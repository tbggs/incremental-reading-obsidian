import { randomUUID } from 'crypto';
import type { ISRSCard, SRSCardRow } from 'src/db/types';
import { createEmptyCard, type State } from 'ts-fsrs';

/**
 *
 */
export default class SRSCard implements ISRSCard {
  id: string;
  reference: string;
  created_at: Date;
  due: Date;
  last_review?: Date;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: State;

  constructor(reference: string, creationTime?: Date) {
    this.id = randomUUID();
    this.reference = reference;
    this.created_at = creationTime || new Date();
    const card = createEmptyCard(this.created_at);
    Object.assign(this, card);
  }

  static rowToDisplay(cardRow: SRSCardRow): ISRSCard {
    const { created_at, due, last_review, ...rest } = cardRow;
    return {
      ...rest,
      created_at: new Date(created_at),
      due: new Date(due),
      ...(last_review && {
        last_review: new Date(last_review),
      }),
    };
  }

  static displayToRow(card: ISRSCard): SRSCardRow {
    const { created_at, due, last_review, ...rest } = card;
    return {
      ...rest,
      created_at: Date.parse(created_at.toISOString()),
      due: Date.parse(due.toISOString()),
      last_review: last_review ? Date.parse(last_review?.toISOString()) : null,
    };
  }
}
