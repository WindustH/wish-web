// Settings errors are reported in one dialog instead of inline text, so a
// failure is noticed wherever the user is (including nested editor pages).
import { shallowRef } from 'vue';
import { describeError } from '../core/i18n/errorMessages';

export interface ErrorReport {
  id: number;
  title: string;
  message: string;
  /** The server's own wording, kept when the message was translated. */
  original?: string;
  hint?: string;
  action?: { label: string; run: () => unknown };
}

const reports = shallowRef<ErrorReport[]>([]);
let next = 1;

export function showError(options: { title: string; error: unknown; hint?: string; action?: ErrorReport['action'] }) {
  const { message, original } = describeError(options.error);
  // The same failure raised twice (e.g. a save retried from two places) is shown once.
  if (reports.value.some(report => report.title === options.title && report.message === message)) return;
  reports.value = [...reports.value, { id: next++, title: options.title, message, original, hint: options.hint, action: options.action }];
}

export function dismissError(id: number) {
  reports.value = reports.value.filter(report => report.id !== id);
}

export function useErrorReports() {
  return reports;
}
