<script setup lang="ts">
import { computed } from 'vue';
import { Server } from '@lucide/vue';
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

const props = defineProps<{ brand?: string }>();
const icons: Record<string, string> = { DeepSeek: deepseek, MiMo: mimo, 'Z.AI': zai, 'Z.ai': zai, Zhipu: zai, SiliconFlow: silicon, Qwen: qwen, Kimi: kimi, 'Tencent Hunyuan (TokenHub)': hunyuan, OpenAI: openai, Anthropic: anthropic, 'Google Gemini': gemini, 'AWS Bedrock': bedrock, MiniMax: minimax, OpenRouter: openrouter, 'Hugging Face Router': huggingface, OpenCode: opencode, Mistral: mistral, xAI: xai, Groq: groq, Cerebras: cerebras, Ollama: ollama, 'LM Studio': lmstudio, vLLM: vllm };
const source = computed(() => props.brand ? icons[props.brand] : undefined);
const maskImage = computed(() => `url("${source.value}")`);
</script>

<template>
  <span v-if="source" class="provider-icon" :style="{ maskImage }" aria-hidden="true" />
  <Server v-else class="provider-icon-fallback" :size="20" aria-hidden="true" />
</template>

<style scoped>
.provider-icon, .provider-icon-fallback { display: inline-block; width: 20px; height: 20px; flex: none; }
.provider-icon { background: currentColor; mask-position: center; mask-size: contain; mask-repeat: no-repeat; }
</style>
