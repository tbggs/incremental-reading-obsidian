import type { SQLiteRepository } from './repository';
import type { TableName, TableNameToRowType } from './types';
import type { SafeOmit } from '../lib/utility-types';
import type {
  NullishToOptional,
  StringKeys,
  StringRecord,
} from '../lib/utility-types';
import { isInteger } from '../lib/utils';

/**
 * ORM-like query builder producing query strings
 */
export default class QueryComposer {
  repo?: SQLiteRepository;
  constructor(repo?: SQLiteRepository) {
    this.repo = repo;
  }

  select<T extends TableName>(table: T) {
    return queryFactory(table, 'SELECT', this.repo);
  }

  insert<T extends TableName>(table: T) {
    return queryFactory(table, 'INSERT', this.repo);
  }

  update<T extends TableName>(table: T) {
    return queryFactory(table, 'UPDATE', this.repo);
  }

  delete<T extends TableName>(table: T) {
    return queryFactory(table, 'DELETE', this.repo);
  }
}

export type QueryCondition<T = unknown> = (
  column: string,
  compareValue: T
) => { clause: string; compareValue: T };

export const eq: QueryCondition = (column: string, compareValue: unknown) => {
  return { clause: `${column} = $`, compareValue };
};

export const gt: QueryCondition = (column: string, compareValue: unknown) => {
  return { clause: `${column} > $`, compareValue };
};

export const gte: QueryCondition = (column: string, compareValue: unknown) => {
  return { clause: `${column} >= $`, compareValue };
};

export const lt: QueryCondition = (column: string, compareValue: unknown) => {
  return { clause: `${column} < $`, compareValue };
};

// might use this instead of comparator functions, but the above might make it easier to have type safety
export type QueryComparator = '=' | '<>' | '>' | '>=' | '<' | '<=' | 'IN';

const operationFuncs = {
  SELECT: (formattedTables: string, formattedColumns: string) => {
    return `SELECT ${formattedColumns} FROM ${formattedTables}`;
  },
  INSERT: (formattedTables: string, formattedColumns: string) => {
    return `INSERT INTO ${formattedTables} ${formattedColumns} VALUES`;
  },
  UPDATE: (table: string, formattedColumnUpdates: string) => {
    return `UPDATE ${table} SET ${formattedColumnUpdates}`;
  },
  DELETE: (formattedTables: string, _: string) => {
    return `DELETE FROM ${formattedTables}`;
  },
};

interface BaseQueryFactory<
  T extends TableName,
  R extends TableNameToRowType[T] = TableNameToRowType[T],
  C extends StringKeys<R>[] = StringKeys<R>[],
> {
  columns: (...columns: C) => this;
  build: () => { query: string; queryParams: R[keyof R][] };
  toString: () => string;
  execute: () => Promise<R[]>;
}

// Conditional interfaces based on operation
interface SelectQueryFactory<
  T extends TableName,
  R extends TableNameToRowType[T] = TableNameToRowType[T],
> extends BaseQueryFactory<T, R> {
  where: <K extends StringKeys<R> = StringKeys<R>>(
    column: K
  ) => WhereConditions<T, R, SelectQueryFactory<T, R>, K>;
  join: <S extends Exclude<TableName, T>>(secondTable: S) => JoinBuilder<T, S>;
  sort: (orderings: [column: string, direction?: 'ASC' | 'DESC'][]) => this;
  limit: (limit: number) => this;
}

interface UpdateQueryFactory<
  T extends TableName,
  R extends TableNameToRowType[T] = TableNameToRowType[T],
> extends BaseQueryFactory<T, R> {
  where: <K extends StringKeys<R>>(
    column: K
  ) => WhereConditions<T, R, UpdateQueryFactory<T, R>, K>;
}

interface DeleteQueryFactory<
  T extends TableName,
  R extends TableNameToRowType[T] = TableNameToRowType[T],
> extends BaseQueryFactory<T, R> {
  where: <K extends StringKeys<R>>(
    column: K
  ) => WhereConditions<T, R, DeleteQueryFactory<T, R>, K>;
}

interface InsertQueryFactory<
  T extends TableName,
  R extends TableNameToRowType[T] = TableNameToRowType[T],
> extends BaseQueryFactory<T, R> {
  // INSERT doesn't have where clause
  values: (
    ...values: NullishToOptional<R>[]
  ) => SafeOmit<InsertQueryFactory<T, R>, 'values'>;
}

export type Conjunction = 'WHERE' | 'AND' | 'OR';

interface CompoundConditions<
  T extends TableName,
  R extends TableNameToRowType[T],
  F extends
    | SelectQueryFactory<T, R>
    | UpdateQueryFactory<T, R>
    | DeleteQueryFactory<T, R>,
> {
  and: <K extends StringKeys<R>>(column: K) => WhereConditions<T, R, F, K>;
  or: <K extends StringKeys<R>>(column: K) => WhereConditions<T, R, F, K>;
}

type FactoryWithCondition<
  T extends TableName,
  R extends TableNameToRowType[T],
  F extends
    | SelectQueryFactory<T, R>
    | UpdateQueryFactory<T, R>
    | DeleteQueryFactory<T, R>,
> = SafeOmit<F, 'where'> & CompoundConditions<T, R, F>;

interface WhereConditions<
  T extends TableName,
  R extends TableNameToRowType[T],
  F extends
    | SelectQueryFactory<T, R>
    | UpdateQueryFactory<T, R>
    | DeleteQueryFactory<T, R>,
  K extends StringKeys<R> = StringKeys<R>,
> {
  eq: (compareValue: R[K]) => FactoryWithCondition<T, R, F>;
  neq: (compareValue: R[K]) => FactoryWithCondition<T, R, F>;
  lt: (compareValue: R[K]) => FactoryWithCondition<T, R, F>;
  lte: (compareValue: R[K]) => FactoryWithCondition<T, R, F>;
  gt: (compareValue: R[K]) => FactoryWithCondition<T, R, F>;
  gte: (compareValue: R[K]) => FactoryWithCondition<T, R, F>;
  in: (compareValue: R[K]) => FactoryWithCondition<T, R, F>;
}

interface JoinBuilder<
  T extends TableName,
  S extends Exclude<TableName, T>,
  R extends TableNameToRowType[T] = TableNameToRowType[T],
  K extends StringKeys<R> = StringKeys<R>,
  SKeys extends StringKeys<TableNameToRowType[S]> = StringKeys<
    TableNameToRowType[S]
  >,
  F extends BaseQueryFactory<T, R> = BaseQueryFactory<T, R>,
> {
  on: (firstTableColumn: `${T}.${K}`, secondTableColumn: `${S}.${SKeys}`) => F;
}

// Function overloads for proper type inference
function queryFactory<
  T extends TableName,
  R extends TableNameToRowType[T] = TableNameToRowType[T],
>(
  tableName: T,
  operation: 'SELECT',
  repo?: SQLiteRepository
): SelectQueryFactory<T, R>;
function queryFactory<
  T extends TableName,
  R extends TableNameToRowType[T] = TableNameToRowType[T],
>(
  tableName: T,
  operation: 'INSERT',
  repo?: SQLiteRepository
): InsertQueryFactory<T, R>;
function queryFactory<
  T extends TableName,
  R extends TableNameToRowType[T] = TableNameToRowType[T],
>(
  tableName: T,
  operation: 'UPDATE',
  repo?: SQLiteRepository
): UpdateQueryFactory<T, R>;
function queryFactory<
  T extends TableName,
  R extends TableNameToRowType[T] = TableNameToRowType[T],
>(
  tableName: T,
  operation: 'DELETE',
  repo?: SQLiteRepository
): DeleteQueryFactory<T, R>;
function queryFactory<
  T extends TableName,
  R extends TableNameToRowType[T] = TableNameToRowType[T],
  C extends StringKeys<R>[] = StringKeys<R>[],
>(
  tableName: T,
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE',
  repo?: SQLiteRepository
) {
  const tables: TableName[] = [tableName];
  let cols: C | null = null;
  let insertValues:
    | NullishToOptional<R>[keyof NullishToOptional<R>][][]
    | null = null;
  let conditions: [string, ...[Conjunction, string][]] | null = null;
  const sortings: string[] = [];
  let limitCount: number | null = null;
  // let paramCount = 0;
  const params: R[keyof R][] = [];

  let built: { query: string; queryParams: typeof params } | null = null;

  const formatTables = () =>
    tables.length > 1 ? tables.join(' JOIN ') : tableName;

  // Base factory methods available to all operations
  const baseFactory = {
    columns(...columns: C) {
      if (!columns.length) {
        throw new Error(
          `At least one column must be specified if calling .columns()`
        );
      }
      cols = columns;
      return this;
    },
    toString() {
      const formattedColumns = Array.isArray(cols)
        ? `(${cols.join(', ')})`
        : '*';
      let query = operationFuncs[operation](formatTables(), formattedColumns);
      if (insertValues) {
        if (!cols) throw new TypeError(`Insert queries must specify columns`);
        query +=
          ' ' +
          insertValues
            .map((_) => `(${cols!.map((_) => `?`).join(', ')})`)
            .join(', ');
      } else if (conditions) {
        query +=
          ' WHERE ' +
          conditions
            .map((condition) =>
              Array.isArray(condition) ? condition.join(' ') : condition
            )
            .join(' ');
      }
      if (sortings.length) query += sortings.join(', ');
      if (limitCount) query += `LIMIT ${limitCount}`;
      return query;
    },
    build() {
      // TODO: disable for incomplete queries
      if (operation === 'INSERT' && insertValues === null) {
        throw new Error(`Can't build without any values to insert.`);
      }
      built ||= {
        query: this.toString(),
        queryParams:
          operation === 'INSERT'
            ? (insertValues!.flat(1) as R[keyof R][]) // TODO: remove assertion
            : params,
      };
      return built;
    },
    async execute() {
      if (!repo) {
        console.warn(`No SQLiteRepository provided`);
        return;
      }
      const { query, queryParams } = this.build();
      // TODO: query and param validation
      try {
        const result = await repo.execSql(query, queryParams);
        console.log({ result });
        return result[0];
      } catch (error) {
        console.error(error);
        console.log({ query, queryParams });
      }
    },
  };

  const createCondition = <K extends StringKeys<R>>(
    column: K,
    comparator: QueryComparator,
    compareValue: R[K],
    conjunction: Conjunction
  ) => {
    const condition = `${column} ${comparator} $${params.length + 1}`;
    if (conjunction === 'WHERE') {
      if (conditions)
        throw new Error(
          `WHERE should not be called multiple times in one query`
        );
      conditions = [condition];
    } else {
      if (!conditions)
        throw new Error(
          `AND or OR called without a preexisting WHERE; this shouldn't happen.`
        );
      conditions.push([conjunction, condition]);
    }
    params.push(compareValue);
    const { where, ...rest } = factory;
    return {
      ...rest,
      and: (column: K) => createConditions(column, 'AND'),
      or: (column: K) => createConditions(column, 'OR'),
    };
  };

  // Create conditions factory
  const createConditions = <K extends StringKeys<R>>(
    column: K,
    conjunction: Conjunction
  ) => {
    return {
      eq: (compareValue: R[K]) =>
        createCondition(column, '=', compareValue, conjunction),
      neq: (compareValue: R[K]) =>
        createCondition(column, '<>', compareValue, conjunction),
      lt: (compareValue: R[K]) =>
        createCondition(column, '<', compareValue, conjunction),
      lte: (compareValue: R[K]) =>
        createCondition(column, '<=', compareValue, conjunction),
      gt: (compareValue: R[K]) =>
        createCondition(column, '>', compareValue, conjunction),
      gte: (compareValue: R[K]) =>
        createCondition(column, '>=', compareValue, conjunction),
      in: (compareValue: R[K]) =>
        createCondition(column, 'IN', compareValue, conjunction),
    };
  };

  // Build the factory based on operation type
  let factory: any;

  if (operation === 'SELECT') {
    factory = {
      ...baseFactory,
      where: <K extends StringKeys<R>>(column: K) =>
        createConditions(column, 'WHERE'),
      join<
        K extends StringKeys<R>,
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
          on(
            firstTableColumn: `${T}.${K}`,
            secondTableColumn: `${S}.${SKeys}`
          ) {
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
          throw new Error(
            `Limit must be a positive integer; received ${limit}`
          );
        }
        limitCount = limit;
        return this;
      },
    };
  } else if (operation === 'INSERT') {
    factory = {
      ...baseFactory,
      values: (...rows: NullishToOptional<Pick<R, C[number]>>[]) => {
        if (!cols)
          throw new Error(`Columns must be specified before inserting values`);
        // turn objects into arrays of parameters sorted the same way as `cols`
        insertValues = rows.map((row) => {
          return cols!.map((col) => row[col]);
        });
        const { columns, values, ...rest } = factory;
        return rest;
      },
    };
  } else {
    // UPDATE or DELETE
    factory = {
      ...baseFactory,
      where: <K extends StringKeys<R>>(column: K) =>
        createConditions(column, 'WHERE'),
    };
  }

  return factory;
}
