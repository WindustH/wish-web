// Filename hints take precedence over the generic text/plain MIME returned by file sniffing.
const extensions: Record<string, string> = {};
for (const [language, suffixes] of Object.entries({
  javascript: 'js jsx mjs cjs',
  typescript: 'ts tsx mts cts',
  python: 'py pyw pyi',
  rust: 'rs',
  go: 'go',
  java: 'java',
  kotlin: 'kt kts',
  swift: 'swift',
  c: 'c h',
  cpp: 'cc cpp cxx hpp hxx',
  csharp: 'cs',
  objectivec: 'm mm',
  bash: 'sh bash zsh fish',
  powershell: 'ps1 psm1 psd1',
  ruby: 'rb',
  php: 'php',
  perl: 'pl pm',
  lua: 'lua',
  r: 'r',
  sql: 'sql',
  graphql: 'graphql gql',
  json: 'json jsonc jsonl ipynb',
  yaml: 'yaml yml',
  ini: 'toml ini cfg conf',
  xml: 'html htm xhtml xml svg vue svelte',
  css: 'css',
  scss: 'scss',
  less: 'less',
  markdown: 'md markdown mdx',
  diff: 'diff patch',
  plaintext: 'txt log csv tsv',
}))
  for (const suffix of suffixes.split(' ')) extensions[suffix] = language;

export function codeLanguage(filename: string, mime = ''): string | undefined {
  const name = filename.split(/[\\/]/).at(-1)?.toLowerCase() ?? '';
  if (/^(dockerfile|containerfile)(\.|$)/.test(name)) return 'dockerfile';
  if (/^(makefile|gnumakefile)$/.test(name)) return 'makefile';
  if (/^\.(bashrc|zshrc|profile|bash_profile)$/.test(name)) return 'bash';
  if (/^\.env(\.|$)/.test(name)) return 'ini';
  const extension = extensions[name.split('.').at(-1) ?? ''];
  if (extension) return extension;
  const type = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  if (/\/(?:[^/]+\+)?json$/.test(type)) return 'json';
  if (/\/(?:[^/]+\+)?xml$/.test(type) || type === 'text/html') return 'xml';
  if (/\/(?:x-)?javascript$/.test(type)) return 'javascript';
  if (type === 'text/markdown') return 'markdown';
  return type.startsWith('text/') ? 'plaintext' : undefined;
}

export function sourcePreviewKind(filename: string, mime = ''): 'html' | 'markdown' | 'svg' | undefined {
  const extension = filename.split('.').at(-1)?.toLowerCase();
  if (extension === 'svg' || mime === 'image/svg+xml') return 'svg';
  if (['html', 'htm', 'xhtml'].includes(extension ?? '') || mime === 'text/html') return 'html';
  if (['md', 'markdown', 'mdx'].includes(extension ?? '') || mime === 'text/markdown') return 'markdown';
}
