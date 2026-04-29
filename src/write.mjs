import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { config, requireBlogRoot } from './config.mjs';
import { chat } from './llm.mjs';
import { SYSTEM_POST, buildPostUser } from './prompts/post.mjs';
import { SYSTEM_TOOL, buildToolUser } from './prompts/tool.mjs';
import { SYSTEM_REVISE, buildReviseUser } from './prompts/revise.mjs';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function extractFrontmatter(markdown) {
  const parsed = matter(markdown);
  return { data: parsed.data, content: parsed.content, raw: markdown };
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/[一-龥]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 60) || `post-${Date.now()}`;
}

export async function writePost({ topic, dryRun = false }) {
  const root = requireBlogRoot();
  const postsDir = path.join(root, 'content', 'posts');
  if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir, { recursive: true });

  const markdown = await chat(
    [
      { role: 'system', content: SYSTEM_POST },
      { role: 'user', content: buildPostUser({ topic, today: today() }) },
    ],
    { temperature: 0.7, maxTokens: 3500 },
  );

  const { data } = extractFrontmatter(markdown);
  if (!data.title || !data.slug) {
    throw new Error(`LLM 返回缺 title/slug:\n${markdown.slice(0, 300)}`);
  }
  const slug = String(data.slug).trim() || slugify(String(data.title));
  const file = path.join(postsDir, `${slug}.mdx`);

  if (fs.existsSync(file) && !dryRun) {
    throw new Error(`文件已存在:${file} (slug=${slug})`);
  }

  if (dryRun) {
    return { file, slug, markdown, written: false };
  }

  fs.writeFileSync(file, markdown + '\n', 'utf8');
  return { file, slug, markdown, written: true };
}

export async function writeTool({ name, dryRun = false }) {
  const root = requireBlogRoot();
  const toolsDir = path.join(root, 'content', 'tools');
  if (!fs.existsSync(toolsDir)) fs.mkdirSync(toolsDir, { recursive: true });

  const markdown = await chat(
    [
      { role: 'system', content: SYSTEM_TOOL },
      { role: 'user', content: buildToolUser({ name, today: today() }) },
    ],
    { temperature: 0.4, maxTokens: 1200 },
  );

  const { data } = extractFrontmatter(markdown);
  if (!data.name || !data.slug) {
    throw new Error(`LLM 返回缺 name/slug:\n${markdown.slice(0, 300)}`);
  }
  const slug = String(data.slug).trim();
  const file = path.join(toolsDir, `${slug}.md`);

  if (fs.existsSync(file) && !dryRun) {
    throw new Error(`工具已存在:${file}`);
  }

  if (dryRun) {
    return { file, slug, markdown, written: false };
  }

  fs.writeFileSync(file, markdown + '\n', 'utf8');
  return { file, slug, markdown, written: true };
}

export async function revisePost({ slug, dryRun = false }) {
  const root = requireBlogRoot();
  const file = path.join(root, 'content', 'posts', `${slug}.mdx`);
  if (!fs.existsSync(file)) {
    // 试 .md
    const alt = path.join(root, 'content', 'posts', `${slug}.md`);
    if (!fs.existsSync(alt)) {
      throw new Error(`文章不存在:${slug}`);
    }
  }
  const actualFile = fs.existsSync(file) ? file : file.replace(/\.mdx$/, '.md');
  const raw = fs.readFileSync(actualFile, 'utf8');

  const revised = await chat(
    [
      { role: 'system', content: SYSTEM_REVISE },
      { role: 'user', content: buildReviseUser({ raw }) },
    ],
    { temperature: 0.3, maxTokens: 4000 },
  );

  if (dryRun) {
    return { file: actualFile, original: raw, revised, written: false };
  }

  fs.writeFileSync(actualFile, revised.trim() + '\n', 'utf8');
  return { file: actualFile, original: raw, revised, written: true };
}
