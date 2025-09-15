import type { MarkdownView } from 'obsidian';
import { normalizePath, type App, type Editor } from 'obsidian';
import {
  SNIPPET_TAG,
  SNIPPET_DIRECTORY,
  SOURCE_PROPERTY_NAME,
  SNIPPET_SLICE_LENGTH,
  MS_PER_DAY,
} from './lib/constants';
import { createFile, createTitle, getContentSlice } from './lib/utils';
import type QueryComposer from './db/query-composer/QueryComposer';
import { randomUUID } from 'crypto';

/**
 * Save the selected text and add it to the learning queue
 *
 * todo:
 * - handle edge cases (uncommon characters, leading/trailing spaces, )
 * - show flash messages confirming creation
 * - selections from web viewer
 * - selections from native PDF viewer
 */
export async function retainSelection(
  editor: Editor,
  view: MarkdownView,
  app: App,
  db: QueryComposer
) {
  // TODO: this returns the most recently active file if the current file is not a FileView.
  // this may result in bugs - check if currently in a FileView beforehand
  // https://docs.obsidian.md/Reference/TypeScript+API/Workspace/getActiveFile
  // const currentFile = workspace.getActiveFile();

  // const currentView = app.workspace.getActiveViewOfType(MarkdownView);

  if (!view.file) {
    // TODO: show a flash error
    new Notice(`A markdown file must be active to make a snippet`);
    return;
  }

  const selection = view.getSelection();

  // format the data as applicable
  if (!selection) {
    const errorMsg = 'Retain failed: no text was selected';
    // TODO: verify this shows a flash message
    new Notice(errorMsg);
  }

  // Create a new note
  const snippetFileName = createTitle(selection);
  const snippetPath = normalizePath(
    `${SNIPPET_DIRECTORY}/${snippetFileName}.md`
  );
  const snippetFile = await createFile(app, snippetPath);

  // Tag it with il-text-snippet, source to point to the source file, and date/time created
  // TODO: handle disambiguation for files with non-unique names the way Obsidian does
  const sourceLink = app.fileManager.generateMarkdownLink(
    view.file,
    snippetFile.path,
    undefined,
    view.file.basename
  );

  await app.fileManager.processFrontMatter(snippetFile, (frontmatter) => {
    Object.assign(frontmatter, {
      tags: SNIPPET_TAG,
      [`${SOURCE_PROPERTY_NAME}`]: sourceLink,
    });
  });
  await app.vault.append(snippetFile, selection);
  // TODO: Add to the database
  console.log('inserting into database');
  const result = await db
    .insert('snippet')
    .columns('reference', 'due')
    .values({
      id: randomUUID(),
      reference: snippetFile.name,
      due: Date.now() + MS_PER_DAY,
      // last_review: 0, // invalid prop for testing
    })
    .execute();

  console.log('insert result:', result);

  // await repo.mutate(
  //   `INSERT INTO snippet (reference, due) VALUES ($1, $2)`,
  //   [snippetFile.name, Date.now() + MS_PER_DAY]
  // );
  const slice = getContentSlice(selection, SNIPPET_SLICE_LENGTH, true);
  if (result) {
    new Notice(`snippet created: ${slice}`);
  } else {
    new Notice(`Failed to save snippet to database: ${slice}`);
  }

  return result;
}
