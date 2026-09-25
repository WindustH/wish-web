// Shared by snapshots and live events: preserve backend diagnostics for display.
export interface DisplayFailure { message: string; family: string }

// `value` is a backend failure value (string, error object or single-key variant) or a thrown error.
export function displayFailure(value: any, family = ''): DisplayFailure | null {
  if (value == null) return null;
  if (typeof value === 'string') return { message: value, family };
  if (value.name === 'AbortError') return null;
  if (value.message || value.detail || value.reason) {
    const details = [family, value.status ? `HTTP ${value.status}` : '', value.code].filter(Boolean);
    return { message: String(value.detail || value.message || value.reason), family: details.join(' · ') };
  }
  const entries = Object.entries(value);
  if (entries.length === 1) return displayFailure(entries[0][1], entries[0][0]);
  return { message: JSON.stringify(value), family };
}

export function operationFailure(operation: any): DisplayFailure | null {
  if (!operation) return null;
  if (operation.type === 'operation_failed') return displayFailure(operation.error);
  const outcome = operation.outcome;
  if (outcome && typeof outcome === 'object') {
    if ('Failed' in outcome) return displayFailure(outcome.Failed);
    if ('StreamFailed' in outcome) return displayFailure(outcome.StreamFailed.reason, 'StreamFailed');
    if ('ModelStopped' in outcome) return displayFailure(outcome.ModelStopped.stop_reason, 'ModelStopped');
  }
  if (outcome === 'ToolOutcomeUnknown') return displayFailure('ToolOutcomeUnknown');
  return null; // Completion and explicit interruption are not failures.
}
