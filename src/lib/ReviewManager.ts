import type { TFile, SectionCache, CachedMetadata } from 'obsidian';
import {
  normalizePath,
  Notice,
  type App,
  type Editor,
  type MarkdownView,
} from 'obsidian';
import type { SQLiteRepository } from 'src/db/repository';
import type { ISnippet, ISRSCard, TableName } from 'src/db/types';
import {
  MS_PER_DAY,
  SNIPPET_SLICE_LENGTH,
  SNIPPET_DIRECTORY,
  SNIPPET_FALLBACK_REVIEW_INTERVAL,
  SNIPPET_TAG,
  SOURCE_PROPERTY_NAME,
  ERROR_NOTICE_DURATION_MS,
  SUCCESS_NOTICE_DURATION_MS,
  CARD_DIRECTORY,
  CARD_TAG,
} from './constants';
import type { Card, FSRS, FSRSParameters, Grade } from 'ts-fsrs';
import { createEmptyCard, fsrs, generatorParameters } from 'ts-fsrs';
import {
  compareDates,
  createFile,
  createTitle,
  getContentSlice,
} from './utils';
import SRSCard from './card';
import { randomUUID } from 'crypto';

const FSRS_PARAMETER_DEFAULTS: Partial<FSRSParameters> = {
  enable_fuzz: false,
  enable_short_term: false,
};

export default class ReviewManager {
  app: App;
  #repo: SQLiteRepository;
  #fsrs: FSRS;

  constructor(app: App, repo: SQLiteRepository) {
    this.app = app;
    this.#repo = repo;
    const params = generatorParameters(FSRS_PARAMETER_DEFAULTS);

    this.#fsrs = fsrs(params);
  }

  /**
   * Fetch all snippets and cards ready for review, then order by due ASC
   * TODO:
   * - paginate
   * - invalidate after some time (e.g., the configured minimum review interval)
   * @param dueBy Unix timestamp. Defaults to current time.
   */
  async getDue(dueBy?: number, limit?: number) {
    const dueTime = dueBy ?? Date.now();
    try {
      const cardsDue = await this.fetchCards({ dueBy: dueTime, limit });
      const snippetsDue = await this.fetchSnippets({ dueBy: dueTime, limit });
      console.log({ cardsDue, snippetsDue });
      const allDue = [...cardsDue, ...snippetsDue].sort((a, b) =>
        compareDates(a.due, b.due)
      );
      console.log({ allDue, cardsDue, snippetsDue });
      return { all: allDue, cards: cardsDue, snippets: snippetsDue };
    } catch (error) {
      console.error(error);
    }
  }

  // #region CARDS
  /**
   * Create an SRS item
   */
  async createCard(editor: Editor, view: MarkdownView) {
    const currentFile = view.file;
    if (!currentFile) {
      new Notice(`A markdown file must be active`, ERROR_NOTICE_DURATION_MS);
      return;
    }

    const selection = view.getSelection();

    // If there's a selection, use it; otherwise, get the current block
    let content: string;
    if (selection) {
      content = selection;
    } else {
      // get the currently focused block(s)
      const blockContent = this.getCurrentBlockContent(editor, currentFile);
      if (!blockContent) {
        new Notice(
          'No block content found at cursor position',
          ERROR_NOTICE_DURATION_MS
        );
        return;
      }
      content = blockContent;
    }

    console.log({ content, selection });
    try {
      // Create the card from the content
      // TODO: Implement card creation logic
      // create the file as a snippet
      const cardFile = await this.createFromText(content, CARD_DIRECTORY);
      const sourceLink = this.generateMarkdownLink(currentFile, cardFile);
      await this.updateFrontMatter(cardFile, {
        tags: CARD_TAG,
        [`${SOURCE_PROPERTY_NAME}`]: sourceLink,
      });

      // parse question/answer formatting

      // create the database entry as FSRS card + reference
      const card = new SRSCard(cardFile.name);
      const params = [
        card.id,
        card.reference,
        card.created_at.getTime(),
        card.due.getTime(),
        card.last_review?.getTime() ?? null,
        card.stability,
        card.difficulty,
        card.elapsed_days,
        card.scheduled_days,
        card.reps,
        card.lapses,
        card.state,
      ];
      const insertResult = await this.#repo.mutate(
        'INSERT INTO srs_card (id, reference, created_at, due, last_review, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
        params
      );

      const fetchedCard = (
        await this.#repo.query('SELECT * FROM srs_card WHERE id = $1', [
          card.id,
        ])
      )[0];
      console.log('created card:', fetchedCard);
      return card;
    } catch (error) {
      console.error(error);
      // TODO: error handling
    }
  }

  async fetchCards(opts?: { dueBy?: number; limit?: number }) {
    let query = 'SELECT * FROM srs_card';
    let params = [];
    if (opts?.dueBy) {
      params.push(opts?.dueBy);
      query += ` WHERE due <= $${params.length}`;
    }
    if (opts?.limit) {
      params.push(opts?.limit);
      query += ` LIMIT $${params.length}`;
    }
    return ((await this.#repo.query(query, params)) ?? []) as SRSCard[];
  }

  /**
   * TODO: store the updates in db
   */
  async reviewCard(card: ISRSCard, grade: Grade, reviewTime?: Date) {
    const recordLog = this.#fsrs.repeat(
      card,
      reviewTime || new Date(),
      (recordLog) => {
        const recordLogItem = recordLog[grade];
        console.log({ card, recordLog, recordLogItem });
        const result = {
          nextCard: {
            ...card,
            ...recordLogItem.card,
          },
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
    if (!view.file) {
      new Notice(`A markdown file must be active`, ERROR_NOTICE_DURATION_MS);
      return;
    }
    const selection = view.getSelection();
    if (!selection) {
      new Notice('Text must be selected', ERROR_NOTICE_DURATION_MS);
      return;
    }

    const currentFile = view.file;
    const snippetFile = await this.createFromText(selection, SNIPPET_DIRECTORY);

    // Tag it with 'il-text-snippet' and link to the source file
    const sourceLink = this.generateMarkdownLink(currentFile, snippetFile);

    await this.updateFrontMatter(snippetFile, {
      tags: SNIPPET_TAG,
      [`${SOURCE_PROPERTY_NAME}`]: sourceLink,
    });

    try {
      // save the snippet to the database
      const result = await this.#repo.mutate(
        'INSERT INTO snippet (id, reference, due) VALUES ($1, $2, $3)',
        [
          randomUUID(),
          `${SNIPPET_DIRECTORY}/${snippetFile.name}`,
          Date.now() + MS_PER_DAY,
        ]
      );

      // TODO: verify this correctly catches failed inserts
      new Notice(
        `snippet created: ${snippetFile.basename}`,
        SUCCESS_NOTICE_DURATION_MS
      );
      return result;
    } catch (error) {
      new Notice(
        `Failed to save snippet to database: ${snippetFile.basename}`,
        ERROR_NOTICE_DURATION_MS
      );
      console.error(error);
    }
  }

  async fetchSnippets(opts?: { dueBy?: number; limit?: number }) {
    let query = 'SELECT * FROM snippet';
    let params = [];
    if (opts?.dueBy) {
      params.push(opts?.dueBy);
      query += ` WHERE due <= $${params.length}`;
    }
    if (opts?.limit) {
      params.push(opts?.limit);
      query += ` LIMIT $${params.length}`;
    }
    return ((await this.#repo.query(query, params)) ?? []) as ISnippet[];
  }
  /**
   * Add a SnippetReview and set the next review date
   */
  async reviewSnippet(
    snippet: ISnippet,
    reviewTime?: number,
    nextReviewTime?: number
  ) {
    const reviewed = reviewTime || Date.now();
    const nextReview =
      nextReviewTime || Date.now() + SNIPPET_FALLBACK_REVIEW_INTERVAL;
    try {
      const insertReviewResult = await this.#repo.mutate(
        'INSERT INTO snippet_review (id, snippet_id, review_time) VALUES ($1, $2, $3)'[
          (randomUUID(), snippet.id, reviewed)
        ]
      );
      // const insertReviewResult = await this.#db
      //   .insert('snippet_review')
      //   .columns('review_time')
      //   .values({
      //     id: randomUUID(),
      //     snippet_id: snippet.id,
      //     review_time: reviewed,
      //   })
      //   .execute();

      const updateSnippetResult = await this.#repo.mutate(
        `UPDATE snippet SET due = $1 WHERE id = $2`,
        [nextReview, snippet.id]
      );

      console.log({ insertReviewResult, updateSnippetResult });
    } catch (error) {
      console.error(error);
    }
  }
  // #endregion
  // #region HELPERS
  async getNote(reference: string): Promise<TFile | null> {
    return this.app.vault.getFileByPath(normalizePath(reference));
  }

  protected async createNote({
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
      const file = await createFile(this.app, fullPath);
      await this.app.vault.append(file, content);
      frontmatterObj && (await this.updateFrontMatter(file, frontmatterObj));
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

  /**
   * Shared logic for creating snippets and cards.
   * Throws if it fails to create the file.
   */
  protected async createFromText(textContent: string, directory: string) {
    const newNoteName = createTitle(textContent);
    const newNote = await this.createNote({
      content: textContent,
      fileName: `${newNoteName}.md`,
      directory,
    });

    if (!newNote) {
      const errorMsg = `Failed to create note "${newNoteName}"`;
      // new Notice(errorMsg);
      // return;
      throw new Error(errorMsg);
    }

    return newNote;
  }

  /**
   * Generates a link with an absolute path and the file name as alias
   */
  generateMarkdownLink(
    fileLinkedTo: TFile,
    fileContainingLink: TFile,
    subpath?: string
  ) {
    return this.app.fileManager.generateMarkdownLink(
      fileLinkedTo,
      fileContainingLink.path,
      subpath,
      fileLinkedTo.basename
    );
  }

  protected async updateFrontMatter(file: TFile, updates: Record<string, any>) {
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      Object.assign(frontmatter, updates);
    });
  }
  /**
   * Get the content of the markdown block/section where the cursor is currently positioned
   * Uses Obsidian's metadata cache for accurate block detection
   */
  getCurrentBlockContent(editor: Editor, file: TFile): string | null {
    const cursor = editor.getCursor();
    const cursorOffset = editor.posToOffset(cursor);

    // Get the cached metadata for the current file
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache?.sections) {
      return null;
    }

    // Find the section that contains the cursor position
    const currentSection = cache.sections.find((section) => {
      return (
        cursorOffset >= section.position.start.offset &&
        cursorOffset <= section.position.end.offset
      );
    });

    if (!currentSection) {
      return null;
    }

    // Get the content of the section
    const sectionStart = currentSection.position.start.offset;
    const sectionEnd = currentSection.position.end.offset;
    const fullContent = editor.getValue();

    return fullContent.slice(sectionStart, sectionEnd);
  }
  // #endregion
}
