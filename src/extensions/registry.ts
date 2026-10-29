import discovery from './discovery/manifest.ts';
import exa from './exa/manifest.ts';
import seedance from './seedance/manifest.ts';
import luma from './luma/manifest.ts';
import elevenlabs from './elevenlabs/manifest.ts';
import siliconflow from './siliconflow/manifest.ts';
import together from './together/manifest.ts';
import jina from './jina/manifest.ts';
import google from './google/manifest.ts';
import zai from './zai/manifest.ts';
import serper from './serper/manifest.ts';
import metaso from './metaso/manifest.ts';
import xiaoyunque from './xiaoyunque/manifest.ts';
import openai from './openai/manifest.ts';
import runninghub from './runninghub/manifest.ts';
import stability from './stability/manifest.ts';
import alibaba from './alibaba/manifest.ts';
import perplexity from './perplexity/manifest.ts';
import kimi from './kimi/manifest.ts';
import bocha from './bocha/manifest.ts';
import deepseek from './deepseek/manifest.ts';
import jimeng from './jimeng/manifest.ts';
import brave from './brave/manifest.ts';
import tavily from './tavily/manifest.ts';
import replicate from './replicate/manifest.ts';
import fal from './fal/manifest.ts';
import searxng from './searxng/manifest.ts';
import type { ExtensionPresentation, ExtensionToolPresentation } from './types.ts';
import legacy from './legacy/manifest.ts';
import novelai from './novelai/manifest.ts';
import bfl from './bfl/manifest.ts';
import minimax from './minimax/manifest.ts';
import xai from './xai/manifest.ts';
import runway from './runway/manifest.ts';
// Only bundled manifests are executable. Backend metadata never supplies JavaScript or component paths.
export const manifests: readonly ExtensionPresentation[] = [
  discovery,
  legacy,
  novelai,
  bfl,
  minimax,
  xai,
  runway,
  exa,
  seedance,
  luma,
  elevenlabs,
  siliconflow,
  together,
  jina,
  google,
  zai,
  serper,
  metaso,
  xiaoyunque,
  openai,
  runninghub,
  stability,
  alibaba,
  perplexity,
  kimi,
  bocha,
  deepseek,
  jimeng,
  brave,
  tavily,
  replicate,
  fal,
  searxng,
];
const tools = new Map<string, ExtensionToolPresentation>();
const ids = new Set<string>();
for (const extension of manifests) {
  if (ids.has(extension.id)) throw new Error(`Duplicate extension: ${extension.id}`);
  ids.add(extension.id);
  for (const tool of extension.tools) {
    if (tools.has(tool.name)) throw new Error(`Duplicate extension tool: ${tool.name}`);
    tools.set(tool.name, tool);
  }
}
export function extensionTool(name?: string) {
  return name ? tools.get(name) : undefined;
}
