import * as manifestData from 'src/../manifest.json';

export const PLUGIN_ID = manifestData.id;
// const WASM_FILE_PATH = './node_modules/sql.js/dist/sql-wasm.wasm'; // TODO: find a way to import properly
export const PLUGIN_ICON = 'lightbulb';

// TODO: move to settings
export const WASM_FILE_NAME = 'sql-wasm.wasm';
export const DATABASE_FILE_PATH = './ir-user-data.sqlite';
export const TEST_DATABASE_FILE_PATH = './ir-test-data.sqlite';
export const SCHEMA_FILE_PATH = 'src/db/schema.sql';
export const SNIPPET_DIRECTORY = 'increading/snippets';
export const CARD_DIRECTORY = 'increading/cards';

export const SNIPPET_TAG = 'ir-text-snippet';
export const CARD_TAG = 'ir-card';
export const SOURCE_PROPERTY_NAME = 'ir-source';

export const ERROR_NOTICE_DURATION_MS = 8000;
export const SUCCESS_NOTICE_DURATION_MS = 4000;

/** characters that should never be permitted in note titles */
export const FORBIDDEN_TITLE_CHARS = new Set(`#^[]|*"\\/<>:?\n`.split(''));
export const CONTENT_TITLE_SLICE_LENGTH = 25;
export const SNIPPET_SLICE_LENGTH = 30;

export const MS_PER_DAY = 1000 * 86_400;
/** Local time to roll over to a new day. Defaults to 0400 (4 AM) */
export const DAY_ROLLOVER_OFFSET_HOURS = 4;

// TODO: replace once inferring TS types from schema
export const TABLE_NAMES = Object.freeze([
  'snippet',
  'snippet_review',
  'srs_card',
  'srs_card_review',
] as const);

export const SNIPPET_FALLBACK_REVIEW_INTERVAL = MS_PER_DAY * 1;

export const SNIPPET_REVIEW_INTERVALS = {
  AGAIN: 1,
  TOMORROW: MS_PER_DAY,
  THREE_DAYS: 3 * MS_PER_DAY,
  ONE_WEEK: 7 * MS_PER_DAY,
};

/** Number of rows to fetch at a time when reviewing */
export const REVIEW_FETCH_COUNT = 50;
