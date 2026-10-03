// The shapes the endpoints take and return. Session and entry views are in projections.ts.
import type { RequestOptions } from './client.ts';
import type { SessionView, ToolSwitches } from './projections.ts';

// Request options callers pass through; a raw body is set by the endpoint itself.
export type EndpointOptions = Omit<RequestOptions, 'body' | 'raw'>;

// Sessions.
export interface SessionsListParams { cursor?: number | string | null; limit?: number; order?: string; query?: string; tag?: string }
export interface SessionsPage { items: SessionView[]; next_cursor: any; has_more: boolean }
export interface CreateSessionBody { provider: string; model: string; name?: string; cwd?: string; reasoning_effort?: string; agent_custom?: string }
export interface ModelChange { provider?: string; model?: string; reasoning_effort?: string }
export interface ShellSettings { program: string; args: string[] | null }

// History.
export interface HistoryQuery { before?: number | null; after?: number | null; limit?: number; order?: 'asc' | 'desc' }
export interface HistorySearchParams { q: string; limit?: number; order?: string; message_types?: string[]; since?: number; until?: number }
export interface HistoryHit { seq: number; kind: string; created_at: number; snippet: string }

// Input and the queue.
export interface MessageBlock { type: string; blob_id: string; filename?: string | null; byte_count?: number | null; placeholder?: string }
// An attachment reference carried by a queued delivery (blob ids are session-qualified).
export interface QueuedAttachment { kind: string; blob_id: string; filename?: string | null; byte_count?: number; placeholder?: string }
export interface QueuedDelivery { id: string; state: 'queued'; text: string; attachments: QueuedAttachment[] }
/** One answer per question: what was chosen or written, or `skipped`. */
export type QuestionAnswer = { skipped: true } | { selected?: string[]; other?: string } | { text: string };

// Blobs.
export interface BlobInfo { id: string; mime_type: string; byte_count: number }
export interface UploadedBlob extends BlobInfo { sha256: string }

// Configuration.
export interface EffectiveConfig { defaults: { provider: string; model: string; reasoning?: { effort?: string }; instructions: string; cwd: string; tools: ToolSwitches }; session_config?: { compaction?: any } }
export interface DefaultModel { provider: string; model: string; reasoning_effort?: string }
// The configuration file as the server shows it - secrets redacted - with the revision a save must name.
export interface ConfigSnapshot { revision: string; config: any }
// The shells the server can run commands in: its default and the ones installed.
export type ShellInfo = { name: string | null; program: string; args: string[] };
export type ShellCatalog = { default: ShellInfo; installed: ShellInfo[] };
// Signing a Codex provider in with ChatGPT in the browser.
export interface ChatgptLogin { status: 'pending' | 'complete' | 'failed' | 'expired' | string; authorization_url?: string; error?: string }
// Just what requireAvailableModel reads from a provider's settings.
export interface ModelCatalogSource { id: string; model_list?: unknown; models?: Record<string, any> | null }
export interface DirectoryListing { path: string; parent: string | null; directories: string[] }

// MCP servers.
/** One tool as an MCP server defines it. */
export interface McpTool { name: string; title?: string; description?: string; inputSchema?: unknown; annotations?: Record<string, unknown> }
/** A configured MCP server and what is known of it. `tools` is null until it has connected once. */
export interface McpServerStatus {
  id: string;
  instances: number;
  server: { name: string | null; version: string | null } | null;
  tools: McpTool[] | null;
  error: string | null;
  stderr: string | null;
  checked_at: number | null;
}

// Skills.
/** A skill as settings list it: where it was found, whether it is off, and whether an earlier one of its name hides it. */
export interface SkillEntry { name: string; description: string; category: string | null; dir: string; source: string; disabled: boolean; shadowed: boolean }
export interface SkillsSnapshot {
  /** Wish's own directory. */
  dir: string;
  roots: { source: string; dir: string; exists: boolean }[];
  skills: SkillEntry[];
  problems: { path: string; message: string }[];
}
/** A skill's instructions and the files beside them, relative to its directory. */
export interface SkillContent { name: string; description: string; dir: string; body: string; files: string[]; more_files: number }

// Web search.
/** A search service Wish knows. `borrows_from` lists the model presets a subscription's search comes with. */
export interface SearchPreset {
  id: string;
  name: string;
  brand?: string;
  protocol: string;
  borrows_from?: string[];
  key: 'borrowed' | 'required' | 'optional' | 'none';
  key_url?: string;
  docs_url?: string;
  base_url_required?: boolean;
  base_url_placeholder?: string;
  region?: 'global' | 'cn';
}
/** A configured search provider and whether it can search now. */
export interface SearchProviderStatus {
  id: string;
  preset: string;
  name: string;
  protocol: string;
  base_url: string | null;
  auth_provider: string | null;
  enabled: boolean;
  ordered: boolean;
  available: boolean;
  problem: string | null;
}
export interface SearchHit { title: string; url: string; snippet?: string; site?: string; published?: string }

// Usage and storage.
export interface UsageTotals {
  usage_records: number;
  committed_responses: number;
  tokens: { input_tokens: number; output_tokens: number; total_tokens: number; reasoning_tokens: number };
  cache: { request_hit_ratio: number | null; read_input_tokens: number; write_input_tokens: number };
}
export interface UsageSnapshot {
  statistics: {
    model_attempts: number;
    attempts_with_usage: number;
    attempts_without_usage: number;
    totals: UsageTotals;
    by_provider_model: { provider: string | null; model: string | null; totals: UsageTotals }[];
  };
}
export interface StorageSnapshot {
  bytes: { session_data: number; blobs: number; executions: number; service_data: number; total: number };
  counts: { executions: number; blobs: number; image_jobs: number; context_generations: number };
}
/** What one session keeps: its history in the database, its attachments and its commands' output. */
export interface SessionBytes { history: number; attachments: number; shell: number; total: number }
export interface SessionStorage {
  id: string;
  name: string;
  provider: string;
  model: string | null;
  cwd: string;
  created_at: number;
  updated_at: number;
  phase: string;
  running: boolean;
  tags: string[] | null;
  context_tokens: number | null;
  messages: { user: number; assistant: number; tool_calls: number };
  bytes: SessionBytes;
}
// What pruning released, or would: history outside the sessions' context and the files only it named.
export interface PruneCounts { messages: number; events: number; files: number; bytes: { history: number; files: number; total: number } }
export interface PruneResult extends PruneCounts {
  sessions: (PruneCounts & { id: string })[];
  skipped: { id: string; reason: string }[];
  // Present once applied: the database's size before and after it was compacted.
  database?: { before: number; after: number };
}
