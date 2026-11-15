import type { LibraryFolder } from '../../core/api/types.ts';
export type LibraryFolderAction =
  | { kind: 'create' | 'link' }
  | { kind: 'rename' | 'delete'; folder: LibraryFolder }
  | { kind: 'move'; ids: string[]; from: string | null };

export function folderTrail(folders: LibraryFolder[], id: string | null): LibraryFolder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const result: LibraryFolder[] = [],
    seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const folder = byId.get(id);
    if (!folder) break;
    result.unshift(folder);
    id = folder.parent;
  }
  return result;
}
