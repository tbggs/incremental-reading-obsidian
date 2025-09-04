import { normalizePath, TFile, type App, type DataAdapter } from 'obsidian';
import type { BindParams, Database, QueryExecResult } from 'sql.js';
import initSqlJs from 'sql.js';
import { pluginId, WASM_FILE_NAME, DATABASE_FILE_NAME, SCHEMA_FILE_PATH } from './constants';
// import wasm from 'sql-wasm.wasm';

// console.log({wasmType: typeof wasm});

export class SQLiteRepository {
  app: App;
  adapter: DataAdapter;
  db: Database;

  private constructor(app: App) {
    this.app = app;
    this.adapter = app.vault.adapter;
  }

  /**
   * Asynchronous factory function
   */
  static async start(app: App): Promise<SQLiteRepository> {
    const repo = new SQLiteRepository(app);
    // load the database file or create it if loading fails
    // TODO: handle failed loads when the file exists
    // await repo.loadDb() ?? await repo.initDb(); // TODO: uncomment for production
    await repo.initDb(); // TODO: remove for production
    return repo;
  }

  /**
   * Execute a read query and return an array of objects corresponding to table rows
   *  TODO:
   * - handle errors better?
   * @param query
   * @returns an array of rows
   */
  async query(query: string, params?: BindParams) {
    const result = await this.execSql(query, params);
    console.log({ result });
    return result;
  }

  /**
   * Execute a write query
   *  TODO:
   * - handle errors better?
   * @param query
   * @returns an array of rows
   */
  async mutate(query: string, params?: BindParams) {
    const result = await this.execSql(query, params);
    console.log('mutation result: ', result);
    if (result) { 
      await this.save(); 
    }
    return result;
  }

  /**
   * Execute one or more queries and return an array of objects corresponding to table rows.
   * Use `query` or `mutation` methods above instead where possible.
   *
   *  TODO:
   * - verify this works on all tables, with inner and outer JOINs, etc
   * - handle errors better?
   * @param query
   * @returns an array where each top-level element is the result of a query
   */
  private async execSql(query: string, params?: BindParams) {
    const result = this.db.exec(query, params);
    console.log('execSql result:', result);
    if (!result) return null;
    if (!result.length) return result;

    // in SQL.js, selected rows are returned in form [{ columns: string[], values: Array<SQLValue[]> }]
    const formatted = result.map(this.formatResult);

    console.log(`execSql rows:`);
    console.table(formatted);

    return formatted;
  }

  /**
   * Format the result of a single query
   */
  formatResult(result: QueryExecResult): Array<Record<string, string>> {
    const { columns, values } = result;
    const formattedEntries = values.map((row) => {
      const output = row.reduce((acc, cell, i) => Object.assign(acc, { [columns[i]]: cell }), {});

      return output;
    });

    return formattedEntries;
  }

  /**
   * Overwrite or create the database file
   */
  async save() {
    if (!this.db) throw new Error('Database was not initialized on repository');
    const data = this.db.export().buffer;
    return this.app.vault.adapter.writeBinary(this.getFilePath(DATABASE_FILE_NAME), data);
  }

  /**
   * Initialize the database, assuming the file doesn't exist
   * @returns a Database
   */
  async initDb() {
    const sql = await this.loadWasm();
    this.db = new sql.Database();
    const schema = await this.adapter.read(this.getFilePath(SCHEMA_FILE_PATH));
    this.db.exec(schema);
    await this.save();
    return this.db;
  }

  async getSchema(tableName: string) {
    if (!this.db) throw new Error('Database was not initialized on repository');
    const result = this.db.exec('SELECT sql from sqlite_schema WHERE name = $1', [tableName]);
    if (!result) {
      console.warn(`No schema found for table ${tableName}`);
      return;
    }

    const schemaString = result[0].values[0][0];
    if (!schemaString) {
      console.warn('No schema returned');
      return;
    }
    const segments = schemaString.toString().split('\n');
    segments.forEach(console.log);
  }

  /**
   * Attempt to load a pre-existing database from disk
   * @returns a Database or null if the file is invalid or not found
   */
  private async loadDb() {
    try {
      const sql = await this.loadWasm();
      const dbArrayBuffer = await this.app.vault.adapter.readBinary(this.getFilePath(DATABASE_FILE_NAME));
      this.db = new sql.Database(Buffer.from(dbArrayBuffer));
      return this.db;
    } catch (e: unknown) {
      // TODO: properly handle errors
      if (e instanceof Error) {
        // console.error(e);
      } else {
        console.error(typeof e); // TODO: properly handle this case
      }

      return null;
    }
  }

  private async loadWasm() {
    const sql = await initSqlJs({ // TODO: handle throws
      locateFile: (_file) => this.getFilePath(WASM_FILE_NAME, true),
    });

    return sql;
  }

  private getFilePath(fileName: string, absolute = false) {
    const pathSegments = [
      this.app.vault.configDir,
      'plugins',
      pluginId,
      fileName
    ];

    if (absolute) {
      pathSegments.unshift(this.app.vault.adapter.basePath);
    }

    // console.log({ pathSegments });
    const basePath = pathSegments.join('/');
    return normalizePath(basePath);
  }
}
