---
name: li-yuque-skills
description: 语雀文档工具。把语雀知识库（整库、某个目录或单篇）下载成本地 Markdown，或把本地 Markdown 新建为语雀文档。用户提到语雀、yuque.com 链接、"下载语雀文档"、"发到语雀"、"传到语雀"、"同步到语雀"时使用。只能下载和新建，不能修改或删除已有文档。
license: MIT
compatibility: 需要 Node.js 18 及以上，并能访问 www.yuque.com；用于 Claude Code、Codex、Cursor 等能在本机执行命令的工具。
metadata:
  author: xiaoli1999
  version: "0.2.0"
  repository: https://github.com/xiaoli1999/li-yuque-skills
---

# li-yuque-skills

所有操作都通过本 skill 目录下的 `scripts/yuque.mjs` 完成，命令写成：

```
node "<本 skill 目录>/scripts/yuque.mjs" <命令> [参数]
```

本工具只有两类能力：**下载**和**新建**。它没有修改、删除已有文档的功能。用户要求修改或删除时，告诉他到语雀网页上操作。

## 1. 运行前检查 Node

运行 `node -v`，需要 18 或以上。没有安装或版本太低时，先征得用户同意，再安装 Node.js LTS：

- Windows：`winget install OpenJS.NodeJS.LTS`，装完要新开一个终端
- macOS：有 Homebrew 就用 `brew install node`；没有就请用户到 https://nodejs.org 下载 LTS 安装包

## 2. 登录（cookie）

- cookie 长期保存在 `~/.li-yuque-skills/yuque-session.txt`，语雀登录过期前一直可用。
- **绝不要**读取、打印、复制这个文件，也不要让用户把 cookie 贴进对话。
- 首次使用，或者命令以退出码 2 结束（提示"登录已失效"）时，带用户走一遍：
  1. 用 Chrome 或 Edge 打开 https://www.yuque.com 并登录
  2. 按 F12，打开「应用」（Application）面板，左侧找到「Cookie」→ `https://www.yuque.com`
  3. 找到名为 `_yuque_session` 的那一行，双击「值」一栏，全选后复制
  4. 回到对话说"复制好了"

  然后运行 `login`。脚本从剪贴板读取、校验并保存，只会显示登录的语雀昵称。
- 如果用户已经把 cookie 贴进了对话：不要复述，也不要使用它。提醒他以后别这样做，建议在语雀网页上退出再重新登录、换一个新的 cookie，再按上面的步骤登录。
- `whoami` 可以查看当前登录的账号。

## 3. 下载

```
pull <知识库链接或文档链接> [--dir "分组/子分组"] [--out 本地目录]
```

- 知识库链接：下载整个知识库。文档链接：只下载这一篇。知识库链接加 `--dir`：只下载这个目录。
- `--dir` 按目录标题写，层级之间用 `/` 分隔。不确定目录名时，先运行 `toc <知识库链接> --depth 2` 看结构，必要时再用 `--dir` 往下看。
- `--out` 问用户想存在哪里；用户没说，就存在当前工作目录下、以知识库名命名的文件夹。
- 每篇保存为一个 `.md`，图片存在同目录的 `img/`；画板（思维导图）转成层级列表；表格、数据表等暂不支持，会跳过并在最后列出。
- 每篇大约 0.5 秒。篇数多时先用 `toc` 告诉用户大概要下载多少篇。
- 重复下载会覆盖同名文件。
- `books` 能列出用户自己的知识库；别人共享给他的知识库不在列表里，直接用链接即可。

## 4. 新建

```
add <md文件> --book <知识库名或链接> [--under "分组/子分组"] [--title 标题] [--yes]
```

- 只能新建到本机白名单里的知识库，用 `books` 查看。
- 目标知识库不在白名单里时，告诉用户；只有用户**明确同意**往这个知识库新建，才运行 `allow <知识库链接>` 把它加入白名单。**不要自己决定加白名单。**
- 必须按这个顺序做：
  1. 准备好 `.md` 文件：用户给的文件，或者你按用户要求写好后存成文件。
  2. 先**不带** `--yes` 运行，得到预览（知识库、位置、标题、字数、图片数）。
  3. 把预览原样告诉用户，等用户明确同意。
  4. 用户同意后，加 `--yes` 再运行一次。
- 标题：有 `--title` 就用它；否则取文件开头的一级标题（会从正文里去掉，避免重复）；都没有就用文件名。
- `--under` 指定放在哪个目录下；不加就放在知识库根目录。新文档排在该目录的最前面。
- `.md` 里引用的本地图片（`![](路径)`）和本地附件（`[名称](路径)`，如 pdf、txt）会自动上传；网络图片保留原链接。语雀免费账号不能上传 zip、rar、7z 等压缩包。
- 完成后把输出里的语雀链接给用户。
- 用户想"更新"已有文档：说明本工具只能新建，可以新建一篇新版本，旧的请他到网页上处理。

## 5. 出错时

- 退出码 2：登录问题，按第 2 节重新登录。
- 退出码 1：把输出的中文提示告诉用户。常见原因：链接不对、账号没有这个知识库的权限、知识库不在新建白名单里。

## 6. 安装与更新

本 skill **必须装在用户全局目录**，所有项目都能用。**不要**装进任何项目里的 `.claude/skills`、`.agents/skills`、`.cursor/skills`。

用下面任一方式安装；要更新，重新运行同一条命令。`-a` 写你自己是哪个工具：

```
npx skills add xiaoli1999/li-yuque-skills -g -a claude-code -y   # 或 -a codex、-a cursor
```

- Claude Code 也可以用插件方式：`claude plugin marketplace add xiaoli1999/li-yuque-skills`，然后 `claude plugin install li-yuque-skills@li-yuque-skills`；更新用 `claude plugin update li-yuque-skills@li-yuque-skills`。
- 访问不了 GitHub 时，用户可能会给你离线安装器 `li-yuque-skills-installer.js`，运行 `node li-yuque-skills-installer.js --for claude-code`（或 `codex`、`cursor`）。

各工具的全局位置：Claude Code `~/.claude/skills/li-yuque-skills/`，Codex `~/.agents/skills/li-yuque-skills/`，Cursor `~/.cursor/skills/li-yuque-skills/`。cookie 和白名单存在 `~/.li-yuque-skills/`，重装、更新都不受影响。装完告诉用户：如果没有马上生效，新开一个对话。
