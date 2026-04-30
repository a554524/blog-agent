#!/usr/bin/env node
// blog-agent CLI
// 用法示例:
//   blog-agent status
//   blog-agent write "Claude Code 自动化测试的 5 个技巧"
//   blog-agent write-tool "Cursor"
//   blog-agent revise claude-code-quickstart
//   blog-agent publish claude-code-quickstart
//   blog-agent deploy
//   blog-agent health
//   blog-agent drafts
//   blog-agent stale-tools 90

import { writePost, writeTool, revisePost } from '../src/write.mjs';
import { publishPost, deploy } from '../src/publish.mjs';
import { status, pendingDrafts, staleTools, health } from '../src/ops.mjs';
import { generateDaily } from '../src/news.mjs';
import { config } from '../src/config.mjs';

const HELP = `blog-agent — ai-blog 运维 CLI

内容:
  write <topic...>      AI 生成一篇草稿 (draft:true) 到 content/posts
  write-tool <name>     AI 生成工具条目到 content/tools
  revise <slug>         LLM 润色已有文章 (就地覆盖)
  news-daily            抓 RSS + LLM 合成今日 AI 新闻日报

发布:
  publish <slug>        将文章 draft:false + git commit + push
  deploy                build + 部署到 Cloudflare Pages

运维:
  status                本地仓库概览
  drafts                列出所有 draft:true 文章
  stale-tools [days]    列出 updatedAt 超过 N 天的工具 (默认 90)
  health                线上 URL 探测

全局选项:
  --dry-run             write/revise 不落盘,只打印
  --no-push             publish 只 commit 不推送

配置:将环境变量写入 ~/blog-agent/.env 或仓库 .env,参见 .env.example
`;

function err(msg) {
  console.error(`错误:${msg}`);
  process.exit(1);
}

function printResult(r) {
  if (r.title) console.log(`# ${r.title}`);
  if (r.lines) r.lines.forEach((l) => console.log(l));
  else console.log(JSON.stringify(r, null, 2));
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = argv.slice(1);
  const dryRun = args.includes('--dry-run');
  const noPush = args.includes('--no-push');
  const positional = args.filter((a) => !a.startsWith('--'));

  if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help') {
    console.log(HELP);
    return;
  }

  switch (cmd) {
    case 'status':
      printResult(status());
      return;

    case 'drafts':
    case 'pending-drafts':
      printResult(pendingDrafts());
      return;

    case 'stale-tools': {
      const days = Number(positional[0] ?? 90);
      printResult(staleTools({ days }));
      return;
    }

    case 'health':
      printResult(await health());
      return;

    case 'write': {
      const topic = positional.join(' ').trim();
      if (!topic) err('用法:blog-agent write <topic...>');
      console.log(`⚙ 生成文章(model=${config.millm.model})...`);
      const r = await writePost({ topic, dryRun });
      console.log(`✓ slug=${r.slug}`);
      console.log(`  文件:${r.file}${r.written ? '' : ' (dry-run,未写入)'}`);
      if (dryRun) console.log('\n--- 内容预览 ---\n' + r.markdown.slice(0, 800));
      return;
    }

    case 'write-tool': {
      const name = positional.join(' ').trim();
      if (!name) err('用法:blog-agent write-tool <name>');
      console.log(`⚙ 生成工具条目 ${name} ...`);
      const r = await writeTool({ name, dryRun });
      console.log(`✓ slug=${r.slug}`);
      console.log(`  文件:${r.file}${r.written ? '' : ' (dry-run)'}`);
      if (dryRun) console.log('\n--- 内容预览 ---\n' + r.markdown.slice(0, 600));
      return;
    }

    case 'news-daily': {
      console.log('⚙ 抓 RSS + LLM 合成今日 AI 新闻...');
      const r = await generateDaily({ dryRun });
      if (r.message) console.log(r.message);
      if (r.candidateCount !== undefined) console.log(`  候选:${r.candidateCount} 条`);
      console.log(`  文件:${r.file}${r.written ? '' : ' (未写入)'}`);
      if (dryRun && r.markdown) console.log('\n--- 预览 ---\n' + r.markdown.slice(0, 1200));
      return;
    }

    case 'revise': {
      const slug = positional[0];
      if (!slug) err('用法:blog-agent revise <slug>');
      console.log(`⚙ 润色 ${slug} ...`);
      const r = await revisePost({ slug, dryRun });
      console.log(`✓ 文件:${r.file}${r.written ? '' : ' (dry-run)'}`);
      if (dryRun) {
        console.log('\n--- 原文 vs 修订 长度 ---');
        console.log(`  原文 ${r.original.length} 字  →  修订 ${r.revised.length} 字`);
      }
      return;
    }

    case 'publish': {
      const slug = positional[0];
      if (!slug) err('用法:blog-agent publish <slug>');
      const r = publishPost({ slug, noPush });
      console.log(`# ${r.message}`);
      console.log(`  slug=${r.slug}  changed=${r.changed}  pushed=${r.pushed ?? false}`);
      return;
    }

    case 'deploy': {
      const skipBuild = args.includes('--skip-build');
      const r = deploy({ skipBuild });
      console.log(`# 部署完成`);
      if (r.deploymentUrl) console.log(`  预览 URL:${r.deploymentUrl}`);
      console.log(`  生产 URL:${r.productionUrl}`);
      return;
    }

    default:
      err(`未知命令:${cmd}\n\n${HELP}`);
  }
}

main().catch((e) => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
