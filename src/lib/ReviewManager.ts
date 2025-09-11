import type { TFile } from 'obsidian';
import {
  normalizePath,
  type App,
  type Editor,
  type MarkdownView,
} from 'obsidian';
import QueryComposer from 'src/db/query-composer/QueryComposer';
import type { SQLiteRepository } from 'src/db/repository';
import type { Snippet, SRSCard } from 'src/db/types';
import {
  MS_PER_DAY,
  SNIPPET_SLICE_LENGTH,
  SNIPPET_DIRECTORY,
  SNIPPET_FALLBACK_REVIEW_INTERVAL,
  SNIPPET_TAG,
  SOURCE_PROPERTY_NAME,
  ERROR_NOTICE_DURATION_MS,
  SUCCESS_NOTICE_DURATION_MS,
} from './constants';
import type { Card, FSRS, FSRSParameters, Grade } from 'ts-fsrs';
import { createEmptyCard, fsrs, generatorParameters } from 'ts-fsrs';
import { createFile, createTitle, getContentSlice } from './utils';

const FSRS_PARAMETER_DEFAULTS: Partial<FSRSParameters> = {
  enable_fuzz: false,
  enable_short_term: false,
};

export default class ReviewManager {
  // editor: Editor;
  app: App;
  #db: QueryComposer;
  #repo: SQLiteRepository;
  #fsrs: FSRS;

  constructor(app: App, repo: SQLiteRepository) {
    // this.editor = editor;
    this.app = app;
    this.#db = new QueryComposer(repo);
    this.#repo = repo;
    const params = generatorParameters(FSRS_PARAMETER_DEFAULTS);

    this.#fsrs = fsrs(params);
  }

  /**
   * Fetch all snippets and cards ready for review, then order by next_review ASC
   * TODO: limit fetch count
   */
  async getDue(limit?: number) {
    try {
      const snippetsDue = await this.#repo.execSql(
        `SELECT FROM snippet WHERE next_review = $1 ORDER BY next_review ASC`,
        [Date.now()]
      );
      console.log({ snippetsDue });
    } catch (error) {}
  }

  /**
   * TODO: Create a new view/window and present the snippets
   * along with buttons to mark review done, dismiss, etc
   */
  async startReview(limit?: number) {
    try {
      const snippetsDue = await this.#repo.execSql(
        `SELECT FROM snippet WHERE next_review = $1`,
        [Date.now()]
      );

      const card: Card = createEmptyCard(new Date());
      const schedulingCards = this.#fsrs.repeat(card, Date.now());
      console.log({ snippetsDue });
    } catch (error) {}
  }

  protected async createFile({
    content,
    frontmatterObj,
    fileName,
    directory,
  }: {
    content: string;
    frontmatterObj?: Record<string, any>;
    fileName: string;
    directory: string;
  }) {
    try {
      const fullPath = normalizePath(`${directory}/${fileName}`);
      const file = await createFile(fullPath);
      frontmatterObj && (await this.updateFrontMatter(file, frontmatterObj));
      await this.app.vault.append(file, content);
      return file;
    } catch (error) {
      console.error(error);
    }
  }

  /**
   * Given a file's path, append to the end of the file, or
   * if passed a callback, modify the file's contents
   */
  protected async updateFile(
    filePath: string,
    update: string | ((currentText: string) => string | Promise<string>)
  ) {
    const file = this.app.vault.getFileByPath(normalizePath(filePath));
    if (!file) {
      throw new Error(`Failed to open file at ${filePath}`);
    }

    if (typeof update === 'function') {
      const currentText = await this.app.vault.read(file);
      await update(currentText);
    } else {
      await this.app.vault.append(file, update);
    }
  }

  protected async updateFrontMatter(file: TFile, updates: Record<string, any>) {
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      Object.assign(frontmatter, updates);
    });
  }

  // #region CARDS
  /**
   * Create an SRS item
   */
  async createCard(view: MarkdownView) {}

  /**
   * TODO: store the updates in db
   */
  async reviewCard(card: SRSCard, grade: Grade, reviewTime?: number) {
    const recordLog = this.#fsrs.repeat(
      card,
      reviewTime || new Date(),
      (recordLog) => {
        const recordLogItem = recordLog[grade];
        console.log({ card, recordLog, recordLogItem });
        const result = {
          ...card,
          ...recordLogItem.card,
          reviewLog: recordLogItem.log,
        };

        return result;
      }
    );
  }
  // #endregion

  // #region SNIPPETS
  /**
   * Save the selected text and add it to the learning queue
   *
   * todo:
   * - handle edge cases (uncommon characters, leading/trailing spaces, )
   * - selections from web viewer
   * - selections from native PDF viewer
   */
  async createSnippet(view: MarkdownView) {
    // TODO: verify `view.file` can't change between the function invocation and assignment to `currentFile`
    if (!view.file) {
      new Notice(
        `A markdown file must be active to make a snippet`,
        ERROR_NOTICE_DURATION_MS
      );
      return;
    }

    const currentFile = view.file;
    const selection = view.getSelection();
    if (!selection) {
      new Notice(
        'Retain failed: no text was selected',
        ERROR_NOTICE_DURATION_MS
      );
      return;
    }

    const snippetFileName = createTitle(selection);
    const snippetFile = await this.createFile({
      content: selection,
      fileName: `${snippetFileName}.md`,
      directory: SNIPPET_DIRECTORY,
    });

    const slice = getContentSlice(selection, SNIPPET_SLICE_LENGTH, true);
    if (!snippetFile) {
      const errorMsg = `Failed to create note "${slice}"`;
      // new Notice(errorMsg);
      // return;
      throw new Error(errorMsg);
    }

    // Tag it with 'il-text-snippet' and link to the source file
    // TODO: handle disambiguation for files with non-unique names the way Obsidian does
    const sourceLink = this.app.fileManager.generateMarkdownLink(
      currentFile,
      snippetFile.path,
      undefined,
      currentFile.basename
    );

    await this.updateFrontMatter(snippetFile, {
      tags: SNIPPET_TAG,
      [`${SOURCE_PROPERTY_NAME}`]: sourceLink,
    });

    await this.app.vault.append(snippetFile, selection);

    try {
      // save the snippet to the database
      const result = await this.#db
        .insert('snippet')
        .columns('reference', 'next_review')
        .values({
          reference: snippetFile.name,
          next_review: Date.now() + MS_PER_DAY,
        })
        .execute();

      // TODO: verify this correctly catches failed inserts
      new Notice(`snippet created: ${slice}`, SUCCESS_NOTICE_DURATION_MS);
      return result;
    } catch (error) {
      new Notice(
        `Failed to save snippet to database: ${slice}`,
        ERROR_NOTICE_DURATION_MS
      );
      console.error(error);
    }
  }
  /**
   * Add a SnippetReview and set the next review date
   */
  async reviewSnippet(
    snippet: Snippet,
    reviewTime?: number,
    nextReviewTime?: number
  ) {
    const review = reviewTime || Date.now();
    const nextReview =
      nextReviewTime || Date.now() + SNIPPET_FALLBACK_REVIEW_INTERVAL;
    try {
      const insertReviewResult = await this.#db
        .insert('snippet_review')
        .columns('snippet_id', 'review_time')
        .values({
          snippet_id: snippet.id,
          review_time: review,
        })
        .execute();

      const updateSnippetResult = await this.#repo.execSql(
        `UPDATE snippet SET next_review = $1 WHERE id = $2`,
        [nextReview, snippet.id]
      );

      console.log({ insertReviewResult, updateSnippetResult });
    } catch (error) {
      console.error(error);
    }
  }
  // #endregion
}
