# Provider settings review — 2026-09-12

All 48 built-in presets were checked against the backend catalog and `auth_for` / Codex adapter implementation. Addresses, protocol choices, and required fields come from that catalog rather than being copied into frontend profiles. This is a configuration and UI review, not an authenticated production test of every vendor.

## Form groups

- API-key platforms share a form, with the correct issuer, region/plan context, protocol choices and documentation link.
- Codex subscription: Access Token, account ID source, optional explicit ChatGPT Account ID. Wish currently has no sign-in or token-refresh flow. This limit is specific to Wish, not Codex generally.
- Hugging Face: user Token with inference permissions.
- Bedrock: region, Access Key ID, Secret Access Key, optional Session Token; the current preset implements SigV4 rather than every authentication method AWS offers.
- Qwen workspace variants: workspace ID before authentication; region and workspace determine the connection.
- MiniMax Token Plan: Subscription Key instead of a pay-as-you-go API key.
- Other Coding Plan / Token Plan variants: channel-specific labels, addresses and instructions; no claims about prices or guaranteed eligibility.
- Ollama, LM Studio and vLLM: service address first, fixed no-auth preset. The address refers to the backend machine.
- Preset authentication cannot be overridden. Named required credentials remain required as specified by the backend. Unrelated new Codex/image-edit overrides are hidden, but existing overrides remain editable.

## Primary documentation

- [Codex authentication](https://developers.openai.com/codex/auth/)
- [Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers/en/index)
- [AWS Bedrock IAM](https://docs.aws.amazon.com/bedrock/latest/userguide/security-iam.html)
- [Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key)
- [Model Studio API keys](https://help.aliyun.com/en/model-studio/get-api-key)
- [MiniMax Subscription Key](https://platform.minimax.io/docs/token-plan/intro)
- [Z.AI Coding Plan](https://docs.z.ai/devpack/quick-start)
- [Kimi provider configuration](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/configuration/providers.md)
- [Claude API authentication](https://platform.claude.com/docs/en/api/overview)
- [OpenRouter authentication](https://openrouter.ai/docs/api_reference/authentication)
- [Ollama authentication](https://docs.ollama.com/api/authentication)
- [LM Studio authentication](https://lmstudio.ai/docs/developer/core/authentication)
- [SiliconFlow quickstart](https://docs.siliconflow.cn/docs/userguide/quickstart)
- [Groq quickstart](https://console.groq.com/docs/quickstart)
- [Cerebras quickstart](https://inference-docs.cerebras.ai/quickstart)
- [OpenCode Zen](https://opencode.ai/docs/zen/) and [Go](https://opencode.ai/docs/go/)
- [Mistral](https://docs.mistral.ai/) and [xAI](https://docs.x.ai/overview)
- [DeepSeek authentication](https://api-docs.deepseek.com/api/deepseek-api/)
- [Zhipu HTTP authentication](https://docs.bigmodel.cn/cn/guide/develop/http/introduction)

Some vendor pages are client-rendered or failed retrieval (MiMo, Tencent, vLLM redirect). Their forms use only the checked backend contract and provide official documentation entry points; no newly inferred capability claims were added. Preset availability and actual account authorization remain upstream decisions.

## Verification

Browser scenario `wish-test/web/scenarios-preset-profiles.mjs` opens all 48 presets through an isolated real backend, checks specialized forms, Codex option tooltips, fixed preset authentication and preservation of masked credentials after saving. Mobile dark-mode checks cover Codex, AWS and local authentication. Build and backend regression evidence is in the coordination deployment directory.

Model catalog changes: overriding a preset service address also changes its default model-catalog host. Explicit model-list configuration remains authoritative.


Model-name length is a shared inbound HTTP limit at
`providerd.http.model_id_max_bytes` (512 UTF-8 Byte by default), never a
provider-specific option. Migrate older source files with
`wish/scripts/global-model-limit.py INPUT.toml OUTPUT.toml`; it preserves the
largest previous effective limit. Removing a visible schema default is valid
even when the source file has no explicit override.

Preset authentication is fixed by the preset. Only its declared API Key, Access Token or named credentials can be configured. An explicit provider auth object is accepted only for custom providers without a preset.
