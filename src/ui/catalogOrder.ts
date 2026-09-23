// Stable ordering within each brand keeps its regions and plans together.
export function providerPriority(brand: string): number {
  const preferred: Record<string, number> = {
    OpenAI: 0, Anthropic: 1, 'Google Gemini': 2, DeepSeek: 3,
    'Z.ai': 4, 'Z.AI': 4, Zhipu: 4, MiMo: 5,
  };
  if (brand in preferred) return preferred[brand]!;
  if (['SiliconFlow', 'AWS Bedrock', 'OpenRouter', 'Hugging Face Router', 'OpenCode', 'Groq', 'Cerebras'].includes(brand)) return 100;
  if (['Ollama', 'LM Studio', 'vLLM'].includes(brand)) return 200;
  return 20;
}
