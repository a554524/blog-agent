import { config } from './config.mjs';

/**
 * MiLLM 内部网关 OpenAI 兼容 chat completions
 * 若网关不可用或 API Key 未配,抛明确错误,便于上层降级
 */
export async function chat(messages, { model, temperature = 0.7, maxTokens = 2048 } = {}) {
  if (!config.millm.apiKey) {
    throw new Error('MILLM_API_KEY 未配置,LLM 调用不可用');
  }
  const url = `${config.millm.baseUrl}/v1/chat/completions`;
  const body = {
    model: model || config.millm.model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.millm.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`MiLLM HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error(`MiLLM 响应缺 content:${JSON.stringify(data).slice(0, 300)}`);
  }
  return content.trim();
}
