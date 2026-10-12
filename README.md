# li-yuque-skills

让 AI（Claude Code、Codex、Cursor）帮你**下载**语雀文档到本地、把本地 Markdown **新建**到语雀。

- 下载：整个知识库、某个目录或单篇文档 → Markdown，图片一起保存；画板（思维导图）转成层级列表。
- 新建：本地 `.md` → 语雀文档，文中引用的本地图片和附件自动上传。
- **只能下载和新建，不能修改或删除**语雀上已有的文档。

符合 [Agent Skills](https://agentskills.io/specification) 开放标准，skill 名为 `li-yuque-skills`。

> ⚠️ **仅供学习交流使用**，使用前请阅读文末的[免责声明](#免责声明)。

## 安装（装到全局，所有项目可用）

需要 [Node.js](https://nodejs.org) 18 及以上。

**方式一：npx skills（Claude Code、Codex、Cursor 通用，推荐）**

```bash
npx skills add xiaoli1999/li-yuque-skills -g -a claude-code -y   # Claude Code
npx skills add xiaoli1999/li-yuque-skills -g -a codex -y         # Codex
npx skills add xiaoli1999/li-yuque-skills -g -a cursor -y        # Cursor
```

只需要安装一次。以后更新见下文「更新」。

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

- 「语雀 skill 怎么用」——不知道从哪开始时说这句，AI 会检查安装、登录、白名单状态，告诉你下一步和可以怎么说
- 「语雀登录，cookie 已复制」——首次使用。在浏览器开发者工具（F12 → 应用 → Cookie → `https://www.yuque.com`）里复制 `_yuque_session` 的值，**不要粘贴进对话**，AI 会从剪贴板读取。登录一次长期有效，直到语雀登录过期。
- 「把 https://www.yuque.com/xxx/yyy 这个知识库下载到桌面」
- 「下载这个知识库里『产品资料/报价』这个目录：https://www.yuque.com/xxx/yyy」
- 「列出我能访问的语雀知识库」——包括个人、团队和企业空间（`xxx.yuque.com`）的知识库
- 「把 https://www.yuque.com/xxx/yyy 加入语雀新建白名单」——新建前需要先加一次
- 「把 D:\文档\周报.md 发到语雀『某某知识库』」——AI 会先给你看预览，你确认后才发布

## 更新

- **更新 skill**：对 AI 说「更新语雀 skill」。脚本每天最多检查一次新版本，有新版时会在命令结果末尾提醒。插件方式安装的用 `claude plugin update li-yuque-skills@li-yuque-skills`。
- **更新 cookie**：cookie 过期或想换账号时，重新复制 `_yuque_session`，对 AI 说「更新语雀 cookie，已复制」。
- 更新 skill 不影响 cookie 和白名单。

## 访问频率与账号风险

语雀没有公开网页接口的频率上限。它的[开放 API 文档](https://www.yuque.com/yuque/developer/api)写明"系统识别异常行为后会进行屏蔽处理，可能会导致用户不可用"；[服务协议](https://www.yuque.com/terms)第三条约定不得使用未经授权的第三方工具对服务"施加其他影响"，第九条约定违反协议或出于安全原因时可中断、终止服务。因此本工具：

- 串行请求，接口之间随机间隔 0.8～1.5 秒（约 1 次/秒，接近人工浏览）；图片之间间隔 0.25 秒；
- 遇到限流（429 / 503 / "频繁"）按 30、60、120 秒退避，仍不行就停下，提示至少 1 小时后再试；
- 一次下载超过 200 篇时要求确认。

日常按需下载、偶尔新建，风险很低；但请不要循环、定时或多开批量下载，也不要短时间反复全量下载同一个知识库。**无法保证不被限制，风险由使用者自行承担。**

## 数据与安全

- cookie 和新建白名单只保存在本机 `~/.li-yuque-skills/`，cookie 只发往 `yuque.com`，脚本不会打印它；检查更新只访问 GitHub / jsDelivr，不带 cookie。
- cookie 等同于你的语雀账号，不要发给任何人。不用了可以对 AI 说「删除语雀 cookie」。
- 新建只能写进你本机白名单里的知识库；白名单只在你明确要求时才会添加。

## 免责声明

1. 本项目**仅供学习和技术交流使用**，不得用于任何商业用途或违法违规用途。
2. 本项目通过语雀网页端接口工作（与你在浏览器中访问相同），**不是语雀官方开放 API**，与语雀及其运营方没有任何关联，也未获得其授权或认可。「语雀」及相关标识归其权利人所有。
3. 请只访问和处理**你本人有权限**的内容，并遵守《中华人民共和国网络安全法》《数据安全法》《个人信息保护法》等法律法规以及语雀的服务协议。**严禁**用于未经授权访问他人内容、批量抓取、侵犯他人隐私或知识产权、传播违法信息等任何违法行为。
4. cookie 等登录凭证由你自行保管，因凭证泄露、账号被限制或封禁、数据丢失、语雀接口变更导致失效等造成的任何直接或间接损失，作者不承担责任。
5. 本项目按「现状」提供，不对可用性、正确性和适用性做任何保证。使用本项目即表示你已阅读并同意本声明；如不同意，请勿使用。

## 开发

```
skills/li-yuque-skills/SKILL.md          skill 说明（给 AI 看）
skills/li-yuque-skills/scripts/yuque.mjs 零依赖脚本
.claude-plugin/                          Claude Code 插件与插件市场清单
docs/使用指南.md                          面向同事的语雀指南源稿
CHANGELOG.md                             版本记录（会嵌进语雀指南）
build.mjs                                校验规范与版本号，生成离线安装器与指南（输出到 dist/）
```

发版：改 `scripts/yuque.mjs` 的 `VERSION` 和 `.claude-plugin/plugin.json` 的 `version`，在 `CHANGELOG.md` 顶部追加记录，运行 `node build.mjs`，推送到 `master`。已安装的用户会在一天内收到更新提醒。

## 许可

[MIT](LICENSE)
