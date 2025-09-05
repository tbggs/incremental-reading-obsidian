// Card, Snippet, ReviewLog, FSRSParameters
import type { Card } from 'ts-fsrs';
import { FSRSParameters } from 'ts-fsrs';
import type { TABLE_NAMES } from '../lib/constants';

// export interface SRSCard extends Card {
//   id: number;
//   blockId: string;
// }

export interface Snippet {
  id?: number;
  reference: string;
  next_review: number | null;
  dismissed?: boolean;
}

export interface SnippetReview {
  id: number;
  snippet_id: number;
  review_time: number; // Unix timestamp
  reference: string;
}

export type TableName = (typeof TABLE_NAMES)[number];

export type RowTypes = Snippet | SnippetReview;
export interface TableNameToRowType extends Record<TableName, RowTypes> {
  snippet: Snippet;
  snippet_review: SnippetReview;
}
