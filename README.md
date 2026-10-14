# li-yuque-skills

中文 | [English](README.en.md)

让 Claude Code、Codex、Cursor 直接**读取、搜索、下载**语雀文档，把 Markdown **新建**到语雀，**修改**有编辑权限的文档，**删除**自己创建的文档。支持个人、团队和企业空间知识库。新建、修改、删除都先预览，确认后才执行。

> ⚠️ 仅供学习交流使用，请先阅读[免责声明](#免责声明)。

## 安装

需要 Node.js 18+。装在全局，只需一次：

```bash
npx skills add xiaoli1999/li-yuque-skills -g -a claude-code -y   # Codex 用 -a codex，Cursor 用 -a cursor
```

也可以直接对 AI 说：「从 GitHub 仓库 xiaoli1999/li-yuque-skills 把 li-yuque-skills 安装到全局，装好后带我上手」。装好后 AI 会运行引导，一步步带你登录。

Claude Code 插件方式：`claude plugin marketplace add xiaoli1999/li-yuque-skills`，再 `claude plugin install li-yuque-skills@li-yuque-skills`。

## 使用

直接对 AI 说：

| 想做的事 | 这样说 |
|---|---|
| 第一次用 / 不知道怎么用 | 语雀 skill 怎么用 |
| 登录 | 语雀登录，cookie 已复制 |
| **发链接直接读** | https://www.yuque.com/xxx/yyy/zzz 这篇讲了什么？ |
| 搜索 | 在语雀里找一下标题带「周报」的文档 |
| 下载 | 把「某某知识库」的「目录A」下载到桌面 |
| 新建 | 把 D:\文档\周报.md 发到语雀「某某知识库」 |
| 修改 | 把这篇里的「旧说法」改成「新说法」：https://www.yuque.com/xxx/yyy/zzz |
| 删除 | 删除我建的这篇：https://www.yuque.com/xxx/yyy/zzz |
| 更新 | 更新语雀 skill ／ 更新语雀 cookie，已复制 |

- **登录**：在浏览器打开语雀，F12 →「应用」→ Cookie → `https://www.yuque.com`，复制 `_yuque_session` 的值。**不要粘贴进对话**，AI 会从剪贴板读取。
- **发链接直接读**：支持文档链接，一次可以发多个；AI 读完直接回答，不保存文件。
- **新建**：AI 会先给你看预览（知识库、目录、标题），你确认后才发布。
- **修改**：有编辑权限就能改（自己的、同事的都行）。AI 先读最新内容再改，整篇替换；Markdown 表达不了的样式（字体颜色、卡片等）会丢失，改错了可在「历史版本」恢复。
- **删除**：只能删自己创建、且没有子文档的文档；删除的文档进知识库回收站，可以恢复。

## 说明

- cookie 只保存在本机 `~/.li-yuque-skills/`，只发往 yuque.com。语雀登录有效期 30 天、使用时自动续期，正常使用不用重新登录。
- 每天第一次使用时自动检查并更新到最新版，并简要说明更新了什么。
- 访问频率约 1 次/秒，遇到限流会自动等待；请不要循环、定时或反复全量下载。
- 本工具使用语雀网页端接口，不是官方开放 API，语雀改版可能导致失效。
- 版本记录见 [CHANGELOG.md](CHANGELOG.md)。

## 免责声明

本项目仅供学习和技术交流，与语雀及其运营方无关，也未获其授权。请只访问你有权限的内容，遵守法律法规和[语雀服务协议](https://www.yuque.com/terms)。严禁用于未授权访问、批量抓取、侵犯隐私或知识产权等违法违规用途。因使用本项目导致的账号受限、数据丢失等任何损失，由使用者自行承担。

## 许可

[MIT](LICENSE)
