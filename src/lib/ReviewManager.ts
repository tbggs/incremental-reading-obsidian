import type { TFile, TAbstractFile } from 'obsidian';
import {
  normalizePath,
  Notice,
  type App,
  type Editor,
  type MarkdownView,
} from 'obsidian';
import type { SQLiteRepository } from 'src/db/repository';
import type {
  ISnippet,
  ISnippetReview,
  ISRSCard,
  SRSCardRow,
} from 'src/db/types';
import {
  SNIPPET_DIRECTORY,
  SNIPPET_FALLBACK_REVIEW_INTERVAL,
  SNIPPET_TAG,
  SOURCE_PROPERTY_NAME,
  ERROR_NOTICE_DURATION_MS,
  SUCCESS_NOTICE_DURATION_MS,
  CARD_DIRECTORY,
  CARD_TAG,
  REVIEW_FETCH_COUNT,
  SNIPPET_REVIEW_INTERVALS,
  CLOZE_DELIMITERS,
  clozeDelimiterPattern,
} from './constants';
import type { FSRS, FSRSParameters, Grade } from 'ts-fsrs';
import { fsrs, generatorParameters } from 'ts-fsrs';
import {
  compareDates,
  createFile,
  createTitle,
  getSelectionWithBounds,
  searchAll,
} from './utils';
import SRSCard from './card';
import { randomUUID } from 'crypto';
import type ReviewView from 'src/views/ReviewView';

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

  // TODO: remove for production
  get repo() {
    return this.#repo;
  }

  protected getEndOfToday() {
    // TODO: get the time; if before DAY_ROLLOVER_OFFSET, return today's rollover time; else return tomorrow's
  }

  async getCardsDue(
    dueBy?: number,
    limit?: number
  ): Promise<{ data: SRSCard; file: TFile }[]> {
    const dueTime = dueBy ?? Date.now();
    try {
      const cardsDue = (
        await this._fetchCardData({ dueBy: dueTime, limit })
      ).map(
        async (item) => ({
          data: item,
          file: await this.getNote(item.reference),
        }),
        this
      );
      const result = await Promise.all(cardsDue);
      return result.filter(
        (card): card is { data: SRSCard; file: TFile } => card.file !== null
      );
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  async getSnippetsDue(
    dueBy?: number,
    limit?: number
  ): Promise<{ data: ISnippet; file: TFile }[]> {
    const dueTime = dueBy ?? Date.now();
    try {
      const snippetsDue = (
        await this._fetchSnippetData({ dueBy: dueTime, limit })
      ).map(
        async (item) => ({
          data: item,
          file: await this.getNote(item.reference),
        }),
        this
      );
      const result = await Promise.all(snippetsDue);
      return result.filter(
        (snippet): snippet is { data: ISnippet; file: TFile } =>
          snippet.file !== null
      );
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  /**
   * Fetch all snippets and cards ready for review, then order by due ASC
   * TODO:
   * - paginate
   * - invalidate after some time (e.g., the configured minimum review interval)
   * @param dueBy Unix timestamp. Defaults to current time.
   */
  async getDue({
    dueBy,
    limit = REVIEW_FETCH_COUNT,
  }: {
    dueBy?: number;
    limit?: number;
  }) {
    try {
      const cardsDue = await this.getCardsDue(dueBy, limit);
      const snippetsDue = await this.getSnippetsDue(dueBy, limit);
      const allDue = [...cardsDue, ...snippetsDue].sort((a, b) =>
        compareDates(a.data.due, b.data.due)
      );
      return { all: allDue, cards: cardsDue, snippets: snippetsDue };
    } catch (error) {
      console.error(error);
      return { all: [], cards: [], snippets: [] };
    }
  }

  // /**
  //  * Get the data and file for the next due review item, or null if none are due
  //  */
  // async getNextDue(dueBy?: number) {
  //   try {
  //     const allDue = await this.getDue({ dueBy, limit: 1 });
  //     if (!allDue || !allDue.all.length) return null;

  //     const dueItem = allDue.all[0];

  //     return { data: dueItem, file: dueFile };
  //   } catch (error) {
  //     console.error(error);
  //     return null;
  //   }
  // }

  /**
   * If text is selected, adds cloze deletion delimiters around the selection
   * and removes them elsewhere.
   * If no text is selected, searches for preexisting delimiters.
   * @param selectionOffsets the character positions of the selection relative
   * to the start of the passed text
   * @throws if no text is selected and no preexisting delimiters are found
   */
  protected delimitCardTexts(
    text: string,
    selectionOffsets: [number, number] | null
  ): string[] {
    const removeDelimiters = (text: string) =>
      text
        .replaceAll(CLOZE_DELIMITERS[0], '')
        .replaceAll(CLOZE_DELIMITERS[1], '');
    if (selectionOffsets) {
      // remove preexisting delimiters
      const pre = removeDelimiters(text.slice(0, selectionOffsets[0]));
      const answer = text.slice(selectionOffsets[0], selectionOffsets[1]);
      const post = removeDelimiters(text.slice(selectionOffsets[1]));
      const result =
        pre + `${CLOZE_DELIMITERS[0]} ${answer} ${CLOZE_DELIMITERS[1]}` + post;
      return [result];
    } else {
      // find the first pair of valid delimiters and remove others
      // TODO: create multiple cards
      const matches = searchAll(text, clozeDelimiterPattern);
      if (!matches.length) {
        throw new Error(`No valid delimiters found in text:` + `\n\n${text}`);
      }
      // remove all other delimiters for each match
      return matches.map(({ match, index }) => {
        const pre = removeDelimiters(text.slice(0, index));
        const post = removeDelimiters(text.slice(match.length + index));
        return pre + match + post;
      });
    }
  }

  // #region CARDS
  /**
   * Create an SRS item
   */
  async createCard(editor: Editor, view: MarkdownView | ReviewView) {
    const currentFile = view.file;
    if (!currentFile) {
      new Notice(`A markdown file must be active`, ERROR_NOTICE_DURATION_MS);
      return;
    }

    const block = this.getCurrentContent(editor, currentFile);
    // TODO: ensure block content is correct for bullet lists (should only use the current bullet) and code blocks (get the whole code block)
    console.log('blockContent:', block);
    if (!block) {
      new Notice('No block content found', ERROR_NOTICE_DURATION_MS);
      return;
    }
    const { content, line: blockLine } = block;

    const selectionBounds = getSelectionWithBounds(editor);
    if (!selectionBounds) {
      console.log('no selection');
      return;
    }
    const { start, end, startOffset, endOffset } = selectionBounds;

    try {
      const withDelimiters = this.delimitCardTexts(content, [
        start.ch,
        end.ch,
      ])[0]; // TODO: create many cards at once and transclude/link all?
      console.log('with delimiters:', withDelimiters);
      const { card, cardFile } = await this.createCardFileAndRow(
        withDelimiters,
        currentFile
      );
      const linkToCard = this.generateMarkdownLink(cardFile, currentFile);
      editor.replaceRange(
        `!${linkToCard}`,
        { line: blockLine, ch: 0 },
        { line: blockLine + 1, ch: 0 }
      );
    } catch (error) {
      new Notice(error);
    }
  }

  protected async createCardFileAndRow(
    delimitedText: string,
    sourceFile: TFile
  ) {
    try {
      // Create the card from the content
      const cardFile = await this.createFromText(delimitedText, CARD_DIRECTORY);
      const linkToSource = this.generateMarkdownLink(sourceFile, cardFile);
      await this.updateFrontMatter(cardFile, {
        tags: CARD_TAG,
        [`${SOURCE_PROPERTY_NAME}`]: linkToSource,
      });

      // parse question/answer formatting

      // create the database entry as FSRS card + reference
      const card = new SRSCard(cardFile.path);
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
        `INSERT INTO srs_card (id, reference, created_at, due, last_review, ` +
          `stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state) ` +
          `VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        params
      );

      const fetchedCard = (
        await this.#repo.query('SELECT * FROM srs_card WHERE id = $1', [
          card.id,
        ])
      )[0];

      return { card, cardFile };
    } catch (error) {
      console.error(error);
      // TODO: error handling
      throw error;
    }
  }

  async _fetchCardData(opts?: {
    dueBy?: number;
    limit?: number;
    includeDismissed?: boolean;
  }) {
    let query = 'SELECT * FROM srs_card';
    const conditions = [];
    const params = [];
    if (opts?.dueBy) {
      params.push(opts?.dueBy);
      conditions.push(`due <= $${params.length}`);
    }
    if (!opts?.includeDismissed) {
      conditions.push('dismissed = 0');
    }

    if (conditions.length) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY due ASC';

    if (opts?.limit) {
      params.push(opts?.limit);
      query += ` LIMIT $${params.length}`;
    }

    console.log({ query, params });
    return ((await this.#repo.query(query, params)) ?? []) as SRSCardRow[];
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

    console.log({ recordLog });
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
  async createSnippet(view: MarkdownView | ReviewView, firstReview?: number) {
    const reviewTime =
      firstReview || Date.now() + SNIPPET_REVIEW_INTERVALS.AGAIN; // TODO: change to tomorrow
    if (!view.file) {
      new Notice(
        `View type not supported for snippets`,
        ERROR_NOTICE_DURATION_MS
      );
      return;
    }
    const selection = view.getSelection();
    if (!selection) {
      new Notice('Text must be selected', ERROR_NOTICE_DURATION_MS);
      return;
    }

    const currentFile = view.file;
    const snippetFile = await this.createFromText(selection, SNIPPET_DIRECTORY);

    // Tag it and link to the source file
    const sourceLink = this.generateMarkdownLink(currentFile, snippetFile);

    await this.updateFrontMatter(snippetFile, {
      tags: SNIPPET_TAG,
      [`${SOURCE_PROPERTY_NAME}`]: sourceLink,
    });

    // TODO: transclude the snippet into its source location

    return this.createSnippetFromFile(snippetFile, reviewTime);
  }

  /**
   * Given a preexisting snippet file, insert into database
   */
  async createSnippetFromFile(snippetFile: TFile, reviewTime: number) {
    try {
      // save the snippet to the database
      const result = await this.#repo.mutate(
        'INSERT INTO snippet (id, reference, due) VALUES ($1, $2, $3)',
        [randomUUID(), `${SNIPPET_DIRECTORY}/${snippetFile.name}`, reviewTime]
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

  async _fetchSnippetData(opts?: {
    dueBy?: number;
    limit?: number;
    includeDismissed?: boolean;
  }) {
    let query = 'SELECT * FROM snippet';
    const conditions = [];
    const params = [];
    if (opts?.dueBy) {
      params.push(opts?.dueBy);
      conditions.push(`due <= $${params.length}`);
    }
    if (!opts?.includeDismissed) {
      conditions.push('dismissed = 0');
    }

    if (conditions.length) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY due ASC';

    if (opts?.limit) {
      params.push(opts?.limit);
      query += ` LIMIT $${params.length}`;
    }

    console.log({ query, params });
    return ((await this.#repo.query(query, params)) ?? []) as ISnippet[];
  }

  async findSnippet(snippetFile: TAbstractFile) {
    const results = await this.#repo.query(
      'SELECT * FROM snippet WHERE reference = $1',
      [snippetFile.path]
    );
    return results;
  }
  /**
   * Add a SnippetReview and set the next review date
   */
  async reviewSnippet(
    snippet: ISnippet,
    reviewTime?: number,
    nextReviewInterval?: number
  ) {
    const reviewed = reviewTime || Date.now();
    const nextReview =
      reviewed + (nextReviewInterval ?? SNIPPET_FALLBACK_REVIEW_INTERVAL);
    try {
      const insertReviewResult = await this.#repo.mutate(
        'INSERT INTO snippet_review (id, snippet_id, review_time) VALUES ($1, $2, $3)',
        [randomUUID(), snippet.id, reviewed]
      );

      const updateSnippetResult = await this.#repo.mutate(
        `UPDATE snippet SET due = $1 WHERE id = $2`,
        [nextReview, snippet.id]
      );
    } catch (error) {
      console.error(error);
    }
  }

  async dismissSnippet(snippet: ISnippet) {
    try {
      await this.#repo.mutate(
        'UPDATE snippet SET dismissed = 1 WHERE id = $1',
        [snippet.id]
      );
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
  /**
   * (WIP) Get the block, bullet list item, or code block the cursor is currently within
   */
  getCurrentContent(editor: Editor, file: TFile) {
    const cursor = editor.getCursor();
    const block = editor.getLine(cursor.line);

    return { content: block, line: cursor.line };
  }
  // #endregion
}
