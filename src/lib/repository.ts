import { Vault } from "obsidian";
import initSqlJs from "sql.js";
import * as manifestData from 'src/../manifest.json';

const pluginId = manifestData.id;

const WASM_FILE_NAME = 'incremental-learning-data-sql.wasm';

const DATABASE_FILE_NAME = 'incremental-learning-data-sql.wasm';

const getFilePath = (fileName: string, vault: Vault) => {
const pathSegments = [
  vault.configDir,
    'plugins',
    pluginId,
    fileName
  ];

  // if (absolute) pathSegments.unshift(vault.adapter.basePath);

  return pathSegments.join('/');
}

const initDb = async (vault: Vault) => {
  try {
    const sql = await initSqlJs({
      locateFile: (url, scriptDirectory) => getFilePath(WASM_FILE_NAME, vault),
    });

    const db = await vault.adapter.readBinary(getFilePath(DATABASE_FILE_NAME, vault));

  } catch (e: unknown) {
    // TODO: properly handle errors
    if (e instanceof Error) {
      console.error(e);
    } else {
      console.error(typeof e); // TODO: properly handle this case
    }
  }
}
