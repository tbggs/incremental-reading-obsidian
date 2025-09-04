
import * as manifestData from 'src/../manifest.json';

export const pluginId = manifestData.id;
// const WASM_FILE_PATH = './node_modules/sql.js/dist/sql-wasm.wasm'; // TODO: find a way to import properly
export const WASM_FILE_NAME = 'sql-wasm.wasm';
export const DATABASE_FILE_NAME = 'il-user-data.sqlite';
export const SCHEMA_FILE_PATH = 'src/lib/schema.sql';