
(function () {
  'use strict';

  /* ============ 常量 & 环境 ============ */
  var DATABASE_ID = 'M3smumYeSxQgh0nzPuiO13';
  var LS_ROWS = 'wb_task_tracker_rows';
  var LS_SEEDED = 'wb_task_tracker_seeded';
  var LS_SEED_IDS = 'wb_task_tracker_seed_ids';
  var LS_TIP = 'wb_task_tracker_tip_dismissed';
  var LS_THEME = 'wb_task_tracker_theme';

  var SMART = (typeof window !== 'undefined' && window.__SMART_PAGE__ && window.__SMART_PAGE__.database) ? window.__SMART_PAGE__ : null;
  var db = (SMART && SMART.database) ? SMART.database : null;
  var ONLINE = !!db;

  var FIELD = { name: '任务名称', status: '状态', priority: '优先级', category: '分类', due: '截止日期', delay: '延迟原因', tags: '标签', done: '完成时间', detail: '详情', images: '详情图片', nextAction: '下一步动作', sourceIdea: '来源想法', delayCount: '延期次数', delayLog: '延期记录', firstDue: '首次截止日' };
  var FTYPE = { name: 'text', status: 'select', priority: 'select', category: 'select', due: 'date', delay: 'text', tags: 'text', done: 'text', detail: 'text', images: 'attachment', nextAction: 'text', sourceIdea: 'text', delayCount: 'text', delayLog: 'text', firstDue: 'date' };
  var STATUS_LIST = ['待办', '进行中', '已延期', '已完成'];
  var FALLBACK_OPTIONS = {
    '状态': ['待办', '进行中', '已延期', '已完成'],
    '优先级': ['P0 紧急', 'P1 高', 'P2 中', 'P3 低'],
    '分类': ['工作', '学习', '生活', '其他']
  };
  var PRIORITY_ORDER = { 'P0 紧急': 0, 'P1 高': 1, 'P2 中': 2, 'P3 低': 3 };

  var SCHEMA_OPTIONS = {};   // { field: [ {text,id} ] }
  var OPT_ID = {};           // { field: { text: id } }
  var state = {
    rows: [], loading: true, error: '', mutating: false,
    filterStatus: '待办', filterCategory: 'all', filterTag: 'all', keyword: '',
    view: 'list', calY: 0, calM: 0, calSelected: '', theme: 'light'
  };
  var seedIds = [];

  /* ============ 图标（内联 SVG，createElementNS 构造） ============ */
  var ICON_PATHS = {
    plus: ['M12 5v14', 'M5 12h14'],
    check: ['M20 6L9 17l-5-5'],
    checkSquare: ['M9 11l3 3L22 4', 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'],
    clock: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M12 7v5l3 2'],
    alert: ['M12 3l9.5 16.5H2.5L12 3z', 'M12 9v4', 'M12 16.5v.01'],
    flag: ['M5 21V4', 'M5 4h11l-1.6 4L16 12H5'],
    list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
    chart: ['M3 20h18', 'M6 20v-7', 'M11 20V6', 'M16 20v-4'],
    download: ['M12 3v12', 'M8 11l4 4 4-4', 'M4 21h16'],
    upload: ['M12 21V9', 'M8 13l4-4 4 4', 'M4 5h16'],
    cloud: ['M7 18h9a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 6 9.4 3.6 3.6 0 0 0 7 18z'],
    shield: ['M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z', 'M9.5 12l2 2 3.5-3.5'],
    trash: ['M4 7h16', 'M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2', 'M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13', 'M10 11v6', 'M14 11v6'],
    edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
    x: ['M6 6l12 12', 'M18 6L6 18'],
    forward: ['M9 6l6 6-6 6'],
    search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-3.5-3.5'],
    refresh: ['M20 11a8 8 0 0 0-13.7-5.3L4 8', 'M4 4v4h4', 'M4 13a8 8 0 0 0 13.7 5.3L20 16', 'M20 20v-4h-4'],
    tag: ['M3 4a1 1 0 0 1 1-1h7.6a1 1 0 0 1 .7.3l8.4 8.4a1 1 0 0 1 0 1.4l-7.6 7.6a1 1 0 0 1-1.4 0L3.3 12.3A1 1 0 0 1 3 11.6V4z', 'M7 7h.01'],
    calendar: ['M8 2v4', 'M16 2v4', 'M3 10h18', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'],
    chevronLeft: ['M15 18l-6-6 6-6'],
    chevronRight: ['M9 6l6 6-6 6'],
    target: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z', 'M12 2v2', 'M12 20v2', 'M2 12h2', 'M20 12h2'],
    sun: ['M12 4V2', 'M12 22v-2', 'M4 12H2', 'M22 12h-2', 'M6.3 6.3L4.9 4.9', 'M19.1 19.1l-1.4-1.4', 'M6.3 17.7l-1.4 1.4', 'M19.1 4.9l-1.4 1.4', 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z'],
    moon: ['M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'],
    doc: ['M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M14 3v5h5', 'M9 13h6', 'M9 17h6'],
    image: ['M3 5h18v14H3z', 'M3 15.5l4.5-4.5 3.5 3.5 3-3 7 7', 'M8.5 9.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z'],
    table: ['M3 5h18v14H3z', 'M3 10h18', 'M3 15h18', 'M9.5 5v14'],
    heading: ['M6 4v16', 'M18 4v16', 'M6 12h12'],
    bold: ['M7 4h6.5a4 4 0 0 1 0 8H7z', 'M7 12h7.5a4 4 0 0 1 0 8H7z'],
    italic: ['M19 4h-9', 'M14 20H5', 'M15 4L9 20'],
    quote: ['M6 16h3l2-4V7H5v5h3z', 'M14 16h3l2-4V7h-6v5h3z'],
    code: ['M16 18l6-6-6-6', 'M8 6l-6 6 6 6'],
    minus: ['M5 12h14'],
    link: ['M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1', 'M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1'],
    listOrdered: ['M10 6h11', 'M10 12h11', 'M10 18h11', 'M4 4h2v4', 'M4 8h2', 'M4 14h2v4']
  };
  var SVGNS = 'http://www.w3.org/2000/svg';

  function makeSvgPath(d) {
    var p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', d);
    return p;
  }
  function svgIcon(name, size) {
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size || 18));
    svg.setAttribute('height', String(size || 18));
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    var paths = ICON_PATHS[name] || [];
    for (var i = 0; i < paths.length; i++) svg.appendChild(makeSvgPath(paths[i]));
    return svg;
  }
  function mountIcons() {
    var els = document.querySelectorAll('[data-icon]');
    for (var i = 0; i < els.length; i++) {
      var host = els[i];
      if (host.getAttribute('data-mounted') === '1') continue;
      var size = parseInt(host.getAttribute('data-size'), 10) || 18;
      host.appendChild(svgIcon(host.getAttribute('data-icon'), size));
      host.setAttribute('data-mounted', '1');
    }
  }
  function iconNode(name, size) {
    var span = document.createElement('span');
    span.className = 'ic';
    span.appendChild(svgIcon(name, size));
    return span;
  }

  /* ============ 小工具 ============ */
  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function markDb(node) {
    node.setAttribute('data-sp-bindable', 'database');
    node.setAttribute('data-sp-database-id', DATABASE_ID);
    return node;
  }
  function safeGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function safeRemove(k) { try { window.localStorage.removeItem(k); } catch (e) {} }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /* ============ 日期（仅取日期部分，避免时区漂移） ============ */
  function toDateOnly(v) {
    if (v == null || v === '') return '';
    var s = String(v);
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    var d = new Date(s);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function addDays(dateStr, n) {
    var parts = String(dateStr).split('-');
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function diffDays(a, b) {
    var pa = String(a).split('-'), pb = String(b).split('-');
    var dStart = new Date(parseInt(pa[0], 10), parseInt(pa[1], 10) - 1, parseInt(pa[2], 10));
    var dEnd = new Date(parseInt(pb[0], 10), parseInt(pb[1], 10) - 1, parseInt(pb[2], 10));
    return Math.round((dStart - dEnd) / 86400000);
  }
  function prettyDue(dueStr) {
    var today = todayStr();
    var n = diffDays(dueStr, today);
    if (n === 0) return { text: '今天到期', tone: 'amber' };
    if (n === 1) return { text: '明天到期', tone: 'amber' };
    if (n > 1) return { text: n + ' 天后到期', tone: n <= 3 ? 'blue' : '' };
    return { text: '逾期 ' + Math.abs(n) + ' 天', tone: 'red' };
  }
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
  /* 周一为一周第一天：0=周一 … 6=周日 */
  function firstDowOfMonth(y, m) { return (new Date(y, m, 1).getDay() + 6) % 7; }
  function weekdayZh(dateStr) {
    var p = String(dateStr).split('-');
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  }
  function cnDate(dateStr) {
    var p = String(dateStr).split('-');
    return p[0] + '年' + parseInt(p[1], 10) + '月' + parseInt(p[2], 10) + '日';
  }
  /* 完成时间：本地时间戳 YYYY-MM-DD HH:mm（不用 UTC，避免时区漂移） */
  function nowStamp() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  /* 仅当前时间 HH:mm（本地） */
  function nowTimeStr() {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function fmtDone(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s);
    if (!m) return s;
    var dpart = m[1] + '-' + m[2] + '-' + m[3];
    var time = m[4] + ':' + m[5];
    var today = todayStr();
    if (dpart === today) return '今天 ' + time;
    if (dpart === addDays(today, -1)) return '昨天 ' + time;
    if (m[1] === today.slice(0, 4)) return parseInt(m[2], 10) + '月' + parseInt(m[3], 10) + '日 ' + time;
    return m[1] + '-' + m[2] + '-' + m[3] + ' ' + time;
  }

  /* ============ 标签工具 ============ */
  var TAG_SPLIT = /[\s,\uff0c\u3001;\uff1b\/#]+/;
  function parseTags(v) {
    if (v == null || v === '') return [];
    var raw = String(v).split(TAG_SPLIT);
    var out = [], seen = {};
    for (var i = 0; i < raw.length; i++) {
      var t = raw[i].replace(/^#+/, '').trim();
      if (!t) continue;
      if (t.length > 12) t = t.slice(0, 12);
      if (seen[t]) continue;
      seen[t] = 1;
      out.push(t);
      if (out.length >= 8) break;
    }
    return out;
  }
  function formatTags(v) {
    var tags = Array.isArray(v) ? v : parseTags(v);
    var out = [];
    for (var i = 0; i < tags.length; i++) out.push('#' + tags[i]);
    return out.join(' ');
  }
  function allTags() {
    var map = {}, order = [];
    for (var i = 0; i < state.rows.length; i++) {
      var ts = parseTags(state.rows[i].tags);
      for (var j = 0; j < ts.length; j++) {
        if (map[ts[j]] == null) { map[ts[j]] = 0; order.push(ts[j]); }
        map[ts[j]]++;
      }
    }
    var list = [];
    for (var k = 0; k < order.length; k++) list.push({ tag: order[k], count: map[order[k]] });
    list.sort(function (a, b) { return (b.count - a.count) || (a.tag < b.tag ? -1 : 1); });
    return list;
  }

  /* ============ 颜色：分类 / 标签（按名称稳定取色） ============ */
  var PALETTE = ['#5b5bd6', '#0b8fb0', '#0f9d8f', '#c2740a', '#d64545', '#8b5cf6', '#c2418f', '#0f8f6f', '#d2691e', '#3b6fe0'];
  function hashStr(s) {
    var h = 0, str = String(s == null ? '' : s);
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  var CAT_COLOR = { '工作': '#3b6fe0', '学习': '#0f9d8f', '生活': '#d2691e', '其他': '#8b93a5' };
  function colorFor(s) {
    var key = String(s == null ? '' : s);
    if (CAT_COLOR[key]) return CAT_COLOR[key];
    return PALETTE[hashStr(key) % PALETTE.length];
  }
  function hex2(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? '0' : '') + n.toString(16); }
  function mixHex(hex, target, p) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    var tr = parseInt(target.slice(1, 3), 16), tg = parseInt(target.slice(3, 5), 16), tb = parseInt(target.slice(5, 7), 16);
    return '#' + hex2(r + (tr - r) * p) + hex2(g + (tg - g) * p) + hex2(b + (tb - b) * p);
  }
  function tintOf(c, p) { return mixHex(c, state.theme === 'dark' ? '#101319' : '#ffffff', p); }
  function inkOf(c) { return state.theme === 'dark' ? mixHex(c, '#ffffff', 0.45) : mixHex(c, '#000000', 0.18); }
  function paintChip(node, key, active) {
    var c = colorFor(key);
    if (active) { node.style.background = c; node.style.color = '#fff'; node.style.borderColor = c; }
    else { node.style.background = tintOf(c, 0.82); node.style.color = inkOf(c); node.style.borderColor = tintOf(c, 0.6); }
  }
  function paintTag(node, tag, active) { paintChip(node, tag, active); }
  function catChip(name) {
    var s = el('span', 'catbadge', name);
    paintChip(s, name, false);
    return s;
  }

  /* ============ Markdown 渲染（全内联实现，无外部依赖） ============ */
  var BT = '\u0060';   /* 反引号（用转义避免源码出现模板字符串字符） */
  var RE_AMP = /&/g, RE_LT = /</g, RE_GT = />/g;
  var RE_DQ = new RegExp('"', 'g');
  var RE_INLINE_CODE = new RegExp(BT + '([^' + BT + ']+)' + BT, 'g');
  var RE_MD_STRIP = new RegExp('[*_~' + BT + '#]', 'g');
  var RE_FENCE = new RegExp('^\\s*(' + BT + BT + BT + '|~~~)\\s*[\\w-]*\\s*$');
  var RE_FENCE_STRIP = new RegExp(BT + BT + BT + '[\\s\\S]*?' + BT + BT + BT, 'g');
  var RE_MD_IMG = new RegExp('!\\[([^\\]]*)\\]\\(([^)\\s]+)\\)', 'g');
  var RE_MD_LINK = new RegExp('\\[([^\\]]+)\\]\\(([^)\\s]+)\\)', 'g');
  var RE_MD_IMG_ANY = new RegExp('!\\[[^\\]]*\\]\\([^)]*\\)', 'g');
  var RE_MD_LINK_ANY = new RegExp('\\[([^\\]]+)\\]\\([^)]*\\)', 'g');
  var RE_MD_OLIST = new RegExp('^\\s*\\d+[.)]\\s+', 'gm');
  var RE_ATT_ID = new RegExp('^[A-Za-z0-9_-]+$');
  /* 图片：att:<id> 走资料库附件（渲染后再异步解析出地址），其余走协议白名单直链 */
  function mdImage(alt, u) {
    var s = String(u == null ? '' : u);
    if (s.indexOf('att:') === 0) {
      var id = s.slice(4);
      if (!RE_ATT_ID.test(id)) return alt;
      return '<img class="mdimg" data-att="' + id + '" alt="' + alt + '" style="max-width:100%;height:auto" loading="lazy">';
    }
    var url = safeUrl(s);
    if (!url) return alt;
    return '<img class="mdimg" src="' + url + '" alt="' + alt + '" style="max-width:100%;height:auto" loading="lazy">';
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(RE_AMP, '&amp;').replace(RE_LT, '&lt;').replace(RE_GT, '&gt;').replace(RE_DQ, '&quot;');
  }
  function safeUrl(u) {
    var s = String(u == null ? '' : u).trim();
    if (/^(https?:\/\/|mailto:|tel:)/i.test(s)) return s;
    return '';
  }
  function mdInline(s) {
    var codes = [];
    var out = s.replace(RE_INLINE_CODE, function (m, p1) { codes.push(p1); return '\u0001' + (codes.length - 1) + '\u0001'; });
    out = out.replace(RE_MD_IMG, function (m, alt, u) { return mdImage(alt, u); });
    out = out.replace(RE_MD_LINK, function (m, t, u) {
      var url = safeUrl(u);
      if (!url) return t;
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + t + '</a>';
    });
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    out = out.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    out = out.replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>');
    out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    out = out.replace(/\u0001(\d+)\u0001/g, function (m, i) { return '<code>' + codes[+i] + '</code>'; });
    return out;
  }
  function splitRow(line) {
    var s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    var cells = [], cur = '', esc = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (esc) { cur += ch; esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '|') { cells.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }
  var MD_HR = /^\s*([-*_])\s*(\1\s*){2,}$/;
  var MD_LI = new RegExp('^(\\s*)([-*+]|\\d+[.)])\\s+(.*)$');
  var MD_TASK_ITEM = /^\[( |x|X)\]\s+(.*)$/;
  var MD_OL_MARK = /^\d/;
  var MD_FENCE = RE_FENCE;
  /* 前导空白折算成缩进宽度（Tab 记 4 列） */
  function liIndent(ws) {
    var w = 0, str = String(ws == null ? '' : ws);
    for (var k = 0; k < str.length; k++) w += (str.charAt(k) === '\t') ? 4 : 1;
    return w;
  }
  /* 生成 <li> 起始（含待办勾选框），不含结束标签，便于嵌套子列表 */
  function liOpenTag(text) {
    var tm = MD_TASK_ITEM.exec(text);
    if (tm) return '<li class="mdtask"><span class="mdck' + (tm[1].toLowerCase() === 'x' ? ' on' : '') + '"></span>' + mdInline(escapeHtml(tm[2]));
    return '<li>' + mdInline(escapeHtml(text));
  }
  /* 按缩进构建嵌套的 ul / ol（栈式，缩进更深的进入上一层 li 内部） */
  function renderListBlock(items) {
    var out = [], stack = [];
    function closeLi() {
      var t = stack.length ? stack[stack.length - 1] : null;
      if (t && t.liOpen) { out.push('</li>'); t.liOpen = false; }
    }
    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      while (stack.length && it.indent < stack[stack.length - 1].indent) {
        var deep = stack[stack.length - 1];
        closeLi();
        out.push('</' + deep.type + '>');
        stack.pop();
      }
      if (!stack.length) {
        out.push('<' + it.type + '>');
        stack.push({ type: it.type, indent: it.indent, liOpen: false });
        out.push(liOpenTag(it.text));
        stack[stack.length - 1].liOpen = true;
        continue;
      }
      var top = stack[stack.length - 1];
      if (it.indent > top.indent) {
        out.push('<' + it.type + '>');
        stack.push({ type: it.type, indent: it.indent, liOpen: false });
        out.push(liOpenTag(it.text));
        stack[stack.length - 1].liOpen = true;
      } else if (it.type !== top.type) {
        closeLi();
        out.push('</' + top.type + '>');
        out.push('<' + it.type + '>');
        top.type = it.type;
        top.indent = it.indent;
        out.push(liOpenTag(it.text));
        top.liOpen = true;
      } else {
        closeLi();
        out.push(liOpenTag(it.text));
        top.liOpen = true;
      }
    }
    while (stack.length) {
      closeLi();
      out.push('</' + stack[stack.length - 1].type + '>');
      stack.pop();
    }
    return out.join('');
  }
  /* 将 Markdown 渲染为安全 HTML：所有文本先经 escapeHtml，链接仅允许 http(s)/mailto/tel */
  function sanitizeMarkdown(src) {
    var text = String(src == null ? '' : src).replace(/\r\n?/g, '\n');
    var lines = text.split('\n'), n = lines.length, i = 0, html = [];
    function inlinePara(buf) { return '<p>' + mdInline(escapeHtml(buf.join('\n'))).replace(/\n/g, '<br>') + '</p>'; }
    while (i < n) {
      var line = lines[i];
      var fence = MD_FENCE.exec(line);
      if (fence) {
        var tok = fence[1], code = [];
        i++;
        while (i < n && !new RegExp('^\\s*' + tok + '\\s*$').test(lines[i])) { code.push(lines[i]); i++; }
        if (i < n) i++;
        html.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
        continue;
      }
      var h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (h) { html.push('<' + 'h' + h[1].length + '>' + mdInline(escapeHtml(h[2])) + '</h' + h[1].length + '>'); i++; continue; }
      if (MD_HR.test(line)) { html.push('<hr>'); i++; continue; }
      if (line.indexOf('|') !== -1 && i + 1 < n && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && /-/.test(lines[i + 1])) {
        var header = splitRow(line);
        i += 2;
        var tbody = [];
        while (i < n && lines[i].indexOf('|') !== -1 && !/^\s*$/.test(lines[i])) { tbody.push(splitRow(lines[i])); i++; }
        var thCells = header.map(function (c) { return '<th>' + mdInline(escapeHtml(c)) + '</th>'; }).join('');
        var th = '<tr>' + thCells + '</tr>';
        var tb = tbody.map(function (row) {
          var cs = [];
          for (var ci = 0; ci < header.length; ci++) cs.push('<td>' + mdInline(escapeHtml(row[ci] == null ? '' : row[ci])) + '</td>');
          return '<tr>' + cs.join('') + '</tr>';
        }).join('');
        var theadHtml = '<thead>' + th + '</thead>';
        var tbodyHtml = '<tbody>' + tb + '</tbody>';
        html.push('<table>' + theadHtml + tbodyHtml + '</table>');
        continue;
      }
      if (/^\s*>/.test(line)) {
        var qb = [];
        while (i < n && /^\s*>/.test(lines[i])) { qb.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        html.push('<blockquote>' + mdInline(escapeHtml(qb.join('\n'))).replace(/\n/g, '<br>') + '</blockquote>');
        continue;
      }
      if (MD_LI.test(line)) {
        var items = [];
        while (i < n && MD_LI.test(lines[i])) {
          var mm = MD_LI.exec(lines[i]);
          items.push({ indent: liIndent(mm[1]), type: MD_OL_MARK.test(mm[2]) ? 'ol' : 'ul', text: mm[3] });
          i++;
        }
        html.push(renderListBlock(items));
        continue;
      }
      if (/^\s*$/.test(line)) { i++; continue; }
      var buf = [];
      while (i < n && !/^\s*$/.test(lines[i]) && !MD_FENCE.test(lines[i]) && !/^(#{1,6})\s+/.test(lines[i]) &&
             !/^\s*>/.test(lines[i]) && !MD_LI.test(lines[i]) && !MD_HR.test(lines[i])) { buf.push(lines[i]); i++; }
      html.push(inlinePara(buf));
    }
    return html.join('\n');
  }
  function mdPlain(src) {
    var s = String(src == null ? '' : src)
      .replace(RE_FENCE_STRIP, ' ')
      .replace(RE_INLINE_CODE, '$1')
      .replace(RE_MD_IMG_ANY, ' ')
      .replace(RE_MD_LINK_ANY, '$1')
      .replace(/^\s*#{1,6}\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(RE_MD_OLIST, '')
      .replace(RE_MD_STRIP, '')
      .replace(/\s+/g, ' ')
      .trim();
    return s.length > 80 ? s.slice(0, 80) + '…' : s;
  }

  /* ============ 计算层（纯函数，不碰 DOM） ============ */
  function classify(row) {
    var today = todayStr();
    var due = toDateOnly(row.due);
    var done = row.status === '已完成';
    var info = { done: done, due: due, days: null, overdue: false, dueToday: false, soon: false, tier: 'none' };
    if (due) {
      info.days = diffDays(due, today);
      if (!done) {
        if (info.days < 0) { info.overdue = true; info.tier = 'overdue'; }
        else if (info.days === 0) { info.dueToday = true; info.tier = 'today'; }
        else if (info.days <= 3) { info.soon = true; info.tier = 'soon'; }
      }
    }
    return info;
  }
  function todayItems() {
    var list = [];
    for (var i = 0; i < state.rows.length; i++) {
      var r = state.rows[i];
      var c = classify(r);
      if (!c.done && (c.overdue || c.dueToday || c.soon)) list.push({ row: r, c: c });
    }
    list.sort(function (a, b) {
      var da = a.c.days == null ? 9999 : a.c.days;
      var dbb = b.c.days == null ? 9999 : b.c.days;
      if (da !== dbb) return da - dbb;
      return (PRIORITY_ORDER[a.row.priority] || 9) - (PRIORITY_ORDER[b.row.priority] || 9);
    });
    return list;
  }
  function filteredRows() {
    var kw = state.keyword.trim().toLowerCase();
    var out = [];
    for (var i = 0; i < state.rows.length; i++) {
      var r = state.rows[i];
      if (state.filterStatus !== 'all' && r.status !== state.filterStatus) continue;
      if (state.filterCategory !== 'all' && r.category !== state.filterCategory) continue;
      if (state.filterTag !== 'all' && parseTags(r.tags).indexOf(state.filterTag) === -1) continue;
      if (kw) {
        var hay = (r.name + ' ' + r.delay + ' ' + r.tags + ' ' + r.done).toLowerCase();
        if (hay.indexOf(kw) === -1) continue;
      }
      out.push(r);
    }
    out.sort(function (a, b) {
      var ad = toDateOnly(a.due) || '9999-99-99';
      var bd = toDateOnly(b.due) || '9999-99-99';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return (PRIORITY_ORDER[a.priority] || 9) - (PRIORITY_ORDER[b.priority] || 9);
    });
    return out;
  }
  /* 日历用：忽略状态筛选（已完成也要显示），仍受分类 / 标签 / 关键词影响 */
  function calRows() {
    var kw = state.keyword.trim().toLowerCase();
    var out = [];
    for (var i = 0; i < state.rows.length; i++) {
      var r = state.rows[i];
      if (state.filterCategory !== 'all' && r.category !== state.filterCategory) continue;
      if (state.filterTag !== 'all' && parseTags(r.tags).indexOf(state.filterTag) === -1) continue;
      if (kw) {
        var hay = (r.name + ' ' + r.delay + ' ' + r.tags + ' ' + r.done).toLowerCase();
        if (hay.indexOf(kw) === -1) continue;
      }
      out.push(r);
    }
    return out;
  }
  /* ============ 延期分析 ============ */

  function parseDelayLog(v) {
    if (!v) return [];
    if (Array.isArray(v)) {
      return v.filter(function (x) { return x && typeof x === 'object'; });
    }
    if (typeof v !== 'string') return [];
    try {
      var arr = JSON.parse(v);
      return Array.isArray(arr) ? arr.filter(function (x) { return x && typeof x === 'object'; }) : [];
    } catch (e) { return []; }
  }

  /* 原因归类：先看关键词命中，命中越多越可信；一个都不中就算「其他」 */
  var DELAY_KINDS = [
    { key: '外部依赖', hint: '等他人 / 等反馈 / 被上游卡住', words: ['等待', '等', '依赖', '对方', '反馈', '回复', '审批', '批准', '同事', '客户', '领导', '上游', '接口', '对接', '配合', '确认', '沟通', '别人', '未收到', '没收到', '未到', '没到', '到货', '发货', '样品', '供应商', '返厂', '外包'] },
    { key: '临时插入', hint: '被更紧急的事顶掉', words: ['插入', '临时', '紧急', '突发', '插进来', '顶掉', '优先级', '改做', '先做别的', '占用', '打断', '临时会议', '开会'] },
    { key: '需求变更', hint: '范围变了 / 返工', words: ['变更', '改需求', '需求', '改方案', '返工', '重做', '范围', '新增', '推翻', '改版'] },
    { key: '预估不足', hint: '低估了工作量', words: ['预估', '低估', '估计', '以为', '没想到', '时间不够', '排期', '乐观', '工作量', '比想象', '复杂', '超出'] },
    { key: '状态与精力', hint: '累 / 拖延 / 没进入状态', words: ['累', '状态', '生病', '身体', '熬夜', '精力', '注意力', '拖延', '不想', '没动力', '情绪', '休息', '犯懒', '忘记', '忘了', '没时间'] },
    { key: '信息不足', hint: '不知道怎么做 / 资料没齐', words: ['卡住', '卡在', '卡了', '不知道', '不清', '不确定', '没想清楚', '调研', '资料', '缺', '没搞懂', '研究', '没思路'] },
  ];

  function classifyDelay(reason) {
    var text = String(reason || '').toLowerCase();
    if (!text.trim()) return '未填原因';
    var best = '其他', bestScore = 0;
    for (var i = 0; i < DELAY_KINDS.length; i++) {
      var d = DELAY_KINDS[i], score = 0;
      for (var j = 0; j < d.words.length; j++) {
        if (text.indexOf(d.words[j]) !== -1) score += d.words[j].length >= 3 ? 2 : 1;
      }
      if (score > bestScore) { bestScore = score; best = d.key; }
    }
    return best;
  }

  /** 延期原因常常是多行流水账，列表里只显示最近一条，并去掉行首日期 */
  function briefReason(txt) {
    var s = String(txt || '').trim();
    if (!s) return '';
    var lines = s.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    var last = lines.length ? lines[lines.length - 1] : s;
    var stripped = last.replace(/^\d{4}[-/.年]?\d{1,2}[-/.月]?\d{1,2}日?[:：\s]*/, '').trim();
    return stripped || last;
  }

  function delayKindHint(key) {
    for (var i = 0; i < DELAY_KINDS.length; i++) if (DELAY_KINDS[i].key === key) return DELAY_KINDS[i].hint;
    return key === '未填原因' ? '记延期时没写原因，复盘时会缺证据' : '';
  }

  /**
   * 汇总三件事：延期了多久、延了几次、都是什么原因。
   * 老数据只有 delay_reason 没有日志，这里补一条「按当前逾期天数」的估算记录，
   * 免得老任务在统计里完全消失。
   */
  function computeDelayStats() {
    var rows = state.rows || [];
    var today = todayStr();
    var tasks = [];
    var events = [];

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var log = r.delayLog || [];
      var flagged = r.status === '已延期' || !!r.delay || log.length > 0 || (r.delayCount || 0) > 0;
      if (!flagged) continue;

      var overdueDays = 0;
      if (r.status !== '已完成' && r.due) {
        var d = diffDays(today, r.due);
        if (d > 0) overdueDays = d;
      }

      var totalDays = 0;
      for (var k = 0; k < log.length; k++) {
        var e = log[k] || {};
        var days = Number(e.days);
        if (!isFinite(days)) days = 0;
        totalDays += days;
        events.push({
          id: r.id, name: r.name || '未命名任务',
          at: e.at || '', days: days, reason: e.reason || '',
          kind: classifyDelay(e.reason), from: e.from || '', to: e.to || '',
          auto: e.auto === true || !e.at
        });
      }
      if (!log.length) {
        // 只有原因、没有逐次记录的任务：优先用「首次截止日 → 当前截止日」算顺延天数，
        // 没有首次截止日就退回当前逾期天数，免得老任务在统计里是 0
        var legacyDays = 0;
        if (r.firstDue && r.due) legacyDays = Math.max(diffDays(r.due, r.firstDue), 0);
        if (!legacyDays) legacyDays = overdueDays;
        events.push({
          id: r.id, name: r.name || '未命名任务',
          at: '', days: legacyDays, reason: briefReason(r.delay), 
          kind: classifyDelay(r.delay), from: r.firstDue || '', to: r.due || ''
        });
        totalDays = legacyDays;
      }

      var count = Math.max(log.length, Number(r.delayCount) || 0, 1);
      tasks.push({
        id: r.id, name: r.name || '未命名任务', status: r.status,
        count: count, totalDays: totalDays, overdueDays: overdueDays,
        reason: briefReason(r.delay || (log.length ? (log[log.length - 1] || {}).reason || '' : '')),
        kind: classifyDelay(r.delay || (log.length ? (log[log.length - 1] || {}).reason : ''))
      });
    }

    tasks.sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return b.totalDays - a.totalDays;
    });
    events.sort(function (a, b) {
      var ad = a.at || '', bd = b.at || '';
      if (ad !== bd) return ad < bd ? 1 : -1;
      return 0;
    });

    var byKind = {};
    var sumDays = 0;
    for (var m = 0; m < events.length; m++) {
      byKind[events[m].kind] = (byKind[events[m].kind] || 0) + 1;
      sumDays += events[m].days;
    }
    var kindList = [];
    for (var key in byKind) {
      if (Object.prototype.hasOwnProperty.call(byKind, key)) kindList.push({ key: key, count: byKind[key] });
    }
    kindList.sort(function (a, b) { return b.count - a.count; });

    var maxOverdue = 0, longest = null;
    for (var n = 0; n < tasks.length; n++) {
      if (tasks[n].overdueDays > maxOverdue) { maxOverdue = tasks[n].overdueDays; longest = tasks[n]; }
    }

    return {
      taskCount: tasks.length,
      eventCount: events.length,
      sumDays: sumDays,
      avgDays: events.length ? Math.round((sumDays / events.length) * 10) / 10 : 0,
      maxOverdue: maxOverdue,
      longest: longest,
      tasks: tasks,
      events: events,
      kinds: kindList
    };
  }

  function computeStats() {
    var byStatus = { '待办': 0, '进行中': 0, '已延期': 0, '已完成': 0 };
    var overdue = 0, delayedList = [];
    for (var i = 0; i < state.rows.length; i++) {
      var r = state.rows[i];
      if (byStatus[r.status] != null) byStatus[r.status]++;
      var c = classify(r);
      if (c.overdue) overdue++;
      if (r.status === '已延期' || (r.delay && r.delay.length)) delayedList.push(r);
    }
    var total = state.rows.length;
    var done = byStatus['已完成'];
    return {
      total: total, byStatus: byStatus, done: done, overdue: overdue,
      delayedCount: byStatus['已延期'], delayedList: delayedList,
      rate: total ? Math.round((done / total) * 100) : 0
    };
  }
  function recentDone(limit) {
    var out = [];
    for (var i = 0; i < state.rows.length; i++) {
      if (state.rows[i].status === '已完成') out.push(state.rows[i]);
    }
    out.sort(function (a, b) {
      var ad = a.done || '', bd = b.done || '';
      if (ad === bd) return 0;
      if (!ad) return 1;
      if (!bd) return -1;
      return ad < bd ? 1 : -1;
    });
    return out.slice(0, limit || 6);
  }

  /* ============ 数据层 ============ */
  function normalizeRow(raw) {
    return {
      id: raw._id || raw.id || ('r' + Math.random().toString(36).slice(2)),
      name: raw[FIELD.name] || '',
      status: raw[FIELD.status] || '待办',
      priority: raw[FIELD.priority] || 'P2 中',
      category: raw[FIELD.category] || '其他',
      due: toDateOnly(raw[FIELD.due]),
      delay: raw[FIELD.delay] || '',
      tags: raw[FIELD.tags] || '',
      done: raw[FIELD.done] || '',
      detail: raw[FIELD.detail] || '',
      images: parseAttachments(raw[FIELD.images]),
      nextAction: raw[FIELD.nextAction] || '',
      sourceIdea: raw[FIELD.sourceIdea] ? String(raw[FIELD.sourceIdea]) : '',
      delayCount: Number(raw[FIELD.delayCount]) || 0,
      delayLog: parseDelayLog(raw[FIELD.delayLog]),
      firstDue: toDateOnly(raw[FIELD.firstDue])
    };
  }
  function readLocal() {
    var txt = safeGet(LS_ROWS);
    if (!txt) return [];
    try {
      var arr = JSON.parse(txt);
      if (!arr || !arr.length) return [];
      var out = [];
      for (var i = 0; i < arr.length; i++) out.push(normalizeRow(arr[i]));
      return out;
    } catch (e) { return []; }
  }
  function writeLocal(rows) {
    var plain = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var o = { _id: r.id };
      o[FIELD.name] = r.name; o[FIELD.status] = r.status; o[FIELD.priority] = r.priority;
      o[FIELD.category] = r.category; o[FIELD.due] = r.due; o[FIELD.delay] = r.delay; o[FIELD.tags] = r.tags; o[FIELD.done] = r.done; o[FIELD.detail] = r.detail;
      o[FIELD.images] = r.images || [];
      o[FIELD.nextAction] = r.nextAction || ''; o[FIELD.sourceIdea] = r.sourceIdea || '';
      o[FIELD.delayCount] = r.delayCount || 0;
      o[FIELD.delayLog] = JSON.stringify(r.delayLog || []);
      o[FIELD.firstDue] = r.firstDue || '';
      plain.push(o);
    }
    safeSet(LS_ROWS, JSON.stringify(plain));
  }
  function optId(field, text) {
    if (OPT_ID[field] && OPT_ID[field][text]) return OPT_ID[field][text];
    return text;
  }
  function changesToProps(changes) {
    var props = {};
    for (var k in changes) {
      if (!Object.prototype.hasOwnProperty.call(changes, k)) continue;
      var field = FIELD[k];
      if (!field) continue;
      var type = FTYPE[k];
      var v = changes[k];
      if (type === 'select') props[field] = { select: optId(field, v) };
      else if (type === 'date') { if (v) props[field] = { date: v }; }
      else if (type === 'attachment') { if (v && v.length) props[field] = { attachment: v }; }
      else props[field] = { text: v == null ? '' : String(v) };
    }
    return props;
  }

  function setSync(s) {
    state.sync = s;
    var box = $('syncState');
    box.setAttribute('data-s', s);
    $('syncText').textContent = (s === 'synced' ? '已同步' : (s === 'syncing' ? '同步中' : '离线模式'));
  }

  /* ============ 主题（深色 / 浅色） ============ */
  function preferredTheme() {
    var saved = safeGet(LS_THEME);
    if (saved === 'dark' || saved === 'light') return saved;
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    } catch (e) {}
    return 'light';
  }
  function updateThemeBtn() {
    var b = $('themeToggle');
    if (!b) return;
    clear(b);
    var dark = state.theme === 'dark';
    b.appendChild(iconNode(dark ? 'sun' : 'moon', 16));
    b.appendChild(el('span', null, dark ? '浅色' : '深色'));
    b.setAttribute('aria-label', dark ? '切换到浅色模式' : '切换到深色模式');
    b.title = dark ? '切换到浅色模式' : '切换到深色模式';
  }
  function applyTheme(mode, persist) {
    state.theme = (mode === 'dark') ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', state.theme);
    if (persist) safeSet(LS_THEME, state.theme);
    updateThemeBtn();
  }

  function loadAll(cb) {
    var acc = [];
    function fetchPage(cursor, guard) {
      if (guard > 100) { cb(null, acc); return; }
      db.query({ databaseId: DATABASE_ID, pageSize: 200, startCursor: cursor })
        .then(function (r) {
          acc = acc.concat(r.results || []);
          var next = r.nextCursor;
          if (r.hasMore && next && next !== cursor && (r.results || []).length) fetchPage(next, guard + 1);
          else cb(null, acc);
        })
        .catch(function (err) {
          state.error = '云端数据加载失败，已切换到本机缓存，请检查网络后重试。';
          toast('数据加载失败，已使用本机缓存');
          cb(err, acc);
        });
    }
    fetchPage(undefined, 0);
  }

  function loadTasks(cb) {
    if (ONLINE) {
      setSync('syncing');
      loadAll(function (err, rows) {
        if (err) {
          state.error = '云端数据加载失败，已切换到本机缓存。';
          state.rows = readLocal();
        } else {
          state.error = '';
          state.rows = [];
          for (var i = 0; i < rows.length; i++) state.rows.push(normalizeRow(rows[i]));
          writeLocal(state.rows);
        }
        state.loading = false;
        setSync(state.error ? 'offline' : 'synced');
        cb();
      });
    } else {
      state.loading = false;
      state.rows = readLocal();
      setSync('offline');
      cb();
    }
  }

  function persistAdd(plain, cb) {
    if (ONLINE) {
      db.addRecord({ databaseId: DATABASE_ID, properties: changesToProps(plain) })
        .then(function () { cb(null); })
        .catch(function (err) { cb(err); });
    } else {
      var rows = readLocal();
      plain.id = 'l' + Date.now() + Math.random().toString(36).slice(2, 6);
      rows.push(plain);
      writeLocal(rows);
      cb(null);
    }
  }
  function persistUpdate(id, changes, cb) {
    if (ONLINE) {
      db.updateRecord({ databaseId: DATABASE_ID, recordId: id, properties: changesToProps(changes) })
        .then(function () { cb(null); })
        .catch(function (err) { cb(err); });
    } else {
      var rows = readLocal();
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].id === id) {
          for (var k in changes) {
            if (Object.prototype.hasOwnProperty.call(changes, k)) rows[i][k] = changes[k];
          }
        }
      }
      writeLocal(rows);
      cb(null);
    }
  }
  function persistDelete(id, cb) {
    if (ONLINE) {
      db.deleteRecord({ databaseId: DATABASE_ID, recordId: id })
        .then(function () { cb(null); })
        .catch(function (err) { cb(err); });
    } else {
      var rows = readLocal();
      var kept = [];
      for (var i = 0; i < rows.length; i++) if (rows[i].id !== id) kept.push(rows[i]);
      writeLocal(kept);
      cb(null);
    }
  }

  /* ============ 示例数据 ============ */
  function sampleTasks() {
    var t = todayStr();
    var mk = function (name, status, priority, category, due, delay, tags, done, detail) {
      return { name: name, status: status, priority: priority, category: category, due: due, delay: delay, tags: tags, done: done || '', detail: detail || '' };
    };
    return [
      mk('提交季度复盘报告', '待办', 'P0 紧急', '工作', t, '', '#汇报 #复盘', '', '## 汇报要点\n\n- 本季度**目标达成率** 92%\n- 需要同步：下季度资源申请\n\n> 详细数据见群文件'),
      mk('回复客户的确认邮件', '待办', 'P1 高', '工作', addDays(t, -1), '', '#沟通 #汇报', '', ''),
      mk('背 50 个雅思单词', '进行中', 'P2 中', '学习', t, '', '#学习 #每日', '', '今日词表：\n\n- abandon\n- benefit\n- curious'),
      mk('预约牙医复诊', '待办', 'P2 中', '生活', addDays(t, 3), '', '#生活 #健康', '', ''),
      mk('整理本月账单', '已延期', 'P3 低', '其他', addDays(t, -2), '上周出差耽误了，本周内补齐', '#生活 #记账', '', ''),
      mk('汇总上周会议纪要', '已完成', 'P2 中', '工作', addDays(t, -1), '', '#复盘', nowStamp(), '已归档到知识库。')
    ];
  }
  function seedSamples(cb) {
    var samples = sampleTasks();
    var ids = [];
    var idx = 0;
    function seedNext() {
      if (idx >= samples.length) { safeSet(LS_SEEDED, '1'); seedIds = ids; safeSet(LS_SEED_IDS, JSON.stringify(ids)); cb(); return; }
      var s = samples[idx++];
      if (ONLINE) {
        db.addRecord({ databaseId: DATABASE_ID, properties: changesToProps(s) })
          .then(function (res) {
            var rid = res && (res.id || res._id || (res.record && res.record._id));
            if (rid) ids.push(rid);
            seedNext();
          })
          .catch(function () { seedNext(); });
      } else {
        var rows = readLocal();
        s.id = 'l' + Date.now() + Math.random().toString(36).slice(2, 6);
        ids.push(s.id);
        rows.push(s);
        writeLocal(rows);
        seedNext();
      }
    }
    seedNext();
  }

  /* ============ 渲染层（彼此不互调，统一由 refreshAll 调度） ============ */
  function renderSyncBanner() {
    var ob = $('offlineBanner');
    if (state.error) {
      ob.hidden = false;
      $('offlineText').textContent = state.error;
    } else if (!ONLINE) {
      ob.hidden = false;
      $('offlineText').textContent = '离线模式：数据保存在本机浏览器，未同步到云端。';
    } else {
      ob.hidden = true;
    }
    var bb = $('backupBanner');
    if (bb && safeGet(LS_TIP) !== '1' && state.rows.length >= 30) {
      bb.hidden = false;
    } else if (bb) {
      bb.hidden = true;
    }
  }

  function taskMetaRow(row, c) {
    var meta = el('div', 'meta');
    if (row.category) meta.appendChild(catChip(row.category));
    if (row.priority) {
      var cls = 'badge' + (row.priority.indexOf('P0') === 0 ? ' red' : (row.priority.indexOf('P1') === 0 ? ' amber' : ''));
      meta.appendChild(el('span', cls, row.priority));
    }
    var statusCls = 'badge' + (row.status === '已完成' ? ' green' : (row.status === '已延期' ? ' amber' : (row.status === '进行中' ? ' blue' : '')));
    meta.appendChild(el('span', statusCls, row.status));
    if (row.status === '已完成' && row.done) {
      meta.appendChild(el('span', 'donetime', '完成于 ' + fmtDone(row.done)));
    }
    if (c.due) {
      var p = prettyDue(c.due);
      meta.appendChild(el('span', 'due ' + p.tone, p.text + '（' + c.due.slice(5) + '）'));
    } else {
      meta.appendChild(el('span', 'due', '未设截止日期'));
    }
    var tagArr = parseTags(row.tags);
    for (var t = 0; t < tagArr.length; t++) {
      var tagChip = el('button', 'tagchip btnlike', '#' + tagArr[t]);
      tagChip.type = 'button';
      tagChip.setAttribute('data-action', 'tag');
      tagChip.setAttribute('data-tag', tagArr[t]);
      tagChip.title = '按此标签查看';
      paintTag(tagChip, tagArr[t], state.filterTag === tagArr[t]);
      meta.appendChild(tagChip);
    }
    if (row.detail) {
      var dchip = el('button', 'docchip');
      dchip.type = 'button';
      dchip.setAttribute('data-action', 'detail');
      dchip.setAttribute('data-id', row.id);
      dchip.title = '查看 / 编辑详情';
      dchip.appendChild(iconNode('doc', 13));
      dchip.appendChild(el('span', null, '详情'));
      meta.appendChild(dchip);
    }
    return meta;
  }

  function barClsFor(row, c) {
    if (row.status === '已完成') return 'green';
    if (c.overdue) return 'red';
    if (row.status === '已延期') return 'amber';
    if (row.status === '进行中') return 'blue';
    return 'gray';
  }

  /* 任务行操作按钮（列表与日历共用） */
  function taskActionsNode(row) {
    var acts = el('div', 'acts');
    if (row.status !== '已完成') {
      var bDone = el('button', 'btn small');
      bDone.type = 'button';
      bDone.title = '完成';
      bDone.setAttribute('data-action', 'complete');
      bDone.setAttribute('data-id', row.id);
      bDone.appendChild(iconNode('check', 15));
      bDone.appendChild(el('span', null, '完成'));
      acts.appendChild(bDone);
    } else {
      var bReopen = el('button', 'btn small');
      bReopen.type = 'button';
      bReopen.title = '重开';
      bReopen.setAttribute('data-action', 'start');
      bReopen.setAttribute('data-id', row.id);
      bReopen.appendChild(iconNode('refresh', 15));
      bReopen.appendChild(el('span', null, '重开'));
      acts.appendChild(bReopen);
    }
    var bEdit = el('button', 'btn small');
    bEdit.type = 'button';
    bEdit.title = '编辑';
    bEdit.setAttribute('data-action', 'edit');
    bEdit.setAttribute('data-id', row.id);
    bEdit.appendChild(iconNode('edit', 15));
    bEdit.appendChild(el('span', null, '编辑'));
    acts.appendChild(bEdit);

    var bDel = el('button', 'btn small');
    bDel.type = 'button';
    bDel.title = '删除';
    bDel.setAttribute('data-action', 'delete');
    bDel.setAttribute('data-id', row.id);
    bDel.style.color = 'var(--red)';
    bDel.appendChild(iconNode('trash', 15));
    bDel.appendChild(el('span', null, '删除'));
    acts.appendChild(bDel);
    return acts;
  }

  function renderToday() {
    var wrap = $('todayList');
    clear(wrap);
    var items = todayItems();
    $('todayCount').textContent = String(items.length);
    if (state.loading) {
      wrap.appendChild(el('div', 'empty', '正在加载任务…'));
      return;
    }
    if (!items.length) {
      var emp = el('div', 'empty');
      emp.appendChild(iconNode('check', 26));
      emp.appendChild(el('div', null, '今天没有需要跟进的任务，保持节奏就好。'));
      wrap.appendChild(emp);
      return;
    }
    for (var i = 0; i < items.length; i++) {
      var row = items[i].row, c = items[i].c;
      var box = el('div', 'titem ' + c.tier);
      var body = el('div', 'body');
      var tName = markDb(el('div', 'name clickable', row.name));
      tName.setAttribute('data-action', 'detail');
      tName.setAttribute('data-id', row.id);
      tName.title = '点击查看 / 编辑详情';
      body.appendChild(tName);
      if (row.detail) body.appendChild(el('div', 'dpreview', mdPlain(row.detail)));
      body.appendChild(taskMetaRow(row, c));
      if (row.delay) {
        body.appendChild(el('div', 'reason', '延期原因：' + row.delay));
      }
      box.appendChild(body);

      var acts = el('div', 'acts');
      var bDone = el('button', 'btn small primary');
      bDone.type = 'button';
      bDone.title = '完成';
      bDone.setAttribute('data-action', 'complete');
      bDone.setAttribute('data-id', row.id);
      bDone.appendChild(iconNode('check', 15));
      bDone.appendChild(el('span', null, '完成'));
      acts.appendChild(bDone);

      var bDelay = el('button', 'btn small');
      bDelay.type = 'button';
      bDelay.title = '记录延期';
      bDelay.setAttribute('data-action', 'delay');
      bDelay.setAttribute('data-id', row.id);
      bDelay.appendChild(iconNode('flag', 15));
      bDelay.appendChild(el('span', null, '记录延期'));
      acts.appendChild(bDelay);

      if (c.days != null && c.days < 0) {
        var bMove = el('button', 'btn small');
        bMove.type = 'button';
        bMove.title = '顺延到今天';
        bMove.setAttribute('data-action', 'postpone');
        bMove.setAttribute('data-id', row.id);
        bMove.appendChild(iconNode('forward', 15));
        bMove.appendChild(el('span', null, '顺延到今天'));
        acts.appendChild(bMove);
      }

      var bEdit = el('button', 'btn small');
      bEdit.type = 'button';
      bEdit.title = '编辑';
      bEdit.setAttribute('data-action', 'edit');
      bEdit.setAttribute('data-id', row.id);
      bEdit.appendChild(iconNode('edit', 15));
      bEdit.appendChild(el('span', null, '编辑'));
      acts.appendChild(bEdit);

      box.appendChild(acts);
      wrap.appendChild(box);
    }
  }

  function renderList() {
    var wrap = $('taskList');
    var tf = $('tagFilter');
    if (tf) {
      var keepTag = state.filterTag;
      clear(tf);
      var allTagOpt = el('option', null, '全部标签'); allTagOpt.value = 'all'; tf.appendChild(allTagOpt);
      var tagList = allTags(), tagExists = false;
      for (var t1 = 0; t1 < tagList.length; t1++) {
        var tOpt = el('option', null, '#' + tagList[t1].tag + '（' + tagList[t1].count + '）');
        tOpt.value = tagList[t1].tag;
        if (tagList[t1].tag === keepTag) tagExists = true;
        tf.appendChild(tOpt);
      }
      if (keepTag !== 'all' && !tagExists) { state.filterTag = 'all'; keepTag = 'all'; }
      tf.value = keepTag;
    }
    clear(wrap);
    var rows = filteredRows();
    $('listCount').textContent = '共 ' + rows.length + ' 条';
    if (state.loading) {
      wrap.appendChild(el('div', 'empty', '正在加载任务…'));
      return;
    }
    if (!rows.length) {
      var emp = el('div', 'empty');
      emp.appendChild(iconNode('list', 26));
      emp.appendChild(el('div', null, state.rows.length ? '没有符合筛选条件，换个条件试试。' : '暂无任务，先在上方添加一条吧。'));
      wrap.appendChild(emp);
      return;
    }
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var c = classify(row);
      var barCls = 'dot-bar ' + barClsFor(row, c);

      var box = el('div', 'litem');
      box.appendChild(el('div', barCls));
      var body = el('div', 'body');
      var nameEl = markDb(el('div', 'name clickable' + (row.status === '已完成' ? ' isdone' : ''), row.name));
      nameEl.setAttribute('data-action', 'detail');
      nameEl.setAttribute('data-id', row.id);
      nameEl.title = '点击查看 / 编辑详情';
      body.appendChild(nameEl);
      body.appendChild(taskMetaRow(row, c));
      // 「下一步动作」放在清单上，拆完就不必再点开详情想「到底从哪下手」
      if (row.nextAction && row.status !== '已完成') {
        var nx = el('div', 'nextAct');
        nx.appendChild(iconNode('forward', 12));
        nx.appendChild(el('span', null, row.nextAction));
        body.appendChild(nx);
      }
      if (row.delay) body.appendChild(el('div', 'reason', '延期原因：' + row.delay));
      box.appendChild(body);

      box.appendChild(taskActionsNode(row));
      wrap.appendChild(box);
    }
  }

  /* ============ 日历视图（只读数据，不调其他渲染函数） ============ */
  function calTone(row) {
    var c = classify(row);
    if (c.done) return 'done';
    if (c.overdue) return 'overdue';
    if (c.dueToday) return 'today';
    return '';
  }
  function calChipCls(row) { var t = calTone(row); return t ? ' ' + t : ''; }
  function calDotCls(row) {
    var t = calTone(row);
    if (t === 'done') return ' green';
    if (t === 'overdue') return ' red';
    if (t === 'today') return ' amber';
    return '';
  }
  function dueMap() {
    var rows = calRows();
    var map = {}, noDue = 0;
    for (var i = 0; i < rows.length; i++) {
      var d = toDateOnly(rows[i].due);
      if (!d) { noDue++; continue; }
      if (!map[d]) map[d] = [];
      map[d].push(rows[i]);
    }
    return { map: map, noDue: noDue };
  }
  function dayTasks(ds) {
    var rows = calRows(), out = [];
    for (var i = 0; i < rows.length; i++) if (toDateOnly(rows[i].due) === ds) out.push(rows[i]);
    return out;
  }
  function filtersActive() {
    return state.filterCategory !== 'all' || state.filterTag !== 'all' || !!state.keyword.trim();
  }

  function renderCalendar() {
    var grid = $('calGrid');
    if (!grid) return;
    var y = state.calY, m = state.calM;
    $('calTitle').textContent = y + '年' + (m + 1) + '月';
    var built = dueMap();
    var map = built.map, today = todayStr();

    var dowName = ['一', '二', '三', '四', '五', '六', '日'];
    clear(grid);
    for (var w = 0; w < 7; w++) grid.appendChild(el('div', 'calDow', dowName[w]));

    var first = firstDowOfMonth(y, m);
    var dim = daysInMonth(y, m);
    var total = Math.ceil((first + dim) / 7) * 7;
    var prevY = (m === 0) ? y - 1 : y, prevM = (m === 0) ? 11 : m - 1;
    var nextY = (m === 11) ? y + 1 : y, nextM = (m === 11) ? 0 : m + 1;
    var prevDim = daysInMonth(prevY, prevM);
    var monthCount = 0;

    for (var i = 0; i < total; i++) {
      var dayNum, cy = y, cm = m, out = false;
      if (i < first) { cy = prevY; cm = prevM; dayNum = prevDim - (first - 1 - i); out = true; }
      else if (i >= first + dim) { cy = nextY; cm = nextM; dayNum = i - (first + dim) + 1; out = true; }
      else { dayNum = i - first + 1; }
      var ds = cy + '-' + pad(cm + 1) + '-' + pad(dayNum);
      var tasks = map[ds] || [];
      if (!out) monthCount += tasks.length;

      var cls = 'calCell' + (out ? ' out' : '') + (ds === today ? ' today' : '') + (ds === state.calSelected ? ' sel' : '');
      var cell = el('button', cls);
      cell.type = 'button';
      cell.setAttribute('data-action', 'calDay');
      cell.setAttribute('data-date', ds);

      var numRow = el('div', 'dnum');
      numRow.appendChild(el('span', 'dnumTxt', String(dayNum)));
      if (tasks.length) numRow.appendChild(el('span', 'calCnt', String(tasks.length)));
      cell.appendChild(numRow);

      var chipBox = el('div', 'calChips');
      var maxChip = 3;
      for (var k = 0; k < tasks.length && k < maxChip; k++) {
        var chip = el('span', 'calChip' + calChipCls(tasks[k]), tasks[k].name);
        chip.title = tasks[k].name;
        chipBox.appendChild(chip);
      }
      if (tasks.length > maxChip) chipBox.appendChild(el('span', 'calMore', '+' + (tasks.length - maxChip)));
      cell.appendChild(chipBox);

      var dots = el('div', 'calDots');
      for (var q = 0; q < tasks.length && q < 5; q++) dots.appendChild(el('span', 'calDot' + calDotCls(tasks[q])));
      cell.appendChild(dots);

      grid.appendChild(cell);
    }

    $('calSum').textContent = '本月 ' + monthCount + ' 项' + (filtersActive() ? '（已筛选）' : '');
    var note = $('calNote');
    clear(note);
    if (built.noDue) {
      note.appendChild(el('span', 'hint', '另有 ' + built.noDue + ' 项任务未设截止日期，不在日历中显示（可在「编辑」里补上日期）。'));
    }
  }

  function renderDayPanel() {
    var wrap = $('calDayPanel');
    if (!wrap) return;
    clear(wrap);
    var ds = state.calSelected;
    if (!ds) { wrap.appendChild(el('div', 'hint', '点击日历里的任意日期，查看当天的任务。')); return; }
    var tasks = dayTasks(ds);
    var head = el('div', 'calDayHead');
    var title = cnDate(ds) + ' · 周' + weekdayZh(ds) + (ds === todayStr() ? '（今天）' : '');
    head.appendChild(el('span', 'calDayTitle', title));
    head.appendChild(markDb(el('span', 'badge' + (tasks.length ? ' blue' : ''), tasks.length + ' 项')));
    var btn = el('button', 'btn small');
    btn.type = 'button';
    btn.setAttribute('data-action', 'calSetDue');
    btn.setAttribute('data-date', ds);
    btn.appendChild(iconNode('plus', 15));
    btn.appendChild(el('span', null, '新任务排到这天'));
    head.appendChild(btn);
    wrap.appendChild(head);

    if (!tasks.length) {
      var emp = el('div', 'empty');
      emp.appendChild(iconNode('calendar', 24));
      emp.appendChild(el('div', null, '这天还没有任务，可以点右上角把新任务排到这天。'));
      wrap.appendChild(emp);
      return;
    }
    var list = el('div', 'dayList');
    for (var i = 0; i < tasks.length; i++) {
      var r = tasks[i], c = classify(r);
      var box = el('div', 'litem');
      box.appendChild(el('div', 'dot-bar ' + barClsFor(r, c)));
      var body = el('div', 'body');
      var dName = markDb(el('div', 'name clickable' + (r.status === '已完成' ? ' isdone' : ''), r.name));
      dName.setAttribute('data-action', 'detail');
      dName.setAttribute('data-id', r.id);
      dName.title = '点击查看 / 编辑详情';
      body.appendChild(dName);
      body.appendChild(taskMetaRow(r, c));
      if (r.delay) body.appendChild(el('div', 'reason', '延期原因：' + r.delay));
      box.appendChild(body);
      box.appendChild(taskActionsNode(r));
      list.appendChild(box);
    }
    wrap.appendChild(list);
  }

  function applyView() {
    var cal = $('calendarWrap'), list = $('taskList');
    var isCal = state.view === 'calendar';
    if (cal) cal.hidden = !isCal;
    if (list) list.hidden = isCal;
    var tabs = document.querySelectorAll('#viewTabs .vtab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].setAttribute('aria-selected', tabs[i].getAttribute('data-view') === state.view ? 'true' : 'false');
    }
  }

  function renderStats() {
    var s = computeStats();
    $('statTotal').textContent = String(s.total);
    $('statDone').textContent = String(s.done);
    $('statDelayed').textContent = String(s.delayedCount);
    $('statOverdue').textContent = String(s.overdue);
    $('statRate').textContent = String(s.rate);

    var r = 42, circ = 2 * Math.PI * r;
    var off = circ * (1 - s.rate / 100);
    var ring = $('ringSvg');
    clear(ring);
    var bg = document.createElementNS(SVGNS, 'circle');
    bg.setAttribute('cx', '50'); bg.setAttribute('cy', '50'); bg.setAttribute('r', String(r));
    bg.setAttribute('fill', 'none'); bg.style.stroke = 'var(--line)'; bg.setAttribute('stroke-width', '10');
    ring.appendChild(bg);
    var fg = document.createElementNS(SVGNS, 'circle');
    fg.setAttribute('cx', '50'); fg.setAttribute('cy', '50'); fg.setAttribute('r', String(r));
    fg.setAttribute('fill', 'none'); fg.style.stroke = 'var(--primary)'; fg.setAttribute('stroke-width', '10');
    fg.setAttribute('stroke-linecap', 'round');
    fg.setAttribute('stroke-dasharray', String(circ));
    fg.setAttribute('stroke-dashoffset', String(off));
    fg.setAttribute('transform', 'rotate(-90 50 50)');
    ring.appendChild(fg);

    var bars = $('statusBars');
    clear(bars);
    var colorMap = { '待办': 'gray', '进行中': 'blue', '已延期': 'amber', '已完成': 'green' };
    for (var i = 0; i < STATUS_LIST.length; i++) {
      var st = STATUS_LIST[i];
      var cnt = s.byStatus[st] || 0;
      var pct = s.total ? Math.round((cnt / s.total) * 100) : 0;
      var rowEl = el('div', 'barRow');
      rowEl.appendChild(el('div', null, st));
      var track = el('div', 'barTrack');
      var fill = el('div', 'barFill ' + colorMap[st]);
      fill.style.width = pct + '%';
      track.appendChild(fill);
      rowEl.appendChild(track);
      rowEl.appendChild(markDb(el('div', 'barNum', String(cnt))));
      bars.appendChild(rowEl);
    }

    renderDelayPanel();

    var doneBox = $('doneList');
    if (doneBox) {
      clear(doneBox);
      var doneRows = recentDone(6);
      if (!doneRows.length) {
        doneBox.appendChild(el('div', 'empty', '还没有已完成的任务；完成后会自动记录完成时间。'));
      } else {
        for (var dj = 0; dj < doneRows.length; dj++) {
          var rd = doneRows[dj];
          var ditem = el('div', 'doneItem');
          ditem.appendChild(markDb(el('div', 't', rd.name)));
          ditem.appendChild(el('div', 'm', rd.done ? ('完成于 ' + fmtDone(rd.done)) : '未记录完成时间（完成于本功能上线前）'));
          doneBox.appendChild(ditem);
        }
      }
    }

    var cloud = $('tagCloud');
    if (cloud) {
      clear(cloud);
      var tagCloudList = allTags();
      if (!tagCloudList.length) {
        cloud.appendChild(el('div', 'empty', '还没有标签，新建任务时可以顺手打上标签。'));
      } else {
        for (var ti = 0; ti < tagCloudList.length; ti++) {
          var tb = el('button', 'tagCloud');
          tb.type = 'button';
          tb.setAttribute('data-action', 'tag');
          tb.setAttribute('data-tag', tagCloudList[ti].tag);
          tb.appendChild(el('span', null, '#' + tagCloudList[ti].tag));
          tb.appendChild(markDb(el('span', 'n', String(tagCloudList[ti].count))));
          paintTag(tb, tagCloudList[ti].tag, state.filterTag === tagCloudList[ti].tag);
          cloud.appendChild(tb);
        }
      }
    }
  }

  /** AI 复盘：统计在任务台算，生成交给主应用（tasks-page 不是模块，拿不到 ai） */
  function openDelayRetro() {
    var d = computeDelayStats();
    if (!d.eventCount) { toast('还没有延期记录，先去任务上点「记录延期」'); return; }
    var retro = window.__zhiqiDelayRetro__;
    if (typeof retro !== 'function') { toast('AI 复盘暂不可用', 'err'); return; }

    var out = el('div', 'dretro');
    out.appendChild(el('div', 'dretro-text', '正在看你的延期数据…'));
    openModal('延期复盘', [out], [{ label: '关闭', primary: true, onClick: closeModal }]);

    retro({
      summary: { taskCount: d.taskCount, eventCount: d.eventCount, sumDays: d.sumDays, avgDays: d.avgDays, maxOverdue: d.maxOverdue },
      kinds: d.kinds,
      tasks: d.tasks
    }, {
      onDelta: function (txt) {
        var box = $('modal').querySelector('.dretro-text');
        if (box) box.textContent = txt;
      },
      onDone: function (txt) {
        var box = $('modal').querySelector('.dretro-text');
        if (box) box.textContent = txt;
      },
      onError: function (msg) {
        var box = $('modal').querySelector('.dretro-text');
        if (box) box.textContent = msg || 'AI 复盘失败，请稍后再试';
      }
    });
  }

  function renderDelayPanel() {
    var d = computeDelayStats();

    var box = $('delayStats');
    if (box) {
      clear(box);
      var cells = [
        { k: '延期任务', v: d.taskCount, u: '项' },
        { k: '累计延期', v: d.eventCount, u: '次' },
        { k: '累计顺延', v: d.sumDays, u: '天' },
        { k: '平均每次', v: d.avgDays, u: '天' },
        { k: '最长逾期', v: d.maxOverdue, u: '天' }
      ];
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        var cell = el('div', 'dstat');
        cell.appendChild(el('div', 'dk', c.k));
        var v = el('div', 'dv');
        v.appendChild(markDb(el('b', null, String(c.v))));
        v.appendChild(el('small', null, c.u));
        cell.appendChild(v);
        box.appendChild(cell);
      }
    }

    var kindBox = $('delayKinds');
    if (kindBox) {
      clear(kindBox);
      if (!d.kinds.length) {
        kindBox.appendChild(el('div', 'empty', '暂无延期记录，节奏保持得不错。'));
      } else {
        var max = d.kinds[0].count || 1;
        for (var ki = 0; ki < d.kinds.length; ki++) {
          var k = d.kinds[ki];
          var row = el('div', 'dkind');
          var hd = el('div', 'dkind-hd');
          hd.appendChild(el('span', 'dkind-name', k.key));
          hd.appendChild(markDb(el('span', 'dkind-num', k.count + ' 次')));
          row.appendChild(hd);
          var track = el('div', 'barTrack');
          var fill = el('div', 'barFill amber');
          fill.style.width = Math.round((k.count / max) * 100) + '%';
          track.appendChild(fill);
          row.appendChild(track);
          var hint = delayKindHint(k.key);
          if (hint) row.appendChild(el('div', 'dkind-hint', hint));
          kindBox.appendChild(row);
        }
      }
    }

    var topBox = $('delayTop');
    if (topBox) {
      clear(topBox);
      if (!d.tasks.length) {
        topBox.appendChild(el('div', 'empty', '还没有延期任务。'));
      } else {
        for (var ti = 0; ti < d.tasks.length && ti < 5; ti++) {
          var t = d.tasks[ti];
          var it = el('button', 'dtop');
          it.type = 'button';
          it.setAttribute('data-action', 'detail');
          it.setAttribute('data-id', t.id);
          it.title = '点击查看 / 编辑任务详情';
          it.appendChild(markDb(el('div', 'dtop-name', t.name)));
          var bits = ['延期 ' + t.count + ' 次', '累计顺延 ' + t.totalDays + ' 天'];
          if (t.overdueDays) bits.push('当前逾期 ' + t.overdueDays + ' 天');
          it.appendChild(el('div', 'dtop-meta', bits.join(' · ')));
          var rline = el('div', 'dtop-reason');
          rline.appendChild(el('span', 'dkind-chip', t.kind));
          rline.appendChild(el('span', null, t.reason || '未填原因'));
          it.appendChild(rline);
          topBox.appendChild(it);
        }
      }
    }

    var evBox = $('delayEvents');
    if (evBox) {
      clear(evBox);
      if (!d.events.length) {
        evBox.appendChild(el('div', 'empty', '还没有逐次记录；每次点任务上的「记录延期」都会记一笔。'));
      } else {
        var shown = Math.min(d.events.length, 8);
        for (var ei = 0; ei < shown; ei++) {
          var e = d.events[ei];
          var ev = el('button', 'dev');
          ev.type = 'button';
          ev.setAttribute('data-action', 'detail');
          ev.setAttribute('data-id', e.id);
          ev.title = '点击查看 / 编辑任务详情';
          ev.appendChild(markDb(el('div', 'dev-name', e.name)));
          var mbits = [];
          if (e.at) mbits.push(e.at);
          mbits.push(e.days ? ('顺延 ' + e.days + ' 天') : '顺延 0 天');
          if (e.auto) mbits.push('自动记录');
          if (e.from && e.to) mbits.push(e.from + ' → ' + e.to);
          ev.appendChild(el('div', 'dev-meta', mbits.join(' · ')));
          var rl = el('div', 'dev-reason');
          rl.appendChild(el('span', 'dkind-chip', e.kind));
          rl.appendChild(el('span', null, e.reason || '未填原因'));
          ev.appendChild(rl);
          evBox.appendChild(ev);
        }
        if (d.events.length > shown) {
          evBox.appendChild(el('div', 'empty', '仅显示最近 ' + shown + ' 条，共 ' + d.events.length + ' 条。'));
        }
      }
    }
  }

  function renderTagSuggest() {
    var wrap = $('tagSuggest');
    if (!wrap) return;
    clear(wrap);
    var tags = allTags();
    if (!tags.length) {
      wrap.appendChild(el('span', 'hint', '还没有标签，直接输入即可创建，例如：复盘 汇报'));
      return;
    }
    wrap.appendChild(el('span', 'hint', '常用标签：'));
    var picked = parseTags($('f_tags').value);
    for (var i = 0; i < tags.length && i < 10; i++) {
      var on = picked.indexOf(tags[i].tag) !== -1;
      var chip = el('button', 'tagchip btnlike', '#' + tags[i].tag);
      chip.type = 'button';
      chip.setAttribute('data-action', 'sugtag');
      chip.setAttribute('data-tag', tags[i].tag);
      paintTag(chip, tags[i].tag, on);
      wrap.appendChild(chip);
    }
  }

  function refreshAll() {
    renderSyncBanner();
    renderToday();
    renderList();
    renderCalendar();
    renderDayPanel();
    renderStats();
    renderTagSuggest();
    applyView();
    // 合并进主应用后，让侧栏的「任务」计数与这里保持一致
    if (typeof window.__zhiqiTaskStats === 'function') window.__zhiqiTaskStats();
  }

  /* ============ 弹窗 ============ */
  function openModal(title, bodyNodes, buttons) {
    var modal = $('modal');
    clear(modal);
    var hd = el('div', 'mhd');
    hd.appendChild(el('h3', null, title));
    var closeBtn = el('button', 'btn small ghost');
    closeBtn.setAttribute('data-action', 'closeModal');
    closeBtn.appendChild(iconNode('x', 16));
    hd.appendChild(closeBtn);
    modal.appendChild(hd);

    var bd = el('div', 'mbd');
    for (var i = 0; i < bodyNodes.length; i++) bd.appendChild(bodyNodes[i]);
    modal.appendChild(bd);

    var ft = el('div', 'mft');
    for (var j = 0; j < buttons.length; j++) {
      var b = buttons[j];
      var btn = el('button', 'btn' + (b.primary ? ' primary' : (b.danger ? ' danger' : '')));
      btn.textContent = b.label;
      btn.onclick = b.onClick;
      ft.appendChild(btn);
    }
    modal.appendChild(ft);
    $('mask').hidden = false;
  }
  function closeModal() {
    closeSlashMenu();
    hideImageViewer();
    detailUI = null;
    $('mask').hidden = true;
    var m = $('modal'); if (m) m.classList.remove('wide');
  }

  function fieldBlock(labelText, inputEl) {
    var wrap = el('div', 'field');
    var lab = el('label', null, labelText);
    wrap.appendChild(lab);
    wrap.appendChild(inputEl);
    return wrap;
  }

  function findRow(id) {
    for (var i = 0; i < state.rows.length; i++) if (state.rows[i].id === id) return state.rows[i];
    return null;
  }

  /**
   * 自动记录延期天数：只要截止日期被挪后，就生成一条带天数的延期记录。
   * 天数 = 新截止日 − 原截止日，全自动算好，不用手填。
   * opts.force=true 时即使天数不变/提前也记一笔（用户主动点「记录延期」时用）。
   * @returns {{patch:Object, days:number, count:number}|null} null = 不构成延期
   */
  function buildDelayPatch(row, to, reason, opts) {
    opts = opts || {};
    if (!row) return null;
    var from = toDateOnly(row.due) || '';
    var next = toDateOnly(to) || '';
    if (!next) return null;
    var days = (from && next) ? diffDays(next, from) : 0;
    if (!opts.force) {
      if (!from || days <= 0) return null; // 首次设日期 / 提前 / 没变，都不算延期
    }
    if (days < 0) days = 0;
    var log = (row.delayLog || []).slice();
    log.push({
      at: todayStr(),
      reason: String(reason == null ? '' : reason).trim(),
      from: from,
      to: next,
      days: days,
      auto: opts.manual !== true
    });
    var patch = {
      due: next,
      delayLog: JSON.stringify(log),
      delayCount: log.length,
      firstDue: row.firstDue || from || next
    };
    if (row.status !== '已完成') {
      patch.status = '已延期';
      patch.done = ''; // 重新变成未完成状态，清掉旧的完成时间
    }
    if (reason) patch.delay = reason;
    return { patch: patch, days: days, count: log.length };
  }

  function openDelayModal(id) {
    var row = findRow(id);
    if (!row) return;
    var today = todayStr();
    var oldDue = toDateOnly(row.due) || '';
    // 已经过期的任务默认顺延到今天，没过期的沿用原日期（用户也能改成任意一天）
    var suggestTo = (oldDue && diffDays(oldDue, today) < 0) ? today : (oldDue || addDays(today, 1));

    var ta = document.createElement('textarea');
    ta.rows = 3;
    ta.placeholder = '例如：等客户回邮件 / 被临时会议占用 / 低估了工作量…写清楚，复盘才有用';
    ta.value = row.delay || '';
    ta.id = 'delay_input';

    var quickWrap = el('div', 'dquick');
    var quickList = ['等待他人反馈', '临时插入紧急事项', '需求或方案变更', '时间预估不足', '状态不好 / 拖延了', '资料不齐 / 卡住了'];
    for (var qi = 0; qi < quickList.length; qi++) {
      (function (txt) {
        var b = el('button', 'dquick-btn', txt);
        b.type = 'button';
        b.setAttribute('data-action', 'delay-quick');
        b.onclick = function () {
          ta.value = txt;
          ta.focus();
        };
        quickWrap.appendChild(b);
      })(quickList[qi]);
    }

    var dueInput = document.createElement('input');
    dueInput.type = 'date';
    dueInput.id = 'delay_due';
    dueInput.value = suggestTo;

    var preview = el('div', 'dpreview', '');
    var refreshPreview = function () {
      var to = toDateOnly(dueInput.value) || '';
      var days = (oldDue && to) ? diffDays(to, oldDue) : 0;
      preview.textContent = oldDue
        ? (days > 0 ? `原定 ${oldDue} → 改到 ${to}，本次顺延 ${days} 天（自动记录）` : `原定 ${oldDue} → 改到 ${to}`)
        : `原任务没有截止日期，将设为 ${to}`;
    };
    dueInput.onchange = refreshPreview;
    refreshPreview();

    var nodes = [
      fieldBlock('延期原因（写清楚，复盘才归类得准）', ta),
      quickWrap,
      fieldBlock('新的截止日期', dueInput),
      preview,
      el('div', 'hint', '天数会按「新截止日 − 原截止日」自动算好并累加，不用自己填；也可以直接改上面的日期，同样会自动记一笔。')
    ];

    openModal('记录延期', nodes, [
      { label: '取消', onClick: closeModal },
      {
        label: '确认延期', primary: true, onClick: function () {
          var reason = ta.value.trim();
          var to = toDateOnly(dueInput.value) || suggestTo;
          var built = buildDelayPatch(row, to, reason, { force: true, manual: true });
          if (!built) { toast('日期无效，请重新选一个截止日'); return; }
          doUpdate(id, built.patch, built.count > 1
            ? `已记录第 ${built.count} 次延期，本次顺延 ${built.days} 天`
            : '已记录延期，自动记下 ' + built.days + ' 天');
        }
      }
    ]);
    setTimeout(function () { ta.focus(); }, 40);
  }

  /* ============ 附件（图片）数据工具 ============ */
  function normalizeAttachment(a) {
    if (!a) return null;
    if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { return null; } }
    if (!a || typeof a !== 'object') return null;
    var id = a.attachmentId || a.id || '';
    if (!id) return null;
    return {
      attachmentId: String(id),
      name: a.name || '图片',
      fileType: a.fileType || '',
      fileSize: a.fileSize || 0,
      mediaType: a.mediaType || 'image',
      width: a.width || 0,
      height: a.height || 0
    };
  }
  function parseAttachments(v) {
    var out = [];
    if (!v) return out;
    var isArr = Object.prototype.toString.call(v) === '[object Array]';
    var list = null;
    if (isArr) list = v;
    else if (typeof v === 'object' && Object.prototype.toString.call(v.attachment) === '[object Array]') list = v.attachment;
    else if (typeof v === 'object' && (v.attachmentId || v.id)) list = [v];
    if (!list) return out;
    for (var i = 0; i < list.length; i++) {
      var n = normalizeAttachment(list[i]);
      if (n) out.push(n);
    }
    return out;
  }
  /* 只保留仍被详情文本引用的附件，避免越存越多 */
  function mergeAttachments(existing, pending, used) {
    var all = (existing || []).concat(pending || []);
    var out = [], seen = {};
    for (var i = 0; i < all.length; i++) {
      var a = all[i];
      if (!a || !a.attachmentId) continue;
      if (!used[a.attachmentId]) continue;
      if (seen[a.attachmentId]) continue;
      seen[a.attachmentId] = 1;
      out.push(a);
    }
    return out;
  }
  function attIdsInText(text) {
    var out = {}, s = String(text == null ? '' : text);
    var re = new RegExp('!\\[[^\\]]*\\]\\(att:([A-Za-z0-9_-]+)\\)', 'g');
    var m;
    while ((m = re.exec(s))) out[m[1]] = 1;
    return out;
  }

  /* ============ 详情图片：解析与渲染 ============ */
  function resolveDetailImageUrl(id) {
    if (!id) return Promise.resolve('');
    if (urlCache[id]) return Promise.resolve(urlCache[id]);
    if (!ONLINE) return Promise.resolve('');
    return db.getPreviewUrl({ nodeId: DATABASE_ID, attachmentId: id }).then(function (res) {
      var url = (res && (res.thumbnailUrl || res.previewUrl)) || '';
      if (url) urlCache[id] = url;
      return url;
    }).catch(function () {
      /* 取不到地址时返回空串，由 mountDetailImage 标记为「加载失败」占位 */
      return '';
    });
  }
  /* 渲染后才解析地址：渲染函数保持同步纯函数，网络解析独立在此 */
  function mountDetailImage(img) {
    var id = img.getAttribute('data-att');
    if (!id) return;
    img.classList.add('loading');
    resolveDetailImageUrl(id).then(function (url) {
      if (!url) { img.classList.remove('loading'); img.classList.add('failed'); return; }
      img.onload = function () { img.classList.remove('loading'); };
      img.onerror = function () {
        if (img.getAttribute('data-retried') === '1') { img.classList.add('failed'); return; }
        img.setAttribute('data-retried', '1');
        urlCache[id] = '';
        mountDetailImage(img);
      };
      img.classList.add('zoomimg');
      img.src = url;
    }, function () {
      img.classList.remove('loading');
      img.classList.add('failed');
    });
  }
  function hydrateDetailImages(container) {
    if (!container) return;
    var imgs = container.querySelectorAll('img.mdimg[data-att]');
    for (var i = 0; i < imgs.length; i++) mountDetailImage(imgs[i]);
  }

  /* ============ 图片上传（压缩 → 资料库附件 → 写入详情） ============ */
  function imageOutName(name, mime) {
    var s = String(name || 'image');
    var dot = s.lastIndexOf('.');
    var base = dot > 0 ? s.slice(0, dot) : s;
    var ext = (mime === 'image/png') ? '.png' : '.jpg';
    return base + ext;
  }
  function compressImage(file, maxW, cb) {
    var objUrl = '';
    try { objUrl = URL.createObjectURL(file); } catch (e) { cb(null, e); return; }
    var img = new Image();
    img.onload = function () {
      try {
        var iw = img.naturalWidth || img.width;
        var ih = img.naturalHeight || img.height;
        var scale = iw > maxW ? maxW / iw : 1;
        var w = Math.max(1, Math.round(iw * scale));
        var h = Math.max(1, Math.round(ih * scale));
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        try { URL.revokeObjectURL(objUrl); } catch (e1) {}
        var type = (file.type === 'image/png') ? 'image/png' : 'image/jpeg';
        if (cv.toBlob) {
          cv.toBlob(function (blob) { cb(blob, blob ? null : new Error('toBlob')); }, type, 0.86);
        } else {
          var durl = cv.toDataURL(type, 0.86);
          var bin = atob(durl.split(',')[1]);
          var u8 = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          cb(new Blob([u8], { type: type }), null);
        }
      } catch (e2) { cb(null, e2); }
    };
    img.onerror = function () { try { URL.revokeObjectURL(objUrl); } catch (e3) {} cb(null, new Error('load')); };
    img.src = objUrl;
  }
  function doInsertDetailImage(file) {
    var ui = detailUI;
    if (!ui || !file) return;
    if (String(file.type).indexOf('image/') !== 0) { toast('请选择图片文件'); return; }
    if (!ONLINE) { toast('离线模式下暂不能上传图片，切到在线后重试'); return; }
    toast('正在上传图片…');
    compressImage(file, 800, function (blob, err) {
      if (err || !blob) { toast('图片处理失败，请换一张试试'); return; }
      var payload;
      try { payload = new File([blob], imageOutName(file.name, blob.type), { type: blob.type }); }
      catch (e4) { payload = blob; }
      db.uploadFile({ nodeId: DATABASE_ID, file: payload })
        .then(function (item) {
          var att = normalizeAttachment(item);
          if (!att) throw new Error('bad attachment');
          ui.pending.push(att);
          return resolveDetailImageUrl(att.attachmentId).then(function () { return att; }, function () { return att; });
        })
        .then(function (att) {
          insertDetailSnippet('![' + (att.name || '图片') + '](att:' + att.attachmentId + ')');
          toast('图片已插入，记得点「保存」');
        })
        .catch(function () { toast('图片上传失败，请稍后重试'); });
    });
  }
  function openDetailImagePicker() {
    var ui = detailUI;
    if (!ui) return;
    if (!ui.picker) {
      var p = document.createElement('input');
      p.type = 'file';
      p.accept = 'image/*';
      p.className = 'sr';
      p.addEventListener('change', function () {
        var f = p.files && p.files[0];
        try { p.value = ''; } catch (e) {}
        if (f) doInsertDetailImage(f);
      });
      document.body.appendChild(p);
      ui.picker = p;
    }
    ui.picker.click();
  }
  function requestDetailImage() {
    var ui = detailUI;
    if (!ui) return;
    ui.imagePos = ui.ta ? ui.ta.selectionStart : 0;
    openDetailImagePicker();
  }
  function insertDetailSnippet(text) {
    var ui = detailUI;
    if (!ui || !ui.ta) return;
    var ta = ui.ta;
    var pos = Math.max(0, Math.min(ui.imagePos || ta.selectionStart, ta.value.length));
    var before = ta.value.slice(0, pos);
    var after = ta.value.slice(pos);
    var lead = (before && before.charAt(before.length - 1) !== '\n') ? '\n' : '';
    var trail = (after && after.charAt(0) !== '\n') ? '\n' : '';
    var block = lead + text + trail;
    ta.value = before + block + after;
    var np = pos + block.length;
    ta.focus();
    ta.selectionStart = ta.selectionEnd = np;
    ta.dispatchEvent(new Event('input'));
  }

  /* ============ 快速插入菜单（输入 / 唤出） ============ */
  var SLASH_ITEMS = [
    { key: 'date', label: '今天日期', hint: '2026-10-15', icon: 'calendar', make: function () { return todayStr(); } },
    { key: 'tomorrow', label: '明天日期', hint: '2026-10-16', icon: 'calendar', make: function () { return addDays(todayStr(), 1); } },
    { key: 'time', label: '当前时间', hint: '14:05', icon: 'clock', make: function () { return nowTimeStr(); } },
    { key: 'now', label: '日期 + 时间', hint: '2026-10-15 14:05', icon: 'clock', make: function () { return nowStamp(); } },
    { key: 'table', label: '表格', hint: '3 行 3 列', icon: 'table', snip: '\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n' },
    { key: 'image', label: '图片', hint: '上传到资料库', icon: 'image' },
    { key: 'h1', label: '一级标题', hint: '#', icon: 'heading', snip: '# ' },
    { key: 'h2', label: '二级标题', hint: '##', icon: 'heading', snip: '## ' },
    { key: 'h3', label: '三级标题', hint: '###', icon: 'heading', snip: '### ' },
    { key: 'bold', label: '加粗', hint: '**文字**', icon: 'bold', snip: '**加粗文字**', caret: [2, 6] },
    { key: 'italic', label: '斜体', hint: '*文字*', icon: 'italic', snip: '*斜体文字*', caret: [1, 5] },
    { key: 'list', label: '无序列表', hint: '- 项目', icon: 'list', snip: '- ' },
    { key: 'olist', label: '有序列表', hint: '1. 项目', icon: 'listOrdered', snip: '1. ' },
    { key: 'todo', label: '待办事项', hint: '- [ ] 事项', icon: 'checkSquare', snip: '- [ ] ' },
    { key: 'indent', label: '增加缩进', hint: 'Tab', icon: 'list', snip: '  ' },
    { key: 'outdent', label: '减少缩进', hint: 'Shift + Tab', icon: 'list', snip: '  ' },
    { key: 'quote', label: '引用', hint: '> 引用', icon: 'quote', snip: '> ' },
    { key: 'code', label: '行内代码', hint: 'code', icon: 'code', snip: '\u0060code\u0060', caret: [1, 5] },
    { key: 'codeblock', label: '代码块', hint: '多行代码', icon: 'code', snip: '\u0060\u0060\u0060\n\n\u0060\u0060\u0060', caret: 4 },
    { key: 'link', label: '链接', hint: '[文字](url)', icon: 'link', snip: '[链接文字](https://)', caret: [1, 5] },
    { key: 'divider', label: '分割线', hint: '---', icon: 'minus', snip: '\n---\n' }
  ];
  var slashState = { open: false, start: -1, query: '', items: [], index: 0, box: null, ta: null };
  var detailUI = null;      // 当前详情弹窗：{ ta, panel, pending, picker, imagePos }
  var urlCache = {};        // attachmentId -> 预览地址（会话内缓存）
  var SLASH_PREV_PUNCT = '，。、；：！？,.;:!?)]}）】」》';

  function filterSlashItems(q) {
    var raw = String(q == null ? '' : q);
    var query = raw.toLowerCase();
    if (!query) return SLASH_ITEMS.slice(0);
    var out = [];
    for (var i = 0; i < SLASH_ITEMS.length; i++) {
      var it = SLASH_ITEMS[i];
      if (it.key.toLowerCase().indexOf(query) !== -1 || it.label.indexOf(raw) !== -1) out.push(it);
    }
    return out;
  }
  /* 用镜像 div 量出光标在 textarea 内的像素位置，让菜单贴着光标弹出 */
  function caretCoords(ta) {
    var cs = window.getComputedStyle(ta);
    var props = ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
      'whiteSpace', 'wordWrap', 'wordBreak', 'textTransform', 'textIndent'];
    var div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.top = '0';
    div.style.left = '-9999px';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word';
    div.style.overflow = 'hidden';
    for (var i = 0; i < props.length; i++) { try { div.style[props[i]] = cs[props[i]]; } catch (e) {} }
    div.textContent = ta.value.slice(0, ta.selectionStart);
    var marker = document.createElement('span');
    marker.textContent = ta.value.slice(ta.selectionStart) || '.';
    div.appendChild(marker);
    document.body.appendChild(div);
    var top = marker.offsetTop, left = marker.offsetLeft;
    var lh = parseFloat(cs.lineHeight);
    if (!lh || isNaN(lh)) lh = (parseFloat(cs.fontSize) || 14) * 1.5;
    document.body.removeChild(div);
    return { top: top, left: left, lineHeight: lh };
  }
  function ensureSlashBox() {
    if (slashState.box) return slashState.box;
    var box = el('div', 'slashMenu');
    box.hidden = true;
    box.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    box.addEventListener('click', function (ev) {
      var t = (ev.target && ev.target.closest) ? ev.target.closest('[data-slash-index]') : null;
      if (!t) return;
      var i = parseInt(t.getAttribute('data-slash-index'), 10);
      if (!isNaN(i)) applySlashItem(slashState.items[i]);
    });
    document.body.appendChild(box);
    slashState.box = box;
    return box;
  }
  function renderSlashItems() {
    var box = slashState.box;
    if (!box) return;
    clear(box);
    if (!slashState.items.length) {
      box.appendChild(el('div', 'slashEmpty', '没有匹配的插入项，试试「日期」「表格」「图片」'));
      return;
    }
    for (var i = 0; i < slashState.items.length; i++) {
      var it = slashState.items[i];
      var row = el('button', 'slashItem' + (i === slashState.index ? ' on' : ''));
      row.type = 'button';
      row.setAttribute('data-slash-index', String(i));
      row.appendChild(iconNode(it.icon, 16));
      row.appendChild(el('span', 'slashLabel', it.label));
      if (it.hint) row.appendChild(el('span', 'slashHint', it.hint));
      box.appendChild(row);
    }
  }
  function placeSlashMenu() {
    var box = slashState.box, ta = slashState.ta;
    if (!box || !ta || box.hidden) return;
    var co = caretCoords(ta);
    var rect = ta.getBoundingClientRect();
    var mw = box.offsetWidth, mh = box.offsetHeight;
    var vw = window.innerWidth, vh = window.innerHeight;
    var top = rect.top + co.top + co.lineHeight;
    var left = rect.left + co.left;
    if (left + mw > vw - 8) left = vw - mw - 8;
    if (left < 8) left = 8;
    if (top + mh > vh - 8) {
      var above = rect.top + co.top - mh - 6;
      top = above > 8 ? above : Math.max(8, vh - mh - 8);
    }
    box.style.top = Math.round(top) + 'px';
    box.style.left = Math.round(left) + 'px';
  }
  function openSlashMenu(ta, start, query) {
    var box = ensureSlashBox();
    slashState.open = true;
    slashState.ta = ta;
    slashState.start = start;
    slashState.query = query;
    slashState.index = 0;
    slashState.items = filterSlashItems(query);
    box.hidden = false;
    renderSlashItems();
    placeSlashMenu();
  }
  function closeSlashMenu() {
    slashState.open = false;
    slashState.start = -1;
    slashState.query = '';
    slashState.items = [];
    slashState.index = 0;
    if (slashState.box) slashState.box.hidden = true;
  }
  function moveSlashMenu(delta) {
    var n = slashState.items.length;
    if (!n) return;
    slashState.index = (slashState.index + delta + n) % n;
    renderSlashItems();
    var on = slashState.box ? slashState.box.querySelector('.slashItem.on') : null;
    if (on && on.scrollIntoView) { try { on.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
  }
  function slashHandleInput(ta) {
    if (ta.selectionStart !== ta.selectionEnd) { closeSlashMenu(); return; }
    var before = ta.value.slice(0, ta.selectionStart);
    var idx = before.lastIndexOf('/');
    if (idx < 0) { closeSlashMenu(); return; }
    var prev = idx > 0 ? before.charAt(idx - 1) : '';
    if (prev !== '' && !/\s/.test(prev) && SLASH_PREV_PUNCT.indexOf(prev) === -1) { closeSlashMenu(); return; }
    var q = before.slice(idx + 1);
    if (q.length > 24 || /\s/.test(q)) { closeSlashMenu(); return; }
    openSlashMenu(ta, idx, q);
  }
  function slashHandleKey(ev, ta) {
    if (!slashState.open || slashState.ta !== ta) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); moveSlashMenu(1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); moveSlashMenu(-1); }
    else if (ev.key === 'Enter' || ev.key === 'Tab') { ev.preventDefault(); applySlashItem(slashState.items[slashState.index]); }
    else if (ev.key === 'Escape') { ev.preventDefault(); closeSlashMenu(); }
  }
  function applySlashItem(item) {
    var ui = detailUI;
    var ta = ui && ui.ta;
    if (!item || !ta) { closeSlashMenu(); return; }
    var s = slashState.start;
    var e = ta.selectionStart;
    if (s < 0 || e < s) { closeSlashMenu(); return; }
    closeSlashMenu();
    if (item.key === 'image') {
      ta.value = ta.value.slice(0, s) + ta.value.slice(e);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s;
      ui.imagePos = s;
      openDetailImagePicker();
      return;
    }
    if (item.key === 'indent' || item.key === 'outdent') {
      ta.value = ta.value.slice(0, s) + ta.value.slice(e);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s;
      applyMdIndent(ta, item.key === 'indent' ? 1 : -1);
      return;
    }
    var text = item.make ? item.make() : (item.snip || '');
    ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
    var cStart, cEnd;
    if (item.caret && Object.prototype.toString.call(item.caret) === '[object Array]') {
      cStart = s + item.caret[0];
      cEnd = s + item.caret[1];
    } else {
      cStart = cEnd = s + (typeof item.caret === 'number' ? item.caret : text.length);
    }
    ta.focus();
    ta.selectionStart = cStart;
    ta.selectionEnd = cEnd;
    ta.dispatchEvent(new Event('input'));
  }

  /* ============ 图片大图查看 ============ */
  function showImageViewer(url) {
    if (!url) return;
    var im = $('imgViewerImg');
    if (!im) return;
    im.setAttribute('src', url);
    $('imgViewer').hidden = false;
  }
  function hideImageViewer() {
    var v = $('imgViewer');
    if (v) v.hidden = true;
    var im = $('imgViewerImg');
    if (im) im.removeAttribute('src');
  }

  /* ============ 任务详情（Markdown 编辑 / 预览） ============ */
  function applyMdWrap(ta, before, after, ph) {
    var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    var sel = v.slice(s, e) || ph || '';
    ta.value = v.slice(0, s) + before + sel + after + v.slice(e);
    ta.focus();
    var ns = s + before.length;
    ta.selectionStart = ns; ta.selectionEnd = ns + sel.length;
    ta.dispatchEvent(new Event('input'));
  }
  function applyMdPrefix(ta, prefix) {
    var s = ta.selectionStart, v = ta.value;
    var ls = v.lastIndexOf('\n', s - 1) + 1;
    ta.value = v.slice(0, ls) + prefix + v.slice(ls);
    ta.focus();
    var np = s + prefix.length;
    ta.selectionStart = np; ta.selectionEnd = np;
    ta.dispatchEvent(new Event('input'));
  }
  /* 列表缩进 / 反缩进：作用于光标所在的整行（或选中的多行） */
  function applyMdIndent(ta, dir) {
    var v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    var ls = v.lastIndexOf('\n', s - 1) + 1;
    var le = v.indexOf('\n', e); if (le < 0) le = v.length;
    var seg = v.slice(ls, le), blines = seg.split('\n'), res = [];
    for (var i = 0; i < blines.length; i++) {
      var ln = blines[i];
      if (dir > 0) res.push('  ' + ln);
      else if (ln.slice(0, 2) === '  ') res.push(ln.slice(2));
      else if (ln.charAt(0) === ' ') res.push(ln.slice(1));
      else if (ln.charAt(0) === '\t') res.push(ln.slice(1));
      else res.push(ln);
    }
    var out = res.join('\n');
    var firstDelta = res[0].length - blines[0].length;
    var tailDelta = out.length - seg.length;
    ta.value = v.slice(0, ls) + out + v.slice(le);
    ta.focus();
    ta.selectionStart = ls + Math.max(0, Math.min(out.length, (s - ls) + firstDelta));
    ta.selectionEnd = ls + Math.max(0, Math.min(out.length, (e - ls) + tailDelta));
    ta.dispatchEvent(new Event('input'));
  }
  function openDetailModal(id) {
    var row = findRow(id);
    if (!row) return;
    var view = 'edit';
    var pending = [];

    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = row.name || '';
    nameInput.placeholder = '任务名称';

    var nextInput = document.createElement('input');
    nextInput.type = 'text';
    nextInput.value = row.nextAction || '';
    nextInput.placeholder = '第一个动作是什么？写成能在 25 分钟内直接开始的样子';

    var ta = document.createElement('textarea');
    ta.className = 'mdInput';
    ta.value = row.detail || '';
    ta.placeholder = '输入 / 快速插入日期、表格、图片…\n\n# 标题\n**加粗**  *斜体*\n- 列表项   - [ ] 待办\n| 表格 | 列 |';

    var panel = el('div', 'mdPanel mdBody');
    panel.hidden = true;
    var tools = el('div', 'mdTools');
    var tabs = el('div', 'mdTabs');
    var tabEdit = el('button', 'mdTab', '编辑');
    var tabView = el('button', 'mdTab', '预览');
    tabEdit.type = 'button'; tabView.type = 'button';
    tabs.appendChild(tabEdit); tabs.appendChild(tabView);

    function mdRenderPreview() {
      clear(panel);
      if (!ta.value.trim()) panel.appendChild(el('div', 'mdEmpty', '还没有内容，切到「编辑」写点什么吧。输入 / 可插入日期、表格、图片。'));
      else panel.innerHTML = sanitizeMarkdown(ta.value);
      hydrateDetailImages(panel);
    }
    function mdSetMode(m) {
      view = m;
      var editing = m === 'edit';
      closeSlashMenu();
      tabEdit.setAttribute('aria-selected', editing ? 'true' : 'false');
      tabView.setAttribute('aria-selected', editing ? 'false' : 'true');
      ta.hidden = !editing;
      tools.hidden = !editing;
      panel.hidden = editing;
      if (!editing) mdRenderPreview();
    }
    tabEdit.onclick = function () { mdSetMode('edit'); };
    tabView.onclick = function () { mdSetMode('view'); };

    function mdTbWrap(label, before, after, ph) {
      var b = el('button', 'mdtool', label); b.type = 'button';
      b.onclick = function () { closeSlashMenu(); applyMdWrap(ta, before, after, ph); };
      return b;
    }
    function mdTbPrefix(label, prefix) {
      var b = el('button', 'mdtool', label); b.type = 'button';
      b.onclick = function () { closeSlashMenu(); applyMdPrefix(ta, prefix); };
      return b;
    }
    function mdTbIndent(label, dir) {
      var b = el('button', 'mdtool', label); b.type = 'button';
      b.title = dir > 0 ? '增加缩进（也可按 Tab）' : '减少缩进（Shift + Tab）';
      b.onclick = function () { closeSlashMenu(); applyMdIndent(ta, dir); };
      return b;
    }
    function mdTbImage() {
      var b = el('button', 'mdtool'); b.type = 'button';
      b.appendChild(iconNode('image', 14));
      b.appendChild(el('span', null, '图片'));
      b.title = '上传图片到资料库（自动压缩到 800px）';
      b.onclick = function () { closeSlashMenu(); requestDetailImage(); };
      return b;
    }
    function mdTbSlash() {
      var b = el('button', 'mdtool'); b.type = 'button';
      b.appendChild(iconNode('plus', 14));
      b.appendChild(el('span', null, '插入'));
      b.title = '唤出插入菜单（也可在编辑区直接输入 /）';
      b.onclick = function () {
        closeSlashMenu();
        var s = ta.selectionStart, v = ta.value;
        var pad0 = (s > 0 && !/\s/.test(v.charAt(s - 1))) ? ' ' : '';
        var ins = pad0 + '/';
        ta.value = v.slice(0, s) + ins + v.slice(ta.selectionEnd);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = s + ins.length;
        openSlashMenu(ta, s + pad0.length, '');
      };
      return b;
    }
    tools.appendChild(mdTbSlash());
    tools.appendChild(mdTbImage());
    tools.appendChild(mdTbPrefix('H1', '# '));
    tools.appendChild(mdTbPrefix('H2', '## '));
    tools.appendChild(mdTbWrap('加粗', '**', '**', '加粗文字'));
    tools.appendChild(mdTbWrap('斜体', '*', '*', '斜体文字'));
    tools.appendChild(mdTbPrefix('列表', '- '));
    tools.appendChild(mdTbPrefix('有序', '1. '));
    tools.appendChild(mdTbPrefix('待办', '- [ ] '));
    tools.appendChild(mdTbIndent('缩进', 1));
    tools.appendChild(mdTbIndent('取消缩进', -1));
    tools.appendChild(mdTbPrefix('引用', '> '));
    tools.appendChild(mdTbWrap('代码', '\u0060', '\u0060', 'code'));
    tools.appendChild(mdTbPrefix('代码块', '\u0060\u0060\u0060\n'));
    tools.appendChild(mdTbWrap('链接', '[', '](https://)', '链接文字'));
    tools.appendChild(mdTbPrefix('分割线', '---\n'));

    detailUI = { ta: ta, panel: panel, pending: pending, picker: null, imagePos: 0 };

    ta.addEventListener('input', function () {
      slashHandleInput(ta);
      if (view === 'view') mdRenderPreview();
    });
    ta.addEventListener('keydown', function (ev) {
      if (slashState.open && slashState.ta === ta) { slashHandleKey(ev, ta); return; }
      if (ev.key === 'Tab') { ev.preventDefault(); applyMdIndent(ta, ev.shiftKey ? -1 : 1); return; }
      slashHandleKey(ev, ta);
    });
    mdSetMode('edit');

    var wrap = el('div', 'detailWrap');
    wrap.appendChild(fieldBlock('任务名称', nameInput));
    wrap.appendChild(fieldBlock('下一步动作', nextInput));
    var logs = row.delayLog || [];
    var delayCounts = Math.max(Number(row.delayCount) || 0, logs.length, 0);
    var delayDays = logs.reduce(function (a, e) { return a + (Number(e && e.days) || 0); }, 0);
    var cc = classify(row);
    var overdueDays = (cc.overdue && cc.days != null) ? Math.abs(cc.days) : 0;
    // 已经记过延期，或者单纯逾期没处理，都显示这个小结——逾期天数是按今天自动算的
    if (delayCounts || row.delay || overdueDays) {
      var bits = [];
      if (delayCounts || row.delay) {
        bits.push('已延期 ' + Math.max(delayCounts, 1) + ' 次');
        if (delayDays) bits.push('累计顺延 ' + delayDays + ' 天');
        var lastLog = logs.length ? logs[logs.length - 1] : null;
        if (lastLog && lastLog.days) bits.push('最近一次 ' + lastLog.days + ' 天');
      }
      if (overdueDays) bits.push('当前逾期 ' + overdueDays + ' 天（自动）');
      if (row.firstDue && row.due && row.firstDue !== row.due) bits.push(row.firstDue + ' → ' + row.due);
      var dsum = el('div', 'delaySum');
      dsum.appendChild(iconNode('clock', 14));
      dsum.appendChild(el('span', null, bits.join(' · ')));
      var bMore = el('button', 'btn small');
      bMore.type = 'button';
      bMore.appendChild(el('span', null, delayCounts ? '再记一次' : '记录延期'));
      bMore.onclick = function () {
        closeModal();
        openDelayModal(id);
      };
      dsum.appendChild(bMore);
      wrap.appendChild(dsum);
    }
    if (row.sourceIdea) {
      var srcBar = el('div', 'srcIdea');
      srcBar.appendChild(iconNode('link', 14));
      srcBar.appendChild(el('span', null, '这条任务从一个想法拆出来'));
      var srcBtn = el('button', 'btn small');
      srcBtn.type = 'button';
      srcBtn.appendChild(el('span', null, '回到原想法'));
      srcBtn.onclick = function () {
        closeModal();
        if (window.__zhiqiOpenIdea__) window.__zhiqiOpenIdea__(row.sourceIdea);
      };
      srcBar.appendChild(srcBtn);
      wrap.appendChild(srcBar);
    }
    wrap.appendChild(tabs);
    wrap.appendChild(tools);
    wrap.appendChild(ta);
    wrap.appendChild(panel);
    wrap.appendChild(el('div', 'mdHint', '输入 / 唤出插入菜单（日期、表格、图片…）。列表缩进：按 Tab 增加、Shift + Tab 减少。也支持 Markdown：# 标题、**加粗**、*斜体*、\u0060代码\u0060、- 列表、1. 有序、- [ ] 待办、> 引用、[链接](url)、| 表格 |。'));

    openModal('任务详情', [wrap], [
      { label: '取消', onClick: closeModal },
      {
        label: '保存', primary: true, onClick: function () {
          var nm = nameInput.value.trim();
          if (!nm) { toast('任务名称不能为空'); try { nameInput.focus(); } catch (e) {} return; }
          var text = ta.value;
          var used = attIdsInText(text);
          var merged = mergeAttachments(row.images, pending, used);
          var payload = { detail: text, images: merged, nextAction: nextInput.value.trim() };
          if (nm !== row.name) payload.name = nm;
          doUpdate(id, payload, nm !== row.name ? '任务名称与详情已保存' : '详情已保存');
        }
      }
    ]);
    $('modal').classList.add('wide');
    setTimeout(function () { try { ta.focus(); } catch (e) {} }, 40);
  }

  function openEditModal(id) {
    var row = findRow(id);
    if (!row) return;
    var nameInput = document.createElement('input');
    nameInput.type = 'text'; nameInput.value = row.name;

    var nextInput = document.createElement('input');
    nextInput.type = 'text';
    nextInput.value = row.nextAction || '';
    nextInput.placeholder = '第一个动作是什么？写成能在 25 分钟内直接开始的样子';

    var catSel = document.createElement('select');
    var priSel = document.createElement('select');
    var statusSel = document.createElement('select');
    fillSelect(catSel, '分类', row.category);
    fillSelect(priSel, '优先级', row.priority);
    fillSelect(statusSel, '状态', row.status);

    var dueInput = document.createElement('input');
    dueInput.type = 'date'; dueInput.value = toDateOnly(row.due);

    // 直接把日期往后改，也算延期：实时提示会自动记多少天
    var dueHint = el('div', 'dueAutoHint', '');
    var refreshDueHint = function () {
      var built = buildDelayPatch(row, dueInput.value, '修改截止日期');
      dueHint.textContent = built
        ? `比原定 ${toDateOnly(row.due)} 晚了 ${built.days} 天，保存后会自动记一笔延期`
        : '';
      dueHint.style.display = built ? '' : 'none';
    };
    dueInput.onchange = refreshDueHint;
    refreshDueHint();

    var delayInput = document.createElement('input');
    delayInput.type = 'text'; delayInput.value = row.delay || '';

    var tagInput = document.createElement('input');
    tagInput.type = 'text';
    tagInput.value = row.tags || '';
    tagInput.placeholder = '空格或逗号分隔，如：复盘 #汇报';

    var doneInput = document.createElement('input');
    doneInput.type = 'text';
    doneInput.value = row.done || '';
    doneInput.placeholder = '完成时自动记录，如 2026-10-13 14:05（留空会自动填当前时间）';

    var nodes = [
      fieldBlock('任务名称', nameInput),
      fieldBlock('下一步动作（决定这条能不能真正开始）', nextInput),
      fieldBlock('分类', catSel),
      fieldBlock('优先级', priSel),
      fieldBlock('状态', statusSel),
      fieldBlock('截止日期', dueInput),
      dueHint,
      fieldBlock('延迟原因', delayInput),
      fieldBlock('标签', tagInput),
      fieldBlock('完成时间', doneInput)
    ];
    openModal('编辑任务', nodes, [
      { label: '取消', onClick: closeModal },
      {
        label: '保存', primary: true, onClick: function () {
          var nm = nameInput.value.trim();
          if (!nm) { toast('任务名称不能为空'); return; }
          var newStatus = statusSel.value;
          var doneVal = doneInput.value.trim();
          if (newStatus === '已完成') { if (!doneVal) doneVal = nowStamp(); }
          else { doneVal = ''; }
          var changes = {
            name: nm, nextAction: nextInput.value.trim(), category: catSel.value, priority: priSel.value,
            status: newStatus, due: dueInput.value, delay: delayInput.value.trim(),
            tags: formatTags(parseTags(tagInput.value)), done: doneVal
          };
          // 日期被改晚 → 自动补一条延期记录（天数自动算）
          var built = buildDelayPatch(row, dueInput.value, delayInput.value.trim() || '修改截止日期');
          var extra = '';
          if (built) {
            changes.delayLog = built.patch.delayLog;
            changes.delayCount = built.patch.delayCount;
            if (!row.firstDue) changes.firstDue = built.patch.firstDue;
            if (newStatus !== '已完成') changes.status = '已延期';
            extra = `，已自动记下顺延 ${built.days} 天`;
          }
          doUpdate(id, changes, '已保存修改' + extra);
        }
      }
    ]);
  }

  function openConfirm(title, message, okLabel, onOk) {
    openModal(title, [el('div', null, message)], [
      { label: '取消', onClick: closeModal },
      { label: okLabel, danger: true, onClick: onOk }
    ]);
  }

  /* ============ 标签管理（重命名 / 移除，自动同步所有任务） ============ */
  function openTagManager() {
    var list = allTags();
    var nodes = [];
    if (!list.length) {
      nodes.push(el('div', 'empty', '还没有标签。新建任务时在「标签」里输入即可创建，例如：复盘 汇报。'));
    } else {
      nodes.push(el('div', 'hint', '重命名或移除标签后，所有用到该标签的任务会自动同步更新（任务本身不会被删除）。'));
      var wrap = el('div', 'tagManageList');
      for (var i = 0; i < list.length; i++) {
        var tag = list[i].tag, cnt = list[i].count;
        var rowEl = el('div', 'tagManageRow');
        var chip = el('span', 'tagchip', '#' + tag);
        paintTag(chip, tag, false);
        rowEl.appendChild(chip);
        rowEl.appendChild(el('span', 'cntHint', cnt + ' 个任务'));
        rowEl.appendChild(el('span', 'grow'));
        var rb = el('button', 'btn small');
        rb.type = 'button';
        rb.setAttribute('data-action', 'tagRename');
        rb.setAttribute('data-tag', tag);
        rb.appendChild(iconNode('edit', 14));
        rb.appendChild(el('span', null, '重命名'));
        rowEl.appendChild(rb);
        var db2 = el('button', 'btn small');
        db2.type = 'button';
        db2.setAttribute('data-action', 'tagRemove');
        db2.setAttribute('data-tag', tag);
        db2.style.color = 'var(--red)';
        db2.appendChild(iconNode('trash', 14));
        db2.appendChild(el('span', null, '移除'));
        rowEl.appendChild(db2);
        wrap.appendChild(rowEl);
      }
      nodes.push(wrap);
    }
    openModal('管理标签', nodes, [{ label: '完成', primary: true, onClick: closeModal }]);
  }
  function openRenameTagModal(oldTag) {
    var list = allTags(), hit = null;
    for (var i = 0; i < list.length; i++) if (list[i].tag === oldTag) hit = list[i];
    if (!hit) { openTagManager(); return; }
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.value = oldTag;
    inp.placeholder = '新的标签名称';
    var nodes = [
      el('div', 'hint', '重命名后，「' + hit.count + '」个任务的标签会自动同步为新名称。'),
      fieldBlock('标签名称', inp)
    ];
    openModal('重命名标签', nodes, [
      { label: '返回', onClick: openTagManager },
      {
        label: '保存', primary: true, onClick: function () {
          var nv = inp.value.trim().replace(/^#+/, '').trim();
          if (!nv) { toast('标签名不能为空'); return; }
          if (nv === oldTag) { openTagManager(); return; }
          applyTagRename(oldTag, nv);
        }
      }
    ]);
  }
  function applyTagRename(oldTag, newTag) {
    var targets = [];
    for (var i = 0; i < state.rows.length; i++) {
      var arr = parseTags(state.rows[i].tags);
      if (arr.indexOf(oldTag) === -1) continue;
      var seen = {}, uniq = [];
      for (var j = 0; j < arr.length; j++) {
        var v = (arr[j] === oldTag) ? newTag : arr[j];
        if (!seen[v]) { seen[v] = 1; uniq.push(v); }
      }
      targets.push({ id: state.rows[i].id, tags: formatTags(uniq) });
    }
    if (state.filterTag === oldTag) state.filterTag = newTag;
    batchTagUpdate(targets, '标签已重命名');
  }
  function applyTagDelete(tag) {
    var targets = [], cnt = 0;
    for (var i = 0; i < state.rows.length; i++) {
      var arr = parseTags(state.rows[i].tags);
      if (arr.indexOf(tag) === -1) continue;
      var kept = [];
      for (var j = 0; j < arr.length; j++) if (arr[j] !== tag) kept.push(arr[j]);
      targets.push({ id: state.rows[i].id, tags: formatTags(kept) });
      cnt++;
    }
    if (!cnt) { toast('没有任务使用该标签'); openTagManager(); return; }
    if (state.filterTag === tag) state.filterTag = 'all';
    openConfirm('移除标签', '将把标签「#' + tag + '」从 ' + cnt + ' 个任务上移除（任务本身不会被删除）。', '移除标签', function () {
      batchTagUpdate(targets, '标签已移除');
    });
  }
  /* 批量更新这些任务的标签字段（顺序写入，完成后统一刷新） */
  function batchTagUpdate(targets, okMsg) {
    if (state.mutating) return;
    if (!targets.length) { closeModal(); toast('没有需要更新的任务'); return; }
    state.mutating = true;
    setSync('syncing');
    var i = 0;
    function next() {
      if (i >= targets.length) {
        state.mutating = false;
        closeModal();
        toast(okMsg);
        loadTasks(function () { refreshAll(); });
        return;
      }
      var t = targets[i++];
      persistUpdate(t.id, { tags: t.tags }, function (err) {
        if (err) {
          state.mutating = false;
          setSync(ONLINE ? 'synced' : 'offline');
          toast('更新失败，请稍后重试');
          loadTasks(function () { refreshAll(); });
          return;
        }
        next();
      });
    }
    next();
  }

  function fillSelect(sel, field, current) {
    clear(sel);
    var opts = SCHEMA_OPTIONS[field];
    var texts = [];
    if (opts && opts.length) {
      for (var i = 0; i < opts.length; i++) texts.push(opts[i].text);
    } else {
      texts = FALLBACK_OPTIONS[field] || [];
    }
    for (var j = 0; j < texts.length; j++) {
      var o = el('option', null, texts[j]);
      o.value = texts[j];
      if (texts[j] === current) o.selected = true;
      sel.appendChild(o);
    }
  }
  function renderSelectOptions() {
    fillSelectForm($('f_category'), '分类', '');
    fillSelectForm($('f_priority'), '优先级', 'P2 中');
    var cf = $('categoryFilter');
    var keep = cf.value;
    clear(cf);
    var allOpt = el('option', null, '全部分类'); allOpt.value = 'all'; cf.appendChild(allOpt);
    renderCategoryFilterOptions(cf);
    if (keep) cf.value = keep;
  }
  function renderCategoryFilterOptions(cf) {
    var opts = SCHEMA_OPTIONS['分类'];
    var texts = [];
    if (opts && opts.length) { for (var i = 0; i < opts.length; i++) texts.push(opts[i].text); }
    else texts = FALLBACK_OPTIONS['分类'] || [];
    for (var j = 0; j < texts.length; j++) {
      var o = el('option', null, texts[j]); o.value = texts[j]; cf.appendChild(o);
    }
  }
  function fillSelectForm(sel, field, current) {
    clear(sel);
    var placeholder = el('option', null, '请选择'); placeholder.value = ''; sel.appendChild(placeholder);
    var opts = SCHEMA_OPTIONS[field];
    var items = [];
    if (opts && opts.length) { for (var i = 0; i < opts.length; i++) items.push({ text: opts[i].text, id: opts[i].id }); }
    else { var fb = FALLBACK_OPTIONS[field] || []; for (var k = 0; k < fb.length; k++) items.push({ text: fb[k], id: fb[k] }); }
    for (var j = 0; j < items.length; j++) {
      var o = el('option', null, items[j].text);
      o.value = items[j].id;
      if (items[j].text === current) o.selected = true;
      sel.appendChild(o);
    }
  }

  /* ============ 事件处理（改数据 → refreshAll） ============ */
  function doUpdate(id, changes, okMsg) {
    if (state.mutating) return;
    state.mutating = true;
    setSync('syncing');
    persistUpdate(id, changes, function (err) {
      state.mutating = false;
      if (err) { setSync(ONLINE ? 'synced' : 'offline'); toast('保存失败，请稍后重试'); return; }
      closeModal();
      toast(okMsg || '已更新');
      loadTasks(function () { refreshAll(); });
    });
  }
  function doSetStatus(id, status) {
    var row = findRow(id);
    var changes = { status: status };
    if (status === '已完成') {
      changes.done = (row && row.done) ? row.done : nowStamp();
    } else if (row && row.done) {
      changes.done = '';
    }
    doUpdate(id, changes, status === '已完成' ? '已完成，已记录完成时间' : '已更新状态');
  }
  function doPostpone(id) {
    var row = findRow(id);
    if (!row) return;
    // 顺延也是延期：日期挪后多少天，自动记多少天
    var built = buildDelayPatch(row, todayStr(), '顺延到今天');
    if (!built) { doUpdate(id, { due: todayStr() }, '已顺延到今天'); return; }
    doUpdate(id, built.patch, `已顺延到今天，自动记下 ${built.days} 天`);
  }
  function doDelete(id) {
    var row = findRow(id);
    if (!row) return;
    openConfirm('删除任务', '确定删除「' + row.name + '」吗？删除后无法恢复。', '删除', function () {
      if (state.mutating) return;
      state.mutating = true;
      setSync('syncing');
      persistDelete(id, function (err) {
        state.mutating = false;
        if (err) { setSync(ONLINE ? 'synced' : 'offline'); toast('删除失败，请稍后重试'); return; }
        closeModal();
        toast('已删除');
        loadTasks(function () { refreshAll(); });
      });
    });
  }
  function doClearSamples() {
    if (ONLINE && seedIds.length === 0) {
      var stored = safeGet(LS_SEED_IDS);
      if (stored) { try { seedIds = JSON.parse(stored) || []; } catch (e) { seedIds = []; } }
    }
    if (!seedIds.length) { toast('当前没有可清空的示例数据'); return; }
    openConfirm('清空示例数据', '将删除本工作台预置的 ' + seedIds.length + ' 条示例任务，你自己添加的任务不受影响。', '清空示例', function () {
      var ids = seedIds.slice(0);
      var i = 0;
      function delNext() {
        if (i >= ids.length) {
          seedIds = []; safeSet(LS_SEED_IDS, '[]'); closeModal(); toast('示例数据已清空');
          loadTasks(function () { refreshAll(); });
          return;
        }
        var rid = ids[i++];
        if (ONLINE) {
          db.deleteRecord({ databaseId: DATABASE_ID, recordId: rid })
            .then(function () { delNext(); })
            .catch(function () { delNext(); });
        } else {
          var rows = readLocal();
          var kept = [];
          for (var k = 0; k < rows.length; k++) if (rows[k].id !== rid) kept.push(rows[k]);
          writeLocal(kept);
          delNext();
        }
      }
      delNext();
    });
  }

  /* ============ 备份 / 恢复 ============ */
  function doExport() {
    var payload = {
      workbench: '个人任务跟踪',
      version: 1,
      exportedAt: new Date().toISOString(),
      rows: state.rows
    };
    var text = JSON.stringify(payload, null, 2);
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var d = new Date();
    a.href = url;
    a.download = '任务跟踪备份_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast('备份文件已生成');
  }
  function onImportFile(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(String(reader.result)); } catch (e) { toast('文件格式无法识别'); ev.target.value = ''; return; }
      var rows = data && data.rows ? data.rows : (Array.isArray(data) ? data : null);
      if (!rows || !rows.length) { toast('未在文件中找到任务数据'); ev.target.value = ''; return; }
      var imported = [];
      for (var i = 0; i < rows.length; i++) imported.push(normalizeRow(rows[i]));
      if (ONLINE) {
        var idx = 0;
        toast('正在恢复 ' + imported.length + ' 条数据…');
        function restoreNext() {
          if (idx >= imported.length) { toast('恢复完成'); ev.target.value = ''; loadTasks(function () { refreshAll(); }); return; }
          var plain = imported[idx++];
          db.addRecord({ databaseId: DATABASE_ID, properties: changesToProps(plain) })
            .then(function () { restoreNext(); })
            .catch(function () { restoreNext(); });
        }
        restoreNext();
      } else {
        var existing = readLocal();
        for (var j = 0; j < imported.length; j++) {
          imported[j].id = 'l' + Date.now() + j + Math.random().toString(36).slice(2, 6);
          existing.push(imported[j]);
        }
        writeLocal(existing);
        ev.target.value = '';
        toast('已恢复 ' + imported.length + ' 条');
        loadTasks(function () { refreshAll(); });
      }
    };
    reader.onerror = function () { toast('读取文件失败'); ev.target.value = ''; };
    reader.readAsText(file);
  }

  /* ============ 表单提交 ============ */
  function onFormSubmit(e) {
    e.preventDefault();
    if (state.mutating) return;
    var name = $('f_name').value.trim();
    if (!name) { toast('请先填写任务名称'); $('f_name').focus(); return; }
    var plain = {
      name: name,
      category: $('f_category').value || '其他',
      priority: $('f_priority').value || 'P2 中',
      due: $('f_due').value || '',
      delay: $('f_delay').value.trim(),
      tags: formatTags(parseTags($('f_tags').value))
    };
    var isOverdue = !!plain.due && diffDays(plain.due, todayStr()) < 0;
    plain.status = (plain.delay && isOverdue) ? '已延期' : '待办';
    var btn = $('submitBtn');
    state.mutating = true;
    setSync('syncing');
    btn.disabled = true;
    persistAdd(plain, function (err) {
      state.mutating = false;
      btn.disabled = false;
      if (err) { setSync(ONLINE ? 'synced' : 'offline'); toast('添加失败，请稍后重试'); return; }
      $('taskForm').reset();
      $('f_priority').value = optId('优先级', 'P2 中');
      toast('任务已添加');
      loadTasks(function () { refreshAll(); });
    });
  }

  /* ============ 初始化 ============ */
  function bindEvents() {
    document.addEventListener('click', function (e) {
      var node = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
      if (!node) return;
      var action = node.getAttribute('data-action');
      var id = node.getAttribute('data-id');
      if (action === 'complete') doSetStatus(id, '已完成');
      else if (action === 'start') doSetStatus(id, '进行中');
      else if (action === 'delay') openDelayModal(id);
      else if (action === 'postpone') doPostpone(id);
      else if (action === 'detail') openDetailModal(id);
      else if (action === 'edit') openEditModal(id);
      else if (action === 'delete') doDelete(id);
      else if (action === 'theme') { applyTheme(state.theme === 'dark' ? 'light' : 'dark', true); refreshAll(); }
      else if (action === 'closeModal') closeModal();
      else if (action === 'clearSamples') doClearSamples();
      else if (action === 'export') doExport();
      else if (action === 'import') $('importFile').click();
      else if (action === 'dismissTip') { safeSet(LS_TIP, '1'); refreshAll(); }
      else if (action === 'tag') {
        var tagVal = node.getAttribute('data-tag');
        state.filterTag = (state.filterTag === tagVal) ? 'all' : tagVal;
        refreshAll();
        var listSec = $('listSection');
        if (listSec && listSec.scrollIntoView) listSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      else if (action === 'sugtag') {
        var sugVal = node.getAttribute('data-tag');
        var curTags = parseTags($('f_tags').value);
        var at = curTags.indexOf(sugVal);
        if (at === -1) curTags.push(sugVal); else curTags.splice(at, 1);
        $('f_tags').value = formatTags(curTags);
        renderTagSuggest();
      }
      else if (action === 'delayAi') openDelayRetro();
      else if (action === 'tagManage') openTagManager();
      else if (action === 'tagRename') openRenameTagModal(node.getAttribute('data-tag'));
      else if (action === 'tagRemove') applyTagDelete(node.getAttribute('data-tag'));
      else if (action === 'tab') {
        var st = node.getAttribute('data-status');
        state.filterStatus = st;
        var tabs = document.querySelectorAll('#statusTabs .tab');
        for (var i = 0; i < tabs.length; i++) tabs[i].setAttribute('aria-selected', tabs[i] === node ? 'true' : 'false');
        refreshAll();
      }
      else if (action === 'view') {
        state.view = node.getAttribute('data-view') === 'calendar' ? 'calendar' : 'list';
        refreshAll();
      }
      else if (action === 'calPrev') {
        state.calM--;
        if (state.calM < 0) { state.calM = 11; state.calY--; }
        refreshAll();
      }
      else if (action === 'calNext') {
        state.calM++;
        if (state.calM > 11) { state.calM = 0; state.calY++; }
        refreshAll();
      }
      else if (action === 'calToday') {
        var tp = todayStr().split('-');
        state.calY = parseInt(tp[0], 10);
        state.calM = parseInt(tp[1], 10) - 1;
        state.calSelected = todayStr();
        refreshAll();
      }
      else if (action === 'calDay') {
        state.calSelected = node.getAttribute('data-date') || '';
        refreshAll();
      }
      else if (action === 'calSetDue') {
        var dsv = node.getAttribute('data-date') || '';
        if (dsv) {
          $('f_due').value = dsv;
          toast('截止日期已设为 ' + dsv + '，填好名称直接添加');
          var addSec = $('addSection');
          if (addSec && addSec.scrollIntoView) addSec.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(function () { if ($('f_name')) $('f_name').focus(); }, 320);
        }
      }
    });
    $('mask').addEventListener('click', function (e) { if (e.target === $('mask')) closeModal(); });
    $('taskForm').addEventListener('submit', onFormSubmit);
    $('importFile').addEventListener('change', onImportFile);
    $('searchInput').addEventListener('input', function () {
      state.keyword = $('searchInput').value;
      refreshAll();
    });
    $('categoryFilter').addEventListener('change', function () {
      state.filterCategory = $('categoryFilter').value;
      refreshAll();
    });
    $('tagFilter').addEventListener('change', function () {
      state.filterTag = $('tagFilter').value;
      refreshAll();
    });
    $('f_tags').addEventListener('input', function () { renderTagSuggest(); });

    /* 快速插入菜单：点击外部关闭，滚动 / 缩放时跟随光标 */
    document.addEventListener('pointerdown', function (e) {
      if (!slashState.open) return;
      var t = e.target;
      if (slashState.box && t && slashState.box.contains(t)) return;
      if (t === slashState.ta) return;
      closeSlashMenu();
    }, true);
    window.addEventListener('scroll', function () { if (slashState.open) placeSlashMenu(); }, true);
    window.addEventListener('resize', function () { if (slashState.open) placeSlashMenu(); });

    /* 详情图片：点开看大图，点遮罩关闭 */
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.tagName === 'IMG' && t.classList && t.classList.contains('mdimg') && t.getAttribute('src')) {
        showImageViewer(t.getAttribute('src'));
        return;
      }
      if (t && t.id === 'imgViewer') hideImageViewer();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideImageViewer(); });
  }

  function registerRealtime() {
    if (ONLINE && typeof db.onUpdated === 'function') {
      var timer = null;
      db.onUpdated(function (payload) {
        var ids = (payload && payload.databaseIds) || [];
        if (ids.indexOf(DATABASE_ID) === -1) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
          loadTasks(function () { refreshAll(); });
        }, 350);
      });
    }
  }

  function loadSchema(cb) {
    if (!ONLINE) { cb(); return; }
    db.getSchema({ databaseId: DATABASE_ID })
      .then(function (schema) {
        var props = (schema && schema.properties) || [];
        for (var i = 0; i < props.length; i++) {
          var f = props[i];
          if ((f.type === 'select' || f.type === 'multi_select') && f.config && f.config.options) {
            SCHEMA_OPTIONS[f.name] = f.config.options;
            var m = {};
            for (var j = 0; j < f.config.options.length; j++) {
              m[f.config.options[j].text] = f.config.options[j].id;
            }
            OPT_ID[f.name] = m;
          }
        }
        cb();
      })
      .catch(function (err) {
        console.error('[database] schema 加载失败:', err);
        cb();
      });
  }

  function init() {
    mountIcons();
    bindEvents();
    applyTheme(preferredTheme(), false);
    setSync(ONLINE ? 'syncing' : 'offline');
    var storedSeeds = safeGet(LS_SEED_IDS);
    if (storedSeeds) { try { seedIds = JSON.parse(storedSeeds) || []; } catch (e) { seedIds = []; } }

    $('f_due').value = todayStr();

    var tp = todayStr().split('-');
    state.calY = parseInt(tp[0], 10);
    state.calM = parseInt(tp[1], 10) - 1;
    state.calSelected = todayStr();
    var dNow = new Date();
    var subEl = document.querySelector('.brand .sub');
    if (subEl) {
      subEl.textContent = dNow.getFullYear() + '年' + (dNow.getMonth() + 1) + '月' + dNow.getDate() +
        '日 周' + ['日', '一', '二', '三', '四', '五', '六'][dNow.getDay()] + ' · 待办跟进 · 延期复盘';
    }

    loadSchema(function () {
      renderSelectOptions();
      loadTasks(function () {
        refreshAll();
        if (state.rows.length === 0 && safeGet(LS_SEEDED) !== '1') {
          seedSamples(function () {
            loadTasks(function () { refreshAll(); });
          });
        }
      });
      registerRealtime();
    });
  }

  /* ============ 对外入口 ============
     合并进「知栖」主应用后，初始化时机由主应用决定（登录成功 / 首次切到任务视图），
     因此这里只暴露方法，不自动 init。 */

  var started = false;

  function start() {
    if (started) return true;
    started = true;
    try {
      init();
    } catch (e) {
      started = false;
      throw e;
    }
    return true;
  }

  /** 主应用侧的任务字段 → 云端列名（经适配层映射） */
  function taskProperties(p) {
    p = p || {};
    var props = {
      [FIELD.name]: p.name || '未命名任务',
      [FIELD.status]: p.status || '待办',
      [FIELD.priority]: p.priority || 'P2 中',
      [FIELD.category]: p.category || '其他',
      [FIELD.due]: p.due || '',
      [FIELD.tags]: p.tags || '',
      [FIELD.detail]: p.detail || '',
    };
    if (p.nextAction) props[FIELD.nextAction] = p.nextAction;
    if (p.sourceIdea) props[FIELD.sourceIdea] = String(p.sourceIdea);
    return props;
  }

  window.TaskBoard = {
    start: start,
    isStarted: function () {
      return started;
    },
    /** 重新拉取云端任务并重绘（主应用在写入任务后调用，避免两处状态不一致） */
    reload: function (cb) {
      loadTasks(function () {
        refreshAll();
        if (cb) cb();
      });
    },
    /** 给主应用侧栏计数与右侧概览用 */
    stats: function () {
      var rows = state.rows || [];
      var open = rows.filter(function (r) { return r.status !== '已完成'; });
      var done = rows.filter(function (r) { return r.status === '已完成'; });
      var overdue = 0, dueToday = 0, soon = 0;
      var byStatus = {};
      rows.forEach(function (r) {
        var s = r.status || '待办';
        byStatus[s] = (byStatus[s] || 0) + 1;
        if (s === '已完成') return;
        var c = classify(r);
        if (c.overdue) overdue++;
        else if (c.dueToday) dueToday++;
        else if (c.soon) soon++;
      });
      var next = open
        .slice()
        .sort(function (a, b) {
          var ca = classify(a), cb = classify(b);
          var da = ca.days == null ? 9999 : ca.days;
          var db2 = cb.days == null ? 9999 : cb.days;
          if (da !== db2) return da - db2;
          return (PRIORITY_ORDER[a.priority] || 9) - (PRIORITY_ORDER[b.priority] || 9);
        })
        .slice(0, 6)
        .map(function (r) {
          var c = classify(r);
          return {
            id: String(r.id),
            name: r.name || '未命名任务',
            status: r.status || '待办',
            priority: r.priority || 'P2 中',
            category: r.category || '其他',
            due: r.due || '',
            delay: r.delay || '',
            days: c.days,
            overdue: c.overdue,
            dueToday: c.dueToday,
            soon: c.soon
          };
        });
      return {
        total: rows.length,
        open: open.length,
        done: done.length,
        delayed: rows.filter(function (r) { return r.status === '已延期'; }).length,
        overdue: overdue,
        dueToday: dueToday,
        soon: soon,
        byStatus: byStatus,
        next: next
      };
    },

    /** 智能问答用：任务不在记录的 entries 表里，主应用要单独把它们捞去检索 */
    allTasks: function () {
      return (state.rows || []).map(function (r) {
        var c = classify(r);
        return {
          id: String(r.id),
          name: r.name || '未命名任务',
          status: r.status || '待办',
          priority: r.priority || 'P2 中',
          category: r.category || '其他',
          due: r.due || '',
          delay: r.delay || '',
          delayCount: Number(r.delayCount) || 0,
          nextAction: r.nextAction || '',
          tags: r.tags || '',
          done: r.done || '',
          detail: (r.detail || '').slice(0, 400),
          days: c.days, overdue: c.overdue, dueToday: c.dueToday, soon: c.soon
        };
      });
    },
    /** 主应用从概览里点某条任务时，直接打开任务详情弹层 */
    openTask: function (id) {
      if (typeof openDetailModal === 'function') openDetailModal(String(id));
    },
    /** 查若干任务的摘要（主应用用它算想法派生任务的进度） */
    byIds: function (ids) {
      var set = {};
      (ids || []).forEach(function (v) { set[String(v)] = 1; });
      return (state.rows || [])
        .filter(function (r) { return set[String(r.id)]; })
        .map(function (r) {
          return {
            id: String(r.id),
            name: r.name || '',
            status: r.status || '待办',
            nextAction: r.nextAction || '',
            sourceIdea: r.sourceIdea || '',
          };
        });
    },
    /** 一次写入多条任务，全部完成后只刷新一次（想法拆解用） */
    addMany: function (list, cb) {
      var i = 0;
      var created = [];
      function next() {
        if (i >= list.length) {
          loadTasks(function () {
            refreshAll();
            if (cb) cb(null, created);
          });
          return;
        }
        db.addRecord({ databaseId: DATABASE_ID, properties: taskProperties(list[i++]) })
          .then(function (res) {
            created.push(res && (res.id || res._id));
            next();
          })
          .catch(function (err) {
            if (cb) cb(err, created);
          });
      }
      if (!list.length) {
        if (cb) cb(new Error('没有要写入的任务'), []);
        return;
      }
      next();
    },
    /** 从记录里创建一条待办（供主应用快速记录联动） */
    addFromEntry: function (payload, cb) {
      db.addRecord({ databaseId: DATABASE_ID, properties: taskProperties(payload) })
        .then(function () {
          return loadTasks(function () {
            refreshAll();
            if (cb) cb(null);
          });
        })
        .catch(function (err) {
          if (cb) cb(err);
        });
    },
  };
})();
