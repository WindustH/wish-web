// Skills as settings show them: a tree of the folders they sit in, the same folder in different
// directories being one, as `wish skill list` shows it to the model.
import type { SkillEntry } from '../../core/api/types.ts';

export interface SkillFolder { path: string; name: string; folders: SkillFolder[]; skills: SkillEntry[] }
export type SkillRow =
  | { kind: 'folder'; folder: SkillFolder; depth: number }
  | { kind: 'skill'; skill: SkillEntry; depth: number };

/** The tree of the skills, each folder's folders first, then its skills, in name order. */
export function skillTree(skills: SkillEntry[]): SkillFolder {
  const root: SkillFolder = { path: '', name: '', folders: [], skills: [] };
  for (const skill of skills) {
    let folder = root;
    for (const name of skill.category?.split('/') ?? []) {
      let next = folder.folders.find(child => child.name === name);
      if (!next) folder.folders.push(next = { path: folder.path ? `${folder.path}/${name}` : name, name, folders: [], skills: [] });
      folder = next;
    }
    folder.skills.push(skill);
  }
  const order = (folder: SkillFolder) => {
    folder.folders.sort((a, b) => a.name.localeCompare(b.name));
    folder.skills.sort((a, b) => a.name.localeCompare(b.name));
    folder.folders.forEach(order);
  };
  order(root);
  return root;
}

/** Every folder of the tree, by path. */
export function foldersOf(root: SkillFolder): Map<string, SkillFolder> {
  const folders = new Map<string, SkillFolder>();
  const visit = (folder: SkillFolder) => { folders.set(folder.path, folder); folder.folders.forEach(visit); };
  visit(root);
  return folders;
}

/** Every skill in a folder and the folders in it. */
export function skillsIn(folder: SkillFolder): SkillEntry[] {
  return [...folder.folders.flatMap(skillsIn), ...folder.skills];
}

/** The rows shown, a closed folder's without what is in it. */
export function skillRows(folder: SkillFolder, open: (folder: SkillFolder) => boolean, depth = 0): SkillRow[] {
  return [
    ...folder.folders.flatMap(child => [
      { kind: 'folder' as const, folder: child, depth },
      ...(open(child) ? skillRows(child, open, depth + 1) : []),
    ]),
    ...folder.skills.map(skill => ({ kind: 'skill' as const, skill, depth })),
  ];
}
