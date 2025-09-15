import type { WorkspaceLeaf, TFile } from 'obsidian';
import { ItemView, MarkdownRenderer } from 'obsidian';
import { SNIPPET_FALLBACK_REVIEW_INTERVAL } from 'src/lib/constants';
import type ReviewManager from 'src/lib/ReviewManager';

export default class ReviewView extends ItemView {
  static #viewType = 'incremental-reading-review';
  #reviewManager: ReviewManager;
  private currentFile: TFile | null = null;
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
    return 'Incremental Reading: Review';
  }

  async onOpen() {
    const dueTime = Date.now() + 5 * SNIPPET_FALLBACK_REVIEW_INTERVAL; // TODO: remove after testing
    const itemsDue = await this.#reviewManager.getDue(dueTime);
    await this.buildHtml();
    console.log({ itemsDue });
    if (itemsDue && itemsDue.all.length) {
      const nextDueFile = await this.#reviewManager.getNote(
        itemsDue.all[0].reference
      );

      console.log({ nextDueFile });
      if (!nextDueFile) return;

      await this.loadFile(nextDueFile);
    }
  }

  async loadFile(file: TFile) {
    this.currentFile = file;
    if (this.markdownContainer) {
      await this.renderMarkdownContent();
    }
  }

  async onClose() {
    // Cleanup if needed
  }

  async buildHtml() {
    const container = this.containerEl;
    container.empty();

    // Create the main layout
    container.addClass('review-view-container');

    // Create markdown container (takes up most of the space)
    this.markdownContainer = container.createDiv({
      cls: 'review-markdown-container',
    });

    // Create button container at the bottom
    this.buttonContainer = container.createDiv({
      cls: 'review-button-container',
    });

    if (!this.currentFile) {
      // Show placeholder if no file loaded
      this.showPlaceholder();
    }

    // Create the button bar
    this.createButtonBar();

    // Add CSS for layout
    this.addStyles();
  }

  private showPlaceholder() {
    if (!this.markdownContainer) return;

    this.markdownContainer.empty();
    this.markdownContainer.createDiv({
      text: 'No file loaded. Use loadFile() to display content.',
      cls: 'review-placeholder',
    });
  }

  private async renderMarkdownContent() {
    if (!this.markdownContainer || !this.currentFile) return;

    this.markdownContainer.empty();

    try {
      const content = await this.app.vault.read(this.currentFile);
      console.log('ReviewView rendering content:', content);

      // Create a content div for the rendered markdown
      const contentDiv = this.markdownContainer.createDiv({
        cls: 'review-content',
      });

      // Render the markdown content
      await MarkdownRenderer.render(
        this.app,
        content,
        contentDiv,
        this.currentFile.path,
        this
      );
    } catch (error) {
      this.markdownContainer.createDiv({
        text: `Error loading file: ${error.message}`,
        cls: 'review-error',
      });
    }
  }

  private createButtonBar() {
    if (!this.buttonContainer) return;

    const buttons = [
      { title: 'Grade Easy', icon: '👍', action: () => this.gradeCard('easy') },
      { title: 'Grade Good', icon: '✅', action: () => this.gradeCard('good') },
      { title: 'Grade Hard', icon: '👎', action: () => this.gradeCard('hard') },
      { title: 'Next Review', icon: '➡️', action: () => this.nextReview() },
    ];

    buttons.forEach((button) => {
      const buttonEl = this.buttonContainer!.createEl('button', {
        text: `${button.icon} ${button.title}`,
        cls: 'review-button',
      });
      buttonEl.addEventListener('click', button.action);
    });
  }

  private addStyles() {
    // Add inline styles for the layout
    const style = this.containerEl.createEl('style');
    style.textContent = `
      .review-view-container {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      
      .review-markdown-container {
        flex: 1;
        overflow: auto;
        padding: 16px;
        background: var(--background-primary);
      }
      
      .review-content {
        height: 100%;
      }
      
      .review-placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--text-muted);
        font-style: italic;
      }
      
      .review-error {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--text-error);
        font-weight: 500;
      }
      
      .review-button-container {
        display: flex;
        gap: 8px;
        padding: 12px;
        border-top: 1px solid var(--background-modifier-border);
        background: var(--background-secondary);
        flex-shrink: 0;
      }
      
      .review-button {
        padding: 8px 16px;
        border: 1px solid var(--background-modifier-border);
        background: var(--interactive-normal);
        color: var(--text-normal);
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.2s ease;
      }
      
      .review-button:hover {
        background: var(--interactive-hover);
      }
      
      .review-button:active {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
      }
    `;
  }

  // Button action methods
  private gradeCard(difficulty: 'easy' | 'good' | 'hard') {
    console.log(`Graded as: ${difficulty}`);
    // Implement your grading logic here
  }

  private nextReview() {
    console.log('Moving to next review');
    // Implement your next review logic here
  }
}
