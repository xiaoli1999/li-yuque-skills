# 版本记录

## v0.4.0 — 2026-10-12

- 新增 `guide` 使用引导：检查安装版本、登录状态、新建白名单，给出下一步和示例说法；对 AI 说「语雀 skill 怎么用」即可。
- 降低访问频率：接口请求间隔改为随机 0.8～1.5 秒，图片间隔 0.25 秒；遇到限流按 30/60/120 秒退避，仍不行就停止。
- 一次下载超过 200 篇时要求用户确认。
- 登录失效时直接给出完整的登录步骤；每次汇报结束提示可以做的下一步。

## v0.3.1 — 2026-10-12

- 修复：检查和下载更新时同时询问 GitHub 与 jsDelivr 镜像，取版本更高的一方，避免某一边缓存滞后拿到旧版本。

## v0.3.0 — 2026-10-12

- 新增 `update`：从 GitHub 一键更新 skill（GitHub 访问不了时自动走 jsDelivr 镜像）；脚本每天最多检查一次新版本，有新版会提醒。
- 新增 `version`（查看版本与安装位置）、`logout`（删除本机 cookie）。
- `books` 支持列出团队和企业空间（`xxx.yuque.com`）里的知识库。
- SKILL.md 按团队 Skills 规范重写：frontmatter 只保留 `name`、`description`，正文分 Objective / Workflow / Project Rules / Resource Routing / Validation / Output。
- 增加免责声明。

## v0.2.0 — 2026-10-12

- 发布到 GitHub，符合 Agent Skills 开放标准；支持 `npx skills add` 和 Claude Code 插件两种安装方式，均为全局安装。
- 新建白名单改为本机配置（`allow` / `disallow`），代码里不含任何知识库地址。

## v0.1.0 — 2026-10-12

- 初版：下载文档和画板为 Markdown（图片本地化）；把 Markdown 新建为语雀文档（自动上传本地图片和附件）；cookie 通过剪贴板登录，不经过 AI 对话。
