import QueryComposer from 'src/db/query-composer/QueryComposer';
import { SQLiteRepository } from 'src/db/repository';
import { MS_PER_DAY } from 'src/lib/constants';
import { describe, it, expect } from 'vitest';

describe('Query Composer', () => {
  // const testRepo = new SQLiteRepository(); // TODO: mock the App instance to enable integration tests;
  const db = new QueryComposer();

  describe('SELECT queries', () => {
    it('with specified columns and conditions', () => {
      // Should have access to snippet-specific columns
      const snippetQuery = db
        .select('snippet')
        .columns('reference', 'next_review')
        .where('reference')
        .eq('test.md')
        .and('dismissed')
        .eq(false);
      const result = snippetQuery.build();
      console.log(result);
      expect(result.query).toContain(
        'SELECT (reference, next_review) FROM snippet WHERE reference = $1 AND dismissed = $2'
      );
      expect(result.queryParams).toEqual(['test.md', false]);

      const otherQuery = db // TODO: test OR query
        .select('snippet')
        .columns('reference', 'next_review')
        .where('next_review')
        .gte(Date.now())
        .or('dismissed')
        .eq(true);
    });
  });

  describe('INSERT', () => {
    it('should construct queries with arguments instead of interpolating', () => {
      const insertValues = [
        {
          reference: `increading/snippets/example-snippet-name`,
          next_review: Date.now() + MS_PER_DAY,
        },
        {
          reference: `increading/snippets/incremental-learning`,
          next_review: Date.now() + MS_PER_DAY * 2,
        },
      ];
      const insertQuery = db
        .insert('snippet')
        .columns('reference', 'next_review')
        .values(...insertValues);

      const { query, queryParams } = insertQuery.build();
      expect(query).toContain(
        'INSERT INTO snippet (reference, next_review) VALUES (?, ?), (?, ?)'
      );
      // query params
      expect(queryParams).toEqual([
        insertValues[0].reference,
        insertValues[0].next_review,
        insertValues[1].reference,
        insertValues[1].next_review,
      ]);
    });
  });
});
