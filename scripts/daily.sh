#!/usr/bin/env bash
# blog-agent 每日新闻自动化(本机 cron/systemd 调用)
#
# 流程:
#   1. 生成 content/posts/news/news-YYYY-MM-DD.mdx
#   2. git add + commit + push (触发 ai-blog CI 自动部署)
#   3. 日志写 ~/.local/share/blog-agent/daily.log

set -uo pipefail

AGENT_DIR="${HOME}/blog-agent"
BLOG_DIR="${HOME}/ai-blog"
LOG_DIR="${HOME}/.local/share/blog-agent"
LOG_FILE="${LOG_DIR}/daily.log"

mkdir -p "$LOG_DIR"

{
  echo "═════════════════════════════════════════"
  echo "$(date '+%Y-%m-%d %H:%M:%S') · 开始"

  export BLOG_ROOT="$BLOG_DIR"
  export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

  cd "$AGENT_DIR" || { echo "BLOG-AGENT 目录不存在"; exit 1; }

  # 1. 生成
  if ! node bin/agent.mjs news-daily; then
    echo "✗ 生成失败"
    exit 1
  fi

  # 2. 检查是否真生成了新文件
  cd "$BLOG_DIR" || exit 1
  if ! git status --porcelain content/posts/news | grep -q .; then
    echo "· 无新增文件,今日可能已生成过,跳过发布"
    exit 0
  fi

  TODAY=$(date +%Y-%m-%d)
  git add content/posts/news
  git -c user.name=blog-bot -c user.email=bot@local commit -q -m "news: AI 日报 ${TODAY}"

  # 3. 推送
  if git push origin main 2>&1; then
    echo "✓ 已推送,CI 会自动部署"
  else
    echo "✗ push 失败"
    exit 1
  fi

  echo "$(date '+%Y-%m-%d %H:%M:%S') · 完成"
} >>"$LOG_FILE" 2>&1
