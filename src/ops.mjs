import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { config, requireBlogRoot } from './config.mjs';

function readFrontmatters(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.mdx?$/.test(f))
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const parsed = matter(raw);
      return { file: f, data: parsed.data };
    });
}

function toDateStr(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function status() {
  const root = requireBlogRoot();
  const posts = readFrontmatters(path.join(root, 'content', 'posts'));
  const tools = readFrontmatters(path.join(root, 'content', 'tools'));

  const drafts = posts.filter((p) => p.data.draft === true);
  const published = posts.filter((p) => p.data.draft !== true);
  const latest = [...published].sort((a, b) => toDateStr(b.data.date).localeCompare(toDateStr(a.data.date)))[0];

  return {
    title: '博客状态',
    lines: [
      `文章总数:${posts.length} (已发 ${published.length} / 草稿 ${drafts.length})`,
      `工具总数:${tools.length}`,
      latest ? `最新文章:${latest.data.title} (${toDateStr(latest.data.date)})` : '暂无文章',
      `线上:${config.siteUrl}`,
    ],
  };
}

export function pendingDrafts() {
  const root = requireBlogRoot();
  const posts = readFrontmatters(path.join(root, 'content', 'posts'));
  const drafts = posts.filter((p) => p.data.draft === true);
  return {
    title: `草稿 ${drafts.length} 篇`,
    lines: drafts.length === 0 ? ['(无)'] : drafts.map((d) => `- ${d.data.slug || d.file}: ${d.data.title}`),
  };
}

export function staleTools({ days = 90 } = {}) {
  const root = requireBlogRoot();
  const tools = readFrontmatters(path.join(root, 'content', 'tools'));
  const threshold = new Date(Date.now() - days * 86400 * 1000);
  const stale = tools
    .filter((t) => {
      const d = t.data.updatedAt ? new Date(t.data.updatedAt) : null;
      return d && d < threshold;
    })
    .sort((a, b) => toDateStr(a.data.updatedAt).localeCompare(toDateStr(b.data.updatedAt)));

  return {
    title: `超 ${days} 天未更新的工具:${stale.length}`,
    lines: stale.length === 0 ? ['(无)'] : stale.map((t) => `- ${t.data.slug}: ${toDateStr(t.data.updatedAt)}`),
  };
}

export async function health() {
  const paths = ['/', '/posts/', '/tools/', '/rss.xml', '/sitemap.xml'];
  const results = [];
  for (const p of paths) {
    const url = `${config.siteUrl}${p}`;
    const start = Date.now();
    try {
      const res = await fetch(url, { redirect: 'follow' });
      results.push({ url: p, code: res.status, ms: Date.now() - start });
    } catch (e) {
      results.push({ url: p, code: 0, ms: Date.now() - start, error: String(e).slice(0, 80) });
    }
  }
  const ok = results.filter((r) => r.code >= 200 && r.code < 400).length;
  return {
    title: `健康检查 ${ok}/${results.length} 通过`,
    lines: results.map((r) => `${r.code || 'ERR'} ${r.url} (${r.ms}ms)${r.error ? ` ${r.error}` : ''}`),
  };
}
