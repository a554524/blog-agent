import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function makeTempBlog() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-agent-'));
  fs.mkdirSync(path.join(root, 'content', 'posts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'content', 'tools'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fake-blog"}');
  return root;
}

async function loadOpsWith(root) {
  process.env.BLOG_ROOT = root;
  vi.resetModules();
  return await import('../src/ops.mjs');
}

describe('ops', () => {
  let root;

  beforeEach(() => {
    root = makeTempBlog();
  });

  it('status counts posts and tools', async () => {
    fs.writeFileSync(
      path.join(root, 'content', 'posts', 'a.mdx'),
      '---\ntitle: A\nslug: a\ndate: 2026-04-28\n---\n内容',
    );
    fs.writeFileSync(
      path.join(root, 'content', 'posts', 'b.mdx'),
      '---\ntitle: B\nslug: b\ndate: 2026-04-29\ndraft: true\n---\n内容',
    );
    fs.writeFileSync(
      path.join(root, 'content', 'tools', 't.md'),
      '---\nslug: t\nname: T\nurl: https://x\ncategory: 对话\nfreeTier: x\nupdatedAt: 2026-04-01\n---\n',
    );
    const { status } = await loadOpsWith(root);
    const r = status();
    expect(r.lines[0]).toMatch(/文章总数.*2/);
    expect(r.lines[0]).toMatch(/已发 1/);
    expect(r.lines[0]).toMatch(/草稿 1/);
    expect(r.lines[1]).toMatch(/工具总数.*1/);
  });

  it('pendingDrafts lists draft=true posts', async () => {
    fs.writeFileSync(
      path.join(root, 'content', 'posts', 'published.mdx'),
      '---\ntitle: P\nslug: published\ndate: 2026-04-28\n---\n',
    );
    fs.writeFileSync(
      path.join(root, 'content', 'posts', 'draft1.mdx'),
      '---\ntitle: D\nslug: draft1\ndate: 2026-04-28\ndraft: true\n---\n',
    );
    const { pendingDrafts } = await loadOpsWith(root);
    const r = pendingDrafts();
    expect(r.title).toMatch(/草稿 1/);
    expect(r.lines[0]).toMatch(/draft1/);
  });

  it('staleTools identifies tools older than threshold', async () => {
    fs.writeFileSync(
      path.join(root, 'content', 'tools', 'fresh.md'),
      '---\nslug: fresh\nname: F\nurl: https://x\ncategory: 对话\nfreeTier: x\nupdatedAt: 2026-04-20\n---\n',
    );
    fs.writeFileSync(
      path.join(root, 'content', 'tools', 'stale.md'),
      '---\nslug: stale\nname: S\nurl: https://x\ncategory: 对话\nfreeTier: x\nupdatedAt: 2020-01-01\n---\n',
    );
    const { staleTools } = await loadOpsWith(root);
    const r = staleTools({ days: 90 });
    expect(r.title).toMatch(/1/);
    expect(r.lines.join('\n')).toMatch(/stale/);
    expect(r.lines.join('\n')).not.toMatch(/fresh/);
  });
});
