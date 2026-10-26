/** A user action, independent of the virtual row currently displaying its activity. */
export interface ActivityRequest {
  chipKey: string;
  stepKey: string | null;
  requestId: number;
  solo?: boolean;
}
