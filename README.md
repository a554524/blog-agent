# blog-agent

`~/ai-blog` 的独立运维 agent,负责 **写文 / 发布 / 巡检** 三件事。

## 设计原则

- **不侵入博客主站**:博客只管展示,所有自动化在这里
- **命令行优先**:每个能力都是一条可单独调用的命令,可被 cron / 飞书机器人 / 其他脚本拼装
- **可降级**:LLM 不可用时仍能跑 status / publish / deploy / health
- **幂等**:publish 对已发布文章无副作用,deploy 对已是最新内容无副作用

## 能力

```
内容:
  write <topic...>      AI 生成一篇草稿到 content/posts
  write-tool <name>     AI 生成工具条目到 content/tools
  revise <slug>         LLM 润色已有文章 (就地覆盖)

发布:
  publish <slug>        draft:false + git commit + push
  deploy                build + 部署到 Cloudflare Pages

运维:
  status                本地仓库概览
  drafts                列出所有草稿
  stale-tools [days]    超 N 天未更新的工具 (默认 90)
  health                线上 URL 探测

全局选项:
  --dry-run             write/revise 不落盘
  --no-push             publish 只 commit 不推送
  --skip-build          deploy 跳过 npm run build
```

## 快速开始

```bash
cd ~/blog-agent
cp .env.example .env
# 编辑 .env,至少填 MILLM_API_KEY / CLOUDFLARE_API_TOKEN

npm install

# 跑一次状态
node bin/agent.mjs status

# 线上健康
node bin/agent.mjs health

# 用 LLM 写一篇
node bin/agent.mjs write "用 Claude Code 快速搭建静态博客"

# 发布并部署
node bin/agent.mjs publish <slug>
node bin/agent.mjs deploy
```

## 典型工作流

### 发一篇新文章

```bash
node bin/agent.mjs write "一个清晰的主题"     # 生成草稿
# 编辑器打开 ~/ai-blog/content/posts/xxx.mdx 人工审阅
node bin/agent.mjs publish xxx                # draft:false + commit + push
node bin/agent.mjs deploy                     # build + 推 Cloudflare
node bin/agent.mjs health                     # 验证线上
```

### 周例行巡检

```bash
node bin/agent.mjs status
node bin/agent.mjs stale-tools 90
node bin/agent.mjs drafts
node bin/agent.mjs health
```

可挂 cron:

```
# 每周一早 9:07 自动巡检,结果发飞书群
7 9 * * 1  cd /home/mi/blog-agent && node bin/agent.mjs health >> /tmp/blog-health.log 2>&1
```

### 批量工具更新

```bash
node bin/agent.mjs stale-tools 90       # 先列出谁过期
# 对每个过期工具,手工或脚本触发 revise
```

## 架构

```
blog-agent/
├── bin/agent.mjs          CLI 入口,子命令路由
├── src/
│   ├── config.mjs         .env 读取 + 常量集中
│   ├── llm.mjs            MiLLM OpenAI 兼容 chat 包装
│   ├── write.mjs          writePost / writeTool / revisePost
│   ├── publish.mjs        publishPost / deploy (wrangler)
│   ├── ops.mjs            status / drafts / staleTools / health
│   └── prompts/           LLM 系统提示
├── tests/                 vitest 单元测试 6 项
└── .env.example
```

## 与博客仓库的关系

```
~/ai-blog                  博客主站 (独立 git 仓库,用户可写作)
~/blog-agent               本工具 (独立项目,读/写 ~/ai-blog)
                            └─ BLOG_ROOT 环境变量指向博客仓库
```

Agent 对博客仓库只做这几件事:
- 读取/写入 `content/posts/*.mdx` `content/tools/*.md`
- 执行 `git add/commit/push`
- 执行 `npm run build`
- 执行 `wrangler pages deploy out`

博客仓库完全不知道 agent 存在,两者独立演化。

## 测试

```bash
npm test
```

当前 2 个测试文件,6 项全部通过。
