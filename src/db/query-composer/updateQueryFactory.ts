import type { StringKeys } from 'src/lib/utility-types';
import type { SQLiteRepository } from '../repository';
import type { TableName } from '../types';
import { createConditions } from './QueryComposer';
import type {
  Row,
  UpdateQueryFactory,
  MutationProps,
  Conjunction,
} from './QueryComposer.types';

function updateQueryFactory<
  T extends TableName,
  R extends Row<T> = Row<T>,
  C extends StringKeys<R> = StringKeys<R>,
>(tableName: T, repo?: SQLiteRepository): UpdateQueryFactory<T, R> {
  // const cols: C[] | null = null;
  let update: MutationProps<T, R, C> | null = null;
  const conditions: [string, ...[Conjunction, string][]] | null = null;
  const params: R[keyof R][] = [];
  const built: { query: string; queryParams: typeof params } | null = null;

  const factory = {
    set(partialRow: MutationProps<T, R, C>) {
      update = partialRow;

      return {
        where: <K extends StringKeys<R>>(column: K) =>
          createConditions(column, 'WHERE', params, conditions),
      };
    },
  };
}
