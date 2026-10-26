import type { AskQuestion } from '../../core/api/projections.ts';
import type { AnswerRecord } from './askUser.ts';
import type { InjectionKey } from 'vue';
export interface QuestionDetail { questions: AskQuestion[]; answers: AnswerRecord[] | null; status: string }

/** A user action, independent of the virtual row currently displaying its activity. */
export interface ActivityRequest {
  chipKey: string;
  stepKey: string | null;
  requestId: number;
  solo?: boolean;
  question?: QuestionDetail;
  files?: boolean;
  filePath?: string;
}

export const openActivityKey: InjectionKey<(request: Omit<ActivityRequest, 'requestId'>) => void> = Symbol('open activity');
