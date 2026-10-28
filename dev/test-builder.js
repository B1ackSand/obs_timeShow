'use strict';
// 离线验证 builder.html：用 DOM 桩执行内联脚本，检查生成的 URL 与中英界面。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.argv[2] || process.cwd();
const html = fs.readFileSync(path.join(ROOT, 'builder.html'), 'utf8');
const code = /<script>([\s\S]*?)<\/script>/.exec(html)[1];

const DEFAULTS = {
  tz: 'Asia/Shanghai', color: '#ffffff', outline: '#000000', dateColor: '#ffffff',
  ow: '5', h24: '24', lang: 'zh-CN', dateFmt: 'long', sw: '480', sh: '140', bg: 'checker',
  fs: '46', ds: '22'
};
const BOOLS = { showDate: true, blink: false, dateColorOn: false };
const IDS = Object.keys(DEFAULTS).concat(Object.keys(BOOLS))
  .concat(['colorHex', 'outlineHex', 'owOut', 'fsOut', 'dsOut', 'langLocal', 'frame', 'screen', 'stage',
    'url', 'toast', 'copy', 'help', 'tzlist']);

function makeEl(id, attrs) {
  const el = {
    id, _classes: new Set(), _attrs: attrs || {}, _on: {},
    textContent: '', innerHTML: '', style: {},
    classList: {
      add(c) { el._classes.add(c); },
      remove(c) { el._classes.delete(c); },
      contains(c) { return el._classes.has(c); },
      toggle() {}
    },
    addEventListener(type, fn) { el._on[type] = fn; },
    getAttribute(n) { return n in el._attrs ? el._attrs[n] : null; },
    setAttribute(n, v) { el._attrs[n] = v; },
    select() {},
    setSelectionRange() {}
  };
  if (id in DEFAULTS) el.value = DEFAULTS[id];
  if (id in BOOLS) el.checked = BOOLS[id];
  el.disabled = false;
  return el;
}

// 从 HTML 抓出所有带 data-i18n* 标记的元素，当作 querySelectorAll 的返回
function collectMarkup() {
  const out = [];
  ['data-i18n', 'data-i18n-html', 'data-i18n-title'].forEach((kind) => {
    const re = new RegExp('<(title|h1|h2|span|div|button|option|label|p|b|code)\\b[^>]*?\\b' +
      kind + '="([^"]+)"', 'g');
    let m;
    while ((m = re.exec(html)) !== null) {
      const attrs = {};
      attrs[kind] = m[2];
      out.push(makeEl('mk' + out.length, attrs));
    }
  });
  return out;
}

function run(overrides, env) {
  env = env || {};
  const els = {};
  IDS.forEach((id) => { els[id] = makeEl(id); });
  els.frame.style = {};
  if (overrides) {
    Object.keys(overrides).forEach((k) => {
      if (!els[k]) els[k] = makeEl(k);
      if (typeof overrides[k] === 'boolean') els[k].checked = overrides[k];
      else els[k].value = overrides[k];
    });
  }

  const markup = collectMarkup();
  const buttons = [
    makeEl('langBtnZh', { 'data-lang': 'zh' }),
    makeEl('langBtnEn', { 'data-lang': 'en' })
  ];

  // 默认模拟中文系统，保证既有用例的默认值不被界面语言推断改掉
  const navLangs = env.navLangs || ['zh-CN', 'zh'];
  const nav = env.nav || { language: navLangs[0], languages: navLangs };
  const store = env.store || { getItem: () => null, setItem: () => {} };
  const sandbox = {
    console, URL, Date, Math, String, Number, Array, Object, RegExp, JSON,
    parseFloat, parseInt, isFinite, encodeURIComponent, decodeURIComponent,
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => {},
    location: { href: 'file:///D:/git/obs_showTime/builder.html' },
    navigator: nav,
    localStorage: store,
    document: {
      documentElement: { lang: '' },
      getElementById: (id) => els[id] || (els[id] = makeEl(id)),
      querySelectorAll: (sel) => {
        if (sel === '#langSwitch [data-lang]') return buttons;
        if (sel === '[data-i18n]') return markup.filter((e) => 'data-i18n' in e._attrs);
        if (sel === '[data-i18n-html]') return markup.filter((e) => 'data-i18n-html' in e._attrs);
        if (sel === '[data-i18n-title]') return markup.filter((e) => 'data-i18n-title' in e._attrs);
        return [];
      },
      execCommand: () => false
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'builder-inline.js' });

  const api = sandbox.obsClockBuilder || {};
  return {
    els, sandbox, buttons, markup, api,
    get url() { return els.url.value; },
    get frameSrc() { return els.frame.src; },
    get q() { return qs(els.url.value); },
    get lang() { return api.lang; },
    dict: api.dict,
    text(key) {
      const el = markup.find((e) => e._attrs['data-i18n'] === key);
      return el ? el.textContent : null;
    },
    titleOf(key) {
      const el = markup.find((e) => e._attrs['data-i18n-title'] === key);
      return el ? el.getAttribute('title') : null;
    }
  };
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  ->  ' + extra : '')); }
}
function qs(u) { return u.indexOf('?') >= 0 ? u.slice(u.indexOf('?') + 1) : ''; }
function has(u, s) { return qs(u).split('&').indexOf(s) >= 0; }

console.log('\n[1] 默认状态');
{
  const r = run();
  check('指向 index.html', r.url.startsWith('file:///D:/git/obs_showTime/index.html'), r.url);
  check('tz 始终输出', has(r.url, 'tz=Asia/Shanghai'), r.q);
  check('默认值全部省略', r.q === 'tz=Asia/Shanghai', r.q);
  check('iframe.src 与 URL 一致', r.frameSrc === r.url, r.frameSrc);
  check('预览框尺寸 = 源尺寸', r.els.screen.style.width === '480px' && r.els.screen.style.height === '140px',
    r.els.screen.style.width + 'x' + r.els.screen.style.height);
  check('无裸 # 进入查询串', r.q.indexOf('#') === -1, r.q);
}

console.log('\n[2] 颜色：剥掉 #，不产生 %23');
{
  const r = run({ color: '#ff0000' });
  check('color=ff0000', has(r.url, 'color=ff0000'), r.q);
  check('不含 %23', r.q.indexOf('%23') === -1, r.q);
  check('不含裸 #', r.q.indexOf('#') === -1, r.q);

  const o = run({ outline: '#123456' });
  check('outline=123456', has(o.url, 'outline=123456'), o.q);

  const d = run({ dateColorOn: true, dateColor: '#00ff00', color: '#ff0000' });
  check('dateColor=00ff00', has(d.url, 'dateColor=00ff00'), d.q);

  const same = run({ dateColorOn: true, dateColor: '#123456', color: '#123456' });
  check('日期色与时间色相同则省略',
    same.q.split('&').filter((x) => x.indexOf('dateColor=') === 0).length === 0, same.q);
}

console.log('\n[3] 其它参数只在偏离默认时输出');
{
  check('outlineWidth=8', has(run({ ow: '8' }).url, 'outlineWidth=8'));
  check('outlineWidth 默认 5 省略', run({ ow: '5' }).q === 'tz=Asia/Shanghai', run({ ow: '5' }).q);
  check('h24=0', has(run({ h24: '12' }).url, 'h24=0'));

  const u = run();
  u.els.lang.value = 'en-US';
  u.els.lang._on.input();
  u.api.setLang('zh');
  check('手改过的 lang 仍原样输出', has(u.url, 'lang=en-US'), u.q);

  check('dateFmt=iso', has(run({ dateFmt: 'iso' }).url, 'dateFmt=iso'));
  check('blink=1', has(run({ blink: true }).url, 'blink=1'));
  check('showDate=0', has(run({ showDate: false }).url, 'showDate=0'));
}

console.log('\n[4] 时区编码');
{
  const r = run({ tz: 'America/New_York' });
  check('斜杠与下划线保留', has(r.url, 'tz=America/New_York'), r.q);
  const sp = run({ tz: 'Asia/Shang hai' });
  check('空格编码为 %20', sp.q.indexOf('tz=Asia/Shang%20hai') === 0, sp.q);
  const amp = run({ tz: 'a&b=c' });
  check('& 与 = 被编码', amp.q.indexOf('tz=a%26b%3Dc') === 0, amp.q);
}

console.log('\n[5] 源尺寸');
{
  const r = run({ sw: '1280', sh: '320' });
  check('1280x320', r.els.screen.style.width === '1280px' && r.els.screen.style.height === '320px',
    r.els.screen.style.width + 'x' + r.els.screen.style.height);
  const bad = run({ sw: '0', sh: '0' });
  check('非法尺寸被夹到最小值',
    bad.els.screen.style.width === '40px' && bad.els.screen.style.height === '30px',
    bad.els.screen.style.width + 'x' + bad.els.screen.style.height);
}

console.log('\n[6] 预设数据完整性');
{
  ['classic', 'gold', 'mint', 'minimal'].forEach((n) => {
    check('预设 ' + n, new RegExp(n + ':\\s*\\{').test(html));
  });
  check('重置按钮存在', html.includes('data-preset="reset"'));
}

console.log('\n[7] 跟随系统语言');
{
  const r = run({ langLocal: true });
  check('lang=local', has(r.url, 'lang=local'), r.q);
  const r2 = run({ langLocal: true, lang: 'ja-JP' });
  check('勾选时忽略输入框内容', has(r2.url, 'lang=local') && !has(r2.url, 'lang=ja-JP'), r2.q);
  const r3 = run({ lang: 'ja-JP' });
  check('未勾选时正常输出', has(r3.url, 'lang=ja-JP'), r3.q);
}

console.log('\n[8] 界面语言：跟随系统与手动切换');
{
  const zh = run();
  check('中文系统 → 中文界面', zh.lang === 'zh', zh.lang);
  check('中文界面下时钟语言 zh-CN', zh.els.lang.value === 'zh-CN', zh.els.lang.value);
  check('中文标题', zh.text('page.h1') === 'OBS 时钟 · 参数生成器', zh.text('page.h1'));
  check('中文 <html lang>', zh.sandbox.document.documentElement.lang === 'zh-CN',
    zh.sandbox.document.documentElement.lang);

  const en = run(null, { navLangs: ['en-US', 'en'] });
  check('英文系统 → 英文界面', en.lang === 'en', en.lang);
  check('英文界面下时钟语言 en-US', en.els.lang.value === 'en-US', en.els.lang.value);
  check('URL 跟着带 lang=en-US', has(en.url, 'lang=en-US'), en.q);
  check('英文标题', en.text('page.h1') === 'OBS Clock · Configurator', en.text('page.h1'));
  check('英文 <html lang>', en.sandbox.document.documentElement.lang === 'en',
    en.sandbox.document.documentElement.lang);
  check('英文正文换了', /paste the URL below/i.test(String(en.text('page.sub'))), en.text('page.sub'));

  check('非中文系统默认英文', run(null, { navLangs: ['ja-JP'] }).lang === 'en');
  check('法文系统默认英文', run(null, { navLangs: ['fr-FR'] }).lang === 'en');
  check('zh-* 都算中文', run(null, { navLangs: ['zh-Hant-TW'] }).lang === 'zh');
  check('只有 language 没有 languages 也能判断', run(null, { nav: { language: 'zh-CN' } }).lang === 'zh');

  const m = run();
  m.buttons[1]._on.click();
  check('点 EN 切到英文', m.lang === 'en', m.lang);
  check('点 EN 后时钟语言变 en-US', has(m.url, 'lang=en-US'), m.q);
  check('点 EN 后标题变英文', m.text('page.h1') === 'OBS Clock · Configurator', m.text('page.h1'));
  check('EN 按钮点亮', m.buttons[1].classList.contains('on'));
  check('中文按钮熄灭', !m.buttons[0].classList.contains('on'));

  m.buttons[0]._on.click();
  check('点中文切回中文', m.lang === 'zh', m.lang);
  check('切回中文后时钟语言回默认（URL 省略 lang）', m.q.indexOf('lang=') === -1, m.q);
}

console.log('\n[9] 界面语言：不覆盖用户输入、记忆选择');
{
  const g = run();
  check('语言输入框绑定了 input 监听', typeof g.els.lang._on.input === 'function');
  g.els.lang.value = 'ja-JP';
  g.els.lang._on.input();
  g.api.setLang('en');
  check('手改过时钟语言则不被界面语言覆盖', g.els.lang.value === 'ja-JP', g.els.lang.value);

  const s2 = run({ langLocal: true, lang: 'ja-JP' });
  s2.api.setLang('en');
  check('勾选跟随系统时也不动输入框', s2.els.lang.value === 'ja-JP', s2.els.lang.value);

  let saved = null;
  const w = run(null, { store: { getItem: () => null, setItem: (k, v) => { saved = k + '=' + v; } } });
  w.buttons[1]._on.click();
  check('手动切换写入 localStorage', saved === 'obsClockBuilder.lang=en', String(saved));

  const remembered = run(null, {
    navLangs: ['zh-CN'],
    store: { getItem: (k) => (k === 'obsClockBuilder.lang' ? 'en' : null), setItem: () => {} }
  });
  check('记住的选择优先于系统语言', remembered.lang === 'en', remembered.lang);
  check('记住英文后时钟语言 en-US', remembered.els.lang.value === 'en-US', remembered.els.lang.value);

  const legacy = run({ lang: 'zh-CN' }, { navLangs: ['en-GB'] });
  check('未标记手改时跟随界面切换', legacy.els.lang.value === 'en-US', legacy.els.lang.value);
}

console.log('\n[10] 界面文案字典');
{
  const r = run();
  const D = r.dict;
  const kz = Object.keys(D.zh).sort();
  const ke = Object.keys(D.en).sort();
  check('中英键完全一致', kz.join('|') === ke.join('|'),
    kz.filter((k) => !(k in D.en)).concat(ke.filter((k) => !(k in D.zh))).join(','));
  check('字典条目够用', kz.length >= 50, kz.length);

  const used = [];
  const re = /data-i18n(?:-html|-title)?="([^"]+)"/g;
  let mm;
  while ((mm = re.exec(html)) !== null) if (used.indexOf(mm[1]) < 0) used.push(mm[1]);
  const missing = used.filter((k) => !(k in D.zh) || !(k in D.en));
  check('HTML 里每个 data-i18n 键都有译文', missing.length === 0, missing.join(', '));
  check('标记数量覆盖整个界面', used.length >= 30, used.length);

  const CJK = /[\u4e00-\u9fa5]/;
  const LITERAL_ONLY = /^(opt\.dateFmt\.(iso|us|eu)|label\.size|preset\.)/;
  const noZh = Object.keys(D.zh).filter((k) => !CJK.test(String(D.zh[k])) && !LITERAL_ONLY.test(k));
  check('中文译文没有漏翻的英文条目', noZh.length === 0, noZh.join(', '));

  const sameEn = Object.keys(D.en).filter((k) => D.en[k] === D.zh[k] && !LITERAL_ONLY.test(k));
  check('英文译文与中文不重复', sameEn.length === 0, sameEn.join(', '));

  check('时区候选跟着中文', String(r.els.tzlist.innerHTML).indexOf('北京 / 上海') > 0);
  const en = run(null, { navLangs: ['en-US'] });
  check('英文时区候选是英文', String(en.els.tzlist.innerHTML).indexOf('Beijing / Shanghai') > 0,
    String(en.els.tzlist.innerHTML).slice(0, 70));
  check('时区候选都有 IANA 值', (String(r.els.tzlist.innerHTML).match(/value="/g) || []).length >= 30,
    (String(r.els.tzlist.innerHTML).match(/value="/g) || []).length);
}

console.log('\n[11] 切换按钮与默认语言');
{
  check('标题栏有中/EN 切换', /id="langSwitch"/.test(html));
  check('两个切换按钮都在', /data-lang="zh"/.test(html) && /data-lang="en"/.test(html));
  check('代码里的兜底语言是英文', /var currentLang = 'en'/.test(html));
  check('记住选择的 key 固定', /obsClockBuilder\.lang/.test(html));
  check('HTML 里没有预置首页语言', !/<body[^>]*class="[^"]*lang-/.test(html));
}

console.log('\n[12] 字号');
{
  const r = run();
  check('默认不输出 size', !/(^|&)size=/.test(r.q), r.q);
  check('默认不输出 dateSize', !/(^|&)dateSize=/.test(r.q), r.q);

  const a = run({ fs: '60' });
  check('fs=60 -> size=60', /(^|&)size=60(&|$)/.test(a.q), a.q);
  check('数值显示 60%', a.els.fsOut.textContent === '60%', a.els.fsOut.textContent);

  const b = run({ ds: '40' });
  check('ds=40 -> dateSize=40', /(^|&)dateSize=40(&|$)/.test(b.q), b.q);
  check('数值显示 40%', b.els.dsOut.textContent === '40%', b.els.dsOut.textContent);

  const c = run({ fs: '70', ds: '5' });
  check('两个一起输出', /(^|&)size=70(&|$)/.test(c.q) && /(^|&)dateSize=5(&|$)/.test(c.q), c.q);
}

console.log('\n通过 ' + pass + ' / ' + (pass + fail));
if (fail) process.exit(1);
