# li-yuque-skills

让 AI（Claude Code、Codex、Cursor）帮你**下载**语雀文档到本地、把本地 Markdown **新建**到语雀。

- 下载：整个知识库、某个目录或单篇文档 → Markdown，图片一起保存；画板（思维导图）转成层级列表。
- 新建：本地 `.md` → 语雀文档，文中引用的本地图片和附件自动上传。
- **只能下载和新建，不能修改或删除**语雀上已有的文档。

符合 [Agent Skills](https://agentskills.io/specification) 开放标准，skill 名为 `li-yuque-skills`。

## 安装（装到全局，所有项目可用）

需要 [Node.js](https://nodejs.org) 18 及以上。

**方式一：npx skills（Claude Code、Codex、Cursor 通用，推荐）**

```bash
npx skills add xiaoli1999/li-yuque-skills -g -a claude-code -y   # Claude Code
npx skills add xiaoli1999/li-yuque-skills -g -a codex -y         # Codex
npx skills add xiaoli1999/li-yuque-skills -g -a cursor -y        # Cursor
```

更新：重新运行同一条命令。

**方式二：Claude Code 插件**

```bash
claude plugin marketplace add xiaoli1999/li-yuque-skills
claude plugin install li-yuque-skills@li-yuque-skills
```

更新：`claude plugin update li-yuque-skills@li-yuque-skills`。

**方式三：手动**

下载 [ZIP](https://github.com/xiaoli1999/li-yuque-skills/archive/refs/heads/master.zip)，把其中的 `skills/li-yuque-skills/` 文件夹复制到全局 skills 目录：

| 工具 | 位置 |
|---|---|
| Claude Code | `~/.claude/skills/li-yuque-skills/` |
| Codex | `~/.agents/skills/li-yuque-skills/` |
| Cursor | `~/.cursor/skills/li-yuque-skills/` |

装完新开一个对话。

## 使用

直接对 AI 说：

- 「语雀登录，cookie 已复制」——首次使用。在浏览器开发者工具（F12 → 应用 → Cookie → `https://www.yuque.com`）里复制 `_yuque_session` 的值，**不要粘贴进对话**，AI 会从剪贴板读取。
- 「把 https://www.yuque.com/xxx/yyy 这个知识库下载到桌面」
- 「下载这个知识库里『产品资料/报价』这个目录：https://www.yuque.com/xxx/yyy」
- 「把 https://www.yuque.com/xxx/yyy 加入语雀新建白名单」——新建前需要先加一次
- 「把 D:\文档\周报.md 发到语雀『某某知识库』」——AI 会先给你看预览，你确认后才发布

## 数据与安全

- cookie 和新建白名单只保存在本机 `~/.li-yuque-skills/`，cookie 只发往 `yuque.com`，脚本不会打印它。
- cookie 等同于你的语雀账号，不要发给任何人。
- 新建只能写进你本机白名单里的知识库；白名单只在你明确要求时才会添加。

## 说明

本工具使用语雀网页端的接口（与浏览器访问相同），不是语雀官方开放 API，语雀改版可能导致失效。请只访问你有权限的内容，并遵守语雀的服务条款。

## 开发

```
skills/li-yuque-skills/SKILL.md          skill 说明（给 AI 看）
skills/li-yuque-skills/scripts/yuque.mjs 零依赖脚本
.claude-plugin/                          Claude Code 插件与插件市场清单
docs/使用指南.md                          面向同事的语雀指南源稿
build.mjs                                生成离线安装器与指南（输出到 dist/）
```

## 许可

[MIT](LICENSE)
