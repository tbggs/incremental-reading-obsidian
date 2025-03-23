// Card, Extract, ReviewLog, FSRSParameters
import { Card, FSRSParameters } from 'ts-fsrs';

export interface ReviewItem extends Card {
  id: number;
  blockId: string;
}

export interface ReviewLog {
  id: number;
}