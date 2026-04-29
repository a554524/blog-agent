import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

function makeBlog() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-pub-'));
  fs.mkdirSync(path.join(root, 'content', 'posts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fake"}');
  execSync('git init -q', { cwd: root });
  execSync('git config user.name tester', { cwd: root });
  execSync('git config user.email tester@local', { cwd: root });
  execSync('git commit -q --allow-empty -m init', { cwd: root });
  return root;
}

async function loadWith(root) {
  process.env.BLOG_ROOT = root;
  vi.resetModules();
  return await import('../src/publish.mjs');
}

describe('publish', () => {
  let root;

  beforeEach(() => {
    root = makeBlog();
  });

  it('flips draft to false and commits', async () => {
    const file = path.join(root, 'content', 'posts', 'demo.mdx');
    fs.writeFileSync(
      file,
      '---\ntitle: Demo\nslug: demo\ndate: 2026-04-28\ndraft: true\n---\n正文',
    );
    const { publishPost } = await loadWith(root);
    const r = publishPost({ slug: 'demo', noPush: true });
    expect(r.changed).toBe(true);
    const after = fs.readFileSync(file, 'utf8');
    expect(after).toMatch(/draft: false/);
    const log = execSync('git log --oneline', { cwd: root, encoding: 'utf8' });
    expect(log).toMatch(/post: Demo/);
  });

  it('is idempotent when already published', async () => {
    const file = path.join(root, 'content', 'posts', 'done.mdx');
    fs.writeFileSync(
      file,
      '---\ntitle: Done\nslug: done\ndate: 2026-04-28\ndraft: false\n---\n',
    );
    const { publishPost } = await loadWith(root);
    const r = publishPost({ slug: 'done', noPush: true });
    expect(r.changed).toBe(false);
  });

  it('throws when post missing', async () => {
    const { publishPost } = await loadWith(root);
    expect(() => publishPost({ slug: 'ghost', noPush: true })).toThrow(/不存在/);
  });
});
