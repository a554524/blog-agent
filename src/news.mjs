import fs from 'node:fs';
import path from 'node:path';
import { config, requireBlogRoot } from './config.mjs';
import { chat } from './llm.mjs';

/**
 * 公开 AI 新闻源(均为 RSS/Atom,无需 key)
 * 选取原则:
 *  - 技术向为主,不要纯商业八卦
 *  - 更新频繁(≥ 每日)
 *  - 英文源居多,让 LLM 翻译归纳,避免重复别人中文稿
 */
const FEEDS = [
  { name: 'HN Front Page', url: 'https://hnrss.org/frontpage?count=30&q=AI+OR+LLM+OR+GPT+OR+Claude' },
  { name: 'MIT Tech Review AI', url: 'https://www.technologyreview.com/feed/' },
  { name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
  { name: "Ars Technica", url: 'https://feeds.arstechnica.com/arstechnica/technology-lab' },
];

function parseRSS(xml) {
  const items = [];
  // 容忍 RSS / Atom 两种
  const itemRe = /<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/g;
  const matches = xml.match(itemRe) ?? [];
  for (const block of matches) {
    const title = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/) ?? [])[1] ?? '';
    const link =
      (block.match(/<link[^>]*>([\s\S]*?)<\/link>/) ?? [])[1]?.trim() ||
      (block.match(/<link[^>]*href="([^"]+)"/) ?? [])[1] ||
      '';
    const pub =
      (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) ?? [])[1] ||
      (block.match(/<updated>([\s\S]*?)<\/updated>/) ?? [])[1] ||
      (block.match(/<published>([\s\S]*?)<\/published>/) ?? [])[1] ||
      '';
    const desc =
      (block.match(/<description>([\s\S]*?)<\/description>/) ?? [])[1] ||
      (block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) ?? [])[1] ||
      '';
    const cleanTitle = title
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();
    const cleanDesc = desc
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 400)
      .trim();
    if (cleanTitle && link) {
      items.push({ title: cleanTitle, link, pub, desc: cleanDesc });
    }
  }
  return items;
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'blog-agent/0.1 (ai-blog)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSS(xml).map((i) => ({ ...i, source: feed.name }));
  } catch (e) {
    console.error(`fetch ${feed.name} 失败:${e.message}`);
    return [];
  }
}

function within24h(pubStr) {
  if (!pubStr) return true; // 无日期就保留,让 LLM 判断
  const d = new Date(pubStr);
  if (Number.isNaN(d.getTime())) return true;
  return Date.now() - d.getTime() < 36 * 3600 * 1000; // 放宽到 36h
}

async function collectCandidates() {
  const all = await Promise.all(FEEDS.map((f) => fetchFeed(f)));
  const flat = all.flat();
  const fresh = flat.filter((i) => within24h(i.pub));
  // 去重:按链接
  const seen = new Set();
  const deduped = [];
  for (const i of fresh) {
    if (seen.has(i.link)) continue;
    seen.add(i.link);
    deduped.push(i);
  }
  return deduped.slice(0, 40); // 上限,避免 prompt 爆炸
}

const SYSTEM_NEWS = `你是 "AI 技术博客" 的新闻编辑,每日汇总英文 AI 新闻为一篇中文日报。

编辑原则:
- 从候选里挑 3-6 条**技术含量最高**的,优先顺序:开源模型发布 > 技术论文 > 公司重大动作 > 行业融资 > 监管
- 跳过:股价新闻、日常产品 UI 更新、招聘、商业八卦
- 每条用 2-4 句中文简介:做了什么、为什么重要、对普通开发者的影响
- 保持客观,不吹不贬,不用 "颠覆"/"重磅"/"炸裂" 这类词
- 保留原始链接供读者跳转

严格按以下 Markdown 格式输出(第一行就是 "---",无前言):

---
title: AI 新闻日报 · YYYY-MM-DD
slug: news-YYYY-MM-DD
date: YYYY-MM-DD
category: AI-新闻
tags: [日报, 新闻]
summary: 今日 N 条值得关注:xxx、yyy、zzz。
draft: false
---

## 今日要点

- 一句话概括每条新闻,≤ 20 字,≤ N 条

## 详细

### 1. 标题 (来源名)

2-4 句中文简介。[阅读原文](URL)

### 2. 标题 (来源名)

...

## 一句话总结

今天行业主题是...(1 句话)`;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatCandidates(items) {
  return items
    .map((i, idx) => {
      return `[${idx + 1}] ${i.title}\n    来源:${i.source} | ${i.pub}\n    ${i.desc || '(无摘要)'}\n    ${i.link}`;
    })
    .join('\n\n');
}

export async function generateDaily({ dryRun = false } = {}) {
  const root = requireBlogRoot();
  const date = today();
  const postsDir = path.join(root, 'content', 'posts', 'news');
  if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir, { recursive: true });

  const outFile = path.join(postsDir, `news-${date}.mdx`);
  if (fs.existsSync(outFile) && !dryRun) {
    return { file: outFile, written: false, message: `今日已生成:${outFile}` };
  }

  const candidates = await collectCandidates();
  if (candidates.length === 0) {
    throw new Error('无候选新闻,RSS 源全部失败');
  }

  const userMsg = `今天日期:${date}
候选新闻 ${candidates.length} 条:

${formatCandidates(candidates)}

请按格式输出一篇完整日报 Markdown,第一行就是 "---"。slug 必须是 news-${date}。`;

  const markdown = await chat(
    [
      { role: 'system', content: SYSTEM_NEWS },
      { role: 'user', content: userMsg },
    ],
    { temperature: 0.5, maxTokens: 3500 },
  );

  if (dryRun) {
    return { file: outFile, markdown, written: false, candidateCount: candidates.length };
  }

  fs.writeFileSync(outFile, markdown.trim() + '\n', 'utf8');
  return { file: outFile, written: true, candidateCount: candidates.length };
}
