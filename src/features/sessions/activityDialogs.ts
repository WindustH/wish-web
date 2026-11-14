import type { AskQuestion } from '../../core/api/projections.ts';
import type { AnswerRecord } from './askUser.ts';
import type { InjectionKey } from 'vue';
import type { BlobMention } from '../../core/blobMentions.ts';
export interface QuestionDetail {
  questions: AskQuestion[];
  answers: AnswerRecord[] | null;
  status: string;
}

/** Snapshot owned by the dialog host, independent of a recycled transcript row. */
export interface PeerMessageDetail {
  preview?: boolean;
  author?: { name: string; color: string; to?: string };
  verb: string;
  /** Read-only compatibility with old session history. */
  group?: { id: string; name: string };
  text: string;
  images?: string[];
  note?: string;
  at?: number;
}

/** A user action, independent of the virtual row currently displaying its activity. */
export interface ActivityRequest {
  chipKey: string;
  stepKey: string | null;
  requestId: number;
  solo?: boolean;
  question?: QuestionDetail;
  peer?: PeerMessageDetail;
  lateAnswers?: AnswerRecord[];
  files?: boolean;
  filePath?: string;
  mentions?: readonly { key: string; mention: BlobMention }[];
}

export const openActivityKey: InjectionKey<(request: Omit<ActivityRequest, 'requestId'>) => void> =
  Symbol('open activity');
