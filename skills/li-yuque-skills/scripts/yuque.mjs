#!/usr/bin/env node
// li-yuque-skills：读取、搜索、下载语雀文档，新建、修改文档，删除自己创建的文档。零依赖，需要 Node 18 及以上。
// 安全约定：
//   1. 写操作只有新建、修改、删除三种；删除只允许删本人创建、且没有子文档的文档。
//   2. 写操作都先预览，用户确认后带 --yes 才执行；访问范围只受账号自身权限约束。
//   3. cookie 只从 ~/.li-yuque-skills/yuque-session.txt 读取，只发往 yuque.com，任何时候都不打印；
//      语雀续期时如果换了新值，校验能登录后才覆盖保存。

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VERSION = '0.7.0';
// 更新来源：GitHub 原始文件优先，访问不了时用 jsDelivr 镜像（可能滞后几小时）
const REPO = 'xiaoli1999/li-yuque-skills';
const BRANCH = 'master';
const REMOTE_FILES = { 'SKILL.md': 'skills/li-yuque-skills/SKILL.md', 'scripts/yuque.mjs': 'skills/li-yuque-skills/scripts/yuque.mjs', changelog: 'CHANGELOG.md' };
const MIRRORS = [p => `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${p}`, p => `https://cdn.jsdelivr.net/gh/${REPO}@${BRANCH}/${p}`];
const SKILL_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const HOME_DIR = path.join(os.homedir(), '.li-yuque-skills');
const COOKIE_FILE = path.join(HOME_DIR, 'yuque-session.txt');
const CONFIG_FILE = path.join(HOME_DIR, 'config.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const HOST_RE = /^([a-z0-9-]+\.)?yuque\.com$/i;
// 语雀写接口的防伪校验是「cookie yuque_ctoken 与请求头 x-csrf-token 一致」，网页端也是自己随机生成
const CTOKEN = crypto.randomBytes(16).toString('hex');

class UserError extends Error {}
class LoginError extends Error {}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const bj = iso => (iso ? new Date(new Date(iso).getTime() + 8 * 3600e3).toISOString().replace('T', ' ').slice(0, 16) : '');

// ---------- 参数 ----------
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split(/=(.*)/s);
      if (v !== undefined) args[k] = v;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) args[k] = argv[++i];
      else args[k] = true;
    } else args._.push(a);
  }
  return args;
}

// ---------- cookie ----------
function extractSession(text) {
  let s = String(text || '').replace(/^﻿/, '').trim();
  const m = /_yuque_session=([^;\s]+)/.exec(s);
  if (m) s = m[1];
  if (!s || /\s/.test(s) || s.length < 20) return null;
  return s;
}

function readCookie() {
  if (!fs.existsSync(COOKIE_FILE)) throw new LoginError('还没登录语雀（找不到 cookie 文件）。');
  const s = extractSession(fs.readFileSync(COOKIE_FILE, 'utf8'));
  if (!s) throw new LoginError('cookie 文件内容不对。');
  return s;
}

function readClipboard() {
  const run = (cmd, a) => execFileSync(cmd, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 });
  if (process.platform === 'win32') return run('powershell.exe', ['-NoProfile', '-Command', 'Get-Clipboard -Raw']);
  if (process.platform === 'darwin') return run('pbpaste', []);
  for (const [cmd, a] of [['wl-paste', ['-n']], ['xclip', ['-o', '-selection', 'clipboard']], ['xsel', ['-ob']]]) {
    try { return run(cmd, a); } catch { /* 换下一个 */ }
  }
  throw new UserError('读不到剪贴板（Linux 需要 wl-paste、xclip 或 xsel）。');
}

// ---------- 请求 ----------
// 频率控制：语雀没有公开网页接口的频率上限，这里按接近人工浏览的节奏走——
// 接口请求之间随机间隔 0.8～1.5 秒、串行；遇到限流按 30/60/120 秒退避，仍不行就停下。
const API_GAP = [800, 1500];
const BACKOFF = [30, 60, 120];
const LARGE_PULL = 200; // 一次下载超过这么多篇，必须用户确认（--yes）
let lastCall = 0;
async function pace(gap = API_GAP) {
  const wait = lastCall + gap[0] + Math.random() * (gap[1] - gap[0]) - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
}
const isThrottled = (status, text) => status === 429 || status === 503 || (status >= 400 && /频繁|too many|rate.?limit/i.test(text || ''));

async function yq(url, { method = 'GET', json, body, session } = {}) {
  const u = new URL(url);
  // cookie 只允许发往语雀
  if (u.protocol !== 'https:' || !HOST_RE.test(u.hostname)) throw new UserError(`只允许访问 yuque.com，拒绝：${u.hostname}`);
  const token = session || readCookie();
  const isApi = u.pathname.startsWith('/api/');
  const headers = {
    'user-agent': UA,
    cookie: `_yuque_session=${token}; yuque_ctoken=${CTOKEN}`,
    referer: `https://${u.hostname}/`,
  };
  if (isApi) {
    headers['x-requested-with'] = 'XMLHttpRequest';
    headers.accept = 'application/json';
  }
  if (method !== 'GET') headers['x-csrf-token'] = CTOKEN;
  let payload = body;
  if (json !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(json);
  }
  // 不跟随跳转，避免 cookie 被带到别处；跳到登录页说明登录失效
  let res, text;
  for (let attempt = 0; ; attempt++) {
    await pace();
    res = await fetch(u, { method, headers, body: payload, redirect: 'manual' });
    if (!isThrottled(res.status, '')) break;
    text = await res.text();
    if (attempt >= BACKOFF.length) {
      throw new UserError('语雀提示访问过于频繁，已停止。请至少过 1 小时再试，期间不要重复运行或同时开多个任务。');
    }
    console.log(`语雀提示访问过于频繁（${res.status}），等待 ${BACKOFF[attempt]} 秒后重试……`);
    await sleep(BACKOFF[attempt] * 1000);
  }
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location') || '';
    if (/login/i.test(loc)) throw new LoginError('语雀登录已失效。');
    throw new UserError(`语雀返回跳转（${res.status}），链接可能不对：${u.pathname}`);
  }
  if (res.status === 401) throw new LoginError('语雀登录已失效。');
  if (!session) noteSessionCookie(res, token);
  text = await res.text();
  if (isThrottled(res.status, text)) throw new UserError('语雀提示访问过于频繁，已停止。请至少过 1 小时再试，期间不要重复运行或同时开多个任务。');
  if (!isApi) {
    if (res.status === 404) throw new UserError(`页面不存在（404），检查链接：${u.href}`);
    if (!res.ok) throw new UserError(`语雀返回 ${res.status}：${u.pathname}`);
    return text;
  }
  let data;
  try { data = JSON.parse(text); } catch { throw new UserError(`语雀接口返回的不是 JSON（${res.status}）：${u.pathname}`); }
  if (!res.ok) {
    const msg = data.message || data.code || '';
    if (res.status === 403) throw new UserError(`没有权限（403）：${msg}`);
    const e = new UserError(`语雀接口出错（${res.status}）：${msg} ${u.pathname}`);
    e.status = res.status;
    e.data = data;
    throw e;
  }
  return data;
}

// 语雀每次续期都会重发 _yuque_session（实测有效期 30 天，值不变）。万一续期时换了新值，先记下来，
// 命令结束时用新值校验能登录后再覆盖保存（saveRenewedSession），这样同事不用手动更新 cookie。
let renewedSession = null;
function noteSessionCookie(res, used) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
  for (const c of list) {
    const m = /(?:^|[\s,])_yuque_session=([^;,\s]+)/.exec(c);
    if (!m || /max-age=0\b|expires=Thu, 01 Jan 1970/i.test(c)) continue;
    if (m[1] !== used && extractSession(m[1])) renewedSession = m[1];
  }
}

async function saveRenewedSession() {
  const s = renewedSession;
  renewedSession = null;
  if (!s) return;
  try {
    await whoami(s); // 新值能登录才保存，防止把未登录的会话写进去
    fs.writeFileSync(COOKIE_FILE + '.new', s + '\n', { mode: 0o600 });
    fs.renameSync(COOKIE_FILE + '.new', COOKIE_FILE);
    console.log('\n语雀续期时换了新的 cookie，已自动保存，无需操作。');
  } catch { /* 新值不能用就保留原来的 */ }
}

function getAppData(html) {
  const m = /decodeURIComponent\("(.+?)"\)\);/s.exec(html);
  if (!m) return null;
  try { return JSON.parse(decodeURIComponent(m[1])); } catch { return null; }
}

// ---------- 知识库与目录 ----------
function parseYuqueUrl(link) {
  let u;
  try { u = new URL(String(link).trim()); } catch { throw new UserError(`不是有效链接：${link}`); }
  if (!HOST_RE.test(u.hostname)) throw new UserError(`不是语雀链接：${link}`);
  const host = u.hostname.toLowerCase() === 'yuque.com' ? 'www.yuque.com' : u.hostname.toLowerCase();
  const seg = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (seg.length < 2) throw new UserError(`链接里没有知识库，格式应为 https://www.yuque.com/<用户或团队>/<知识库>：${link}`);
  return { host, login: seg[0], book: seg[1], doc: seg[2] || null };
}

async function loadBook(link) {
  const p = parseYuqueUrl(link);
  const url = `https://${p.host}/${p.login}/${p.book}`;
  const app = getAppData(await yq(url));
  const book = app && app.book;
  if (!book || !book.id) throw new UserError(`打不开知识库：${url}（链接不对，或这个账号没有权限）`);
  return { host: p.host, login: p.login, slug: p.book, id: book.id, name: book.name || p.book, toc: book.toc || [], url, docSlug: p.doc };
}

function buildTree(toc) {
  const nodes = toc.map(t => ({ ...t, type: String(t.type || '').toUpperCase(), children: [] }));
  const byUuid = new Map(nodes.map(n => [n.uuid, n]));
  const roots = [];
  for (const n of nodes) {
    const parent = n.parent_uuid && byUuid.get(n.parent_uuid);
    (parent ? parent.children : roots).push(n);
  }
  return roots;
}

function findPath(roots, dirPath) {
  const segs = String(dirPath).split('/').map(s => s.trim()).filter(Boolean);
  let level = roots, node = null;
  for (let i = 0; i < segs.length; i++) {
    const hits = level.filter(n => (n.title || '').trim() === segs[i]);
    if (hits.length !== 1) {
      const here = segs.slice(0, i).join('/') || '根目录';
      const names = level.map(n => n.title).slice(0, 50).join('、');
      throw new UserError(hits.length
        ? `「${here}」下有 ${hits.length} 个都叫「${segs[i]}」，无法区分。`
        : `「${here}」下没有「${segs[i]}」。这一层有：${names || '（空）'}`);
    }
    node = hits[0];
    level = node.children;
  }
  if (!node) throw new UserError('目录路径为空。');
  return node;
}

// ---------- 文件名 ----------
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
function safeName(s) {
  let n = String(s || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  if (!n) n = '未命名';
  if (RESERVED.test(n)) n += '_';
  return n.slice(0, 80);
}

// ---------- 画板（思维导图）转 Markdown ----------
const decodeEntities = s => s
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&amp;/g, '&');
const nodeText = html => decodeEntities(String(html || '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/div>\s*<div[^>]*>/gi, '\n').replace(/<[^>]+>/g, ''))
  .split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join('<br>');
// 进度图标：6 = 完成；0 = 未开始；1～5 = 部分完成
const progressMark = n => {
  const p = n.icons && n.icons.progress;
  if (p === undefined) return { box: '', note: '' };
  if (p === 6) return { box: '[x] ', note: '' };
  return { box: '[ ] ', note: p > 0 ? `（进度 ${p}/6）` : '' };
};

function boardToMd(d) {
  let c = d.content;
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch { c = null; } }
  const body = (c && c.diagramData && c.diagramData.body) || [];
  const out = ['> 语雀画板（思维导图）转写为层级列表。`[x]` = 完成，`[ ]` = 未完成。', ''];
  let freehand = 0;
  const lines = (n, depth, acc) => {
    for (const ch of n.children || []) {
      const { box, note } = progressMark(ch);
      acc.push(`${'  '.repeat(depth)}- ${box}${nodeText(ch.html) || '（空）'}${note}`);
      lines(ch, depth + 1, acc);
    }
  };
  for (const b of body) {
    if (b.type === 'freehand') { freehand++; continue; }
    if (b.type === 'image' && b.image && b.image.src) { out.push(`![图片](${b.image.src})`, ''); continue; }
    const { box, note } = progressMark(b);
    out.push(`## ${box}${nodeText(b.html) || '（未命名主题）'}${note}`, '');
    const acc = [];
    lines(b, 0, acc);
    if (acc.length) out.push(...acc, '');
  }
  if (freehand) out.push(`> 另有手绘笔迹 ${freehand} 处，未转写。`, '');
  return out.join('\n');
}

// ---------- 图片本地化 ----------
const EXT_BY_TYPE = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/bmp': '.bmp' };

async function localizeImages(md, absDir, prefix, stat) {
  const re = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)([^)]*)\)/g;
  const urls = [...new Set([...md.matchAll(re)].map(m => m[2]))];
  const local = new Map();
  let i = 0;
  for (const url of urls) {
    i++;
    if (i > 1) await sleep(250); // 图片走 CDN，也别连发
    try {
      const clean = url.split('#')[0];
      // 图片在公开 CDN 上，不带 cookie
      const res = await fetch(clean, { headers: { 'user-agent': UA, referer: 'https://www.yuque.com/' } });
      if (!res.ok) throw new Error(String(res.status));
      const type = (res.headers.get('content-type') || '').split(';')[0].trim();
      let ext = path.extname(new URL(clean).pathname).toLowerCase();
      if (!/^\.(png|jpe?g|gif|webp|svg|bmp)$/.test(ext)) ext = EXT_BY_TYPE[type] || '.png';
      const name = `${prefix}-${i}${ext}`;
      fs.mkdirSync(path.join(absDir, 'img'), { recursive: true });
      fs.writeFileSync(path.join(absDir, 'img', name), Buffer.from(await res.arrayBuffer()));
      local.set(url, `./img/${name}`);
      stat.img++;
    } catch {
      stat.imgFail++;
    }
  }
  return md.replace(re, (all, alt, url, rest) => (local.has(url) ? `![${alt}](${local.get(url)}${rest})` : all));
}

// ---------- 命令：login / whoami ----------
async function whoami(session) {
  const app = getAppData(await yq('https://www.yuque.com/dashboard', { session }));
  const me = app && app.me;
  if (!me || !me.id) throw new LoginError('语雀登录已失效。');
  return me;
}

async function cmdLogin() {
  const s = extractSession(readClipboard());
  if (!s) throw new UserError('剪贴板里不是有效的 cookie。请在浏览器里复制 _yuque_session 的「值」后再试。');
  const me = await whoami(s);
  fs.mkdirSync(HOME_DIR, { recursive: true });
  fs.writeFileSync(COOKIE_FILE, s + '\n', { mode: 0o600 });
  console.log(`登录成功：${me.name}（${me.login}）。cookie 已保存到 ${COOKIE_FILE}`);
  console.log('为了安全，可以随便复制点别的内容，把剪贴板里的 cookie 覆盖掉。');
}

async function cmdWhoami() {
  const me = await whoami();
  console.log(`已登录：${me.name}（${me.login}）`);
}

// ---------- 本机配置（更新检查记录） ----------
function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) || {}; } catch { return {}; }
}

function writeConfig(patch) {
  const c = { ...readConfig(), ...patch };
  fs.mkdirSync(HOME_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2) + '\n');
}

// ---------- 命令：books / toc ----------
// 列出能访问的知识库：我的 + 语雀主站团队 + 各企业空间（xxx.yuque.com）团队
async function listAllBooks() {
  const isBook = b => String(b.type || 'Book') === 'Book' && b.slug;
  const out = [];
  const mine = ((await yq('https://www.yuque.com/api/mine/books?limit=100&offset=0')).data || []).filter(isBook);
  for (const b of mine) out.push({ name: b.name, url: `https://www.yuque.com/${(b.user && b.user.login) || ''}/${b.slug}`, group: '我的知识库' });

  const hosts = [{ host: 'www.yuque.com', label: '语雀' }];
  for (const o of (await yq('https://www.yuque.com/api/mine/organizations')).data || []) {
    try {
      const h = new URL(o.host).hostname;
      if (HOST_RE.test(h) && h !== 'www.yuque.com') hosts.push({ host: h, label: `${o.name}（${h}）` });
    } catch { /* 跳过无效地址 */ }
  }
  const failed = [];
  for (const { host, label } of hosts) {
    let groups = [];
    try { groups = (await yq(`https://${host}/api/mine/groups`)).data || []; } catch (e) {
      if (e instanceof LoginError) throw e;
      failed.push(`${label}：读取团队失败（${e.message}）`);
      continue;
    }
    for (const g of groups) {
      const books = ((await yq(`https://${host}/api/groups/${g.id}/books?offset=0&limit=200`)).data || []).filter(isBook);
      for (const b of books) out.push({ name: b.name, url: `https://${host}/${(b.user && b.user.login) || g.login}/${b.slug}`, group: `团队「${g.name}」· ${label}` });
    }
  }
  return { books: out, failed };
}

// 知识库参数可以是链接，也可以是名称（按可访问的知识库匹配）
async function resolveBookRef(arg) {
  if (/^https?:\/\//i.test(arg)) return arg;
  const { books } = await listAllBooks();
  const exact = books.filter(b => b.name === arg);
  const hits = exact.length ? exact : books.filter(b => normText(b.name).includes(normText(arg)));
  if (hits.length === 1) return hits[0].url;
  if (!hits.length) throw new UserError(`没找到名为「${arg}」的知识库。可以先运行 books 查看，或直接给知识库链接。`);
  throw new UserError(`有多个知识库匹配「${arg}」：\n${hits.map(b => `  - ${b.name}：${b.url}（${b.group}）`).join('\n')}\n请用完整名称或链接。`);
}

async function cmdBooks() {
  const { books, failed } = await listAllBooks();
  let last = null;
  for (const b of books) {
    if (b.group !== last) {
      console.log(`\n${b.group}（${books.filter(x => x.group === b.group).length} 个）：`);
      last = b.group;
    }
    console.log(`  - ${b.name}：${b.url}`);
  }
  for (const f of failed) console.log(`\n${f}`);
  console.log('\n以上都可以下载（只要账号有权限）；别人单独共享给你的知识库可能不在列表里，直接用链接即可。');
}

// ---------- 命令：search（按目录和标题模糊搜索） ----------
// 归一化：全角转半角、转小写、去掉空白和常见标点，便于中英文混合匹配
function normText(s) {
  return String(s || '').normalize('NFKC').toLowerCase().replace(/[\s\-_·.,，。、:：;；!！?？'"“”‘’()（）\[\]【】<>《》/\\|]+/g, '');
}

// 按顺序出现即可（如「AI协作」能匹配「AI开发协作」）
function isSubseq(q, s) {
  let i = 0;
  for (const ch of s) if (ch === q[i]) i++;
  return i === q.length;
}

// 打分：标题完全相同 > 标题包含整个关键词 > 标题包含全部词 > 路径包含 > 按顺序出现；0 表示不匹配
function matchScore(query, title, fullPath) {
  const q = normText(query), t = normText(title), p = normText(fullPath);
  const terms = String(query).split(/\s+/).map(normText).filter(Boolean);
  if (!q) return 0;
  if (t === q) return 100;
  if (t.includes(q)) return 90;
  if (terms.length > 1 && terms.every(x => t.includes(x))) return 80;
  if (p.includes(q)) return 70;
  if (terms.every(x => p.includes(x))) return 60;
  if (q.length >= 2 && isSubseq(q, t)) return 50;
  if (q.length >= 2 && isSubseq(q, p)) return 40;
  return 0;
}

async function cmdSearch(args) {
  const query = args._.slice(1).join(' ').trim();
  if (!query) throw new UserError('用法：search <关键词> [--book 知识库名或链接] [--limit 条数]');
  const limit = Number(args.limit) || 20;
  let targets;
  if (args.book) targets = [{ url: await resolveBookRef(args.book) }];
  else {
    const { books } = await listAllBooks();
    targets = books;
    console.log(`在 ${books.length} 个知识库里搜索「${query}」（按目录和标题），约需 ${Math.ceil(books.length * 1.2)} 秒……`);
  }
  const hits = [];
  const failed = [];
  for (const t of targets) {
    let book;
    try { book = await loadBook(t.url); } catch (e) {
      if (e instanceof LoginError) throw e;
      failed.push(`${t.name || t.url}：${e.message}`);
      continue;
    }
    // 先看标题本身是否匹配；标题不匹配时才看「知识库/目录/标题」整条路径。
    // 某个目录的标题已经命中时，它下面的内容只在自己标题也匹配时才列出，避免整棵子树刷屏。
    const walk = (list, trail, coveredByAncestor) => {
      for (const n of list) {
        let own = 0;
        if (n.type === 'TITLE' || n.type === 'DOC') {
          const dirPath = trail.join('/');
          own = matchScore(query, n.title, n.title);
          const score = own || (coveredByAncestor ? 0 : matchScore(query, n.title, `${book.name}/${dirPath}/${n.title}`));
          if (score) hits.push({ score, book, node: n, dirPath });
        }
        walk(n.children, [...trail, n.title], coveredByAncestor || own > 0);
      }
    };
    walk(buildTree(book.toc), [], false);
  }
  hits.sort((a, b) => b.score - a.score || a.dirPath.localeCompare(b.dirPath, 'zh'));
  console.log(`\n找到 ${hits.length} 条${hits.length > limit ? `，显示前 ${limit} 条` : ''}：`);
  for (const h of hits.slice(0, limit)) {
    const where = `${h.book.name}${h.dirPath ? ' › ' + h.dirPath.split('/').join(' › ') : ''}`;
    if (h.node.type === 'DOC') console.log(`  - [文档] ${h.node.title}\n      位置：${where}\n      链接：${h.book.url}/${h.node.url}`);
    else console.log(`  - [目录] ${h.node.title}/\n      位置：${where}\n      下载这个目录：pull ${h.book.url} --dir "${[...(h.dirPath ? h.dirPath.split('/') : []), h.node.title].join('/')}"`);
  }
  if (!hits.length) console.log('  没有匹配的目录或标题。可以换个关键词、减少字数，或用空格分开多个词。');
  for (const f of failed) console.log(`  （跳过 ${f}）`);
}

async function cmdToc(args) {
  const link = args._[1];
  if (!link) throw new UserError('用法：toc <知识库名或链接> [--dir 目录/子目录] [--depth 层数]');
  const book = await loadBook(await resolveBookRef(link));
  const roots = buildTree(book.toc);
  const start = args.dir ? findPath(roots, args.dir).children : roots;
  const maxDepth = args.depth ? Number(args.depth) : Infinity;
  let docs = 0, groups = 0;
  const lines = [];
  const walk = (list, depth) => {
    for (const n of list) {
      if (n.type === 'TITLE') groups++;
      else if (n.type === 'DOC') docs++;
      if (depth < maxDepth) {
        const label = n.type === 'TITLE' ? `${n.title}/` : n.type === 'DOC' ? n.title : `${n.title}（外链）`;
        lines.push(`${'  '.repeat(depth)}- ${label}${n.type === 'DOC' && n.children.length ? '（含子文档）' : ''}`);
      }
      walk(n.children, depth + 1);
    }
  };
  walk(start, 0);
  console.log(`知识库：${book.name}  ${book.url}${args.dir ? `  › ${args.dir}` : ''}`);
  console.log(`分组 ${groups} 个，文档 ${docs} 篇\n`);
  console.log(lines.join('\n'));
}

// ---------- 命令：pull ----------
async function fetchDoc(book, slug) {
  const q = `book_id=${book.id}&merge_dynamic_data=false`;
  const r = await yq(`https://${book.host}/api/docs/${encodeURIComponent(slug)}?${q}&mode=markdown`);
  const d = r.data || {};
  const type = String(d.type || '').toLowerCase();
  if (type === 'doc') {
    if (typeof d.sourcecode !== 'string') throw new Error('没拿到正文');
    return { kind: 'doc', d, md: d.sourcecode };
  }
  if (type === 'board') {
    const r2 = await yq(`https://${book.host}/api/docs/${encodeURIComponent(slug)}?${q}`);
    return { kind: 'board', d: r2.data, md: boardToMd(r2.data) };
  }
  return { kind: 'skip', d, type: d.type || '未知' };
}

// ---------- 命令：read（发链接直接读，正文输出到终端给 AI，不写文件） ----------
async function cmdRead(args) {
  const links = args._.slice(1);
  if (!links.length) throw new UserError('用法：read <文档链接> [更多文档链接...]');
  for (const link of links) {
    const book = await loadBook(await resolveBookRef(link));
    if (!book.docSlug) {
      // 给的是知识库链接：列出目录，让用户挑要读哪篇
      const roots = buildTree(book.toc);
      const lines = [];
      const walk = (list, depth) => {
        for (const n of list) {
          if (depth < 3) lines.push(`${'  '.repeat(depth)}- ${n.type === 'TITLE' ? n.title + '/' : `${n.title}  ${book.url}/${n.url}`}`);
          walk(n.children, depth + 1);
        }
      };
      walk(roots, 0);
      console.log(`这是知识库「${book.name}」的链接，不是单篇文档。目录（前三层）如下，请让用户选择要读哪一篇：\n\n${lines.join('\n')}`);
      continue;
    }
    const r = await fetchDoc(book, book.docSlug);
    const url = `${book.url}/${book.docSlug}`;
    if (r.kind === 'skip') {
      console.log(`「${r.d.title || url}」是${r.type}类型，暂不支持读取：${url}`);
      continue;
    }
    const md = r.md.replace(/<a\b[^>]*?>(\s*?)<\/a>/g, '').trim();
    console.log(`# ${r.d.title}\n\n> 知识库：${book.name} · 更新：${bj(r.d.content_updated_at || r.d.updated_at)} · 原文：<${url}>\n\n${md}\n`);
    if (links.length > 1) console.log('\n---\n');
  }
}

async function cmdPull(args) {
  const link = args._[1];
  if (!link) throw new UserError('用法：pull <知识库名、知识库链接或文档链接> [--dir 目录/子目录] [--out 本地目录]');
  const book = await loadBook(await resolveBookRef(link));
  const roots = buildTree(book.toc);
  const outRoot = path.resolve(args.out || path.join(process.cwd(), safeName(book.name)));

  const plan = [], skipped = [], failed = [];
  const walk = (list, rel) => {
    for (const n of list) {
      if (n.type === 'TITLE') walk(n.children, path.join(rel, safeName(n.title)));
      else if (n.type === 'DOC') {
        plan.push({ title: n.title, slug: n.url, rel });
        if (n.children.length) walk(n.children, path.join(rel, safeName(n.title)));
      }
    }
  };
  if (book.docSlug) {
    const n = book.toc.find(t => t.url === book.docSlug);
    plan.push({ title: n ? n.title : book.docSlug, slug: book.docSlug, rel: '' });
  } else if (args.dir) walk([findPath(roots, args.dir)], '');
  else walk(roots, '');

  // 同目录重名：后来的加上 slug 区分
  const used = new Map();
  for (const p of plan) {
    const key = path.join(p.rel, safeName(p.title)).toLowerCase();
    p.file = path.join(p.rel, used.has(key) ? `${safeName(p.title)}-${p.slug}.md` : `${safeName(p.title)}.md`);
    used.set(key, true);
  }

  console.log(`知识库：${book.name}  ${book.url}`);
  const minutes = Math.max(1, Math.round(plan.length * 1.6 / 60));
  if (plan.length > LARGE_PULL && !args.yes) {
    console.log(`共 ${plan.length} 篇，预计 ${minutes} 分钟以上。篇数较多，为避免触发语雀的访问频率限制，需要用户确认。`);
    console.log('建议只下载需要的目录（--dir）。用户确认要全部下载后，加 --yes 再运行。');
    return;
  }
  console.log(`共 ${plan.length} 篇，预计约 ${minutes} 分钟，保存到：${outRoot}\n`);
  const stat = { ok: 0, board: 0, img: 0, imgFail: 0 };
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    const docUrl = `${book.url}/${p.slug}`;
    try {
      const r = await fetchDoc(book, p.slug);
      if (r.kind === 'skip') {
        skipped.push(`${p.title}（${r.type}）${docUrl}`);
        console.log(`[${i + 1}/${plan.length}] 跳过 ${p.title}（${r.type} 暂不支持）`);
        continue;
      }
      const abs = path.join(outRoot, p.file);
      const dir = path.dirname(abs);
      fs.mkdirSync(dir, { recursive: true });
      let md = r.md.replace(/<a\b[^>]*?>(\s*?)<\/a>/g, '');
      md = await localizeImages(md, dir, p.slug, stat);
      const title = r.d.title || p.title;
      const foot = `\n\n> 更新：${bj(r.d.content_updated_at || r.d.updated_at)} · 原文：<${docUrl}>\n`;
      fs.writeFileSync(abs, `# ${title}\n\n${md.trim()}${foot}`);
      stat.ok++;
      if (r.kind === 'board') stat.board++;
      console.log(`[${i + 1}/${plan.length}] ${p.file}`);
    } catch (e) {
      if (e instanceof LoginError) throw e;
      failed.push(`${p.title}：${e.message} ${docUrl}`);
      console.log(`[${i + 1}/${plan.length}] 失败 ${p.title}：${e.message}`);
    }
  }
  console.log(`\n完成：成功 ${stat.ok} 篇（其中画板 ${stat.board} 篇），跳过 ${skipped.length} 篇，失败 ${failed.length} 篇；图片 ${stat.img} 张，失败 ${stat.imgFail} 张（失败的保留原链接）。`);
  console.log(`位置：${outRoot}`);
  if (skipped.length) console.log('\n跳过（表格、数据表等暂不支持）：\n' + skipped.map(s => '  - ' + s).join('\n'));
  if (failed.length) console.log('\n失败：\n' + failed.map(s => '  - ' + s).join('\n'));
}

// ---------- 命令：add ----------
function randomSlug() {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.randomBytes(16), b => abc[b % abc.length]).join('');
}

async function cmdAdd(args) {
  const file = args._[1];
  if (!file || !args.book) throw new UserError('用法：add <md文件> --book <知识库名或链接> [--under 目录/子目录] [--title 标题] [--yes]');
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new UserError(`文件不存在：${abs}`);
  let md = fs.readFileSync(abs, 'utf8').replace(/^﻿/, '');

  const book = await loadBook(await resolveBookRef(args.book));
  const parent = args.under ? findPath(buildTree(book.toc), args.under) : null;
  if (parent && !['TITLE', 'DOC'].includes(parent.type)) throw new UserError(`「${args.under}」不是分组也不是文档，不能放在它下面。`);

  // 标题：--title 优先；否则取开头的一级标题；再否则用文件名。开头的一级标题会从正文里去掉，避免重复。
  const h1 = /^\s*#\s+(.+?)\s*#*\s*(\r?\n|$)/.exec(md);
  const title = String(args.title || (h1 && h1[1]) || path.basename(abs, path.extname(abs))).trim();
  if (h1 && h1[1].trim() === title) md = md.slice(h1[0].length);

  const locals = scanLocalFiles(md, path.dirname(abs));

  console.log('新建预览：');
  console.log(`  知识库：${book.name}  ${book.url}`);
  console.log(`  位置：${parent ? `${args.under}（排在最前）` : '根目录（排在最前）'}`);
  console.log(`  标题：${title}`);
  printLocals(md, locals);
  if (!args.yes) {
    console.log('\n这是预览，还没有写入。请把预览给用户看，用户明确确认后加 --yes 再运行一次。');
    return;
  }

  const uploads = locals.filter(f => f.exists);
  // 有本地文件要上传时先建草稿，上传完替换链接再发布；没有就一步发布
  const created = await yq(`https://${book.host}/api/docs`, {
    method: 'POST',
    json: {
      book_id: book.id, type: 'Doc', format: 'markdown', title, slug: randomSlug(),
      body: md, body_draft: md, status: uploads.length ? 0 : 1,
      insert_to_catalog: true, action: 'prependChild', target_uuid: parent ? parent.uuid : null,
    },
  });
  const doc = created.data || {};
  if (!doc.id || !doc.slug) throw new UserError('语雀没有返回新文档信息，请到网页上确认是否已创建。');
  const docUrl = `${book.url}/${doc.slug}`;

  let synced = true;
  if (uploads.length) {
    try {
      md = await uploadLocals(book, doc.id, md, uploads);
      // 只改本次刚建的这篇
      synced = await saveDoc(book, doc.slug, doc.id, title, md, true, docUrl);
    } catch (e) {
      throw new UserError(`文档已建成草稿，但上传本地文件或发布时出错：${e.message}\n草稿地址：${docUrl}（可到网页上处理）`);
    }
  }
  console.log(`\n已新建：${title}\n链接：${docUrl}`);
  if (!synced) console.log(DRAFT_NOT_SYNCED);
}

// 预览里说明正文长度和本地图片、附件
function printLocals(md, locals) {
  const imgs = locals.filter(f => f.kind === 'image');
  const atts = locals.filter(f => f.kind === 'attachment');
  const missing = locals.filter(f => !f.exists);
  console.log(`  正文：${md.trim().length} 字符；本地图片 ${imgs.length} 张，本地附件 ${atts.length} 个`);
  if (missing.length) console.log(`  找不到的本地文件（会保留原样）：${missing.map(f => f.ref).join('、')}`);
  const risky = locals.filter(f => f.exists && f.kind === 'attachment' && RISKY_EXT.test(f.abs));
  if (risky.length) console.log(`  注意：语雀免费账号不能上传压缩包等类型，这些附件可能失败：${risky.map(f => f.ref).join('、')}`);
}

// 把本地文件上传到这篇文档名下，并把正文里的本地路径换成语雀地址
async function uploadLocals(book, docId, md, uploads) {
  const done = new Map();
  for (const f of uploads) {
    if (!done.has(f.abs)) done.set(f.abs, await uploadFile(book, docId, f.abs, f.kind));
    f.url = done.get(f.abs);
  }
  for (const f of uploads) md = md.split(`](${f.ref}`).join(`](${f.url}`);
  return md;
}

// 按文档链接取知识库和文档详情（修改、删除只认单篇文档的链接）
async function loadDocByLink(link) {
  if (!/^https?:\/\//i.test(String(link))) throw new UserError(`需要文档链接（https://...yuque.com/...），收到：${link}。不知道链接时先用 search 找。`);
  const book = await loadBook(link);
  if (!book.docSlug) throw new UserError(`这是知识库链接，不是单篇文档的链接：${link}`);
  const r = await yq(`https://${book.host}/api/docs/${encodeURIComponent(book.docSlug)}?book_id=${book.id}&merge_dynamic_data=false`);
  const doc = r.data || {};
  if (!doc.id) throw new UserError(`打不开这篇文档：${link}`);
  if (String(doc.type || '').toLowerCase() !== 'doc') throw new UserError(`「${doc.title}」是${doc.type || '未知'}类型，只支持普通文档。`);
  return { book, doc, url: `${book.url}/${book.docSlug}`, abilities: doc.abilities || {} };
}

// ---------- 命令：edit（用本地 Markdown 替换已有文档的全文） ----------
// read / pull 输出里的说明行：「> 知识库：… · 更新：… · 原文：<链接>」或「> 更新：… · 原文：<链接>」
const META_RE = /^>\s*(?:知识库：.*?·\s*)?更新：\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})?\s*·\s*原文：<(https:\/\/[^>\s]+)>[ \t]*\r?$/gm;

async function cmdEdit(args) {
  const [, link, file] = args._;
  if (!link || !file) throw new UserError('用法：edit <文档链接> <md文件> [--title 标题] [--yes]');
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new UserError(`文件不存在：${abs}`);
  const { book, doc, url, abilities } = await loadDocByLink(link);
  if (!abilities.update) throw new UserError(`没有「${doc.title}」的编辑权限：${url}`);

  // 去掉 read / pull 加的说明行；其中的「更新」时间是修改的底稿时间，用来发现别人后来又改过
  let md = fs.readFileSync(abs, 'utf8').replace(/^﻿/, '');
  const base = [...md.matchAll(META_RE)].find(m => m[1] && m[2].split(/[?#]/)[0].endsWith(`/${book.docSlug}`));
  md = md.replace(META_RE, '');
  const h1 = /^\s*#\s+(.+?)\s*#*\s*(\r?\n|$)/.exec(md);
  const title = String(args.title || (h1 && h1[1]) || doc.title).trim();
  if (h1 && h1[1].trim() === title) md = md.slice(h1[0].length);
  md = md.trim() + '\n';
  if (!md.trim()) throw new UserError('文件里没有正文，不能把文档改成空白。');
  const locals = scanLocalFiles(md, path.dirname(abs));
  const remoteAt = bj(doc.content_updated_at || doc.updated_at);
  const editor = doc.last_editor && doc.last_editor.name;

  console.log('修改预览：');
  console.log(`  文档：${doc.title}  ${url}`);
  console.log(`  知识库：${book.name}`);
  console.log(`  语雀上最后修改：${remoteAt}${editor ? `（${editor.trim()}）` : ''}${doc.status === 0 ? '；这篇目前是草稿，改完仍是草稿' : ''}`);
  console.log(`  标题：${title === doc.title ? '不变' : `「${doc.title}」→「${title}」`}`);
  console.log(`  语雀上现在约 ${doc.word_count || 0} 字，会被下面的新内容整篇替换`);
  printLocals(md, locals);
  if (base && base[1] < remoteAt) console.log(`  ⚠ 你的底稿是 ${base[1]} 的版本，之后语雀上又被改过（${remoteAt}）。直接覆盖会丢掉这些改动，建议先重新读取最新内容再改。`);
  console.log('  提醒：Markdown 表达不了的样式（字体颜色、卡片、合并单元格等）会丢失；语雀保留历史版本，改错了可以在文档的「历史版本」里恢复。');
  if (!args.yes) {
    console.log('\n这是预览，还没有写入。请把预览给用户看，用户明确确认后加 --yes 再运行一次。');
    return;
  }

  const uploads = locals.filter(f => f.exists);
  if (uploads.length) md = await uploadLocals(book, doc.id, md, uploads);
  const synced = await saveDoc(book, book.docSlug, doc.id, title, md, doc.status !== 0, url);
  console.log(`\n已修改：${title}\n链接：${url}`);
  if (!synced) console.log(DRAFT_NOT_SYNCED);
}

// 按网页编辑器的顺序保存正文：先以编辑模式打开（不这样做，存草稿会被忽略），再存草稿（同时更新编辑器草稿），需要时再发布。
// 只改发布内容时，网页编辑器会载入旧草稿，下次保存会把旧内容发布回去。返回编辑器草稿是否已是新内容。
async function saveDoc(book, slug, id, title, md, publish, url) {
  const editUrl = `https://${book.host}/api/docs/${encodeURIComponent(slug)}?book_id=${book.id}&merge_dynamic_data=false&mode=edit`;
  const put = status => yq(`https://${book.host}/api/docs/${id}`, {
    method: 'PUT',
    json: { id, title, body: md, ...(status === 0 ? { body_draft: md } : {}), format: 'markdown', status, save_type: 'user' },
  });
  await yq(editUrl);
  await put(0);
  if (publish) {
    try { await put(1); } catch (e) {
      throw new UserError(`新内容已存为草稿，但发布时出错：${e.message}\n请到网页上打开这篇点「发布」：${url}`);
    }
  }
  const draft = ((await yq(editUrl)).data || {}).body_draft;
  return String(draft || '').trim() === md.trim();
}
const DRAFT_NOT_SYNCED = '注意：已发布，但网页编辑器里的草稿没有同步。之后在网页上编辑这篇前，请先确认编辑器里是新内容。';

// ---------- 命令：delete（只删自己创建、且没有子文档的文档） ----------
async function cmdDelete(args) {
  const link = args._[1];
  if (!link || args._.length > 2) throw new UserError('用法：delete <文档链接> [--yes]（一次只能删一篇）');
  const { book, doc, url, abilities } = await loadDocByLink(link);
  const me = await whoami();
  const owner = (doc.user && doc.user.name || '').trim() || '别人';
  if (doc.user_id !== me.id) throw new UserError(`只能删除自己创建的文档。「${doc.title}」是${owner}创建的，确需删除请联系作者，或到语雀网页上操作。`);
  if (!abilities.destroy) throw new UserError(`没有「${doc.title}」的删除权限：${url}`);
  const node = book.toc.find(t => t.url === book.docSlug);
  const kids = node ? book.toc.filter(t => t.parent_uuid === node.uuid) : [];
  if (kids.length) throw new UserError(`「${doc.title}」下面还有 ${kids.length} 篇子文档，为避免误删，不删除带子文档的文档。请先移走子文档，或到语雀网页上操作。`);
  const editor = doc.last_editor || {};

  console.log('删除预览：');
  console.log(`  文档：${doc.title}  ${url}`);
  console.log(`  知识库：${book.name}`);
  console.log(`  创建：${bj(doc.created_at)}（${String(me.name || '').trim()}，本人）；最后修改：${bj(doc.content_updated_at || doc.updated_at)}（${(editor.name || '').trim() || '未知'}）`);
  console.log(`  正文约 ${doc.word_count || 0} 字`);
  if (editor.id && editor.id !== me.id) console.log('  注意：最后修改人不是你，删除会连同他人的修改一起删掉。');
  console.log('  删除后进入知识库的「回收站」，可以在语雀网页上恢复。');
  if (!args.yes) {
    console.log('\n这是预览，还没有删除。请把预览给用户看，用户明确确认要删除后加 --yes 再运行一次。');
    return;
  }
  await yq(`https://${book.host}/api/docs/${doc.id}`, { method: 'DELETE' });
  console.log(`\n已删除：${doc.title}\n已进入「${book.name}」的回收站，需要时可在语雀网页上恢复。`);
}

// 语雀前端代码里 .zip/.rar/.7z 只对付费账号开放，其余压缩包和 .mjs 也会被拒（2026-10-12 实测）
const RISKY_EXT = /\.(zip|rar|7z|gz|tgz|gzip|tar|jar|dmg|pkg|mjs)$/i;

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.zip': 'application/zip', '.pdf': 'application/pdf' };

// 找出 Markdown 里引用的本地文件：![..](路径) 是图片，[..](路径) 是附件
function scanLocalFiles(md, baseDir) {
  const out = [];
  const re = /(!?)\[[^\]]*\]\((?!https?:|data:|mailto:|#)([^)\s]+)[^)]*\)/g;
  for (const m of md.matchAll(re)) {
    const ref = m[2];
    let rel = ref;
    try { rel = decodeURIComponent(ref); } catch { /* 保持原样 */ }
    const abs = path.resolve(baseDir, rel);
    const exists = fs.existsSync(abs) && fs.statSync(abs).isFile();
    if (!m[1] && !exists) continue; // 普通链接指向不存在的文件：多半不是附件，忽略
    out.push({ ref, abs, exists, kind: m[1] ? 'image' : 'attachment' });
  }
  return out;
}

async function uploadFile(book, docId, abs, kind) {
  const fd = new FormData();
  const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
  fd.append('file', new Blob([fs.readFileSync(abs)], { type }), path.basename(abs));
  const url = `https://${book.host}/api/upload/attach?type=${kind}&attachable_type=Doc&attachable_id=${docId}&ctoken=${CTOKEN}`;
  let r;
  try {
    r = await yq(url, { method: 'POST', body: fd });
  } catch (e) {
    if (/不支持上传该类型文件|Invalid filename/.test(e.message)) throw new Error(`语雀不允许上传 ${path.basename(abs)} 这种类型的文件（免费账号不能传压缩包）`);
    throw e;
  }
  const u = r.data && (r.data.url || r.data.src);
  if (!u) throw new Error(`上传 ${path.basename(abs)} 后没拿到地址`);
  return u;
}

// ---------- 命令：guide（使用引导：检查状态，告诉用户下一步怎么做） ----------
const LOGIN_STEPS = `登录语雀（cookie 只在剪贴板里交给 AI，不要粘贴到对话里）：
     a. 用 Chrome 或 Edge 打开 https://www.yuque.com 并登录（公司空间的同事也在这里登录）
     b. 按 F12 →「应用」（Application）→ 左侧「Cookie」→ https://www.yuque.com
     c. 找到 _yuque_session，双击「值」一栏，全选复制
     d. 对 AI 说「语雀登录，cookie 已复制」`;

const SAY_EXAMPLES = `你可以这样对 AI 说：
  · 列出我能访问的语雀知识库
  · 在语雀里找一下标题带「某关键词」的文档
  · 看看「某某知识库」的目录
  · 把 <知识库链接> 下载到桌面；或只下载其中「目录A/目录B」
  · 发一个文档链接，直接问「这篇讲了什么」
  · 把这篇文档下载下来：<文档链接>
  · 把 D:\\文档\\周报.md 发到语雀「某某知识库」的「某目录」下
  · 帮我把刚才的内容整理成文档，发到语雀「某某知识库」
  · 把这篇文档里的「旧说法」改成「新说法」：<文档链接>
  · 删除我建的这篇文档：<文档链接>（只能删自己创建的）
  · 更新语雀 skill ／ 更新语雀 cookie，已复制 ／ 删除语雀 cookie`;

async function cmdGuide() {
  // 本机从没用过（刚安装）：先说清楚只需要做一次的事
  const firstRun = !fs.existsSync(CONFIG_FILE) && !fs.existsSync(COOKIE_FILE);
  console.log(`li-yuque-skills v${VERSION} · 使用引导\n`);
  if (firstRun) console.log('欢迎使用！刚装好只需要做一次「登录」，之后一直能用；skill 每天第一次使用时会自动更新，不用管。\n');
  const todo = [];

  console.log(`① 安装：v${VERSION}，Node ${process.versions.node}；每天第一次使用时自动检查并更新`);

  let me = null, state = '未登录';
  if (fs.existsSync(COOKIE_FILE)) {
    try {
      me = await whoami();
      state = `已登录：${me.name}（${me.login}）`;
    } catch (e) {
      state = e instanceof LoginError ? '登录已失效，需要重新登录' : `无法确认（${e.message}）`;
    }
  }
  console.log(`② 登录：${state}`);
  if (!me) {
    todo.push(LOGIN_STEPS);
    todo.push('登录好后试一下：发一个语雀文档链接给 AI，问「这篇讲了什么」');
  }

  console.log('\n下一步（请 AI 一步一步带用户做，做完一步再说下一步）：');
  if (!todo.length) console.log('  一切就绪，可以直接用了。');
  todo.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
  console.log(`\n${SAY_EXAMPLES}`);
  console.log('\n提醒：新建、修改、删除前都会先给你看预览，你确认后才执行；不要短时间内反复下载整个知识库，以免触发语雀的访问频率限制。');
}

// ---------- 命令：logout ----------
async function cmdLogout() {
  if (!fs.existsSync(COOKIE_FILE)) { console.log('本机没有保存 cookie。'); return; }
  fs.rmSync(COOKIE_FILE, { force: true });
  console.log(`已删除本机保存的 cookie：${COOKIE_FILE}。`);
}

// ---------- 命令：version / update（从 GitHub 更新 skill 自身） ----------
const cmpVer = (a, b) => {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};
const versionOf = src => (/const VERSION = '([^']+)'/.exec(src) || [])[1] || null;

// 从一个来源下载仓库文件；不带 cookie
async function fetchFrom(mirror, p, timeout) {
  const res = await fetch(mirror(p), { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// 同时问 GitHub 和镜像，取版本最高的那个（两边都可能有几分钟到几小时的缓存）
async function fetchLatest(timeout) {
  const rs = await Promise.allSettled(MIRRORS.map(m => fetchFrom(m, REMOTE_FILES['scripts/yuque.mjs'], timeout)));
  let best = null;
  rs.forEach((r, i) => {
    const v = r.status === 'fulfilled' ? versionOf(r.value) : null;
    if (v && (!best || cmpVer(v, best.version) > 0)) best = { version: v, script: r.value, mirror: MIRRORS[i] };
  });
  if (!best) throw new Error(`访问 GitHub 和镜像都失败（${rs.map(r => r.reason && r.reason.message).filter(Boolean).join('；')}）`);
  return best;
}

// 查最新版本并记下来（不改 day，不影响当天的自动更新）
async function checkLatest(timeout) {
  const best = await fetchLatest(timeout);
  writeConfig({ updateCheck: { ...(readConfig().updateCheck || {}), at: Date.now(), latest: best.version } });
  return best;
}

const isPluginInstall = () => /[\/]plugins[\/]/.test(SKILL_ROOT);

// 从 CHANGELOG 摘出 (from, to] 之间各版本的要点，每条只取第一句
function changesBetween(changelog, from, to) {
  const out = [];
  for (const sec of String(changelog).split(/^## /m).slice(1)) {
    const v = (/^v(\d+\.\d+\.\d+)/.exec(sec) || [])[1];
    if (!v || cmpVer(v, from) <= 0 || cmpVer(v, to) > 0) continue;
    for (const line of sec.split(/\r?\n/)) {
      const m = /^- (.+)/.exec(line);
      if (m) out.push(`  · ${m[1].split('。')[0]}`);
    }
  }
  return out;
}

// 下载并替换 SKILL.md 和脚本，返回这次更新的要点
async function installUpdate(best, timeout) {
  const skillMd = path.join(SKILL_ROOT, 'SKILL.md');
  if (!fs.existsSync(skillMd) || !/^name:\s*li-yuque-skills\s*$/m.test(fs.readFileSync(skillMd, 'utf8'))) {
    throw new UserError(`没在 ${SKILL_ROOT} 找到 li-yuque-skills 的 SKILL.md，无法自动更新。`);
  }
  // SKILL.md 和脚本取自同一个来源，保证是同一版本
  const got = { 'SKILL.md': await fetchFrom(best.mirror, REMOTE_FILES['SKILL.md'], timeout), 'scripts/yuque.mjs': best.script };
  if (!/^---\r?\nname:\s*li-yuque-skills/.test(got['SKILL.md'])) throw new UserError('下载到的文件不完整，已放弃更新。');
  // 新脚本先过语法检查，再逐个原子替换
  const tmp = path.join(os.tmpdir(), `li-yuque-skills-${process.pid}.mjs`);
  fs.writeFileSync(tmp, got['scripts/yuque.mjs']);
  try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'ignore' }); } catch { throw new UserError('下载到的新脚本校验失败，已放弃更新。'); } finally { fs.rmSync(tmp, { force: true }); }
  for (const [rel, text] of Object.entries(got)) {
    const dest = path.join(SKILL_ROOT, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(`${dest}.new-${process.pid}`, text);
    fs.renameSync(`${dest}.new-${process.pid}`, dest);
  }
  // 更新说明：哪个来源的 CHANGELOG 已经写到新版本就用哪个（各来源的缓存可能滞后）
  for (const m of [best.mirror, ...MIRRORS.filter(x => x !== best.mirror)]) {
    try {
      const notes = changesBetween(await fetchFrom(m, REMOTE_FILES.changelog, timeout), VERSION, best.version);
      if (notes.length) return notes;
    } catch { /* 换下一个来源 */ }
  }
  return []; // 拿不到更新说明不影响更新
}

function printUpdated(to, notes, auto) {
  console.log(`\n${auto ? '已自动' : '已'}把 li-yuque-skills 从 ${VERSION} 更新到 ${to}${auto ? '（每天第一次使用时检查）' : ''}。`);
  if (notes.length) console.log(`这次更新了：\n${notes.join('\n')}`);
  console.log('下一条命令起使用新版；使用说明有变化时，新开对话后生效。cookie 不受影响。');
}

async function cmdVersion() {
  console.log(`li-yuque-skills 当前版本 ${VERSION}`);
  console.log(`安装位置：${SKILL_ROOT}${isPluginInstall() ? '（Claude Code 插件方式安装）' : ''}`);
  try {
    const latest = (await checkLatest(10000)).version;
    console.log(cmpVer(latest, VERSION) > 0 ? `最新版本 ${latest}，可以更新。` : `已是最新版本（GitHub 上为 ${latest}）。`);
  } catch (e) {
    console.log(`检查新版本失败：${e.message}`);
  }
}

async function cmdUpdate() {
  if (isPluginInstall()) {
    console.log('这是 Claude Code 插件方式安装的，请在终端运行：\n  claude plugin update li-yuque-skills@li-yuque-skills');
    return;
  }
  const best = await checkLatest(30000);
  if (cmpVer(best.version, VERSION) <= 0) {
    console.log(`已是最新版本 ${VERSION}。`);
    return;
  }
  printUpdated(best.version, await installUpdate(best, 30000), false);
}

// 每天第一次使用时检查新版本，有就自动更新并说明更新了什么。
// 每天只试一次：网络不通或更新失败不影响本次结果，改为提醒，第二天再试。
async function autoUpdate() {
  try {
    const c = readConfig().updateCheck || {};
    const d = new Date();
    const today = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    let latest = c.latest;
    if (c.day !== today) {
      writeConfig({ updateCheck: { ...c, day: today } });
      try {
        const best = await checkLatest(5000);
        latest = best.version;
        if (cmpVer(latest, VERSION) > 0 && !isPluginInstall()) {
          printUpdated(latest, await installUpdate(best, 15000), true);
          return;
        }
      } catch { /* 下面照常提醒 */ }
    }
    if (latest && cmpVer(latest, VERSION) > 0) {
      console.log(isPluginInstall()
        ? `\n提示：li-yuque-skills 有新版本 ${latest}（当前 ${VERSION}），请在终端运行 claude plugin update li-yuque-skills@li-yuque-skills`
        : `\n提示：li-yuque-skills 有新版本 ${latest}（当前 ${VERSION}），对 AI 说「更新语雀 skill」即可更新。`);
    }
  } catch { /* 本机配置读写失败也不影响命令本身 */ }
}

// ---------- 入口 ----------
const HELP = `li-yuque-skills ${VERSION}：语雀文档读取、下载、新建、修改、删除

用法：node yuque.mjs <命令> [参数]
第一次用、或不知道下一步做什么：运行 guide

  guide                       使用引导：检查安装和登录状态，给出下一步和示例说法
  login                      首次登录或更新 cookie：从剪贴板读取，校验后保存（不会显示 cookie）
  logout                      删除本机保存的 cookie
  whoami                      查看当前登录的语雀账号
  version                     查看当前版本、安装位置，并检查新版本
  update                      从 GitHub 更新本 skill 到最新版（平时每天第一次使用时会自动更新）
  books                       列出我的知识库和团队/空间知识库
  read <文档链接...>           直接读取文档正文（输出到终端，不写文件）
  search <关键词> [--book 知识库名或链接] [--limit 条数]
                              按目录和标题模糊搜索文档（不填 --book 则搜全部可访问的知识库）
  toc  <知识库名或链接> [--dir 目录/子目录] [--depth 层数]
                              查看目录结构
  pull <知识库名、知识库链接或文档链接> [--dir 目录/子目录] [--out 本地目录] [--yes]
                              下载为 Markdown，图片存到同目录 img/
  add  <md文件> --book <知识库名或链接> [--under 目录/子目录] [--title 标题] [--yes]
                              新建文档；不加 --yes 只预览不写入
  edit <文档链接> <md文件> [--title 标题] [--yes]
                              用本地 Markdown 替换文档全文（需有编辑权限）；不加 --yes 只预览
  delete <文档链接> [--yes]    删除自己创建、且没有子文档的文档（进回收站）；不加 --yes 只预览

cookie 位置：${COOKIE_FILE}`;

async function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) throw new UserError(`Node 版本太低（${process.versions.node}），需要 18 或以上。`);
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  const table = {
    guide: cmdGuide, login: cmdLogin, logout: cmdLogout, whoami: cmdWhoami, version: cmdVersion, update: cmdUpdate,
    books: cmdBooks, search: cmdSearch, read: cmdRead, toc: cmdToc, pull: cmdPull, add: cmdAdd,
    edit: cmdEdit, delete: cmdDelete,
  };
  if (!cmd || args.help || !table[cmd]) { console.log(HELP); return; }
  // 命令出错也照常保存续期的 cookie、做每日更新（新版可能正好修了这个错）
  try { await table[cmd](args); } finally {
    await saveRenewedSession();
    if (!['version', 'update'].includes(cmd)) await autoUpdate();
  }
}

main().catch(e => {
  if (e instanceof LoginError) {
    console.error(`${e.message}\n${LOGIN_STEPS}\n复制好后运行：node yuque.mjs login`);
    process.exit(2);
  }
  if (e instanceof UserError) {
    console.error(e.message);
    process.exit(1);
  }
  console.error('出错了：' + (e && e.message ? e.message : e));
  process.exit(1);
});
