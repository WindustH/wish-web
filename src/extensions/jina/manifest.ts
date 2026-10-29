import tools from './tools.ts';
import type { ExtensionPresentation } from '../types.ts';
export default { id: 'jina', settings: ['search', 'fetch'], tools } satisfies ExtensionPresentation;
