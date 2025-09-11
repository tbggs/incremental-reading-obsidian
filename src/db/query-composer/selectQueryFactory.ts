import type { StringKeys } from 'src/lib/utility-types';
import { isInteger } from 'src/lib/utils';
import type { SQLiteRepository } from '../repository';
import type { TableName, TableNameToRowType } from '../types';
import type {
  Row,
  Conjunction,
  WhereConditions,
  SelectQueryFactory,
} from './QueryComposer.types';

export function selectQueryFactory<
  T extends TableName,
  R extends Row<T> = Row<T>,
  C extends StringKeys<R> = StringKeys<R>,
>(
  tableName: T,
  createConditions: (
    column: C,
    conjunction: Conjunction,
    params: R[keyof R][],
    conditions: [string, ...[Conjunction, string][]] | null
  ) => WhereConditions<T, R, C, SelectQueryFactory<T, R, C>>,
  baseFactory: {
    columns(...columns: C[]): any;
    toString(): string;
    build(): {
      query: string;
      queryParams: R[keyof R][];
    };
    execute(): Promise<Record<string, string>[] | undefined>;
  },
  repo?: SQLiteRepository
): SelectQueryFactory<T, R> {
  const tables: TableName[] = [tableName];
  const cols: C[] | null = null;
  const conditions: [string, ...[Conjunction, string][]] | null = null;
  const params: R[keyof R][] = [];
  const sortings: string[] = [];
  let limitCount: number | null = null;

  const operationFunc = (formattedTables: string, formattedColumns: string) => {
    return `SELECT ${formattedColumns} FROM ${formattedTables}`;
  };

  const factory = {
    ...baseFactory,
    where: (column: C) => createConditions(column, 'WHERE', params, conditions),
    join<
      S extends Exclude<TableName, T>, // TODO: this might cause false errors if table T has the same prefix as table S
      SKeys extends StringKeys<TableNameToRowType[S]>,
    >(secondTable: S) {
      if (tables.includes(secondTable)) {
        throw new Error(
          `Invalid JOIN with multiple references to table "${secondTable}"`
        );
      }
      tables.push(secondTable);
      return {
        on(firstTableColumn: `${T}.${C}`, secondTableColumn: `${S}.${SKeys}`) {
          // TODO: infer types on tables being joined
          return factory;
        },
      };
    },
    sort(orderings: [column: StringKeys<R>, direction?: 'ASC' | 'DESC'][]) {
      sortings.push(
        ...orderings.map(([column, direction]) =>
          `${column}` + direction ? ` ${direction}` : ''
        )
      );
      return this;
    },
    limit(limit: number) {
      if (!isInteger(limit) || limit < 1) {
        throw new Error(`Limit must be a positive integer; received ${limit}`);
      }
      limitCount = limit;
      return this;
    },
  };

  return factory;
}
