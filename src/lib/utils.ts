import type { TFile } from 'obsidian';
import { CONTENT_TITLE_SLICE_LENGTH, FORBIDDEN_TITLE_CHARS } from './constants';

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

/**
 * Generates an alphanumeric ID of the specified length (default 5)
 */
export function generateId(length: number = 5): string {
  if (length <= 0 || length % 1 !== 0) {
    throw new TypeError(
      `Length must be a positive integer; received ${length}`
    );
  }

  return Math.random()
    .toString(36) // letters and digits
    .slice(2, length + 2); // remove the decimal place
}

/**
 * Get a title-safe date and time in UTC.
 * Uses the current time if a Date is not passed
 */
export function getDateTimeString(date?: Date) {
  const dateToUse = date ?? new Date();
  let formatted = `${dateToUse.getUTCFullYear()}-${dateToUse.getUTCMonth() + 1}-${dateToUse.getUTCDate()}`;
  formatted += `T${dateToUse.getHours()}h${dateToUse.getMinutes()}m${dateToUse.getSeconds()}s`;
  return formatted;
}

/**
 * Filter characters that cannot be used for file names
 * or Obsidian note titles
 */
export function sanitizeForTitle(text: string, checkFinalChar: boolean) {
  return text
    .trim()
    .split('')
    .filter(
      (char, i) =>
        !FORBIDDEN_TITLE_CHARS.has(char) && (!checkFinalChar ||
        (i !== text.length - 1 || !' .'.includes(char)))
    )
    .join('');
}

/**
 * Returns the start of `content` as a string no longer than `sliceLength`,
 * adding ellipses if longer
 */
export function getContentSlice(
  content: string,
  sliceLength: number,
  ellipses: boolean = false,
) {
  const trimmed = content.trim();
  if (!ellipses) return trimmed.slice(0, sliceLength);

  return trimmed.length > sliceLength
    ? `${trimmed.slice(0, sliceLength - 3)}...`
    : trimmed;
}

/**
 * Creates a title with an ISO timestamp and a slice of the content,
 * or a random ID if no content is passed
 * TODO: handle file system name length limitations?
 */
export function createTitle(content?: string) {
  const time = getDateTimeString();
  const TITLE_SEGMENT_SEPARATOR = ' - ';
  const segments = [];
  if (content) {
    const contentSlice = content.trim().slice(0, CONTENT_TITLE_SLICE_LENGTH);
    const sanitized = sanitizeForTitle(contentSlice, false).trim();
    if (sanitized.length > 0) segments.push(sanitized);
  }
  segments.push(time, generateId());
  return segments.join(TITLE_SEGMENT_SEPARATOR);
}

export const isInteger = (value: unknown): value is number => 
  typeof value === 'number' && 
  !Number.isNaN(value) && 
  value % 1 === 0;
