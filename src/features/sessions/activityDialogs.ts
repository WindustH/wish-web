import type { InjectionKey } from 'vue';
/** A user action, independent of the virtual row currently displaying its activity. */
export interface ActivityRequest {
  chipKey: string;
  stepKey: string | null;
  requestId: number;
  solo?: boolean;
  files?: boolean;
  filePath?: string;
}

export const openActivityKey: InjectionKey<(request: Omit<ActivityRequest, 'requestId'>) => void> = Symbol('open activity');
