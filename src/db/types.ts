// Card, Snippet, ReviewLog, FSRSParameters
import type { Card, FSRSReview } from 'ts-fsrs';
import { FSRSParameters } from 'ts-fsrs';
import type { TABLE_NAMES } from '../lib/constants';

export interface SRSCard extends Card {
  id: string;
  reference: string;
}

export interface SRSCardReview extends FSRSReview {
  id: string;
  card_id: string;
}

export interface Snippet {
  id: string;
  reference: string;
  next_review: number | null;
  dismissed?: boolean;
}

export interface SnippetReview {
  id: string;
  snippet_id: string;
  review_time: number; // Unix timestamp
}

export type TableName = (typeof TABLE_NAMES)[number];

export type RowTypes = Snippet | SnippetReview;
export interface TableNameToRowType extends Record<TableName, RowTypes> {
  snippet: Snippet;
  snippet_review: SnippetReview;
}
