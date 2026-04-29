import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import matter from 'gray-matter';
import { config, requireBlogRoot } from './config.mjs';

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} 失败:\n${r.stderr || r.stdout}`);
  }
  return r.stdout.trim();
}

export function publishPost({ slug, noPush = false }) {
  const root = requireBlogRoot();
  const postsDir = path.join(root, 'content', 'posts');
  const mdx = path.join(postsDir, `${slug}.mdx`);
  const md = path.join(postsDir, `${slug}.md`);
  const file = fs.existsSync(mdx) ? mdx : fs.existsSync(md) ? md : null;
  if (!file) throw new Error(`文章不存在:${slug}`);

  const raw = fs.readFileSync(file, 'utf8');
  const parsed = matter(raw);
  if (!parsed.data.draft) {
    return { file, slug, message: '文章已是发布状态,跳过', changed: false };
  }
  parsed.data.draft = false;
  const updated = matter.stringify(parsed.content, parsed.data);
  fs.writeFileSync(file, updated, 'utf8');

  const title = parsed.data.title || slug;
  run('git', ['add', file], root);

  const hasStaged = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: root }).status;
  if (hasStaged === 0) {
    return { file, slug, message: '无变更可提交', changed: false };
  }

  run('git', ['commit', '-m', `post: ${title}`], root);
  if (!noPush) {
    try {
      run('git', ['push', 'origin', 'main'], root);
    } catch (e) {
      return { file, slug, message: `提交成功但 push 失败:${e.message}`, changed: true, pushed: false };
    }
  }
  return { file, slug, title, message: '已提交并推送', changed: true, pushed: !noPush };
}

export function deploy({ skipBuild = false } = {}) {
  const root = requireBlogRoot();
  const steps = [];

  if (!skipBuild) {
    steps.push('build');
    execSync('npm run build', { cwd: root, stdio: 'inherit' });
  }

  const outDir = path.join(root, 'out');
  if (!fs.existsSync(outDir)) {
    throw new Error(`out/ 不存在,需要先 build (BUILD_MODE=static npm run build)`);
  }

  if (!config.cf.token) throw new Error('CLOUDFLARE_API_TOKEN 未配置');
  if (!config.cf.accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID 未配置');

  steps.push('deploy');
  const env = {
    ...process.env,
    CLOUDFLARE_API_TOKEN: config.cf.token,
    CLOUDFLARE_ACCOUNT_ID: config.cf.accountId,
  };
  const r = spawnSync(
    'npx',
    ['wrangler', 'pages', 'deploy', outDir, '--project-name', config.cf.project, '--branch', 'main', '--commit-dirty', 'true'],
    { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (r.status !== 0) {
    throw new Error(`wrangler deploy 失败:\n${r.stderr || r.stdout}`);
  }

  const stdout = r.stdout;
  const urlMatch = stdout.match(/https:\/\/[a-z0-9-]+\.pages\.dev/g) ?? [];
  const deploymentUrl = urlMatch[0] || null;

  return {
    steps,
    deploymentUrl,
    productionUrl: config.siteUrl,
    stdout: stdout.slice(-1500),
  };
}
