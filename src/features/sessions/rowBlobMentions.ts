import { readBlobMention, type BlobMention } from '../../core/blobMentions.ts';
import { stepToolName, toolOutput } from './entries/processDetails.ts';

/** Project only explicit successful blob tool results, never arbitrary command output. */
export function rowBlobMentions(row: any): { key: string; mention: BlobMention }[] {
  const chips =
    row.type === 'process'
      ? [row]
      : row.type === 'chips'
        ? row.chips
        : row.type === 'image_album'
          ? row.items.flatMap((item: any) => item.before ?? [])
          : (row.before ?? []);
  const result: { key: string; mention: BlobMention }[] = [];
  for (const chip of chips ?? [])
    for (const step of chip.steps ?? []) {
      if (step.kind !== 'entry' || stepToolName(step) !== 'blob') continue;
      const mention = readBlobMention(toolOutput(step)?.mention);
      if (mention) result.push({ key: step.key, mention });
    }
  return result;
}
