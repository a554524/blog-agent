import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.mjs';

/**
 * 读 Claude Code 的 settings.json 作为 LLM 配置默认源
 * 覆盖顺序(后者覆盖前者):
 *   1. ~/.claude/settings.json 的 env (免配置,直接复用 Claude Code)
 *   2. blog-agent 自己的 .env 里的 MILLM_*
 *   3. process.env 运行时变量
 */
function loadClaudeCodeDefaults() {
  const p = path.join(os.homedir(), '.claude', 'settings.json');
  if (!fs.existsSync(p)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const env = data?.env ?? {};
    return {
      baseUrl: env.ANTHROPIC_BASE_URL,
      apiKey: env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN,
      model:
        env.ANTHROPIC_DEFAULT_SONNET_MODEL ||
        env.ANTHROPIC_MODEL ||
        env.ANTHROPIC_DEFAULT_OPUS_MODEL ||
        env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
    };
  } catch {
    return {};
  }
}

function resolveConfig() {
  const cc = loadClaudeCodeDefaults();
  return {
    baseUrl: config.millm.baseUrl !== 'http://model.mify.ai.srv'
      ? config.millm.baseUrl
      : cc.baseUrl || config.millm.baseUrl,
    apiKey: config.millm.apiKey || cc.apiKey || '',
    model: cc.model || config.millm.model,
  };
}

/**
 * 调用 Anthropic Messages API 兼容接口
 * 请求:{ model, system?, messages: [{role, content}], max_tokens, temperature }
 * 响应:{ content: [{type: 'text', text: '...'}] }
 */
export async function chat(messages, { model, temperature = 0.7, maxTokens = 2048 } = {}) {
  const cfg = resolveConfig();
  if (!cfg.apiKey) throw new Error('LLM 凭证未配置:~/.claude/settings.json 的 ANTHROPIC_API_KEY 为空');
  if (!cfg.baseUrl) throw new Error('LLM 地址未配置');

  // Anthropic API 要求 system 独立字段,不放 messages 数组
  const systemMsgs = messages.filter((m) => m.role === 'system');
  const convoMsgs = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  const body = {
    model: model || cfg.model,
    max_tokens: maxTokens,
    messages: convoMsgs,
    ...(systemMsgs.length > 0 && {
      system: systemMsgs.map((m) => m.content).join('\n\n'),
    }),
  };
  // Claude 4+ 里 temperature 被废弃,仅老模型保留
  if (temperature !== undefined && !/4\-[67]|claude\-sonnet\-4|claude\-opus\-4/i.test(body.model ?? '')) {
    body.temperature = temperature;
  }

  const url = `${cfg.baseUrl.replace(/\/$/, '')}/v1/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const block = (data?.content ?? []).find((b) => b?.type === 'text');
  if (!block?.text) {
    throw new Error(`LLM 响应缺 text 块:${JSON.stringify(data).slice(0, 400)}`);
  }
  return block.text.trim();
}
