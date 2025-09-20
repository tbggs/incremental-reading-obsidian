// Card, Snippet, ReviewLog, FSRSParameters
import type { Card, FSRSReview } from 'ts-fsrs';
import { FSRSParameters } from 'ts-fsrs';
import type { TABLE_NAMES } from '../lib/constants';
import type { SafeOmit } from 'src/lib/utility-types';

export interface ISRSCard extends Card {
  id: string;
  reference: string;
  created_at: Date;
}

export interface SRSCardRow
  extends SafeOmit<ISRSCard, 'created_at' | 'due' | 'last_review'> {
  created_at: number;
  due: number;
  last_review: number | null;
}
export interface ISRSCardReview extends FSRSReview {
  id: string;
  card_id: string;
}

export interface ISnippet {
  id: string;
  reference: string;
  due: number | null;
  dismissed?: boolean;
  priority: number;
  parent?: string;
}

export interface IDueSnippet extends ISnippet {
  due: number;
}

export interface ISnippetReview {
  id: string;
  snippet_id: string;
  review_time: number; // Unix timestamp
}

export type TableName = (typeof TABLE_NAMES)[number];

export type RowTypes = ISnippet | ISnippetReview | SRSCardRow | ISRSCardReview;
export interface TableNameToRowType extends Record<TableName, RowTypes> {
  snippet: ISnippet;
  snippet_review: ISnippetReview;
  srs_card: SRSCardRow;
  srs_card_review: ISRSCardReview;
}
