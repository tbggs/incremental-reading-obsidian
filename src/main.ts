import type { App, Editor, MarkdownView, WorkspaceLeaf } from 'obsidian';
import {
  addIcon,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
} from 'obsidian';
import {
  DATABASE_FILE_PATH,
  ERROR_NOTICE_DURATION_MS,
  SCHEMA_FILE_PATH,
} from './lib/constants';
import { SQLiteRepository } from './db/repository';
import QueryComposer from './db/query-composer/QueryComposer';
import ReviewManager from './lib/ReviewManager';
import { State } from 'ts-fsrs';
import ReviewView from './views/ReviewView';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
  mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
  mySetting: 'default',
};

export default class MyPlugin extends Plugin {
  settings: MyPluginSettings;
  #db: QueryComposer;
  #reviewManager: ReviewManager;

  async onload() {
    await this.loadSettings();

    // This creates an icon in the left ribbon.
    // TODO: replace the placeholder
    const ribbonIconEl = this.addRibbonIcon(
      'lightbulb',
      'Incremental Learning',
      (evt: MouseEvent) => {
        // Called when the user clicks the icon.
        new Notice('This is a notice!');
      }
    );
    // Perform additional things with the ribbon
    ribbonIconEl.addClass('incremental-learning-ribbon');

    // TODO: show counts of cards and snippets in queue?
    // // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
    // const statusBarItemEl = this.addStatusBarItem();
    // statusBarItemEl.setText('Status Bar Text');

    this.addCommand({
      id: 'retain-selection',
      name: 'retain selection',
      hotkeys: [
        {
          modifiers: ['Alt'],
          key: 'X',
        },
      ], // TODO: add setting to customize
      editorCallback: (editor: Editor, view: MarkdownView) => {
        if (!this.#db) {
          new Notice(`SQLite database still loading`);
          return;
        }
        return this.#reviewManager.createSnippet(view);
        // return retainSelection(editor, view, this.app, this.#db);
      },
    });

    this.addCommand({
      id: 'create-card',
      name: 'Create SRS card from selection or current block',
      hotkeys: [
        {
          modifiers: ['Alt', 'Shift'],
          key: 'C',
        },
      ],
      editorCallback: (editor: Editor, view: MarkdownView) => {
        if (!this.#reviewManager) {
          new Notice(`Plugin still loading`);
          return;
        }
        return this.#reviewManager.createCard(editor, view);
      },
    });

    this.addCommand({
      id: 'begin learning',
      name: 'Learn',
      callback: async () => {
        let leaf: WorkspaceLeaf | null = null;
        const leaves = this.app.workspace.getLeavesOfType(ReviewView.viewType);

        if (leaves.length > 0) {
          leaf = leaves[0];
        } else {
          leaf = this.app.workspace.getLeaf();
          await leaf.setViewState({ type: ReviewView.viewType, active: true });
        }

        this.app.workspace.revealLeaf(leaf);
      },
    });

    this.addCommand({
      id: 'list-snippets-and-cards',
      name: 'list snippets and cards',
      callback: async () => {
        if (!this.#db) {
          new Notice(`SQLite database still loading`);
          return;
        }
        const snippets = await this.#reviewManager.fetchSnippets();
        const cards = await this.#reviewManager.fetchCards();

        // await this.repo?.query('SELECT rowid, * FROM snippet');
        if (!snippets && !cards) {
          console.log('No snippets or cards found');
          return;
        }
        snippets &&
          console.table(
            snippets.map((snippet) => ({
              ...snippet,
              due: snippet.due ? new Date(snippet.due).toUTCString() : null,
              dismissed: Boolean(snippet.dismissed),
            }))
          );
        cards &&
          console.table(
            cards.map((card) => ({
              ...card,
              created_at: new Date(card.created_at).toUTCString(),
              due: new Date(card.created_at).toUTCString(),
              last_review: card.last_review
                ? new Date(card.last_review).toUTCString()
                : null,
              state: State[card.state],
            }))
          );

        // const due = await this.#reviewManager.getDue();
        // if (due) {
        //   console.log('due:');
        //   console.table(due.all);
        // }
      },
    });

    // this.addCommand({
    //   // TODO: remove after done testing
    //   id: 'delete-all-snippets',
    //   name: 'DELETE all snippets',
    //   callback: async () => {
    //     if (!this.#db) {
    //       new Notice(`SQLite database still loading`);
    //       return;
    //     }
    //     const deleteResult = await this.#db.delete('snippet').execute();
    //     const rows = await this.#db.select('snippet').execute();

    //     // await this.repo?.query('SELECT rowid, * FROM snippet');
    //     if (!rows) return;
    //     new Notice(
    //       `Failed to delete all snippets from database!`,
    //       ERROR_NOTICE_DURATION_MS
    //     );
    //     console.table(
    //       rows.map((row) => ({
    //         ...row,
    //         due: row.due ? new Date(row.due).toUTCString() : null,
    //         dismissed: Boolean(row.dismissed),
    //       }))
    //     );
    //   },
    // });

    // TODO: set up UI modal
    // // This adds a complex command that can check whether the current state of the app allows execution of the command
    // this.addCommand({
    // 	id: 'open-sample-modal-complex',
    // 	name: 'Open sample modal (complex)',
    // 	checkCallback: (checking: boolean) => {
    // 		// Conditions to check
    // 		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    // 		if (markdownView) {
    // 			// If checking is true, we're simply "checking" if the command can be run.
    // 			// If checking is false, then we want to actually perform the operation.
    // 			if (!checking) {
    // 				new SampleModal(this.app).open();
    // 			}

    // 			// This command will only show up in Command Palette when the check function returns true
    // 			return true;
    // 		}
    // 	}
    // });

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new SampleSettingTab(this.app, this));

    // // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
    // // Using this function will automatically remove the event listener when this plugin is disabled.
    // this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
    // 	console.log('click', evt);
    // });

    // // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
    // this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));

    this.app.workspace.onLayoutReady(async () => {
      // expensive startup operations should go here

      // const currentView = this.app.workspace.getActiveViewOfType(MarkdownView);
      // const currentDoc = currentView?.file;
      // console.log({ currentDoc, currentFile });
      const repo = await SQLiteRepository.start(
        this.app,
        DATABASE_FILE_PATH,
        SCHEMA_FILE_PATH
      );
      this.#db = new QueryComposer(repo);
      this.#reviewManager = new ReviewManager(this.app, repo);
      this.registerView(
        ReviewView.viewType,
        (leaf) => new ReviewView(leaf, this.#reviewManager)
      );

      // listen for snippet creations
      this.app.vault.on('create', async (file) => {
        // // check if the snippet is in the database already
        // const result = await this.#db.select('snippet').columns('id').execute();
        // // await repo.query(
        // //   `SELECT (id) FROM snippet WHERE reference = $1`,
        // //   [file.name]
        // // );
        // // TODO: handle failed fetches differently from no results
        // if (!result) {
        //   new Notice(`Failed to fetch rows`, ERROR_NOTICE_DURATION_MS);
        //   return;
        // } else if (result.length === 0) {
        //   // insert a new snippet row
        //   await repo.mutate(
        //     `INSERT INTO snippet (reference, due) VALUES ($1, $2)`,
        //     [file.name, Date.now() + MS_PER_DAY]
        //   );
        // } else {
        //   // if so, set dismissed to 0
        // }
      });
      // const executeExampleQuery = async (reference: string, nextReview: number) => {
      // 	const myQuery = `INSERT INTO snippet (reference, due) ` +
      // 									`VALUES ($1, $2)`;

      // 	const result = await repo.mutate(myQuery, [reference, nextReview]);
      // 	return result;
      // }

      // const result = await executeExampleQuery(source, reference, nextReview);
      const fetchQuery = 'SELECT * FROM snippet';
      const fetchResult = await repo.query(fetchQuery);
    });
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class SampleSettingTab extends PluginSettingTab {
  plugin: MyPlugin;

  constructor(app: App, plugin: MyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName('Setting #1')
      .setDesc("It's a secret")
      .addText((text) =>
        text
          .setPlaceholder('Enter your secret')
          .setValue(this.plugin.settings.mySetting)
          .onChange(async (value) => {
            this.plugin.settings.mySetting = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
