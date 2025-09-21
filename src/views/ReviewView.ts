import type { WorkspaceLeaf, TFile, IconName } from 'obsidian';
import { ItemView, MarkdownRenderer } from 'obsidian';
import type { ISnippet, ISRSCard, ISRSCardDisplay } from 'src/db/types';
import {
  CLOZE_DELIMITERS,
  clozeDelimiterPattern,
  MS_PER_DAY,
  PLACEHOLDER_PLUGIN_ICON,
  SNIPPET_FALLBACK_REVIEW_INTERVAL,
  SNIPPET_REVIEW_INTERVALS,
  SUCCESS_NOTICE_DURATION_MS,
} from 'src/lib/constants';
import type ReviewManager from 'src/lib/ReviewManager';
import { searchAll } from 'src/lib/utils';
import type { Grade } from 'ts-fsrs';
import { Rating } from 'ts-fsrs';

type ReviewItem = {
  data: ISRSCardDisplay | ISnippet;
  file: TFile;
};

export default class ReviewView extends ItemView {
  static #viewType = 'incremental-reading-review';
  #reviewManager: ReviewManager;
  private reviewQueue: ReviewItem[] | null = null;
  private currentItem: ReviewItem | null = null;
  private markdownContainer: HTMLElement | null = null;
  private buttonContainer: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, reviewManager: ReviewManager) {
    super(leaf);
    this.#reviewManager = reviewManager;
  }

  static get viewType() {
    return this.#viewType;
  }

  getViewType(): string {
    return ReviewView.viewType;
  }

  getDisplayText(): string {
    return 'Incremental Reading';
  }

  getIcon(): IconName {
    return PLACEHOLDER_PLUGIN_ICON;
  }

  get file() {
    return this.currentItem?.file ?? null;
  }

  /**
   * Get selected text from the rendered markdown content.
   * This allows snippet creation from ReviewView
   */
  getSelection(): string {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return '';
    }

    // Check if the selection is within our markdown container
    const range = selection.getRangeAt(0);
    if (!this.markdownContainer?.contains(range.commonAncestorContainer)) {
      return '';
    }

    return selection.toString().trim();
  }

  async onOpen() {
    const due = await this.#reviewManager.getDue({ dueBy: this.getDueTime() });
    this.reviewQueue = [...due.all].reverse();
    await this.showNextDue();
  }

  async onClose() {
    // Cleanup if needed
  }

  async refreshQueue() {
    if (!this.reviewQueue || !this.reviewQueue.length) {
      this.reviewQueue = (
        await this.#reviewManager.getDue({ dueBy: this.getDueTime() })
      ).all.reverse();
    }
    if (this.reviewQueue.length) {
      this.currentItem = this.reviewQueue.pop() ?? null;
    }
  }
  // TODO: change to end of day accounting for day rollover offset
  getDueTime() {
    return Date.now() + 7 * SNIPPET_FALLBACK_REVIEW_INTERVAL;
  }

  async showNextDue() {
    await this.refreshQueue();
    if (!this.currentItem) {
      // TODO: move fallback HTML logic here
      await this.buildHtml();
      return;
    }

    await this.buildHtml(this.currentItem);
    await this.renderMarkdownContent(this.currentItem);
  }

  async buildHtml(item?: ReviewItem) {
    const container = this.containerEl;
    container.empty();

    container.addClass('ir-review-view-container');

    this.buttonContainer = container.createDiv({
      cls: 'ir-review-button-container',
    });

    this.markdownContainer = container.createDiv({
      cls: 'ir-review-markdown-container',
    });

    // Obsidian classes to apply note styling to the review interface
    this.markdownContainer.addClasses([
      'markdown-preview-view',
      'markdown-rendered',
      'node-insert-event',
      'is-readable-line-width',
      'allow-fold-headings',
      'allow-fold-lists',
      'show-indentation-guide',
      'show-properties',
      'cm-sizer',
    ]);

    if (!this.reviewQueue?.length) {
      // Show placeholder if no file loaded
      this.showPlaceholder();
    }

    // Create the button bar
    this.createButtonBar(item);
  }

  private showPlaceholder() {
    if (!this.markdownContainer) return;

    this.markdownContainer.empty();
    this.markdownContainer.createDiv({
      text: 'Nothing due for review.',
      cls: 'ir-review-placeholder',
    });
  }

  private async renderMarkdownContent(
    item: ReviewItem,
    revealAnswer?: boolean
  ) {
    if (!this.markdownContainer) return;

    this.markdownContainer.empty();

    try {
      const content = await this.app.vault.read(item.file);

      // Create a content div for the rendered markdown
      const contentDiv = this.markdownContainer.createDiv({
        cls: 'ir-review-content',
      });
      let formattedContent = content;
      if ('state' in item.data && !revealAnswer) {
        const match = searchAll(content, clozeDelimiterPattern)[0];
        if (!match) {
          throw new Error(`Valid cloze delimiters not found in ${content}`);
        }

        const pre = content.slice(0, match.index);
        const answer = `${CLOZE_DELIMITERS[0]}__${CLOZE_DELIMITERS[1]}`;
        const post = content.slice(match.index + match.match.length);
        formattedContent = pre + answer + post;
      }
      // Render the markdown content
      await MarkdownRenderer.render(
        this.app,
        formattedContent,
        contentDiv,
        item.file.path,
        this
      );
    } catch (error) {
      this.markdownContainer.createDiv({
        text: `Error loading file: ${error.message}`,
        cls: 'ir-review-error',
      });
    }
  }

  private createButtonBar(item?: ReviewItem, revealAnswer?: boolean) {
    if (!this.buttonContainer) return;
    this.buttonContainer.empty();

    const buttons: {
      title: string;
      icon: string;
      action: () => Promise<void>;
    }[] = []; // TODO: button to show queue as a paginated table
    if (!item) {
      // TODO: buttons to show only when no items are selected
    } else if ('state' in item.data) {
      const card = item.data;
      if (!revealAnswer) {
        buttons.push({
          title: 'Show Answer',
          icon: '',
          action: async () => {
            await this.renderMarkdownContent(item, true);
            this.createButtonBar(item, true);
          },
        });
      } else {
        buttons.push(
          {
            title: '(1) Again',
            icon: '🔁',
            action: async () => {
              await this.gradeCard(card, Rating.Again);
            },
          },
          {
            title: '(2) Hard',
            icon: '👎',
            action: async () => {
              await this.gradeCard(card, Rating.Hard);
            },
          },
          {
            title: '(3) Good',
            icon: '👍',
            action: async () => {
              await this.gradeCard(card, Rating.Good);
            },
          },
          {
            title: '(4) Easy',
            icon: '✅',
            action: async () => {
              await this.gradeCard(card, Rating.Easy);
            },
          }
          // {
          //   title: '(0) Manual',
          //   icon: '👎',
          //   action: async () => {
          //     await this.gradeCard(card, Rating.Manual);
          //     await this.showNextDue();
          //   },
          // }
          // {
          //   title: 'Skip for now',
          //   icon: '➡️',
          //   action: async () => this.nextReview(),
          // }
        );
      }
    } else if ('dismissed' in item.data) {
      const snippet = item.data;
      buttons.push(
        {
          title: '(1) Again',
          icon: '🔁',
          action: async () =>
            await this.reviewSnippet(snippet, SNIPPET_REVIEW_INTERVALS.AGAIN),
        },
        {
          title: '(2) Tomorrow',
          icon: '☀',
          action: async () =>
            await this.reviewSnippet(
              snippet,
              SNIPPET_REVIEW_INTERVALS.TOMORROW
            ),
        },
        {
          title: '(3) Three Days',
          icon: '📅',
          action: async () =>
            await this.reviewSnippet(
              snippet,
              SNIPPET_REVIEW_INTERVALS.THREE_DAYS
            ),
        },
        {
          title: '(4) One Week',
          icon: '↩',
          action: async () =>
            await this.reviewSnippet(
              snippet,
              SNIPPET_REVIEW_INTERVALS.ONE_WEEK
            ),
        },
        {
          title: 'Dismiss',
          icon: '❌',
          action: async () => {
            await this.#reviewManager.dismissSnippet(snippet);
            await this.showNextDue();
          },
        }
      );
    }

    buttons.forEach((button) => {
      const buttonEl = this.buttonContainer!.createEl('button', {
        text: `${button.icon} ${button.title}`,
        cls: 'ir-review-button',
      });
      buttonEl.addEventListener('click', button.action);
    });
    // TODO: hotkeys
  }

  // Button action methods
  private async gradeCard(card: ISRSCardDisplay, grade: Grade) {
    new Notice(`Graded as: ${grade}`);
    await this.#reviewManager.reviewCard(card, grade);
    await this.showNextDue();
  }

  // Button action methods
  private async reviewSnippet(snippet: ISnippet, nextInterval: number) {
    new Notice(
      `Marking snippet reviewed with next interval of ${Math.round((10 * nextInterval) / MS_PER_DAY) / 10} days`,
      SUCCESS_NOTICE_DURATION_MS
    );

    await this.#reviewManager.reviewSnippet(snippet, Date.now(), nextInterval);
    await this.showNextDue();
  }
}
