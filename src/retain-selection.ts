import { App, Editor } from "obsidian";

const SNIPPET_DIRECTORY = '.il';
const SNIPPET_TAG = 'il-text-snippet';
const SOURCE_PROPERTY_NAME = 'il-source';


const formatFrontMatter = (properties: Record<string, string>): string => {
  const stringEntries = Object.entries(properties).map(([key, value]) => `${key}: ${value}`);
  const formatted = '---\n' + stringEntries.join('\n') + '---\n';
  return formatted;
};

/**
 * Save the selected text and add it to the learning queue
 *
 * todo:
 * - handle edge cases
 * - show flash messages
 * - selections from web viewer
 * - selections from native PDF viewer
 */
export async function retainSelection(editor: Editor, app: App) {
  const { vault, workspace } = app;

  // TODO: this returns the most recently active file if the current file is not a FileView.
  // this may result in bugs - check if currently in a FileView beforehand
  // https://docs.obsidian.md/Reference/TypeScript+API/Workspace/getActiveFile
  const currentFile = workspace.getActiveFile();
  if (!currentFile) {
    // TODO: show a flash error
    return;
  }

  const selection = editor.getSelection();

  // format the data as applicable
  // Tag it with il-text-snippet, source to point to the source file, and date/time created
  // TODO: handle disambiguation for files with non-unique names the way Obsidian does
  const currentFileLink = `[${currentFile.name}]`;
  if (!selection) {
    const errorMsg = "Retain failed: no text was selected";
    // show a flash message
  }

  const properties = { tags: SNIPPET_TAG, 'il-source': `[[${currentFileLink}]]` };

  const formatted = formatFrontMatter(properties) + selection;
  const selectionStart = selection.slice(0, 20);
  const time = new Date(Date.now());
  const fileName = selectionStart + time;

  // Create a new note in the .il folder
  // TODO: If the folder doesn't exist, create it
  const newNote = await vault.create(`/${SNIPPET_DIRECTORY}/${fileName}.md`, formatted);
  // TODO: Add to the database
}