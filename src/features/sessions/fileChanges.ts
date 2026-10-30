// File cards are projections of durable tool results, never inferred from shell text.
import { fileEdits, diffCounts, parseDiff, type FileEdit } from './entries/processDetails.ts';
import { cfg } from '../../core/config.ts';
export interface FileChange {
  path: string;
  edits: FileEdit[];
  added: number;
  removed: number;
}
export function changedFiles(chip: any): FileChange[] {
  const files = new Map<string, FileChange>();
  for (const step of chip.steps ?? [])
    for (const edit of fileEdits(step)) {
      if (typeof edit.path !== 'string' || !edit.path || edit.changed === false) continue;
      const file: FileChange = files.get(edit.path) ?? { path: edit.path, edits: [], added: 0, removed: 0 };
      const counts = diffCounts(parseDiff(edit.diff ?? ''));
      file.edits.push(edit);
      file.added += counts.added;
      file.removed += counts.removed;
      files.set(edit.path, file);
    }
  return [...files.values()];
}
export function rowFileChanges(row: any) {
  const chips =
    row.type === 'process'
      ? [row]
      : row.type === 'chips'
        ? row.chips
        : row.type === 'image_album'
          ? row.items.flatMap((item: any) => item.before ?? [])
          : (row.before ?? []);
  return chips
    .map((chip: any) => ({ chipKey: chip.key as string, files: changedFiles(chip) }))
    .filter((group: { files: FileChange[] }) => group.files.length);
}
export const stackedFiles = (files: readonly FileChange[]) => files.length > cfg.history.fileCardLimit;
export function fileCardsHeight(row: any): number {
  return rowFileChanges(row).reduce(
    (height: number, group: { files: FileChange[] }) =>
      height + (stackedFiles(group.files) ? 96 : group.files.length * 76) + 12,
    0,
  );
}
