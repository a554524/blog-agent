import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function loadDotEnv() {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(os.homedir(), 'blog-agent', '.env'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const raw = fs.readFileSync(p, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
    return p;
  }
  return null;
}

loadDotEnv();

export const config = {
  blogRoot: process.env.BLOG_ROOT || path.join(os.homedir(), 'ai-blog'),
  millm: {
    baseUrl: (process.env.MILLM_BASE_URL || 'http://model.mify.ai.srv').replace(/\/$/, ''),
    apiKey: process.env.MILLM_API_KEY || '',
    model: process.env.MILLM_MODEL || 'claude-sonnet-4-5',
  },
  cf: {
    token: process.env.CLOUDFLARE_API_TOKEN || '',
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
    project: process.env.CF_PAGES_PROJECT || 'ai-blog',
  },
  siteUrl: (process.env.SITE_URL || 'https://ai-blog-61z.pages.dev').replace(/\/$/, ''),
  feishu: {
    webhook: process.env.FEISHU_WEBHOOK || '',
    secret: process.env.FEISHU_WEBHOOK_SECRET || '',
  },
};

export function requireBlogRoot() {
  if (!fs.existsSync(path.join(config.blogRoot, 'package.json'))) {
    throw new Error(`BLOG_ROOT 无效:${config.blogRoot} 下没有 package.json`);
  }
  return config.blogRoot;
}
