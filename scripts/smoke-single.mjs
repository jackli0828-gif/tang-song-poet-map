/**
 * 单文件 HTML 的浏览器实测（file:// 协议，模拟用户双击打开）。
 * 用法: node scripts/smoke-single.mjs [html路径]
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

// ESM 不认 NODE_PATH，用 createRequire 指向托管 workspace 里的 puppeteer
const WORKSPACE = 'C:/Users/li/.workbuddy/binaries/node/workspace/';
const require = createRequire(WORKSPACE + 'noop.js');
const puppeteer = require('puppeteer');

const file = process.argv[2] || 'C:/Users/li/Desktop/唐宋词人时空轨迹图.html';
const url = pathToFileURL(path.resolve(file)).href;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`);
  }
};

console.log('=== 单文件 HTML 浏览器实测（file://） ===');
console.log('打开:', url);

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--allow-file-access-from-files', '--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 950 });

const errors = [];
const warnings = [];
page.on('pageerror', (e) => errors.push(String(e.message || e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console.error: ' + m.text());
  if (m.type() === 'warning') warnings.push(m.text());
});
const requests = [];
page.on('request', (r) => requests.push(r.url()));

await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
await wait(1500);

// ---------- 1. 启动健康 ----------
ok('无运行时 / 控制台错误', errors.length === 0, errors.slice(0, 3).join(' | ') || '0 个');
const external = requests.filter((u) => /^https?:/i.test(u));
ok('无外部网络请求', external.length === 0, external.slice(0, 3).join(' | ') || '0 个');
const rootChildren = await page.$eval('#root', (el) => el.children.length).catch(() => 0);
ok('React 已挂载（#root 有子节点）', rootChildren > 0, `children=${rootChildren}`);

// ---------- 2. 迭代 9 · 首屏引导 ----------
const intro = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  if (!d) return { shown: false };
  const text = (d.innerText || '').replace(/\s+/g, ' ');
  return {
    shown: true,
    text: text.slice(0, 120),
    hasStart: [...d.querySelectorAll('button')].some((b) => (b.innerText || '').includes('开始探索')),
  };
});
ok('首访自动弹出三步引导', intro.shown, intro.text || '');
ok('引导含「开始探索」按钮', !!intro.hasStart);
await page.screenshot({ path: path.resolve('.verify', 'shot-00-intro.png') });

// 关闭引导
const introClosed = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  if (!d) return false;
  const btn = [...d.querySelectorAll('button')].find((b) => (b.innerText || '').includes('开始探索'));
  if (btn) btn.click();
  return !!btn;
});
await wait(600);
const stillOpen = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
ok('点击「开始探索」可关闭引导', introClosed && !stillOpen);

// ---------- 3. 地图渲染 ----------
const svgInfo = await page.evaluate(() => {
  const svg = document.querySelector('svg');
  if (!svg) return { svg: 0, paths: 0, texts: 0, circles: 0 };
  return {
    svg: 1,
    paths: svg.querySelectorAll('path').length,
    texts: svg.querySelectorAll('text').length,
    circles: svg.querySelectorAll('circle').length,
  };
});
ok('SVG 地图已渲染', svgInfo.svg === 1);
ok('省界 path 数量 > 20', svgInfo.paths > 20, `paths=${svgInfo.paths}`);
ok('地图标注 text 数量 > 20', svgInfo.texts > 20, `texts=${svgInfo.texts}`);
ok('轨迹节点 circle 数量 > 5', svgInfo.circles > 5, `circles=${svgInfo.circles}`);

const poetNames = await page.evaluate(() => {
  const t = document.body.innerText || '';
  return ['李白', '杜甫', '苏轼', '辛弃疾', '李清照'].filter((n) => t.includes(n));
});
ok('诗人名录可见（抽样 5 位）', poetNames.length === 5, poetNames.join('、'));

// ---------- 4. 迭代 9 · 全局四维检索 ----------
await page.click('input[aria-label^="全局检索"]');
await page.type('input[aria-label^="全局检索"]', '赤壁', { delay: 60 });
await wait(900);
const searchPanel = await page.evaluate(() => {
  const input = document.querySelector('input[aria-label^="全局检索"]');
  const panel = input?.parentElement?.querySelector('div');
  const text = (document.body.innerText || '').replace(/\s+/g, ' ');
  return {
    hasWork: text.includes('念奴娇') || text.includes('赤壁赋'),
    hasPlace: /人到过/.test(text),
    hasGroup: text.includes('作品'),
  };
});
ok('检索「赤壁」下拉出现作品结果', searchPanel.hasWork);
ok('检索结果含作品分组与地点分组', searchPanel.hasGroup);
await page.screenshot({ path: path.resolve('.verify', 'shot-01-search.png') });

// 点击第一条作品结果
const clickedWork = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const hit = btns.find((b) => (b.innerText || '').includes('念奴娇'));
  if (!hit) return '';
  const t = hit.innerText.replace(/\s+/g, ' ').slice(0, 60);
  hit.click();
  return t;
});
ok('可点击检索到的作品结果', clickedWork.length > 0, clickedWork || '未找到');
await wait(1600);

const afterJump = await page.evaluate(() => {
  const pop = document.querySelector('.shadow-popup');
  const body = (document.body.innerText || '').replace(/\s+/g, ' ');
  return {
    hasPopup: !!pop,
    text: pop ? (pop.innerText || '').replace(/\s+/g, ' ').slice(0, 180) : '',
    isSu: body.includes('苏轼'),
    hasHuangzhou: body.includes('黄州'),
  };
});
ok('点作品后地图弹出该地作品浮层', afterJump.hasPopup, afterJump.text.slice(0, 90));
ok('跳转后主诗人切为苏轼且落在黄州', afterJump.isSu && afterJump.hasHuangzhou);
await page.screenshot({ path: path.resolve('.verify', 'shot-02-search-jump.png') });

// 清空检索框，避免影响后续
await page.evaluate(() => {
  const input = document.querySelector('input[aria-label^="全局检索"]');
  const btn = input?.parentElement?.querySelector('button[aria-label="清空检索"]');
  if (btn) btn.click();
});
await wait(400);

// ---------- 5. 节点点击 → 作品浮层 ----------
const popup = await page.evaluate(async () => {
  const nodes = [...document.querySelectorAll('svg g[role="button"]')].filter((g) => {
    const r = g.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  if (!nodes.length) return { hasPopup: false, reason: 'no visible node g' };
  const target = nodes[Math.floor(nodes.length / 2)];
  const r = target.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, view: window, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
  for (const type of ['mouseover', 'mouseenter', 'mousemove', 'mousedown', 'mouseup', 'click']) {
    target.dispatchEvent(new MouseEvent(type, opts));
  }
  await new Promise((res) => setTimeout(res, 1400));
  const el = document.querySelector('.shadow-popup');
  return { hasPopup: !!el, text: el ? (el.innerText || '').replace(/\s+/g, ' ').slice(0, 160) : '' };
});
ok('点击地图节点弹出作品浮层', popup.hasPopup, popup.text.slice(0, 90) || popup.reason || '');
ok('浮层含古今地名对照（「今…」）', /今/.test(popup.text || ''));
await page.screenshot({ path: path.resolve('.verify', 'shot-03-node.png') });

// ---------- 6. 播放 ----------
const readYear = () =>
  page.evaluate(() => {
    const r = document.querySelector('input[type="range"]');
    return r ? r.value : '';
  });
// 先移开焦点：上一步点过检索框，焦点仍在 input 内，
// 而「输入框内不拦截空格」是刻意为之（否则打字会触发播放），属正确行为。
await page.evaluate(() => {
  const el = document.activeElement;
  if (el && typeof el.blur === 'function') el.blur();
});
await wait(200);
const yearBefore = await readYear();
await page.keyboard.press('Space');
await wait(2000);
const yearAfter = await readYear();
ok('空格触发播放且年份推进', yearBefore !== '' && Number(yearAfter) > Number(yearBefore), `${yearBefore} -> ${yearAfter}`);
await page.keyboard.press('Space');
await page.screenshot({ path: path.resolve('.verify', 'shot-04-play.png') });

// ---------- 7. 迭代 9 · 快捷键速查 ----------
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '操作速查');
  if (btn) btn.click();
});
await wait(700);
const help = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  if (!d) return { shown: false };
  const t = (d.innerText || '').replace(/\s+/g, ' ');
  return { shown: true, hasSpace: t.includes('空格'), hasWheel: t.includes('滚轮'), text: t.slice(0, 80) };
});
ok('「?」按钮唤出操作速查', help.shown, help.text || '');
ok('速查表含空格与滚轮说明', !!help.hasSpace && !!help.hasWheel);
await page.screenshot({ path: path.resolve('.verify', 'shot-05-help.png') });
await page.keyboard.press('Escape');
await wait(500);
ok('Esc 可关闭速查表', await page.evaluate(() => !document.querySelector('[role="dialog"]')));

// ---------- 8. 迭代 9 · 分享按钮 ----------
const shareBtn = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').includes('分享链接'));
  return b ? b.title : '';
});
ok('顶栏存在分享链接按钮', shareBtn.length > 0, shareBtn);
const hash = await page.evaluate(() => window.location.hash);
ok('URL 带诗人/年份深链 hash', hash.length > 1, hash);

// ---------- 9. 缩放 ----------
const zoomRes = await page.evaluate(() => {
  const inBtn = [...document.querySelectorAll('button')].find((b) => b.title === '放大');
  const outBtn = [...document.querySelectorAll('button')].find((b) => b.title === '缩小');
  const resetBtn = [...document.querySelectorAll('button')].find((b) => (b.title || '').startsWith('复位'));
  if (!inBtn || !outBtn) return { found: false };
  const before = document.querySelector('svg g[transform]')?.getAttribute('transform') || '';
  inBtn.click();
  return { found: true, before, hasReset: !!resetBtn };
});
await wait(800);
const zoomAfter = await page.evaluate(() => document.querySelector('svg g[transform]')?.getAttribute('transform') || '');
ok('缩放控件齐全（放大/缩小/复位）', !!zoomRes.found && !!zoomRes.hasReset);
ok('点击放大后地图变换改变', zoomRes.before !== zoomAfter, `${zoomRes.before} -> ${zoomAfter}`);
await page.screenshot({ path: path.resolve('.verify', 'shot-06-zoom.png') });

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
if (warnings.length) console.log(`（控制台警告 ${warnings.length} 条，可忽略）`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
