// 构建：校验 skill 规范与版本号，生成离线安装器 dist/li-yuque-skills-installer.js，渲染语雀指南 dist/使用指南.md。
// 离线安装器给访问不了 GitHub 的人用；语雀免费账号不能上传 .zip/.rar/.7z 附件（2026-10-12 实测），.js 可以。
// 指南里的公司知识库从 guide.local.json 读取（不入库），格式：{ "bookName": "知识库名", "bookUrl": "https://www.yuque.com/..." }
// 用法：node build.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const NAME = 'li-yuque-skills';
const root = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.join(root, 'skills', NAME);
const dist = path.join(root, 'dist');
const INSTALLER = `${NAME}-installer.js`;
const fail = msg => { console.error('构建失败：' + msg); process.exit(1); };

// ---- 规范与版本校验 ----
const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
const script = fs.readFileSync(path.join(skillDir, 'scripts', 'yuque.mjs'), 'utf8');
const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'));
execFileSync(process.execPath, ['--check', path.join(skillDir, 'scripts', 'yuque.mjs')], { stdio: 'inherit' });

const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skillMd);
if (!front) fail('SKILL.md 缺少 frontmatter');
const fm = front[1];
const name = (/^name:\s*(.+)$/m.exec(fm) || [])[1];
const desc = (/^description:\s*(.+)$/m.exec(fm) || [])[1] || '';
if (name !== NAME) fail(`SKILL.md 的 name（${name}）必须与目录名 ${NAME} 一致`);
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) fail('name 只能是小写字母、数字和单个连字符，最长 64');
if (!desc || desc.length > 1024) fail('description 必填且不超过 1024 字符');
// 团队规范：frontmatter 只允许 name 和 description
const keys = fm.split(/\r?\n/).filter(l => /^[A-Za-z_-]+:/.test(l)).map(l => l.split(':')[0]);
if (keys.join(',') !== 'name,description') fail(`SKILL.md frontmatter 只能有 name 和 description，现在是：${keys.join(', ')}`);
const version = /const VERSION = '([^']+)'/.exec(script)[1];
if (version !== plugin.version) fail(`版本号不一致：yuque.mjs ${version}，plugin.json ${plugin.version}`);
for (const [f, s] of [['SKILL.md', skillMd], ['plugin.json', JSON.stringify(plugin)], ['README.md', fs.readFileSync(path.join(root, 'README.md'), 'utf8')]]) {
  if (s.includes('{{OWNER}}')) fail(`${f} 里还有 {{OWNER}} 占位符没替换`);
}
const owner = plugin.author.name;

// ---- 离线安装器 ----
const files = { 'SKILL.md': skillMd, 'scripts/yuque.mjs': script };
const sha = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, crypto.createHash('sha256').update(v, 'utf8').digest('hex')]));
const installer = `#!/usr/bin/env node
// ${NAME} 离线安装器 ${version}：把 skill 装到当前用户的全局 skills 目录，所有项目都能用。
// 能访问 GitHub 时优先用：npx skills add ${owner}/${NAME} -g -a <claude-code|codex|cursor> -y
// 用法：node ${INSTALLER} --for <claude-code|codex|cursor>
//   claude-code → ~/.claude/skills/${NAME}/
//   codex       → ~/.agents/skills/${NAME}/
//   cursor      → ~/.cursor/skills/${NAME}/
// 只写入上面的目录（已有旧版本会整个替换），不碰 cookie 和白名单所在的 ~/.${NAME}/。
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const VERSION = ${JSON.stringify(version)};
const FILES = ${JSON.stringify(files, null, 1)};
const SHA256 = ${JSON.stringify(sha, null, 1)};
const TARGETS = { 'claude-code': ['.claude', 'skills'], codex: ['.agents', 'skills'], cursor: ['.cursor', 'skills'] };

const i = process.argv.indexOf('--for');
const wanted = i > 0 ? String(process.argv[i + 1] || '').split(',').map(s => s.trim()).filter(Boolean) : [];
if (!wanted.length || wanted.some(t => !TARGETS[t])) {
  console.log('用法：node ${INSTALLER} --for <claude-code|codex|cursor>');
  process.exit(1);
}
for (const [name, text] of Object.entries(FILES)) {
  if (crypto.createHash('sha256').update(text, 'utf8').digest('hex') !== SHA256[name]) {
    console.error('安装器文件已损坏（' + name + ' 校验不一致），请重新下载。');
    process.exit(1);
  }
}
for (const t of wanted) {
  const dir = path.join(os.homedir(), ...TARGETS[t], '${NAME}');
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [name, text] of Object.entries(FILES)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  console.log('已安装 ${NAME} ' + VERSION + ' → ' + dir + '（全局，所有项目可用）');
}
console.log('新开一个对话后生效。首次使用需要登录语雀，对 AI 说「语雀登录」即可。');
`;
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, INSTALLER), installer);
execFileSync(process.execPath, ['--check', path.join(dist, INSTALLER)], { stdio: 'inherit' });

// ---- 语雀指南 ----
let local = {};
try { local = JSON.parse(fs.readFileSync(path.join(root, 'guide.local.json'), 'utf8')); } catch { /* 没有就留占位 */ }
const repoUrl = `https://github.com/${owner}/${NAME}`;
// CHANGELOG 嵌进指南：去掉总标题，版本标题降一级
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
  .replace(/^# .*\r?\n+/, '').replace(/^## /gm, '### ').trim();
const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
if (!changelog.includes(`v${version} `)) fail(`CHANGELOG.md 里还没有 v${version} 的记录`);
const guide = fs.readFileSync(path.join(root, 'docs', '使用指南.md'), 'utf8')
  .replaceAll('{{CHANGELOG}}', changelog)
  .replaceAll('{{DATE}}', today)
  .replaceAll('{{OWNER}}', owner)
  .replaceAll('{{REPO_URL}}', repoUrl)
  .replaceAll('{{ZIP_URL}}', `${repoUrl}/archive/refs/heads/master.zip`)
  .replaceAll('{{INSTALLER}}', `./${INSTALLER}`)
  .replaceAll('{{VERSION}}', version)
  .replaceAll('{{BOOK_NAME}}', local.bookName || '{{BOOK_NAME}}')
  .replaceAll('{{BOOK_URL}}', local.bookUrl || '{{BOOK_URL}}');
fs.writeFileSync(path.join(dist, '使用指南.md'), guide);

console.log(`版本 ${version}；仓库 ${repoUrl}`);
console.log(`已生成：${path.join(dist, INSTALLER)}（${fs.statSync(path.join(dist, INSTALLER)).size} 字节）`);
console.log(`已生成：${path.join(dist, '使用指南.md')}`);
if (guide.includes('{{BOOK_')) console.log('提示：没有 guide.local.json，指南里的公司知识库还是占位符。');
