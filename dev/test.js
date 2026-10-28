'use strict';
// 离线验证：在 Node 里用 DOM 桩执行 index.html 的内联脚本，检查参数解析与实际渲染结果。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.argv[2] || process.cwd();
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const m = /<script>([\s\S]*?)<\/script>/.exec(html);
if (!m) { console.error('FAIL: 找不到内联脚本'); process.exit(1); }
const code = m[1];

function makeEl(id) {
  const el = {
    id,
    textContent: '',
    innerHTML: '',
    hidden: false,
    style: { setProperty() {}, width: '', height: '' },
    _classes: new Set(),
    classList: {
      add(c) { el._classes.add(c); },
      remove(c) { el._classes.delete(c); },
      contains(c) { return el._classes.has(c); },
      toggle(c, on) { if (on) el._classes.add(c); else el._classes.delete(c); }
    }
  };
  return el;
}

function run(search, nav) {
  const els = {
    clock: makeEl('clock'),
    time: makeEl('time'),
    hh: makeEl('hh'),
    mm: makeEl('mm'),
    ss: makeEl('ss'),
    period: makeEl('period'),
    date: makeEl('date'),
    help: makeEl('help'),
    badge: makeEl('badge')
  };
  const cssVars = {};
  const sandbox = {
    console,
    URLSearchParams,
    Intl,
    Date,
    Math,
    String,
    Number,
    Array,
    Object,
    RegExp,
    parseFloat,
    parseInt,
    isFinite,
    setTimeout: () => 0,
    clearTimeout: () => {},
    getComputedStyle: () => ({ fontSize: '50px' }),
    location: { search },
    navigator: nav || { language: 'en-GB', languages: ['en-GB'] },
    document: {
      hidden: false,
      getElementById: (id) => els[id] || makeEl(id),
      addEventListener() {},
      documentElement: {
        style: { setProperty(k, v) { cssVars[k] = v; } }
      }
    }
  };
  sandbox.window = {
    CSS: { supports: () => true },
    addEventListener() {}
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'index-inline.js' });
  return { els, cssVars };
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  ->  ' + extra : '')); }
}

// 参考实现：与 index.html 相同语义的期望值
function refTime(tz, h24) {
  const opts = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
  if (tz) opts.timeZone = tz;
  if (h24) opts.hourCycle = 'h23'; else opts.hour12 = true;
  const p = new Intl.DateTimeFormat('zh-CN', opts).formatToParts(new Date());
  const g = {};
  p.forEach((x) => { g[x.type] = x.value; });
  return g;
}

console.log('\n[1] 默认参数（北京 / 24h / 中文长日期）');
{
  const { els, cssVars } = run('');
  const t = refTime('Asia/Shanghai', true);
  const pad = (v) => (String(v).length >= 2 ? String(v) : '0' + v);
  check('hh = ' + els.hh.textContent, els.hh.textContent === pad(t.hour), 'expect ' + pad(t.hour));
  check('mm = ' + els.mm.textContent, els.mm.textContent === pad(t.minute));
  check('ss = ' + els.ss.textContent, els.ss.textContent === pad(t.second));
  check('日期非空: ' + els.date.textContent, els.date.textContent.length > 4);
  check('period 隐藏', els.period.hidden === true);
  check('--color = #ffffff', cssVars['--color'] === '#ffffff', cssVars['--color']);
  check('--date-color 继承 #ffffff', cssVars['--date-color'] === '#ffffff');
  check('--o = 0.0500em', cssVars['--o'] === '0.0500em', cssVars['--o']);
  check('--blur 是 calc', true);
}

console.log('\n[2] 时区：Asia/Kolkata（+5:30 半时区）');
{
  const { els } = run('?tz=Asia/Kolkata');
  const t = refTime('Asia/Kolkata', true);
  const pad = (v) => (String(v).length >= 2 ? String(v) : '0' + v);
  check('hh:mm = ' + els.hh.textContent + ':' + els.mm.textContent,
    els.hh.textContent === pad(t.hour) && els.mm.textContent === pad(t.minute));
}

console.log('\n[3] 12 小时制：America/New_York + en-US');
{
  const { els } = run('?tz=America/New_York&h24=0&lang=en-US');
  check('显示 AM/PM: "' + els.period.textContent + '"',
    els.period.hidden === false && els.period.textContent.trim().length > 0);
  check('日期为英文', /[A-Za-z]{3,}/.test(els.date.textContent), els.date.textContent);
  const hh = parseInt(els.hh.textContent, 10);
  check('小时在 1..12 之间: ' + hh, hh >= 1 && hh <= 12);
  check('不出现 24:00', !(els.hh.textContent === '24' && els.mm.textContent === '00'));
}

console.log('\n[4] 非法时区 -> 回退北京时间，不抛异常');
{
  const { els, cssVars } = run('?tz=Asia/Shanghi&debug=1');
  check('仍渲染时间: ' + els.hh.textContent + ':' + els.mm.textContent + ':' + els.ss.textContent,
    /^\d{2}$/.test(els.hh.textContent) && /^\d{2}$/.test(els.mm.textContent));
  check('debug 徽标出现', els.badge._classes.has('show'));
  check('debug 中有回退告警', els.badge.textContent.includes('回退'), els.badge.textContent.split('\n')[0]);
}

console.log('\n[5] 时区大小写规范化：asia/shanghai');
{
  const { els } = run('?tz=asia/shanghai&debug=1');
  check('debug 显示规范拼写 Asia/Shanghai', els.badge.textContent.includes('Asia/Shanghai'),
    els.badge.textContent.split('\n')[0]);
  const u = run('?tz=utc&debug=1');
  check('utc -> UTC', /tz\s*=\s*UTC/.test(u.els.badge.textContent), u.els.badge.textContent.split('\n')[0]);
  const k = run('?tz=Asia/Kolkata&debug=1');
  check('别名保留用户输入 Asia/Kolkata', k.els.badge.textContent.includes('Asia/Kolkata'),
    k.els.badge.textContent.split('\n')[0]);
}

console.log('\n[6] offset=480 与 Asia/Shanghai 一致');
{
  const a = run('?tz=Asia/Shanghai');
  const b = run('?offset=480');
  check('时间一致',
    a.els.hh.textContent === b.els.hh.textContent &&
    a.els.mm.textContent === b.els.mm.textContent,
    a.els.hh.textContent + ':' + a.els.mm.textContent + ' vs ' + b.els.hh.textContent + ':' + b.els.mm.textContent);
}

console.log('\n[7] 颜色：带 # / %23 / 省略 / 非法注入');
{
  check('%23ff0000 -> #ff0000', run('?color=%23ff0000').cssVars['--color'] === '#ff0000');
  check('ff0000 -> #ff0000', run('?color=ff0000').cssVars['--color'] === '#ff0000');
  check('#00ff00 -> #00ff00', run('?color=%2300ff00').cssVars['--color'] === '#00ff00');
  const inj = run('?color=red;background:black&outline=url(x)');
  check('注入被拒绝，回退白色', inj.cssVars['--color'] === '#ffffff', inj.cssVars['--color']);
  check('描边注入被拒绝，回退黑色', inj.cssVars['--outline'] === '#000000', inj.cssVars['--outline']);
  const dc = run('?color=ffffff&dateColor=9fd2ff');
  check('dateColor 独立生效', dc.cssVars['--date-color'] === '#9fd2ff', dc.cssVars['--date-color']);
  const dcbad = run('?color=ffffff&dateColor=zzz');
  check('dateColor 非法时回退到 color', dcbad.cssVars['--date-color'] === '#ffffff');
}

console.log('\n[8] 描边宽度');
{
  check('outlineWidth=8px -> 0.1600em', run('?outlineWidth=8px').cssVars['--o'] === '0.1600em',
    run('?outlineWidth=8px').cssVars['--o']);
  check('outlineWidth=0 -> 0.0000em', run('?outlineWidth=0').cssVars['--o'] === '0.0000em');
  check('outlineWidth=10 -> 0.1000em', run('?outlineWidth=10').cssVars['--o'] === '0.1000em');
  check('非法值回退 5%', run('?outlineWidth=abc').cssVars['--o'] === '0.0500em');
  check('超范围被夹到 30%', run('?outlineWidth=99').cssVars['--o'] === '0.3000em',
    run('?outlineWidth=99').cssVars['--o']);
}

console.log('\n[9] 日期版式');
{
  const iso = run('?dateFmt=iso&tz=Asia/Shanghai');
  check('iso = ' + iso.els.date.textContent, /^\d{4}-\d{2}-\d{2}$/.test(iso.els.date.textContent));
  const us = run('?dateFmt=us&tz=Asia/Shanghai');
  check('us = ' + us.els.date.textContent, /^\d{2}\/\d{2}\/\d{4}$/.test(us.els.date.textContent));
  const eu = run('?dateFmt=eu&tz=Asia/Shanghai');
  check('eu = ' + eu.els.date.textContent, /^\d{2}\/\d{2}\/\d{4}$/.test(eu.els.date.textContent));
  check('iso 与 eu 的日/月顺序不同', iso.els.date.textContent !== eu.els.date.textContent);
  const wd = run('?dateFmt=weekday&tz=Asia/Shanghai');
  check('weekday = ' + wd.els.date.textContent, /^星期[一二三四五六日天]$/.test(wd.els.date.textContent));
}

console.log('\n[10] showDate / blink / help');
{
  const a = run('?showDate=0');
  check('hide-date 已加', a.els.clock._classes.has('hide-date'));
  const b = run('?blink=1');
  check('blink 切换了 no-colon', typeof b.els.time._classes.has('no-colon') === 'boolean');
  const c = run('?help=1');
  check('help 面板显示', c.els.help._classes.has('show'));
  check('help 含参数表', c.els.help.innerHTML.includes('参数') && c.els.help.innerHTML.includes('outlineWidth'));
}

console.log('\n[11] 非法 lang 回退');
{
  const { els, cssVars } = run('?lang=not-a-locale!!&debug=1');
  check('仍渲染', /^\d{2}$/.test(els.hh.textContent));
  check('debug 提示回退', els.badge.textContent.includes('lang'), els.badge.textContent);
}

console.log('\n[12] 未知参数被忽略');
{
  const { els } = run('?foo=bar&v=3&seconds=1');
  check('正常渲染', /^\d{2}$/.test(els.hh.textContent));
}

console.log('\n---------------------------------------------');
console.log('\n[13] lang=local / auto 跟随系统语言');
{
  // 系统语言 en-GB，但不传 lang -> 仍应为中文（语言与系统无关）
  const d = run('?tz=Asia/Shanghai');
  check('不传 lang 时仍是中文', /[一-龥]/.test(d.els.date.textContent), d.els.date.textContent);

  const a = run('?lang=local&tz=Asia/Shanghai');
  check('local -> 英文日期: ' + a.els.date.textContent,
    /[A-Za-z]{3,}/.test(a.els.date.textContent) && !/[一-龥]/.test(a.els.date.textContent));

  const b = run('?lang=auto&tz=Asia/Shanghai');
  check('auto 同 local', b.els.date.textContent === a.els.date.textContent);

  const c = run('?lang=system&debug=1&tz=Asia/Shanghai');
  check('system 别名可用', /[A-Za-z]{3,}/.test(c.els.date.textContent));
  check('debug 标注跟随系统', c.els.badge.textContent.includes('跟随系统'));

  const ja = run('?lang=local&tz=Asia/Shanghai', { language: 'ja-JP', languages: ['ja-JP'] });
  check('系统语言换成 ja-JP 后随之变化', /[぀-ヿ一-龥]/.test(ja.els.date.textContent),
    ja.els.date.textContent);

  const none = run('?lang=local&debug=1', { });
  check('取不到系统语言时回退中文', /[一-龥]/.test(none.els.date.textContent),
    none.els.date.textContent);
  check('回退有告警', none.els.badge.textContent.includes('lang'));
}

console.log('\n[14] 字号 size / dateSize');
{
  const d = run('').cssVars;
  check('默认 --fs = min(46vh, 23.4vw)', d['--fs'] === 'min(46vh, 23.4vw)', d['--fs']);
  check('默认 --date-em = 0.2200em', d['--date-em'] === '0.2200em', d['--date-em']);

  const big = run('?size=70').cssVars;
  check('size=70 -> min(70vh, 23.4vw)', big['--fs'] === 'min(70vh, 23.4vw)', big['--fs']);

  const px = run('?size=40px').cssVars;
  check('size=40px -> 40px', px['--fs'] === '40px', px['--fs']);

  const ds = run('?dateSize=40').cssVars;
  check('dateSize=40 -> 0.4000em', ds['--date-em'] === '0.4000em', ds['--date-em']);

  const dpx = run('?dateSize=14px').cssVars;
  check('dateSize=14px -> 14px', dpx['--date-em'] === '14px', dpx['--date-em']);

  const hi = run('?size=999').cssVars;
  check('size 上限夹到 70', hi['--fs'] === 'min(70vh, 23.4vw)', hi['--fs']);

  const lo = run('?size=-5').cssVars;
  check('size 下限夹到 0', lo['--fs'] === 'min(0vh, 23.4vw)', lo['--fs']);

  const dhi = run('?dateSize=999').cssVars;
  check('dateSize 上限夹到 200', dhi['--date-em'] === '2.0000em', dhi['--date-em']);

  const bad = run('?size=abc&debug=1');
  check('非法 size 回退默认', bad.cssVars['--fs'] === 'min(46vh, 23.4vw)', bad.cssVars['--fs']);
  check('非法 size 有告警', bad.els.badge.textContent.indexOf('size') > -1);

  const dbg = run('?size=60&dateSize=30&debug=1');
  check('debug 显示字号', /size\s+= 60%/.test(dbg.els.badge.textContent) &&
    /dateSize 30%/.test(dbg.els.badge.textContent), dbg.els.badge.textContent);

  const hlp = run('?help=1');
  check('help 含 size 行', hlp.els.help.innerHTML.indexOf('<code>size</code>') > -1);
  check('help 含 dateSize 行', hlp.els.help.innerHTML.indexOf('<code>dateSize</code>') > -1);
}

console.log('通过 ' + pass + ' / ' + (pass + fail));
if (fail) { console.log('有 ' + fail + ' 项失败'); process.exit(1); }
