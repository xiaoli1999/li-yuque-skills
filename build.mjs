// 构建：校验 skill 规范与版本号，渲染语雀指南 dist/使用指南.md。
// 指南里的示例知识库从 guide.local.json 读取（不入库），格式：{ "bookName": "知识库名" }
// 用法：node build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const NAME = 'li-yuque-skills';
const root = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.join(root, 'skills', NAME);
const dist = path.join(root, 'dist');
const fail = msg => { console.error('构建失败：' + msg); process.exit(1); };
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

// ---- 规范与版本校验 ----
const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
const script = fs.readFileSync(path.join(skillDir, 'scripts', 'yuque.mjs'), 'utf8');
const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
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
const changelog = read('CHANGELOG.md').replace(/^# .*\r?\n+/, '').replace(/^## /gm, '### ').trim();
if (!changelog.includes(`v${version} `)) fail(`CHANGELOG.md 里还没有 v${version} 的记录`);
const owner = plugin.author.name;

// ---- 语雀指南 ----
let local = {};
try { local = JSON.parse(read('guide.local.json')); } catch { /* 没有就留占位 */ }
const repoUrl = `https://github.com/${owner}/${NAME}`;
const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const guide = read('docs/使用指南.md')
  .replaceAll('{{CHANGELOG}}', changelog)
  .replaceAll('{{DATE}}', today)
  .replaceAll('{{OWNER}}', owner)
  .replaceAll('{{REPO_URL}}', repoUrl)
  .replaceAll('{{VERSION}}', version)
  .replaceAll('{{BOOK_NAME}}', local.bookName || '某某知识库');
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, '使用指南.md'), guide);

console.log(`版本 ${version}；仓库 ${repoUrl}`);
console.log(`已生成：${path.join(dist, '使用指南.md')}`);
