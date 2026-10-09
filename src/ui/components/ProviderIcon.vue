<script setup lang="ts">
import Icon from './Icon.vue';
import { computed } from 'vue';
import deepseek from '@lobehub/icons-static-svg/icons/deepseek.svg?url';
import mimo from '@lobehub/icons-static-svg/icons/xiaomimimo.svg?url';
import zai from '@lobehub/icons-static-svg/icons/zai.svg?url';
import silicon from '@lobehub/icons-static-svg/icons/siliconcloud.svg?url';
import qwen from '@lobehub/icons-static-svg/icons/qwen.svg?url';
import kimi from '@lobehub/icons-static-svg/icons/kimi.svg?url';
import hunyuan from '@lobehub/icons-static-svg/icons/hunyuan.svg?url';
import openai from '@lobehub/icons-static-svg/icons/openai.svg?url';
import anthropic from '@lobehub/icons-static-svg/icons/anthropic.svg?url';
import gemini from '@lobehub/icons-static-svg/icons/gemini.svg?url';
import bedrock from '@lobehub/icons-static-svg/icons/bedrock.svg?url';
import minimax from '@lobehub/icons-static-svg/icons/minimax.svg?url';
import openrouter from '@lobehub/icons-static-svg/icons/openrouter.svg?url';
import huggingface from '@lobehub/icons-static-svg/icons/huggingface.svg?url';
import opencode from '@lobehub/icons-static-svg/icons/opencode.svg?url';
import mistral from '@lobehub/icons-static-svg/icons/mistral.svg?url';
import xai from '@lobehub/icons-static-svg/icons/xai.svg?url';
import groq from '@lobehub/icons-static-svg/icons/groq.svg?url';
import cerebras from '@lobehub/icons-static-svg/icons/cerebras.svg?url';
import ollama from '@lobehub/icons-static-svg/icons/ollama.svg?url';
import lmstudio from '@lobehub/icons-static-svg/icons/lmstudio.svg?url';
import vllm from '@lobehub/icons-static-svg/icons/vllm.svg?url';
import copilot from '@lobehub/icons-static-svg/icons/githubcopilot.svg?url';
import stepfun from '@lobehub/icons-static-svg/icons/stepfun.svg?url';
import baiducloud from '@lobehub/icons-static-svg/icons/baiducloud.svg?url';
import volcengine from '@lobehub/icons-static-svg/icons/volcengine.svg?url';
import huaweicloud from '@lobehub/icons-static-svg/icons/huaweicloud.svg?url';
import together from '@lobehub/icons-static-svg/icons/together.svg?url';
import fireworks from '@lobehub/icons-static-svg/icons/fireworks.svg?url';
import nvidia from '@lobehub/icons-static-svg/icons/nvidia.svg?url';
import modelscope from '@lobehub/icons-static-svg/icons/modelscope.svg?url';
import aihubmix from '@lobehub/icons-static-svg/icons/aihubmix.svg?url';
import ai302 from '@lobehub/icons-static-svg/icons/ai302.svg?url';
import tavily from '@lobehub/icons-static-svg/icons/tavily.svg?url';
import brave from '@lobehub/icons-static-svg/icons/brave.svg?url';
import exa from '@lobehub/icons-static-svg/icons/exa.svg?url';
import bocha from '@lobehub/icons-static-svg/icons/bocha.svg?url';
import jina from '@lobehub/icons-static-svg/icons/jina.svg?url';
import perplexity from '@lobehub/icons-static-svg/icons/perplexity.svg?url';
import searxng from '@lobehub/icons-static-svg/icons/searxng.svg?url';

const props = defineProps<{ brand?: string; fallback?: string }>();
const icons: Record<string, string> = { DeepSeek: deepseek, MiMo: mimo, 'Z.AI': zai, 'Z.ai': zai, Zhipu: zai, SiliconFlow: silicon, Qwen: qwen, Kimi: kimi, 'Tencent Hunyuan (TokenHub)': hunyuan, OpenAI: openai, Anthropic: anthropic, 'Google Gemini': gemini, 'AWS Bedrock': bedrock, MiniMax: minimax, OpenRouter: openrouter, 'Hugging Face Router': huggingface, OpenCode: opencode, Mistral: mistral, xAI: xai, Groq: groq, Cerebras: cerebras, Ollama: ollama, 'LM Studio': lmstudio, vLLM: vllm, 'GitHub Copilot': copilot, StepFun: stepfun, 'Baidu Qianfan': baiducloud, 'Volcengine Ark': volcengine, 'Huawei Cloud': huaweicloud, 'Together AI': together, Fireworks: fireworks, 'NVIDIA NIM': nvidia, ModelScope: modelscope, AiHubMix: aihubmix, '302.AI': ai302, Tavily: tavily, Brave: brave, Exa: exa, Bocha: bocha, Jina: jina, Perplexity: perplexity, SearXNG: searxng };
const source = computed(() => props.brand ? icons[props.brand] : undefined);
const maskImage = computed(() => `url("${source.value}")`);
</script>

<template>
  <span v-if="source" class="provider-icon" :style="{ maskImage }" aria-hidden="true" />
  <Icon :name="fallback ?? 'providers'" v-else class="provider-icon-fallback" :size="20" aria-hidden="true" />
</template>

<style scoped>
.provider-icon, .provider-icon-fallback { display: inline-block; width: 20px; height: 20px; flex: none; }
.provider-icon { background: currentColor; mask-position: center; mask-size: contain; mask-repeat: no-repeat; }
</style>
