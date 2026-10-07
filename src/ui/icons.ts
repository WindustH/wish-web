// Wish's own icons: the inside of a 24×24 SVG that Icon.vue strokes at 2 with round caps and joins.
// Two tones: an object's body is washed with its colour (SOFT) under a full-strength outline, so the
// icons read as solid things rather than wire; controls - arrows, crosses, checks - stay single
// strokes. Shapes fill the grid to about 2.5 units from its edge. Where the app has a concept of its
// own - the service that holds sessions, model providers, MCP servers, reasoning, a run's steps,
// queued messages - the icon draws that concept, not a stock pictogram. Conversation icons share
// one bubble: a soft rectangle with its tail at the lower left. Brand logos are not here: they come
// from @lobehub/icons-static-svg (ProviderIcon).
const SOFT = 'fill="currentColor" fill-opacity=".18"';
const SOLID = 'fill="currentColor" stroke="none"';
const dot = (x: number, y: number) => `M${x} ${y}h.01`;
// The shared conversation bubble, 17 wide, its tail under the left third.
const BUBBLE = 'M3 7.5A3.5 3.5 0 0 1 6.5 4h11A3.5 3.5 0 0 1 21 7.5v6a3.5 3.5 0 0 1-3.5 3.5H10.5L6 20.5V17h-.5A2.5 2.5 0 0 1 3 14.5Z';

export const ICONS: Record<string, string> = {
  // Controls
  'chevron-down': '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
  'chevron-left': '<path d="m14.5 6-6 6 6 6"/>',
  'chevron-right': '<path d="m9.5 6 6 6-6 6"/>',
  'chevrons-up-down': '<path d="m7.5 9 4.5-4.5L16.5 9m-9 6 4.5 4.5 4.5-4.5"/>',
  'arrow-left': '<path d="M20 12H5m6-6.5L4.5 12l6.5 6.5"/>',
  'arrow-down': '<path d="M12 4v15m-6.5-6.5L12 19l6.5-6.5"/>',
  'arrow-up': '<path d="M12 20V5m-6.5 6.5L12 5l6.5 6.5"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  plus: '<path d="M12 4.5v15M4.5 12h15"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  'ellipsis-vertical': `<path d="${dot(12, 5.5)}${dot(12, 12)}${dot(12, 18.5)}" stroke-width="3"/>`,
  'external-link': '<path d="M10 5H7a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3v-3M14 4h6v6m0-6-8.5 8.5"/>',
  'log-out': `<path d="M10 4H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h3Z" ${SOFT} stroke="none"/><path d="M10 4H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h3m5.5-12.5 4.5 4.5-4.5 4.5M20 12H9.5"/>`,
  // The sidebar: its column in shade.
  'panel-left': `<path d="M9.5 4H6.5A3.5 3.5 0 0 0 3 7.5v9A3.5 3.5 0 0 0 6.5 20h3Z" ${SOFT} stroke="none"/><rect x="3" y="4" width="18" height="16" rx="3.5"/><path d="M9.5 4v16"/>`,
  // Track and progress.
  'loader-circle': '<circle cx="12" cy="12" r="8.5" stroke-opacity=".22"/><path d="M20.5 12A8.5 8.5 0 0 0 12 3.5"/>',
  'refresh-cw': '<path d="M20 12a8 8 0 0 1-13.9 5.4M4 12a8 8 0 0 1 13.9-5.4M18.5 3v4h-4M5.5 21v-4h4"/>',
  search: `<circle cx="10.5" cy="10.5" r="6.5" ${SOFT}/><path d="m15.5 15.5 5 5"/>`,
  // An eye: what a password field shows, or (struck through) hides.
  eye: `<path d="M2.5 12C4.7 7.7 8 5.5 12 5.5s7.3 2.2 9.5 6.5c-2.2 4.3-5.5 6.5-9.5 6.5S4.7 16.3 2.5 12Z" ${SOFT}/><circle cx="12" cy="12" r="2.8"/>`,
  'eye-off': `<path d="M2.5 12C4.7 7.7 8 5.5 12 5.5s7.3 2.2 9.5 6.5c-2.2 4.3-5.5 6.5-9.5 6.5S4.7 16.3 2.5 12Z" ${SOFT}/><path d="M4.5 4.5l15 15"/>`,
  // A skill: a book of instructions, with the spark of the know-how in it.
  skill: `<path d="M5.5 3.5h12a1 1 0 0 1 1 1V20.5h-13a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" ${SOFT}/><path d="M3.5 18.5a2 2 0 0 1 2-2h13"/><path d="M11.5 6.5c.3 1.7 1 2.4 2.7 2.7-1.7.3-2.4 1-2.7 2.7-.3-1.7-1-2.4-2.7-2.7 1.7-.3 2.4-1 2.7-2.7Z" ${SOLID}/>`,
  key: `<circle cx="8" cy="15.5" r="4.5" ${SOFT}/><path d="m11.3 12.2 8.2-8.2m-3.2 3.2 2.6 2.6m-5.3-.1 1.8 1.8"/>`,
  // Send: a folded paper plane - the crane's cousin - its upper wing solid, the lower in shade,
  // the fold between them.
  send: '<path d="M21 3.25 3.5 10.25l7.5 3 3 7.5Z" fill="currentColor" fill-opacity=".3"/><path d="M21 3.25 3.5 10.25l7.5 3Z" fill="currentColor"/><path d="m11 13.25 10-10"/>',
  square: `<rect x="6" y="6" width="12" height="12" rx="3" ${SOFT}/>`,
  download: `<path d="M4 15.5V17a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1.5" ${SOFT}/><path d="M12 3.5v11m-5-4.5 5 5 5-5"/>`,

  // Things
  pencil: `<path d="M15.8 4.2a2.4 2.4 0 0 1 3.4 3.4L8.5 18.3l-4.7 1.9 1.9-4.7Z" ${SOFT}/><path d="m13.5 6.5 4 4"/>`,
  'trash-2': `<path d="m6 7 .9 11.6a2 2 0 0 0 2 1.9h6.2a2 2 0 0 0 2-1.9L18 7Z" ${SOFT}/><path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m-5 4v5.5m4-5.5v5.5"/>`,
  copy: `<path d="M15.5 8.5v-2A2.5 2.5 0 0 0 13 4H6.5A2.5 2.5 0 0 0 4 6.5V13a2.5 2.5 0 0 0 2.5 2.5h2"/><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5" ${SOFT}/>`,
  // Pasted text.
  clipboard: `<rect x="4.5" y="4.5" width="15" height="16" rx="3" ${SOFT}/><rect x="9" y="3" width="6" height="3.5" rx="1.2"/><path d="M8.5 11h7m-7 4h4.5"/>`,
  save: `<path d="M4.5 7A2.5 2.5 0 0 1 7 4.5h9L19.5 8v9a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 17Z" ${SOFT}/><path d="M8.5 4.5V8h6.5V4.5M8 19.5V14h8v5.5"/>`,
  image: `<rect x="3.5" y="4" width="17" height="16" rx="3.5" ${SOFT}/><circle cx="9" cy="9.5" r="1.8"/><path d="m4 17.5 5-5 3.5 3.5 2.5-2.5 5 5"/>`,
  paperclip: '<path d="m15.5 8-6.3 6.3a1.9 1.9 0 0 0 2.7 2.7l6.6-6.6a3.8 3.8 0 0 0-5.4-5.4l-6.6 6.6a5.7 5.7 0 0 0 8 8l5-5"/>',
  tag: `<path d="M4 12.4V5.5A1.5 1.5 0 0 1 5.5 4h6.9l7.6 7.6a1.8 1.8 0 0 1 0 2.5l-5.9 5.9a1.8 1.8 0 0 1-2.5 0Z" ${SOFT}/><path d="${dot(8.5, 8.5)}" stroke-width="3"/>`,
  // A folder: back leaf and the front panel over it, the front in shade.
  folder: `<path d="M3.5 8V6.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V9"/><path d="M3.5 9.5h17v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" ${SOFT}/>`,
  // A new folder: the folder, and a plus on it.
  'folder-plus': `<path d="M3.5 8V6.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V9"/><path d="M3.5 9.5h17v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" ${SOFT}/><path d="M12 11.8v5.4M9.3 14.5h5.4"/>`,
  // Pinned to the top: a pushpin, its head filled.
  pin: `<path d="M9 3.5h6l-.9 5.6 3.4 3.4H6.5l3.4-3.4Z" ${SOFT}/><path d="M9 3.5h6l-.9 5.6 3.4 3.4H6.5l3.4-3.4ZM12 12.5v8"/>`,
  house: `<path d="M4 10.5 12 4l8 6.5v8a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9V20H5.5A1.5 1.5 0 0 1 4 18.5Z" ${SOFT}/>`,
  'file-diff': `<path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8Z" ${SOFT}/><path d="M14 3v5h5M9.5 11.5h5M12 9v5m-2.5 3.5h5"/>`,
  terminal: `<rect x="3" y="4" width="18" height="16" rx="3.5" ${SOFT}/><path d="m7 9.5 3 2.5-3 2.5m6 .5h4"/>`,
  globe: `<circle cx="12" cy="12" r="9" ${SOFT}/><path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z"/>`,
  // A chunky six-tooth gear.
  settings: `<path d="M9.6 5.32 9.59 3.02h4.82l0 2.3 2.17 1.26 2-1.16 2.4 4.17-1.99 1.15v2.52l1.99 1.15-2.4 4.17-2-1.16-2.17 1.26v2.3H9.59l.01-2.3-2.18-1.26-2 1.16-2.4-4.17 1.99-1.15v-2.52L3.02 9.59l2.4-4.17 2 1.16Z" ${SOFT}/><circle cx="12" cy="12" r="3"/>`,
  // A session's own settings: sliders.
  tune: `<path d="M4 8h8.5m4 0H20M4 16h3.5m4 0H20"/><circle cx="14.5" cy="8" r="2.5" ${SOFT}/><circle cx="9.5" cy="16" r="2.5" ${SOFT}/>`,
  sun: `<circle cx="12" cy="12" r="4.2" ${SOFT}/><path d="M18.6 12h2.6m-4.53 4.67 1.84 1.84M12 18.6v2.6m-4.67-4.53-1.84 1.84M5.4 12H2.8m4.53-4.67L5.49 5.49M12 5.4V2.8m4.67 4.53 1.84-1.84"/>`,
  moon: `<path d="M20 15.2A8.5 8.5 0 1 1 8.8 4a9.5 9.5 0 0 0 11.2 11.2Z" ${SOFT}/>`,
  monitor: `<rect x="3" y="4" width="18" height="12.5" rx="3" ${SOFT}/><path d="M8.5 20.5h7M12 16.5v4"/>`,
  // Setting up: a spark and its small twin, solid.
  sparkles: `<path d="M10.5 3.5c.7 4 2.5 5.8 6.5 6.5-4 .7-5.8 2.5-6.5 6.5-.7-4-2.5-5.8-6.5-6.5 4-.7 5.8-2.5 6.5-6.5Z" ${SOFT}/><path d="M18 14.5c.35 1.9 1.1 2.65 3 3-1.9.35-2.65 1.1-3 3-.35-1.9-1.1-2.65-3-3 1.9-.35 2.65-1.1 3-3Z" ${SOLID}/>`,

  // Signs
  info: `<circle cx="12" cy="12" r="9" ${SOFT}/><path d="M12 11v5.5${dot(12, 7.8)}"/>`,
  'triangle-alert': `<path d="M10.2 4.6a2.1 2.1 0 0 1 3.6 0l7 12.2a2.1 2.1 0 0 1-1.8 3.2H5a2.1 2.1 0 0 1-1.8-3.2Z" ${SOFT}/><path d="M12 9.5v4.5${dot(12, 17)}"/>`,
  clock: `<circle cx="12" cy="12" r="9" ${SOFT}/><path d="M12 7v5l3.5 2"/>`,
  'circle-dot': `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3" ${SOLID}/>`,

  // Wish's own concepts
  // Sessions: a conversation standing on the server that keeps it.
  service: `<path d="M6 5.5A2.5 2.5 0 0 1 8.5 3h7A2.5 2.5 0 0 1 18 5.5v3a2.5 2.5 0 0 1-2.5 2.5H11l-2.5 2.3V11A2.5 2.5 0 0 1 6 8.5Z" ${SOFT}/><rect x="3.5" y="15" width="17" height="5.5" rx="2"/><path d="${dot(7.2, 17.75)}" stroke-width="2.6"/>`,
  // Model providers: a cloud with a spark in it.
  providers: `<path d="M6.5 18.5a4 4 0 0 1-.3-8 5.8 5.8 0 0 1 11.1-1.4 4.6 4.6 0 0 1 .7 9.4Z" ${SOFT}/><path d="M12 10.8c.35 1.9 1.1 2.65 3 3-1.9.35-2.65 1.1-3 3-.35-1.9-1.1-2.65-3-3 1.9-.35 2.65-1.1 3-3Z" ${SOLID}/>`,
  // Groups: two people.
  users: `<circle cx="9" cy="8" r="3.5" ${SOFT}/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4"/><path d="M16.5 14.3a5.5 5.5 0 0 1 4 5.2"/>`,
  // MCP: two servers linked through the bridge.
  mcp: `<rect x="3" y="3" width="8" height="8" rx="2.5" ${SOFT}/><rect x="13" y="13" width="8" height="8" rx="2.5"/><path d="M11 7h2.5A3.5 3.5 0 0 1 17 10.5V13M7 11v2.5a3.5 3.5 0 0 0 3.5 3.5H13"/>`,
  // Interface: a window, and light and dark in it.
  appearance: `<rect x="3" y="4" width="18" height="16" rx="3.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 7.5a4.5 4.5 0 0 0 0 9Z" ${SOLID}/>`,
  // Debug: a connection's pulse.
  diagnostics: `<rect x="3" y="4.5" width="18" height="15" rx="3.5" ${SOFT}/><path d="M6.5 12.5H9l1.5-3.5 3 7 1.5-3.5h2.5"/>`,
  // Statistics: rounded columns on a floor.
  stats: `<rect x="4.5" y="12" width="4" height="8" rx="1.5" ${SOFT}/><rect x="10" y="4.5" width="4" height="15.5" rx="1.5" ${SOFT}/><rect x="15.5" y="8.5" width="4" height="11.5" rx="1.5" ${SOFT}/>`,
  // Sessions and data: the store they are kept in, its lid in shade and two layers below.
  storage: `<ellipse cx="12" cy="6" rx="7.5" ry="2.75" ${SOFT}/><path d="M4.5 6v12c0 1.52 3.36 2.75 7.5 2.75s7.5-1.23 7.5-2.75V6M4.5 12c0 1.52 3.36 2.75 7.5 2.75s7.5-1.23 7.5-2.75"/>`,
  // Choosing several: a ticked box.
  'check-square': `<rect x="4" y="4" width="16" height="16" rx="4" ${SOFT}/><path d="m8.5 12 2.5 2.5 4.5-5"/>`,
  // Clearing old history: an eraser leaning on the line it clears.
  eraser: `<path d="M7.8 19.5 3.9 15.6a2 2 0 0 1 0-2.8l8.9-8.9a2 2 0 0 1 2.8 0l4.5 4.5a2 2 0 0 1 0 2.8l-8.3 8.3" ${SOFT}/><path d="m8 10 6.5 6.5M7.8 19.5h12.7"/>`,
  // Account status: balances and quotas, read off a gauge.
  account: `<path d="M3.5 17a8.5 8.5 0 0 1 17 0Z" ${SOFT}/><path d="m12 17 3.8-5.5"/><path d="${dot(12, 17)}" stroke-width="3.4"/>`,
  // Reasoning: the model's side of the conversation, still thinking.
  thinking: `<path d="${BUBBLE}" ${SOFT}/><path d="${dot(8, 10.5)}${dot(12, 10.5)}${dot(16, 10.5)}" stroke-width="2.8"/>`,
  // A tool call.
  tool: `<path d="M14.7 3.5a5 5 0 0 0-4.6 6.9l-6.2 6.2a2.1 2.1 0 0 0 3 3l6.2-6.2a5 5 0 0 0 6.9-4.6l-3.3 1.6-2.6-.6-.6-2.6Z" ${SOFT}/>`,
  // A run's work: steps climbed.
  steps: `<path d="M3.5 20.5v-5H9V10h5.5V4.5h6v16Z" ${SOFT} stroke="none"/><path d="M3.5 20.5v-5H9V10h5.5V4.5h6"/>`,
  // A model: a block of its own.
  model: `<path d="M12 3 20 7.5 12 12 4 7.5Z" ${SOFT}/><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9ZM4 7.5 12 12l8-4.5M12 12v9"/>`,
  // The model asked the user something.
  question: `<path d="${BUBBLE}" ${SOFT}/><path d="M9.7 8.6a2.4 2.4 0 0 1 4.6.9c0 1.6-2.3 2.1-2.3 2.1${dot(12, 14.2)}"/>`,
  // A conversation with one session.
  chat: `<path d="${BUBBLE}" ${SOFT}/><path d="${dot(8.5, 10.5)}${dot(12, 10.5)}${dot(15.5, 10.5)}"/>`,
  // A new conversation.
  'new-session': `<path d="${BUBBLE}" ${SOFT}/><path d="M12 7.2v6.6M8.7 10.5h6.6"/>`,
  // Messages waiting their turn (the count is a badge beside it).
  queue: `<path d="${BUBBLE}" ${SOFT}/><path d="M7.5 8.5h5M7.5 12.5h9"/>`,
};
