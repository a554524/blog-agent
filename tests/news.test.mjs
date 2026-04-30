import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// 通过源码文本校验关键常量和函数存在,避免强依赖网络
describe('news module', () => {
  const src = readFileSync(path.resolve(__dirname, '../src/news.mjs'), 'utf8');

  it('defines public RSS feeds', () => {
    expect(src).toMatch(/hnrss\.org/);
    expect(src).toMatch(/theverge\.com/);
  });

  it('exports generateDaily', () => {
    expect(src).toMatch(/export async function generateDaily/);
  });

  it('uses correct category AI-新闻 (无空格,URL 友好)', () => {
    expect(src).toMatch(/category: AI-新闻/);
  });

  it('has parseRSS supporting both rss and atom', () => {
    expect(src).toMatch(/<item/);
    expect(src).toMatch(/<entry/);
  });
});
