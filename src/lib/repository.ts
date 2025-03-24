import { App, DataAdapter } from "obsidian";
import initSqlJs, { BindParams, Database, QueryExecResult } from "sql.js";
import { pluginId, WASM_FILE_NAME, DATABASE_FILE_NAME } from './constants';
// import * as schema from './schema.sql';
// import wasm from 'sql-wasm.wasm';

// console.log({wasmType: typeof wasm});

export class SQLiteRepository {
  app: App;
  adapter: DataAdapter;
  db?: Database;

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
    repo.db = await repo.loadDb() ?? await repo.initDb();
    await repo.save();
    return repo;
  }

  /**
   *
   *  TODO:
   * - format results as objects
   * -
   * - handle errors better
   * @param query
   * @returns 
   */
  async query(query: string, params?: BindParams, isMutation = false) {
    const result = this.db?.exec(query, params);
    if (isMutation) await this.save();
    if (!result) return null;

    const formatted = result.map(({ columns, values }) => {
      // in values, each element represents a row
      const formattedEntries = values.map((row) => {
        const output = row.reduce((acc, cell, i) => Object.assign(acc, { [columns[i]]: cell }), {});

        return output;
      });

      return formattedEntries;
    }).flat();

    console.log({ queryResult: result });
    console.table(formatted);

    return formatted;
  }

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
    const db = new sql.Database();
    const schema = await this.adapter.read(this.getFilePath('src/lib/schema.sql'));
    db.exec(schema);
    return db;
  }

  async getSchema(tableName: string) {
    const result = this.db?.exec('SELECT sql from sqlite_schema WHERE name = $1', [tableName]);
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
      return new sql.Database(Buffer.from(dbArrayBuffer));
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
    return basePath;
  }
}
