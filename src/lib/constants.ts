import * as manifestData from 'src/../manifest.json';

export const pluginId = manifestData.id;
// const WASM_FILE_PATH = './node_modules/sql.js/dist/sql-wasm.wasm'; // TODO: find a way to import properly

// TODO: move to settings
export const WASM_FILE_NAME = 'sql-wasm.wasm';
export const DATABASE_FILE_PATH = './il-user-data.sqlite';
export const TEST_DATABASE_FILE_PATH = './il-test-data.sqlite';
export const SCHEMA_FILE_PATH = 'src/db/schema.sql';
export const SNIPPET_DIRECTORY = 'increading/snippets';
export const CARD_DIRECTORY = 'increading/cards';

export const SNIPPET_TAG = 'il-text-snippet';
export const SOURCE_PROPERTY_NAME = 'il-source';

export const ERROR_NOTICE_DURATION_MS = 8000;
export const SUCCESS_NOTICE_DURATION_MS = 4000;

/** characters that should never be permitted in note titles */
export const FORBIDDEN_TITLE_CHARS = new Set(`#^[]|*"\\/<>:?\n`.split(''));
export const CONTENT_TITLE_SLICE_LENGTH = 25;
export const SNIPPET_SLICE_LENGTH = 30;

export const MS_PER_DAY = 1000 * 86_400;

// TODO: replace once inferring TS types from schema
export const TABLE_NAMES = Object.freeze([
  'snippet',
  'snippet_review',
] as const);

export const SNIPPET_FALLBACK_REVIEW_INTERVAL = MS_PER_DAY * 1;
