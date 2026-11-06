<script setup lang="ts">
import Markdown from '../../domain/references/ReferenceMarkdown.vue';
const samples = [
  [
    'typescript',
    '// A small Wish client\ninterface Session { id: string; title: string }\nasync function loadSession(id: string): Promise<Session> {\n  const response = await fetch(`/api/sessions/${id}`);\n  if (!response.ok) throw new Error("Request failed");\n  return response.json();\n}',
  ],
  [
    'python',
    '# Keep the original order\ndef recent_sessions(items, limit=5):\n    return [item for item in items if item["active"]][:limit]',
  ],
  [
    'rust',
    '// Share immutable state\nuse std::sync::Arc;\nfn session_name(name: Option<&str>) -> String {\n    name.unwrap_or("Wish").to_owned()\n}',
  ],
  ['bash', '# Start a local server\nexport PORT=8790\npnpm build && node serve.ts'],
  ['json', '{\n  "name": "Wish",\n  "stream": true,\n  "limit": 50,\n  "tags": ["work", "notes"]\n}'],
  ['html', '<section class="session" aria-label="Wish">\n  <h2>Recent sessions</h2>\n</section>'],
  ['diff', '@@ -1,2 +1,2 @@\n-const limit = 10;\n+const limit = 50;\n const title = "Wish";'],
];
const text = samples.map(([language, code]) => `\`\`\`${language}\n${code}\n\`\`\``).join('\n\n');
</script>
<template><Markdown :text="text" /></template>
