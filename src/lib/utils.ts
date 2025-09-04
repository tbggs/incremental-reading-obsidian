import { TFile } from "obsidian";

export async function createFile(absolutePath: string): Promise<TFile> {
  if (this.app.vault.getAbstractFileByPath(absolutePath)) {
    throw new Error(`File already exists at ${absolutePath}`);
  }

  const folderPath = absolutePath.slice(0, absolutePath.lastIndexOf('/'));
  if (!this.app.vault.getAbstractFileByPath(folderPath)) {
    await this.app.vault.createFolder(folderPath);
  }

  try {
    const file = await this.app.vault.create(absolutePath, '');
    return file;
  } catch (e) {
    console.error(`Failed to create file at ${absolutePath}`);
    throw e;
  }
}