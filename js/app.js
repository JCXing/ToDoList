import { cloud } from './cloud.js';
import * as api from './db.js';
import * as ai from './ai.js';
import * as keep from './session.js';
import * as ideas from './ideas.js';

/* ============================================================
   工具
   ============================================================ */

const $ = (sel, root = document) => root.querySelector(sel);

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const KIND_ICON = { idea: 'idea', material: 'material', todo: 'todo', note: 'note' };

function fmtRel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (Number.isNaN(diff)) return '';
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

function fmtDue(dateStr) {
  if (!dateStr) return '';
  const today = todayStr();
  if (dateStr === today) return '今天到期';
  const d = new Date(`${dateStr}T00:00:00`);
  const t = new Date(`${today}T00:00:00`);
  const days = Math.round((d - t) / 86400000);
  if (days === 1) return '明天到期';
  if (days > 1) return `${dateStr.slice(5).replace('-', '/')} 到期`;
  return `逾期 ${Math.abs(days)} 天`;
}

const isOverdue = (e) => e.kind === 'todo' && !e.done && e.due_date && e.due_date < todayStr();

function toast(message, kind = 'ok') {
  const wrap = $('#toast-wrap');
  const el = document.createElement('div');
  el.className = `etoast${kind === 'err' ? ' err' : ''}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 260);
  }, kind === 'err' ? 4200 : 2600);
}

/* 轻量 markdown 渲染（先转义，再套用有限的语法） */
function inlineMd(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function md(src) {
  const lines = esc(src).split('\n');
  let html = '';
  let inList = false;
  const closeList = () => {
    if (inList) {
      html += '</ul>';
      inList = false;
    }
  };
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      closeList();
      continue;
    }
    const h = t.match(/^#{1,4}\s+(.*)$/);
    if (h) {
      closeList();
      html += `<h4>${inlineMd(h[1])}</h4>`;
      continue;
    }
    const li = t.match(/^[-*]\s+(.*)$/);
    if (li) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${inlineMd(li[1])}</li>`;
      continue;
    }
    closeList();
    html += `<p>${inlineMd(t)}</p>`;
  }
  closeList();
  return html;
}

function parseActions(text) {
  const idx = text.lastIndexOf('后续行动建议');
  if (idx === -1) return [];
  const tail = text.slice(idx).split('\n').slice(1);
  return tail
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s+/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, '').replace(/\*\*/g, '').trim())
    .filter(Boolean)
    .slice(0, 6);
}

function icon(name, cls = 'ico') {
  const paths = {
    inbox: '<path d="M3.5 12.5 6 5.5h12l2.5 7v5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-5Z"/><path d="M3.5 12.5H9l1 2h4l1-2h5.5"/>',
    todo: '<path d="m4 12 4 4 10-9"/>',
    idea: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 1 3.5 10.9c-.4.3-.5.7-.5 1.1v1H9v-1c0-.4-.1-.8-.5-1.1A6 6 0 0 1 12 3Z"/>',
    material: '<path d="M5 4.5h8.5L19 10v9.5H5z"/><path d="M13 4.5V10h6"/>',
    note: '<path d="M4 6h16M4 12h16M4 18h9"/>',
    chart: '<path d="M4 19V5M4 19h16"/><path d="M8 15v-3M12.5 15V9M17 15v-5"/>',
    chat: '<path d="M20 15.5a2 2 0 0 1-2 2H8L4 21V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M6.5 17.5 9 15M15 9l2.5-2.5"/>',
    link: '<path d="M9.5 14.5 14.5 9.5"/><path d="M13 6.5 14.6 5a3.2 3.2 0 0 1 4.5 4.5L17.5 11"/><path d="M11 17.5 9.4 19a3.2 3.2 0 0 1-4.5-4.5L6.5 13"/>',
    trash: '<path d="M4.5 7h15M9 7V4.5h6V7M6.5 7l.8 12.5h9.4L17.5 7"/>',
    edit: '<path d="M4.5 19.5h4L20 8l-4-4L4.5 15.5z"/><path d="m14.5 5.5 4 4"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    check: '<path d="m4 12 4.5 4.5L20 6.5"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4h-4"/>',
    send: '<path d="M4.5 12 20 4.5 15 20l-3.5-6.5z"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  };
  return `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${paths[name] || ''}</svg>`;
}

/* ============================================================
   状态
   ============================================================ */

const state = {
  user: null,
  entries: [],
  summaries: [],
  qaLogs: [],
  view: 'inbox',
  query: '',
  category: null,
  tag: null,
  selectedId: null,
  busy: new Set(),
  failed: new Map(),
  loading: true,
  seeding: false,
  chat: { messages: [], busy: false, controller: null, seq: 0 },
  summary: { busy: false, streaming: '' },
  taskStats: { total: 0, open: 0, done: 0, delayed: 0, overdue: 0, dueToday: 0, soon: 0, byStatus: {}, next: [] },
};

const VIEW_META = {
  inbox: { title: '收件箱', icon: 'inbox' },
  tasks: { title: '任务', icon: 'todo' },
  idea: { title: '想法', icon: 'idea' },
  material: { title: '资料', icon: 'material' },
  // Supabase 版未开启 AI：「阶段总结」「智能问答」页签暂时收起
  // summary: { title: '阶段总结', icon: 'chart' },
  // chat: { title: '智能问答', icon: 'chat' },
};

/** 改类型时的一类话，帮你想清楚该放哪 */
const KIND_HINT = {
  idea: '自己冒出来的念头、反思、疑问',
  material: '抄来的、查来的、以后要翻回去看的',
  todo: '要动手去做的事',
  note: '上面都不像，先放着',
};

/** 空列表时按视图解释「这里装什么、你在录入框写的东西会不会进来」 */
const EMPTY_HINT = {
  inbox: {
    icon: 'inbox',
    title: '这里还没有记录',
    body: '所有记录都会先落到这里。类型由你决定：在上面的下拉里选「想法 / 资料 / 待办 / 笔记」，或者直接切到「想法」「资料」页再记——在哪个页记就是哪一类。',
  },
  idea: {
    icon: 'idea',
    title: '还没有想法类记录',
    body: '在「想法」页随手记的内容都会归到这里；在别处记的也可以打开记录、点标题下面的「归到 → 想法」换过来。',
  },
  material: {
    icon: 'material',
    title: '还没有资料类记录',
    body: '在「资料」页随手记的内容都会归到这里；在别处记的可以打开记录、点标题下面的「归到 → 资料」换过来，或点右上角「批量改类型」一次改一批。',
  },
  tasks: {
    icon: 'todo',
    title: '任务台还是空的',
    body: '记录里出现「要做的事」时会自动建一条任务；也可以直接在这里点「新建任务」。',
  },
};

/* ============================================================
   数据加载
   ============================================================ */

async function loadAll() {
  state.loading = true;
  renderContent();
  const [entries, summaries, qaLogs] = await Promise.all([
    api.listEntries(),
    api.listSummaries().catch(() => []),
    api.listQaLogs().catch(() => []),
  ]);
  state.entries = entries;
  state.summaries = summaries;
  state.qaLogs = qaLogs;
  state.loading = false;
  render();
}

/* ============================================================
   过滤 / 派生
   ============================================================ */

function haystack(e) {
  return [e.title, e.content, e.summary, e.category, (e.tags || []).join(' '), (e.key_points || []).join(' ')]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function scopedEntries() {
  let list = state.entries;
  if (state.view === 'tasks') return [];
  if (state.view === 'idea') list = list.filter((e) => e.kind === 'idea' || e.kind === 'note');
  else if (state.view === 'material') list = list.filter((e) => e.kind === 'material');
  else if (state.view === 'summary' || state.view === 'chat') return [];

  if (state.category) list = list.filter((e) => e.category === state.category);
  if (state.tag) list = list.filter((e) => (e.tags || []).includes(state.tag));
  const q = state.query.trim().toLowerCase();
  if (q) list = list.filter((e) => haystack(e).includes(q));
  return list;
}

function counts() {
  const all = state.entries;
  const t = state.taskStats || {};
  return {
    inbox: all.length,
    todo: t.open || 0,
    tasks: t.open || 0,
    taskDone: t.done || 0,
    taskOverdue: t.overdue || 0,
    taskToday: t.dueToday || 0,
    taskTotal: t.total || 0,
    idea: all.filter((e) => e.kind === 'idea' || e.kind === 'note').length,
    material: all.filter((e) => e.kind === 'material').length,
    summary: state.summaries.length,
    category: all.reduce((acc, e) => {
      const key = e.category || '未分类';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    tags: all.reduce((acc, e) => {
      (e.tags || []).forEach((tag) => {
        acc[tag] = (acc[tag] || 0) + 1;
      });
      return acc;
    }, {}),
    overdue: t.overdue || 0,
    done: t.done || 0,
    week: all.filter((e) => Date.now() - new Date(e.created_at).getTime() < 86400000 * 7).length,
  };
}

/* ============================================================
   渲染 — 顶部 / 左栏
   ============================================================ */

function renderNav() {
  const c = counts();
  $('#nav-list').innerHTML = Object.entries(VIEW_META)
    .map(
      ([key, meta]) => `
      <button class="nav-item${state.view === key ? ' is-active' : ''}" data-view="${key}">
        ${icon(meta.icon, 'nav-ico')}
        <span>${meta.title}</span>
        <span class="nav-count">${c[key] || ''}</span>
      </button>`,
    )
    .join('');

  const cats = Object.entries(c.category).sort((a, b) => b[1] - a[1]);
  $('#category-list').innerHTML = cats.length
    ? cats
        .map(
          ([name, n]) => `
        <button class="cat-item${state.category === name ? ' is-active' : ''}" data-cat="${esc(name)}">
          <i class="cat-bullet"></i><span>${esc(name)}</span><span class="cat-count">${n}</span>
        </button>`,
        )
        .join('')
    : '<div class="rail-title" style="padding-left:8px;color:var(--ink-4);font-size:11px">暂无分类</div>';

  const tags = Object.entries(c.tags)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18);
  $('#tag-list').innerHTML = tags
    .map(
      ([name, n]) =>
        `<button class="tag-pill${state.tag === name ? ' is-active' : ''}" data-tag="${esc(name)}">${esc(name)}</button>`,
    )
    .join('');
}

function renderHeader() {
  const meta = VIEW_META[state.view];
  const c = counts();
  $('#view-title').textContent = meta.title;

  let sub = '';
  if (state.view === 'inbox') sub = state.query
    ? `搜索「${state.query}」命中 ${scopedEntries().length} 条`
    : `全部记录都在这里 · 共 ${c.inbox} 条${c.inbox ? `，最近一次 ${fmtRel(state.entries[0]?.created_at) || '—'}` : ''}`;
  else if (state.view === 'tasks') sub = `${c.tasks} 项待跟进${state.taskStats.delayed ? ` · ${state.taskStats.delayed} 项已延期` : ''} · 共 ${state.taskStats.total} 项任务`;
  else if (state.view === 'idea') sub = `在这个页面记的都归到这里 · 共 ${c.idea} 条`;
  else if (state.view === 'material') sub = `在这个页面记的都归到这里 · 共 ${c.material} 条`;
  else if (state.view === 'summary') sub = '从记录里回看这段时间，并给出下一步建议';
  else if (state.view === 'chat') sub = '只在你自己的记录里找答案，答不上来会直说';
  $('#view-sub').textContent = sub;

  const actions = $('#view-actions');
  if (state.view === 'chat') {
    actions.innerHTML = state.chat.messages.length
      ? `<button class="btn-ghost" data-act="reset-chat">${icon('refresh')}新对话</button>`
      : '';
  } else if (['inbox', 'idea', 'material'].includes(state.view) && state.entries.length) {
    // 单条改类型在卡片上点类型标签就行，这里给一个一屏改一批的入口
    actions.innerHTML = `<button class="btn-ghost" data-act="batch-kind">${icon('spark')}批量改类型（${state.entries.length} 条）</button>`;
  } else {
    actions.innerHTML = '';
  }

  applyViewChrome();
}

/** 右侧栏在任务视图里承载「任务概览」，窄屏（抽屉模式）则让位给主区 */
const SIDEBAR_MIN = 1500;
function sidebarWide() {
  return window.matchMedia(`(min-width: ${SIDEBAR_MIN}px)`).matches;
}

/**
 * 宽屏任务视图：把「新建任务」搬进最右侧栏，且排在「待完成」卡片上面 ——
 * 录入口放在视线第一落点，往下才是待完成清单。主区右列腾出来的位置交给「今天要处理」。
 * 窄屏（右栏是抽屉）时搬回主区，单列顺序保持「今天要处理 → 新建任务 → 清单 → 统计」。
 */
function mountAddCard() {
  const add = $('#addSection');
  const board = $('#view-board');
  const detail = $('#detail');
  if (!add || !board || !detail) return;
  if (state.view === 'tasks' && sidebarWide()) {
    if (add.parentElement !== detail) detail.insertBefore(add, detail.firstChild);
    board.classList.add('add-in-side');
    return;
  }
  if (add.parentElement !== board) {
    const anchor = $('#listSection');
    if (anchor) board.insertBefore(add, anchor);
    else board.appendChild(add);
  }
  board.classList.remove('add-in-side');
}

/** 任务视图使用嵌入的任务台，其余视图用记录列表 + 详情面板 */
function applyViewChrome() {
  const board = state.view === 'tasks';
  const wide = sidebarWide();
  $('#view-board')?.classList.toggle('hidden', !board);
  $('#composer')?.classList.toggle('hidden', board || state.view === 'summary' || state.view === 'chat');
  $('#content')?.classList.toggle('hidden', board);
  $('#main-head')?.classList.toggle('hidden', board);
  $('#search-box')?.classList.toggle('hidden', board);
  $('#detail')?.classList.toggle('hidden', board && !wide);
  // 任务台有自己的筛选器，左栏的分类 / 标签此时不参与过滤
  document.querySelectorAll('.rail-block').forEach((el) => el.classList.toggle('hidden', board));
  // 同步状态与导入导出属于任务台，其他视图不显示
  document.querySelectorAll('#syncState, [data-action="export"], [data-action="import"]').forEach((el) => {
    el.classList.toggle('hidden', !board);
  });
  if (board) renderDetail();
  else mountAddCard();
}

/* ============================================================
   渲染 — 列表
   ============================================================ */

function chipsFor(e) {
  const out = [];
  out.push(`<span class="chip cat">${esc(e.category || '未分类')}</span>`);
  if (e.kind === 'todo') {
    if (e.priority === 1) out.push('<span class="chip prio-1">高优先</span>');
    else if (e.priority === 2) out.push('<span class="chip prio-2">中优先</span>');
    if (e.due_date) out.push(`<span class="chip due${isOverdue(e) ? ' overdue' : ''}">${esc(fmtDue(e.due_date))}</span>`);
    if (e.done) out.push('<span class="chip">已完成</span>');
  }
  if ((e.related_ids || []).length) out.push(`<span class="chip link">${icon('link')}${e.related_ids.length} 条关联</span>`);
  return out.join('');
}

function cardHtml(e) {
  const busy = state.busy.has(e.id);
  const failed = state.failed.get(e.id);
  const selected = state.selectedId === e.id;
  const raw = (e.content || '').slice(0, 160);

  return `
  <article class="ecard${selected ? ' is-selected' : ''}${busy ? ' is-analyzing' : ''}" data-id="${e.id}">
    <div class="entry-top">
      <button class="kind-tag kind-${e.kind}" data-act="pick-kind"
        title="这条现在是「${esc(ai.KIND_LABEL[e.kind] || e.kind)}」，点这里改类型">${esc(ai.KIND_LABEL[e.kind] || e.kind)}</button>
      <h3 class="entry-title${e.done ? ' done' : ''}">${esc(e.title || '未命名记录')}</h3>
      <span class="entry-time">${fmtRel(e.created_at)}</span>
    </div>
    ${
      busy
        ? `<div class="analyzing-note"><span class="pulse"></span>AI 正在归类、写摘要、找关联…</div>
           <div style="margin-top:8px" class="skeleton-line"></div>`
        : `<p class="entry-summary${e.summary ? '' : ' is-raw'}">${esc(e.summary || raw || '（空白记录）')}</p>`
    }
    <div class="entry-meta">
      ${chipsFor(e)}
      ${ideas.cardExtrasHtml(e)}
      ${(e.tags || []).slice(0, 3).map((t) => `<span class="entry-tag">${esc(t)}</span>`).join('')}
      ${failed ? `<span class="chip" style="color:var(--danger);background:var(--danger-soft);border-color:transparent">整理失败</span>` : ''}
      <span class="ecard-tools">
        ${
          e.kind === 'todo'
            ? `<button class="icon-btn" data-act="toggle-done" title="${e.done ? '标记未完成' : '标记完成'}">${icon('check')}</button>`
            : ''
        }
        <button class="icon-btn" data-act="delete" title="删除">${icon('trash')}</button>
      </span>
    </div>
  </article>`;
}

function emptyHtml() {
  if (state.query) {
    return `<div class="eempty">${icon('inbox', 'empty-ico')}
      <h3>没有找到匹配的记录</h3>
      <p>换个关键词试试，或者直接问管家——它会在你的记录里找答案。</p>
      <button class="btn-ghost" data-act="ask-query">用 AI 回答「${esc(state.query)}」</button>
    </div>`;
  }
  const hint = EMPTY_HINT[state.view] || EMPTY_HINT.inbox;
  const notes = state.entries.filter((e) => e.kind === 'note').length;
  return `<div class="eempty">
    ${icon(hint.icon, 'empty-ico')}
    <h3>${hint.title}</h3>
    <p>${hint.body}</p>
    ${
      state.view === 'material' && notes
        ? `<button class="btn-ghost" style="margin-top:4px" data-act="open-kind-modal">把别的记录改成资料（${notes} 条笔记）</button>`
        : ''
    }
    ${state.view === 'tasks' ? '' : '<button class="btn-ghost" data-act="seed">载入几条示例，先看看效果</button>'}
  </div>`;
}

function renderList() {
  const list = scopedEntries();

  if (state.loading) {
    $('#content').innerHTML = `<div class="elist">${[1, 2, 3]
      .map(
        () => `<div class="ecard"><div class="skeleton-line" style="width:42%;margin-bottom:10px"></div>
        <div class="skeleton-line" style="width:88%;margin-bottom:6px"></div>
        <div class="skeleton-line" style="width:64%"></div></div>`,
      )
      .join('')}</div>`;
    return;
  }

  if (!list.length) {
    $('#content').innerHTML = emptyHtml();
    return;
  }

  $('#content').innerHTML = `<div class="elist">${list.map(cardHtml).join('')}</div>`;
}

/* ============================================================
   渲染 — 右侧详情
   ============================================================ */

function relatedOf(e) {
  const ids = new Set(e.related_ids || []);
  state.entries.forEach((other) => {
    if ((other.related_ids || []).includes(e.id)) ids.add(other.id);
  });
  ids.delete(e.id);
  return [...ids].map((id) => state.entries.find((x) => x.id === id)).filter(Boolean);
}

function taskTier(t) {
  if (t.overdue) return { cls: 'is-overdue', label: '已逾期' };
  if (t.dueToday) return { cls: 'is-today', label: '今天到期' };
  if (typeof t.days === 'number' && t.days > 0) return { cls: 'is-soon', label: `${t.days} 天后到期` };
  return { cls: 'is-later', label: '未设期限' };
}

/** 任务概览里的一条任务（右侧栏与收件箱概览共用） */
function taskRowHtml(t) {
  const tier = taskTier(t);
  const due = t.overdue
    ? `逾期 ${Math.abs(t.days)} 天`
    : t.dueToday
      ? '今天到期'
      : t.due
        ? t.due.slice(5).replace('-', '/') + ' 到期'
        : '未设期限';
  return `<button class="tk-item ${tier.cls}" type="button" data-task="${esc(t.id)}">
      <span class="tk-dot"></span>
      <span class="tk-body">
        <span class="tk-name">${esc(t.name)}</span>
        <span class="tk-meta"><i class="tk-pri">${esc((t.priority || '').split(' ')[0] || 'P2')}</i>${esc(t.category || '其他')}<i class="tk-due">${esc(due)}</i></span>
      </span>
    </button>`;
}

function taskOverviewHtml() {
  const t = state.taskStats || {};
  const total = t.total || 0;
  const done = t.done || 0;
  const rate = total ? Math.round((done / total) * 100) : 0;
  const next = Array.isArray(t.next) ? t.next.slice(0, 5) : [];

  return `
    <div class="tk-hero">
      <div class="tk-hero-top">
        <div>
          <div class="label">待完成</div>
          <div class="big">${t.open || 0}</div>
        </div>
        <div class="tk-hero-side">
          <span><b>${t.overdue || 0}</b> 逾期</span>
          <span><b>${t.dueToday || 0}</b> 今日</span>
          <span><b>${t.soon || 0}</b> 三日内</span>
        </div>
      </div>
      <div class="tk-rate">
        <div class="tk-rate-bar"><i style="width:${rate}%"></i></div>
        <span>已完成 ${done} / ${total} · ${rate}%</span>
      </div>
    </div>

    <div class="tk-panel">
      <div class="tk-panel-head">${icon('todo')} 接下来做
        <button class="tk-more" type="button" data-act="goto-tasks">全部任务</button>
      </div>
      ${
        next.length
          ? `<div class="tk-list">${next.map(taskRowHtml).join('')}</div>`
          : `<div class="tk-empty">还没有待完成的任务，去「新建任务」添加一条。</div>`
      }
    </div>
    ${ideas.reviewPanelHtml()}`;
}

function overviewHtml() {
  const c = counts();
  const t = state.taskStats || {};
  const cats = Object.entries(c.category).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = Math.max(1, ...cats.map(([, n]) => n));
  const next = Array.isArray(t.next) ? t.next.slice(0, 3) : [];
  const pending = t.open || 0;
  const hint = t.overdue
    ? `其中 ${t.overdue} 项已逾期，建议先处理`
    : t.dueToday
      ? `有 ${t.dueToday} 项今天到期`
      : pending
        ? '暂无逾期，按计划推进即可'
        : '暂时没有待完成的任务';

  return `
    <div class="overview-hero task-hero">
      <div class="label">待完成</div>
      <div class="big">${pending}</div>
      <div class="sub">${hint}</div>
    </div>

    <div class="tk-panel">
      <div class="tk-panel-head">${icon('todo')} 接下来做
        <button class="tk-more" type="button" data-act="goto-tasks">去任务页</button>
      </div>
      ${
        next.length
          ? `<div class="tk-list">${next.map(taskRowHtml).join('')}</div>`
          : `<div class="tk-empty">任务清单还是空的，去「任务」页添加第一条。</div>`
      }
    </div>

    ${ideas.reviewPanelHtml()}

    <div class="estat-row">
      <div class="estat"><div class="v">${c.inbox}</div><div class="k">全部记录</div></div>
      <div class="estat"><div class="v">${c.week}</div><div class="k">近 7 天新增</div></div>
      <div class="estat"><div class="v">${t.done || 0}</div><div class="k">已完成任务</div></div>
      <div class="estat"><div class="v">${Object.keys(c.category).length}</div><div class="k">覆盖分类</div></div>
    </div>
    ${
      cats.length
        ? `<div class="detail-block">
            <div class="block-label">${icon('chart')} 记录分类分布</div>
            <div class="bar-row">
              ${cats
                .map(
                  ([name, n]) => `<div class="bar-item"><span>${esc(name)}</span>
                  <div class="bar-track"><div class="bar-fill" style="width:${Math.round((n / max) * 100)}%"></div></div>
                  <span class="bar-num">${n}</span></div>`,
                )
                .join('')}
            </div>
          </div>`
        : ''
    }
    <div class="detail-block">
      <div class="block-label">${icon('spark')} 试试这样问</div>
      <div class="tag-list" style="padding:0">
        <button class="tag-pill" data-ask="我最近在想什么？">我最近在想什么？</button>
        <button class="tag-pill" data-ask="这周有哪些事被我拖住了？">这周拖住了什么？</button>
        <button class="tag-pill" data-ask="把和产品相关的记录串起来讲讲">产品线索串联</button>
      </div>
    </div>`;
}

function detailEntryHtml(e) {
  const rel = relatedOf(e);
  const busy = state.busy.has(e.id);
  const failed = state.failed.get(e.id);
  const points = e.key_points || [];

  return `
    <div class="detail-head">
      <h2>${esc(e.title || '未命名记录')}</h2>
      <button class="icon-btn" data-act="close-detail" title="收起">${icon('close')}</button>
    </div>
    <div class="detail-meta">
      <span class="chip cat">${esc(ai.KIND_LABEL[e.kind] || e.kind)} · ${esc(e.category || '未分类')}</span>
      ${chipsFor(e).replace(/<span class="chip cat">[^<]*<\/span>/, '')}
      <span class="chip">${fmtRel(e.created_at)}</span>
    </div>

    <div class="kind-switch">
      <span class="ks-label">类型</span>
      ${Object.entries(ai.KIND_LABEL)
        .map(
          ([v, l]) =>
            `<button class="ks-btn${e.kind === v ? ' is-active' : ''}" data-act="set-kind" data-kind="${v}" title="把这条改成「${l}」">${l}</button>`,
        )
        .join('')}
    </div>

    ${
      busy
        ? `<div class="detail-block"><div class="analyzing-note"><span class="pulse"></span>正在整理这条记录…</div></div>`
        : e.summary
          ? `<div class="detail-block"><div class="block-label">${icon('spark')} 一句话摘要</div>
              <p class="detail-text">${esc(e.summary)}</p></div>`
          : `<div class="detail-block"><div class="block-label">${icon('spark')} 摘要</div>
              <p class="detail-text">还没有摘要${failed ? '（整理失败）' : ''}。AI 未开启时可以点「编辑」手写摘要。</p></div>`
    }

    ${
      points.length
        ? `<div class="detail-block"><div class="block-label">${icon('check')} 重点信息</div>
            <ul class="point-list">${points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`
        : ''
    }

    ${ideas.detailBlockHtml(e)}

    <div class="detail-block">
      <div class="block-label">${icon('note')} 原始记录</div>
      <div class="detail-content">${esc(e.content || '（空）')}</div>
      ${
        (e.tags || []).length
          ? `<div class="tag-list" style="padding:10px 0 0">${(e.tags || [])
              .map(
                (t) =>
                  `<button class="tag-pill${state.tag === t ? ' is-active' : ''}" data-act="filter-tag" data-tag="${esc(t)}" title="按这个标签筛选">#${esc(t)}</button>`,
              )
              .join('')}</div>`
          : ''
      }
    </div>

    <div class="detail-block">
      <div class="block-label">${icon('link')} 关联内容 · ${rel.length}</div>
      ${
        rel.length
          ? `<div class="rel-list">${rel
              .map(
                (r) => `<button class="rel-item" data-jump="${r.id}">
                  <span class="rel-title">${esc(r.title)}</span>
                  <span class="rel-sub">${esc(ai.KIND_LABEL[r.kind] || r.kind)} · ${esc(r.summary || r.content || '').slice(0, 40)}</span>
                </button>`,
              )
              .join('')}</div>`
          : `<p class="detail-text" style="color:var(--ink-4)">还没有建立关联。再记录几条相关内容，管家会把它们串起来。</p>`
      }
    </div>

    <div class="detail-actions">
      ${e.kind === 'todo' ? `<button class="btn-ghost" data-act="toggle-done">${icon(e.done ? 'refresh' : 'check')}${e.done ? '标记为未完成' : '标记为完成'}</button>` : ''}
      <button class="btn-ghost" data-act="edit">${icon('edit')}编辑</button>
      <button class="btn-ghost" data-act="delete" style="color:var(--danger)">${icon('trash')}删除这条</button>
    </div>`;
}

function renderDetail() {
  const body = $('#detail-body');
  if (!body) return;
  if (state.view === 'tasks') {
    // 统计卡留在主区不动，右栏只渲染任务概览（「新建任务」卡在它上面）
    body.innerHTML = taskOverviewHtml();
  } else {
    const entry = state.entries.find((e) => e.id === state.selectedId);
    body.innerHTML = entry ? detailEntryHtml(entry) : overviewHtml();
  }
  // innerHTML 只覆盖 #detail-body，放在它前面的卡片不会被抹掉，所以这步放最后
  mountAddCard();
}

/* ============================================================
   渲染 — 阶段总结
   ============================================================ */

function renderSummaryView() {
  const range = state.summary.range || '7';
  const cards = state.summaries
    .map((s) => {
      const actions = Array.isArray(s.actions) ? s.actions : [];
      return `<article class="summary-card" data-summary="${s.id}">
        <div class="summary-card-head">
          <h3>${esc(s.title)}</h3>
          <span class="time">${fmtRel(s.created_at)} · ${s.entry_count} 条记录</span>
          <button class="icon-btn" data-act="del-summary" data-id="${s.id}" title="删除">${icon('trash')}</button>
        </div>
        <div class="prose">${md(s.content || '')}</div>
        ${
          actions.length
            ? `<div class="actions-list">${actions
                .map((a, i) => `<div class="action-item"><span class="action-idx">${i + 1}</span><span>${esc(a)}</span></div>`)
                .join('')}</div>`
            : ''
        }
      </article>`;
    })
    .join('');

  $('#content').innerHTML = `
    <div class="summary-toolbar">
      <select id="summary-range">
        <option value="7"${range === '7' ? ' selected' : ''}>近 7 天</option>
        <option value="30"${range === '30' ? ' selected' : ''}>近 30 天</option>
        <option value="all"${range === 'all' ? ' selected' : ''}>全部记录</option>
      </select>
      <span class="hint">${summaryRangeCount(range)} 条记录会参与本次总结</span>
      <button class="btn-primary" id="gen-summary">${icon('spark')}生成阶段总结</button>
    </div>
    <div id="summary-stream"></div>
    ${cards || `<div class="eempty">${icon('chart', 'empty-ico')}<h3>还没有阶段总结</h3>
      <p>选一个时间范围，管家会回看这段时间的记录：主线是什么、推进了什么、卡在哪里，以及接下来建议先做哪几件事。</p></div>`}`;
}

function summaryRangeCount(range) {
  if (range === 'all') return state.entries.length;
  const days = Number(range) || 7;
  return state.entries.filter((e) => Date.now() - new Date(e.created_at).getTime() <= days * 86400000).length;
}

function summaryEntries(range) {
  if (range === 'all') return state.entries;
  const days = Number(range) || 7;
  return state.entries.filter((e) => Date.now() - new Date(e.created_at).getTime() <= days * 86400000);
}

async function generateSummary() {
  if (state.summary.busy) return;
  const range = $('#summary-range')?.value || '7';
  state.summary.range = range;
  const list = summaryEntries(range);
  if (!list.length) {
    toast('这个时间段还没有记录，先写几条再来总结', 'err');
    return;
  }
  const label = range === 'all' ? '全部记录' : `近 ${range} 天`;

  state.summary.busy = true;
  const btn = $('#gen-summary');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="pulse"></span>正在回看记录…';
  }
  const host = $('#summary-stream');
  const blockId = `sum-${Date.now()}`;
  host.innerHTML = `<article class="summary-card" id="${blockId}">
      <div class="summary-card-head"><h3>${label}的阶段总结</h3><span class="time">生成中…</span></div>
      <div class="prose" data-body></div>
    </article>`;

  let text = '';
  try {
    await ai.generateSummary({
      digest: buildDigest(list),
      periodLabel: label,
      onDelta: (d) => {
        text += d;
        const body = host.querySelector(`#${blockId} [data-body]`);
        if (body) body.innerHTML = md(text);
      },
    });

    const actions = parseActions(text);
    const periodStart = range === 'all' ? (list[list.length - 1]?.created_at || '').slice(0, 10) || null : new Date(Date.now() - Number(range) * 86400000).toISOString().slice(0, 10);
    const saved = await api.createSummary({
      title: `${label} · 阶段总结`,
      period_start: periodStart,
      period_end: todayStr(),
      content: text,
      actions: actions.map((a) => a),
      entry_count: list.length,
      owner_name: state.user?.name ?? null,
    });
    state.summaries.unshift(saved);
    toast('阶段总结已生成并保存');
    render();
  } catch (error) {
    toast(error.message || '生成失败，请重试', 'err');
    host.innerHTML = `<article class="summary-card"><div class="prose" style="color:var(--danger)">生成失败：${esc(error.message || '未知错误')}</div></article>`;
  } finally {
    state.summary.busy = false;
  }
}

function buildDigest(list) {
  const lines = list
    .slice(0, 120)
    .map((e) => {
      const date = (e.created_at || '').slice(0, 10);
      const kind = (ai.KIND_LABEL[e.kind] || e.kind) + (e.done ? '(已完成)' : '');
      return `${date} | ${kind} | ${e.category || '未分类'} | ${e.title || ''} | ${(e.summary || e.content || '').slice(0, 60)}`;
    })
    .join('\n');
  const conversion = ideas.conversionDigest();
  return conversion ? `${lines}\n\n【想法转化】${conversion}` : lines;
}

/* ============================================================
   渲染 — 智能问答
   ============================================================ */

function extractCites(text) {
  const ids = [...String(text).matchAll(/\[#(\d+)\]/g)].map((m) => Number(m[1]));
  return [...new Set(ids)].filter((id) => state.entries.some((e) => e.id === id));
}

/** 任务引用的写法是 [T#id]，和记录的 [#id] 区分开 */
function extractTaskCites(text) {
  const ids = [...String(text).matchAll(/\[T#(\d+)\]/g)].map((m) => Number(m[1]));
  const known = allTasks().map((t) => Number(t.id));
  return [...new Set(ids)].filter((id) => known.includes(id));
}

function renderChatView() {
  const msgs = state.chat.messages;
  const log = msgs.length
    ? msgs
        .map((m) => {
          const citeParts = [];
          (m.cites || []).forEach((id) => {
            const e = state.entries.find((x) => x.id === id);
            if (e) citeParts.push(`<button class="cite" data-jump="${id}">#${id} ${esc(e.title)}</button>`);
          });
          (m.taskCites || []).forEach((id) => {
            const t = allTasks().find((x) => String(x.id) === String(id));
            citeParts.push(`<button class="cite cite-task" data-task-jump="${esc(id)}">${icon('todo', 'cite-ic')}任务 ${esc(t ? t.name : id)}</button>`);
          });
          const cites = citeParts.length ? `<div class="cite-row">${citeParts.join('')}</div>` : '';
          const body = m.role === 'ai'
            ? `<div class="msg-text">${m.text ? md(m.text) : '<span class="typing"><i></i><i></i><i></i></span>'}</div>${cites}`
            : `<div class="msg-text">${md(m.text)}</div>`;
          return `<div class="msg ${m.role}">
            <div class="msg-avatar">${m.role === 'ai' ? '栖' : '我'}</div>
            <div class="msg-body"${m.role === 'ai' && m.streaming ? ' data-live="1"' : ''}>
              <div class="msg-role">${m.role === 'ai' ? '管家' : '你'}</div>
              ${body}
            </div>
          </div>`;
        })
        .join('')
    : '';

  const history = state.qaLogs.slice(0, 4);

  $('#content').innerHTML = `
    <div class="chat-wrap">
      ${
        msgs.length
          ? `<div class="chat-log" id="chat-log">${log}</div>`
          : `<div class="chat-log" id="chat-log">
              <div class="eempty" style="padding:18px 10px 6px">
                ${icon('chat', 'empty-ico')}
                <h3>问点什么吧</h3>
                <p>答案只来自你自己的记录与任务。里面没有的，它会直接告诉你没有。</p>
              </div>
              <div class="chat-suggest" style="justify-content:center">
                <button class="suggest" data-ask="我最近在关注什么？">我最近在关注什么？</button>
                <button class="suggest" data-ask="哪些任务被我拖住了？">哪些任务被拖住了？</button>
                <button class="suggest" data-ask="接下来最该先做哪件事？">接下来先做哪件？</button>
                <button class="suggest" data-ask="把和产品相关的记录串起来讲讲">产品线索串联</button>
              </div>
              ${
                history.length
                  ? `<div class="detail-block" style="max-width:560px;margin:8px auto 0">
                      <div class="block-label">最近问过</div>
                      <div class="rel-list">${history
                        .map(
                          (q) => `<button class="rel-item" data-ask="${esc(q.question)}">
                            <span class="rel-title">${esc(q.question)}</span>
                            <span class="rel-sub">${fmtRel(q.created_at)}</span></button>`,
                        )
                        .join('')}</div>
                    </div>`
                  : ''
              }
            </div>`
      }
      <form class="chat-form" id="chat-form">
        <textarea id="chat-input" rows="1" placeholder="问关于你记录的任何问题…"></textarea>
        <button class="btn-primary" id="chat-send" type="submit">${state.chat.busy ? icon('stop') + '停止' : icon('send') + '提问'}</button>
      </form>
    </div>`;
}

/* ============================================================
   渲染总入口
   ============================================================ */

function render() {
  renderNav();
  renderHeader();
  renderMetaOptions(); // 分类 / 标签候选随记录更新
  if (state.view === 'tasks') {
    applyViewChrome();
    return;
  }
  if (state.view === 'summary') renderSummaryView();
  else if (state.view === 'chat') renderChatView();
  else renderList();
  renderDetail();
}

function renderContent() {
  if (state.view === 'tasks') return;
  if (state.view === 'summary') renderSummaryView();
  else if (state.view === 'chat') renderChatView();
  else renderList();
}

/* ============================================================
   记录流程
   ============================================================ */

/** 录入时手动指定的类型：只在本次整理中生效，AI 不再覆盖 */
const manualKinds = new Map();

/**
 * 在哪个页面记，就是哪一类 —— 类型由「你选的」决定，AI 不再插手。
 * 只有主动在下拉里选「让 AI 猜」时，才会走 AI 判断。
 */
function defaultKindFor(view) {
  if (view === 'material') return 'material';
  if (view === 'idea') return 'idea';
  if (view === 'tasks') return 'todo';
  return 'idea'; // 收件箱 / 其它：默认想法，想归资料就自己切页签或改下拉
}

/**
 * 切页签时录入框的类型一定跟着页签走 —— "在哪个页面添加就是哪一类"。
 * 手动改过只在当前页签内保留；一切页签就重新跟随，不会带着旧选择跑。
 */
let composerKindPinnedView = null;
function syncComposerKind() {
  const sel = $('#capture-kind');
  if (!sel) return;
  if (composerKindPinnedView === state.view) return;
  sel.value = defaultKindFor(state.view);
}

async function capture() {
  const input = $('#capture-input');
  const text = input.value.trim();
  if (!text) {
    input.focus();
    toast('先写点什么再记录', 'err');
    return;
  }
  const btn = $('#capture-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="pulse"></span>正在保存…';

  // 用户自己填的分类 / 标签 / 类型优先于 AI 的判断，填了就直接落库
  const manualCategory = ($('#capture-category')?.value || '').trim().slice(0, 16);
  const manualTags = parseTags($('#capture-tags')?.value);
  const manualKind = ($('#capture-kind')?.value || '').trim();

  let row;
  try {
    row = await api.createEntry({
      content: text,
      title: text.split('\n')[0].slice(0, 24) || '未整理记录',
      kind: manualKind || 'note',
      owner_name: state.user?.name ?? null,
      ...(manualCategory ? { category: manualCategory } : {}),
      ...(manualTags.length ? { tags: manualTags } : {}),
    });
  } catch (error) {
    toast(error.message || '保存失败', 'err');
    btn.disabled = false;
    btn.innerHTML = `${icon('spark')}记录并整理`;
    return;
  }

  input.value = '';
  autoGrow(input);
  if ($('#capture-category')) $('#capture-category').value = '';
  if ($('#capture-tags')) $('#capture-tags').value = '';
  if ($('#capture-kind')) $('#capture-kind').value = defaultKindFor(state.view);
  // 手动指定过的类型要一路锁住，AI 整理时不能再改回去
  if (manualKind) manualKinds.set(row.id, manualKind);
  state.entries.unshift(row);
  if (ai.AI_ENABLED) {
    state.busy.add(row.id);
    render();
    toast('已记录，正在整理…');
  } else {
    render();
    toast(`已记录到「${ai.KIND_LABEL[row.kind] || row.kind}」（AI 未开启，按你选的类型保存）`);
  }

  btn.disabled = false;
  btn.innerHTML = `${icon('spark')}记录并整理`;

  await organize(row.id);
}

async function organize(id) {
  const entry = state.entries.find((e) => e.id === id);
  if (!entry) return;

  // Supabase 版：AI 未开启。内容已按你选的类型/分类/标签保存，这里不再整理。
  if (!ai.AI_ENABLED) {
    state.busy.delete(id);
    state.failed.delete(id);
    render();
    return;
  }

  state.busy.add(id);
  state.failed.delete(id);
  render();

  const index = state.entries
    .filter((e) => e.id !== id)
    .slice(0, 60)
    .map((e) => `${e.id} | ${e.title} | ${(e.tags || []).join(',')}`);

  // 用户手填的分类 / 标签 / 类型已在落库时写入，这里只做补充，不覆盖
  const ownCategory = (entry.category || '').trim();
  const ownTags = entry.tags || [];
  // 类型是用户说了算的：页签默认、下拉选择、详情页一键切换都算数；
  // 只有当初选了「让 AI 猜」（落库 note）才轮到 AI 判断
  const ownKind = manualKinds.get(id) || (entry.kind && entry.kind !== 'note' ? entry.kind : null);

  try {
    const result = await ai.analyzeEntry({
      content: entry.content,
      index,
      categories: knownCategories(),
      tagPool: knownTags(),
      locked: { category: ownCategory, tags: ownTags, kind: ownKind },
    });
    if (!result) throw new Error('整理结果解析失败');
    const saved = await api.updateEntry(id, {
      title: result.title || entry.title,
      // 用户/页签指定的类型说了算：AI 再怎么判都不许改回去
      kind: ownKind || result.kind,
      category: ownCategory || result.category,
      tags: mergeTags(ownTags, result.tags),
      summary: result.summary,
      key_points: result.key_points,
      priority: result.priority,
      due_date: result.due_date,
      related_ids: result.related_ids,
    });
    replaceEntry(saved);
    // 明确告诉你归到了哪一类，AI 判错了能立刻发现
    let note = `已归到「${ai.KIND_LABEL[saved.kind] || saved.kind}」· ${saved.category || '未分类'}${saved.related_ids?.length ? ` · 关联到 ${saved.related_ids.length} 条旧记录` : ''}`;
    if (saved.kind === 'todo') {
      const added = await pushTaskFromEntry(saved);
      if (added) note += ' · 已加入任务清单';
    }
    toast(note);
  } catch (error) {
    state.failed.set(id, error.message || '整理失败');
    toast(`内容已保存，AI 整理失败：${error.message || ''}`, 'err');
  } finally {
    // 注意：manualKinds 不清 —— 你定过的类型要一直有效，之后重新整理也不许改
    state.busy.delete(id);
    render();
  }
}

/** 客观信息 / 参数 / 摘录这类内容，AI 常常判成「笔记」而落进想法页，这里用来做一键纠正的预判 */
function looksLikeMaterial(e) {
  const t = `${e.title || ''} ${e.content || ''} ${e.summary || ''} ${(e.key_points || []).join(' ')}`;
  return /《[^》]+》|https?:\/\/|「[^」]{4,}」|“[^”]{4,}”|摘录|摘抄|读到|书里|书上说|文章(里|中)?(提到|说)|研究表明|数据显示|据.{0,6}统计|定义是|方法论|课程|报告显示|\d+\s*(mm|cm|nm|um|μm|m|kg|g|ms|s|V|W|℃|%|度)/i.test(
    t,
  );
}

/**
 * 类型判错了的批量纠正。
 * AI 判断难免把资料当成想法（反过来也一样），一条条改太慢；
 * 这里把全部记录列成一屏，每行右边直接选类型，只保存你动过的那些。
 */
function openKindModal() {
  const rows = state.entries.slice(0, 200);
  const opts = (cur) =>
    ['idea', 'material', 'todo', 'note']
      .map((k) => `<option value="${k}"${k === cur ? ' selected' : ''}>${ai.KIND_LABEL[k]}</option>`)
      .join('');

  const root = $('#modal-root');
  root.innerHTML = `<div class="emodal-mask">
    <div class="emodal">
      <h3>批量改类型</h3>
      <p class="auth-note" style="text-align:left;margin-top:2px">
        每行右边直接选类型，只改你动过的那些。想不清是想法还是资料时，按「以后会想查回去吗」判断——会就是资料。
      </p>
      <div class="kind-quick">
        <span>一键：</span>
        <button class="btn-ghost" data-quick="material">把「笔记」都改成资料</button>
        <button class="btn-ghost" data-quick="idea">把「笔记」都改成想法</button>
        <button class="btn-ghost" data-quick="reset">还原</button>
      </div>
      <div class="recheck" id="rc-list">
        ${
          rows.length
            ? rows
                .map(
                  (e) => `<div class="recheck-item">
            <span class="rc-main">
              <span class="rc-title">${esc(e.title || e.content || '未整理记录')}</span>
              <span class="rc-sub">${esc(e.category || '未分类')} · ${esc((e.summary || e.content || '').slice(0, 46))}</span>
            </span>
            <select class="rc-kind" data-id="${e.id}" data-cur="${esc(e.kind || 'note')}" title="这条的类型">${opts(e.kind || 'note')}</select>
          </div>`,
                )
                .join('')
            : '<p class="auth-note">还没有记录</p>'
        }
      </div>
      <div class="emodal-foot">
        <button class="btn-ghost" data-close>取消</button>
        <button class="btn-primary" data-save>保存</button>
      </div>
    </div>
  </div>`;

  const close = () => {
    root.innerHTML = '';
  };
  const selects = () => [...root.querySelectorAll('#rc-list .rc-kind')];
  const diffs = () =>
    selects()
      .filter((s) => s.value !== s.dataset.cur)
      .map((s) => ({ id: Number(s.dataset.id), kind: s.value }));
  const syncBtn = () => {
    const n = diffs().length;
    const btn = root.querySelector('[data-save]');
    btn.textContent = n ? `保存（改 ${n} 条）` : '保存';
    btn.disabled = !n;
  };

  root.querySelector('[data-close]').onclick = close;
  root.querySelector('.emodal-mask').addEventListener('click', (ev) => {
    if (ev.target.classList.contains('emodal-mask')) close();
  });
  root.querySelector('#rc-list').addEventListener('change', syncBtn);
  root.querySelector('.kind-quick').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-quick]');
    if (!btn) return;
    selects().forEach((s) => {
      if (btn.dataset.quick === 'reset') s.value = s.dataset.cur;
      else if (s.dataset.cur === 'note') s.value = btn.dataset.quick;
    });
    syncBtn();
  });
  syncBtn();

  root.querySelector('[data-save]').onclick = async () => {
    const list = diffs();
    if (!list.length) return;
    const btn = root.querySelector('[data-save]');
    btn.disabled = true;
    btn.textContent = `正在改 ${list.length} 条…`;
    let done = 0;
    for (const { id, kind } of list) {
      try {
        replaceEntry(await api.updateEntry(id, { kind }));
        manualKinds.set(id, kind);
        done += 1;
      } catch {
        /* 单条失败不影响其它记录 */
      }
    }
    close();
    render();
    toast(done ? `已改 ${done} 条的类型` : '一条都没改成', done ? 'ok' : 'err');
  };
}

/** 单条改类型的小弹窗：点列表卡片上的类型标签就能弹出来，不用先打开详情 */
function openKindMenu(entry) {
  const root = $('#modal-root');
  const kinds = ['idea', 'material', 'todo', 'note'];
  root.innerHTML = `<div class="emodal-mask">
    <div class="emodal kmenu">
      <h3>这条归到哪一类？</h3>
      <p class="kmenu-title">${esc(entry.title || entry.content || '未命名记录')}</p>
      <div class="kmenu-grid">
        ${kinds
          .map(
            (k) => `<button class="kmenu-btn${entry.kind === k ? ' is-active' : ''}" data-kind="${k}">
              <span class="kmenu-name">${ai.KIND_LABEL[k]}</span>
              <span class="kmenu-hint">${KIND_HINT[k]}</span>
            </button>`,
          )
          .join('')}
      </div>
      <div class="emodal-foot">
        <button class="btn-ghost" data-close>取消</button>
        <button class="btn-ghost" data-more>改一批…</button>
      </div>
    </div>
  </div>`;

  const close = () => {
    root.innerHTML = '';
  };
  root.querySelector('[data-close]').onclick = close;
  root.querySelector('.emodal-mask').addEventListener('click', (ev) => {
    if (ev.target.classList.contains('emodal-mask')) close();
  });
  root.querySelector('[data-more]').onclick = () => {
    close();
    openKindModal();
  };
  root.querySelector('.kmenu-grid').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-kind]');
    if (!btn) return;
    close();
    if (btn.dataset.kind !== entry.kind) setKind(entry, btn.dataset.kind);
  });
}


function replaceEntry(row) {
  const i = state.entries.findIndex((e) => e.id === row.id);
  if (i >= 0) state.entries[i] = row;
  else state.entries.unshift(row);
}

/** 单条记录改类型：详情区里点一下就改，不用进编辑弹窗 */
async function setKind(entry, kind) {
  const prev = entry.kind;
  manualKinds.set(entry.id, kind); // 手动定过就锁住，之后再让 AI 整理也不许改
  entry.kind = kind; // 先本地生效，网络慢也不卡顿
  render();
  try {
    replaceEntry(await api.updateEntry(entry.id, { kind }));
    toast(`已改为「${ai.KIND_LABEL[kind] || kind}」`);
  } catch (error) {
    entry.kind = prev;
    toast(error.message || '改类型失败', 'err');
  }
  render();
}

/* ---------------------- 分类与标签：既可选也可自填 ---------------------- */

const TAG_LIMIT = 8;

/** "产品, 取舍 #复盘" → ["产品","取舍","复盘"] */
function parseTags(value) {
  return [
    ...new Set(
      String(value || '')
        .split(/[,，、;；\s]+/)
        .map((t) => t.replace(/^#/, '').trim())
        .filter(Boolean),
    ),
  ].slice(0, TAG_LIMIT);
}

/** 用户手填的在前，AI 补的在后面，去重后截断 */
function mergeTags(own, extra) {
  return [...new Set([...(own || []), ...(extra || [])])].slice(0, TAG_LIMIT);
}

/** 已有分类（含用户自建的）+ 内置分类，供输入框联想与 AI 参考 */
function knownCategories() {
  const used = state.entries.map((e) => (e.category || '').trim()).filter(Boolean);
  return [...new Set([...ai.CATEGORIES, ...used])];
}

function knownTags() {
  const used = state.entries.flatMap((e) => e.tags || []).map((t) => String(t).trim()).filter(Boolean);
  return [...new Set(used)].slice(0, 40);
}

/** 把已有分类 / 标签写进 datalist，输入框仍可自由输入新值 */
function renderMetaOptions() {
  const catList = $('#category-options');
  if (catList) {
    catList.innerHTML = knownCategories()
      .map((c) => `<option value="${esc(c)}"></option>`)
      .join('');
  }
  const tagList = $('#tag-options');
  if (tagList) {
    tagList.innerHTML = knownTags()
      .map((t) => `<option value="${esc(t)}"></option>`)
      .join('');
  }
}

/* ============================================================
   交互
   ============================================================ */

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 340)}px`;
}

function selectEntry(id) {
  state.selectedId = state.selectedId === id ? null : id;
  renderDetail();
  const detail = $('#detail');
  if (window.innerWidth <= 1180) detail.classList.toggle('is-open', Boolean(state.selectedId));
  document.querySelectorAll('.ecard').forEach((card) => {
    card.classList.toggle('is-selected', Number(card.dataset.id) === state.selectedId);
  });
}

function setView(view) {
  // 换了页签，之前手动选的类型就作废，重新跟随新页签
  if (view !== state.view) composerKindPinnedView = null;
  state.view = view;
  state.selectedId = null;
  $('#detail')?.classList.remove('is-open');
  syncComposerKind();
  render();
  if (view === 'tasks') ensureBoard();
  $('.main').scrollTop = 0;
}

/* ============================================================
   任务台（与待办合并）
   ============================================================ */

let boardLoading = null;

/** 登录态就绪后装配数据通道，再按需载入任务台脚本并初始化一次 */
function ensureBoard() {
  if (!window.TaskAdapter || !window.TaskAdapter.start()) {
    toast('任务数据通道未就绪，请重新登录', 'err');
    return null;
  }
  if (window.TaskBoard && window.TaskBoard.isStarted()) {
    refreshTaskStats();
    return Promise.resolve();
  }
  if (boardLoading) return boardLoading;

  boardLoading = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'js/tasks-page.js';
    script.onload = () => {
      try {
        window.TaskBoard.start();
        refreshTaskStats();
      } catch (error) {
        console.error('[zhiqi] 任务台初始化失败', error);
        toast('任务台加载失败，请刷新重试', 'err');
      }
      resolve();
    };
    script.onerror = () => {
      boardLoading = null;
      toast('任务台组件加载失败', 'err');
      resolve();
    };
    document.body.appendChild(script);
  });
  return boardLoading;
}

function refreshTaskStats() {
  const stats = window.TaskBoard && window.TaskBoard.stats ? window.TaskBoard.stats() : null;
  if (!stats) return;
  state.taskStats = stats;
  renderNav();
  // 任务状态刚变过：派生任务可能已全部完成，想法要跟着标成「已落地」
  ideas.syncProgress();
  if (state.view === 'tasks') {
    const el = $('#view-sub');
    if (el) el.textContent = `${stats.open} 项待跟进${stats.delayed ? ` · ${stats.delayed} 项已延期` : ''} · 共 ${stats.total} 项任务`;
    renderDetail();
  } else if (!state.selectedId) {
    // 收件箱等视图的右侧概览同样吃任务数据，任务一变就跟着刷新
    renderDetail();
  }
}

window.__zhiqiTaskStats = refreshTaskStats;

/** 任务台的「AI 复盘」按钮：tasks-page 不是模块，用不上 ai，由这里代跑 */
window.__zhiqiDelayRetro__ = function (payload, handlers) {
  const h = handlers || {};
  let text = '';
  ai.delayRetro({
    ...(payload || {}),
    onDelta: (d) => {
      text += d;
      if (h.onDelta) h.onDelta(text);
    },
  })
    .then(() => {
      if (h.onDone) h.onDone(text || '这次没分析出结论，先多记几次延期原因试试。');
    })
    .catch((error) => {
      if (h.onError) h.onError(error.message || 'AI 复盘失败');
    });
};

/** 想法模块需要的依赖在这里注入，避免它反过来引用 app.js */
function attachIdeas() {
  ideas.attach({
    state,
    esc,
    icon,
    toast,
    render,
    replaceEntry,
    reloadEntries,
  });
}

/** 重新拉一次记录（想法合并等跨条目改动后用，避免本地与云端不一致） */
async function reloadEntries() {
  state.entries = await api.listEntries();
}

const PRIORITY_TO_TASK = { 1: 'P1 高', 2: 'P2 中', 3: 'P3 低' };
const TASK_CATEGORIES = ['工作', '学习', '生活', '其他'];

/** AI 判定为待办的记录，同步写入任务台，避免「待办」分散在两处 */
function pushTaskFromEntry(entry) {
  return new Promise((resolve) => {
    if (!window.TaskBoard || !window.TaskBoard.isStarted()) {
      resolve(false);
      return;
    }
    window.TaskBoard.addFromEntry(
      {
        name: entry.title || entry.content.slice(0, 40) || '未命名任务',
        status: entry.done ? '已完成' : '待办',
        priority: PRIORITY_TO_TASK[entry.priority] || 'P2 中',
        category: TASK_CATEGORIES.includes(entry.category) ? entry.category : '其他',
        due: entry.due_date || '',
        tags: (entry.tags || []).join(' '),
        detail: entry.content || '',
      },
      (error) => {
        if (!error) refreshTaskStats();
        resolve(!error);
      },
    );
  });
}

async function ask(question) {
  if (!question.trim() || state.chat.busy) return;
  if (state.view !== 'chat') setView('chat');

  state.chat.seq += 1;
  const id = `m${state.chat.seq}`;
  const history = state.chat.messages
    .filter((m) => m.text)
    .slice(-6)
    .reduce((acc, m, i, arr) => {
      if (m.role === 'user' && arr[i + 1]?.role === 'ai') acc.push({ q: m.text, a: arr[i + 1].text.slice(0, 400) });
      return acc;
    }, []);

  state.chat.messages.push({ id: `${id}u`, role: 'user', text: question, cites: [] });
  const answer = { id, role: 'ai', text: '', cites: [], streaming: true };
  state.chat.messages.push(answer);

  state.chat.busy = true;
  const controller = new AbortController();
  state.chat.controller = controller;
  render();
  scrollChat();

  const contexts = buildContext(retrieve(question, state.entries));
  const taskHits = retrieveTasks(question, allTasks());
  const taskContext = buildTaskContext(taskHits);

  try {
    await ai.answerQuestion({
      question,
      contexts,
      taskContext,
      history,
      signal: controller.signal,
      onDelta: (d) => {
        answer.text += d;
        const live = document.querySelector('[data-live] .msg-text');
        if (live) {
          live.innerHTML = md(answer.text);
          scrollChat();
        }
      },
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      answer.text = `${answer.text ? `${answer.text}\n\n` : ''}（已停止生成）`;
    } else {
      answer.text = answer.text || `生成失败：${error.message || '请重试'}`;
      toast(error.message || '回答失败', 'err');
    }
  } finally {
    answer.streaming = false;
    answer.cites = extractCites(answer.text);
    answer.taskCites = extractTaskCites(answer.text);
    state.chat.busy = false;
    state.chat.controller = null;
    render();
    scrollChat();

    const log = await api.createQaLog({
      question,
      answer: answer.text,
      cited_ids: answer.cites,
      owner_name: state.user?.name ?? null,
    }).catch(() => null);
    if (log) state.qaLogs.unshift(log);
  }
}

function scrollChat() {
  const main = $('.main');
  if (main) main.scrollTop = main.scrollHeight;
}

function retrieve(question, entries) {
  if (!entries.length) return [];
  const clean = question.toLowerCase().replace(/[^0-9a-z\u4e00-\u9fa5]/g, '');
  const grams = new Set();
  question
    .toLowerCase()
    .split(/[\s，。、？?！!；;：:,.()（）【】\[\]"'“”]+/)
    .filter((w) => w.length >= 2)
    .forEach((w) => grams.add(w));
  for (let i = 0; i < clean.length - 1; i += 1) grams.add(clean.slice(i, i + 2));

  const scored = entries
    .map((e) => {
      const title = (e.title || '').toLowerCase();
      const summary = (e.summary || '').toLowerCase();
      const content = (e.content || '').toLowerCase();
      const tags = (e.tags || []).join(' ').toLowerCase();
      const cat = (e.category || '').toLowerCase();
      let score = 0;
      grams.forEach((g) => {
        if (!g) return;
        if (title.includes(g)) score += 4;
        if (tags.includes(g)) score += 3;
        if (cat.includes(g)) score += 2;
        if (summary.includes(g)) score += 2;
        if (content.includes(g)) score += 1;
      });
      if (e.kind === 'todo' && !e.done) score += 0.5;
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  if (scored.length) return scored.map((x) => x.e);
  return entries.slice(0, 5);
}

function buildContext(list) {
  if (!list.length) return '';
  return list
    .map((e) => {
      const head = `[#${e.id}] ${e.title}（${ai.KIND_LABEL[e.kind] || e.kind} · ${e.category || '未分类'} · ${(e.created_at || '').slice(0, 10)}${e.done ? ' · 已完成' : ''}）`;
      const body = [e.summary, (e.key_points || []).join('；'), (e.content || '').slice(0, 700)].filter(Boolean).join(' / ');
      return `${head}\n${body}`;
    })
    .join('\n\n');
}

/* ---------- 任务检索：任务不在 entries 表里，问答要单独捞一遍 ---------- */

function allTasks() {
  const board = window.TaskBoard;
  if (!board || typeof board.allTasks !== 'function') return [];
  try {
    return board.allTasks() || [];
  } catch (error) {
    return [];
  }
}

/** 问「任务 / 待办 / 拖住 / 延期」这类问题时，任务必须优先参战 */
const TASK_INTENT = /任务|待办|to-?do|todo|清单|进度|截止|到期|逾期|延期|拖[了住延]|没做|未完|完成|下一步|安排|计划|日程|本周|这周|下周|今天|明天|优先/;

function retrieveTasks(question, tasks) {
  if (!tasks.length) return [];
  const q = question.toLowerCase();
  const grams = new Set();
  q.split(/[\s，。、？?！!；;：:,.()（）【】\[\]"'“”]+/)
    .filter((w) => w.length >= 2)
    .forEach((w) => grams.add(w));
  const clean = q.replace(/[^0-9a-z\u4e00-\u9fa5]/g, '');
  for (let i = 0; i < clean.length - 1; i += 1) grams.add(clean.slice(i, i + 2));
  const wantsTask = TASK_INTENT.test(question);

  const scored = tasks
    .map((t) => {
      const name = (t.name || '').toLowerCase();
      const detail = (t.detail || '').toLowerCase();
      const tags = (t.tags || '').toLowerCase();
      const cat = (t.category || '').toLowerCase();
      const delay = (t.delay || '').toLowerCase();
      let score = 0;
      grams.forEach((g) => {
        if (!g) return;
        if (name.includes(g)) score += 4;
        if (tags.includes(g)) score += 3;
        if (delay.includes(g)) score += 2;
        if (cat.includes(g)) score += 2;
        if (detail.includes(g)) score += 1;
      });
      if (wantsTask) score += 1.5;
      if (t.status !== '已完成' && t.overdue) score += 2;
      else if (t.status !== '已完成' && (t.dueToday || t.soon)) score += 0.8;
      if (t.status === '已延期' || t.delay) score += 0.6;
      return { t, score };
    })
    .sort((a, b) => b.score - a.score);

  const hits = scored.filter((x) => x.score > 0).slice(0, 8).map((x) => x.t);
  // 一个都没命中但明显在问任务，就把「未完成的 + 逾期的」端上来，总比空手强
  if (!hits.length && wantsTask) {
    return tasks
      .filter((t) => t.status !== '已完成')
      .sort((a, b) => {
        const av = a.overdue ? 0 : a.dueToday ? 1 : a.soon ? 2 : 3;
        const bv = b.overdue ? 0 : b.dueToday ? 1 : b.soon ? 2 : 3;
        return av - bv;
      })
      .slice(0, 8);
  }
  return hits;
}

function dueWord(t) {
  if (!t.due) return '无截止日';
  if (t.status === '已完成') return `截止 ${t.due}（已完成）`;
  if (t.overdue) return `截止 ${t.due}，已逾期 ${Math.abs(t.days || 0)} 天`;
  if (t.dueToday) return `截止 ${t.due}，今天到期`;
  if (t.soon) return `截止 ${t.due}，${t.days} 天后`;
  return `截止 ${t.due}`;
}

function buildTaskContext(list) {
  if (!list.length) return '';
  return list
    .map((t) => {
      const head = `[T#${t.id}] ${t.name}（任务 · ${t.status} · ${t.priority} · ${t.category} · ${dueWord(t)}）`;
      const lines = [head];
      if (t.nextAction) lines.push(`下一步动作：${t.nextAction}`);
      if (t.delay) lines.push(`延期：${t.delay}${t.delayCount ? `（累计 ${t.delayCount} 次）` : ''}`);
      if (t.tags) lines.push(`标签：${t.tags}`);
      if (t.detail) lines.push(`详情：${t.detail.slice(0, 300)}`);
      return lines.join('\n');
    })
    .join('\n\n');
}

/* ============================================================
   删除 / 编辑 / 重点
   ============================================================ */

function confirmDialog({ title, message, confirmText = '确认', danger = false, onConfirm }) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="emodal-mask">
    <div class="emodal" style="max-width:420px">
      <h3>${esc(title)}</h3>
      <p style="margin:-6px 0 4px;color:var(--ink-2);font-size:13px;line-height:1.8">${esc(message)}</p>
      <div class="emodal-foot">
        <button class="btn-ghost" data-close>取消</button>
        <button class="btn-primary" data-confirm style="${danger ? 'background:var(--danger);border-color:var(--danger)' : ''}">${esc(confirmText)}</button>
      </div>
    </div>
  </div>`;
  const close = () => {
    root.innerHTML = '';
  };
  root.querySelector('[data-close]').onclick = close;
  root.querySelector('.emodal-mask').addEventListener('click', (e) => {
    if (e.target.classList.contains('emodal-mask')) close();
  });
  root.querySelector('[data-confirm]').onclick = async () => {
    close();
    await onConfirm();
  };
}

async function removeEntry(id) {
  const entry = state.entries.find((e) => e.id === id);
  if (!entry) return;
  confirmDialog({
    title: '删除这条记录？',
    message: `「${entry.title}」及其摘要、关联会一起删除，无法恢复。`,
    confirmText: '删除',
    danger: true,
    onConfirm: async () => {
      try {
        await api.deleteEntry(id);
        state.entries = state.entries.filter((e) => e.id !== id);
        if (state.selectedId === id) state.selectedId = null;
        render();
        toast('已删除');
      } catch (error) {
        toast(error.message || '删除失败', 'err');
      }
    },
  });
}

async function toggleDone(id) {
  const entry = state.entries.find((e) => e.id === id);
  if (!entry) return;
  try {
    const saved = await api.updateEntry(id, { done: !entry.done });
    replaceEntry(saved);
    render();
    toast(saved.done ? '已标记完成' : '已恢复为待完成');
  } catch (error) {
    toast(error.message || '操作失败', 'err');
  }
}

async function addPoints(id) {
  const entry = state.entries.find((e) => e.id === id);
  if (!entry) return;
  toast('正在提炼重点…');
  try {
    const points = await ai.extractKeyPoints({ title: entry.title, content: entry.content });
    const saved = await api.updateEntry(id, { key_points: points });
    replaceEntry(saved);
    render();
    toast(`已提取 ${points.length} 条重点`);
  } catch (error) {
    toast(error.message || '提取失败', 'err');
  }
}

function openEditor(id) {
  const e = state.entries.find((x) => x.id === id);
  if (!e) return;
  const root = $('#modal-root');
  root.innerHTML = `<div class="emodal-mask">
    <div class="emodal">
      <h3>编辑记录</h3>
      <label class="afield"><span>标题</span><input id="edit-title" value="${esc(e.title || '')}" /></label>
      <label class="afield"><span>原始内容</span><textarea id="edit-content">${esc(e.content || '')}</textarea></label>
      <div class="grid-2">
        <label class="afield"><span>类型</span>
          <select id="edit-kind">
            ${Object.entries(ai.KIND_LABEL).map(([v, l]) => `<option value="${v}"${e.kind === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        <label class="afield"><span>分类（可直接输入新的）</span>
          <input id="edit-category" list="category-options" value="${esc(e.category || '')}" placeholder="如：读书" autocomplete="off" />
        </label>
        <label class="afield"><span>优先级</span>
          <select id="edit-priority">
            <option value="1"${e.priority === 1 ? ' selected' : ''}>高</option>
            <option value="2"${e.priority === 2 ? ' selected' : ''}>中</option>
            <option value="3"${e.priority === 3 ? ' selected' : ''}>低</option>
          </select>
        </label>
        <label class="afield"><span>到期日（待办）</span><input id="edit-due" type="date" value="${esc(e.due_date || '')}" /></label>
      </div>
      <label class="afield"><span>标签（逗号分隔，可自填）</span><input id="edit-tags" list="tag-options" value="${esc((e.tags || []).join(', '))}" placeholder="如：深度工作, 复盘" autocomplete="off" /></label>
      <div class="emodal-foot">
        <button class="btn-ghost" data-close>取消</button>
        <button class="btn-primary" data-save>保存</button>
      </div>
    </div>
  </div>`;

  const close = () => {
    root.innerHTML = '';
  };
  root.querySelector('[data-close]').onclick = close;
  root.querySelector('.emodal-mask').addEventListener('click', (ev) => {
    if (ev.target.classList.contains('emodal-mask')) close();
  });
  root.querySelector('[data-save]').onclick = async () => {
    const patch = {
      title: $('#edit-title').value.trim() || e.title,
      content: $('#edit-content').value,
      kind: $('#edit-kind').value,
      category: ($('#edit-category').value || '').trim().slice(0, 16) || '其他',
      priority: Number($('#edit-priority').value),
      due_date: $('#edit-due').value || null,
      tags: parseTags($('#edit-tags').value),
    };
    try {
      const saved = await api.updateEntry(id, patch);
      replaceEntry(saved);
      close();
      render();
      toast('已保存');
    } catch (error) {
      toast(error.message || '保存失败', 'err');
    }
  };
}

/* ============================================================
   示例数据
   ============================================================ */

async function seedSamples() {
  if (state.seeding) return;
  state.seeding = true;
  const today = todayStr();
  const inDays = (n) => {
    const d = new Date(Date.now() + n * 86400000);
    return d.toISOString().slice(0, 10);
  };
  const owner = state.user?.name ?? null;

  const samples = [
    {
      title: '产品评审先问「只能留三个功能，留哪三个」',
      kind: 'idea',
      category: '工作',
      content:
        '做产品时容易陷入功能堆砌，真正难的是决定删掉什么。下次评审开始前先问一句：如果只能留三个功能，留哪三个？答不上来，说明还没想清楚核心价值。',
      summary: '功能堆砌是惰性，取舍才是产品判断力；评审先用「只留三个」做检验。',
      key_points: ['评审前先问：只能留三个功能，留哪三个', '答不上来说明核心价值还没想清', '删掉什么比增加什么更难'],
      tags: ['产品', '取舍'],
      priority: 3,
    },
    {
      title: '深度工作：产出 = 时间 × 专注强度',
      kind: 'material',
      category: '学习',
      content:
        '读《深度工作》：高质量产出 = 时间 × 专注强度。碎片化切换的代价不是那几分钟，而是每次重新进入状态大约需要 15 分钟。所以一天被打断四次，等于损失一小时的高质量时间。',
      summary: '产出取决于专注强度而非时长；每次切换状态要付约 15 分钟的恢复成本。',
      key_points: ['产出 = 时间 × 专注强度', '每次切换状态约损失 15 分钟', '一天被打断 4 次≈损失 1 小时'],
      tags: ['深度工作', '效率'],
      priority: 3,
    },
    {
      title: '周五前把 Q4 复盘文档发出来',
      kind: 'todo',
      category: '工作',
      content: '周五前把 Q4 复盘文档发出来，重点写清楚三个失败假设，不要只列成绩。发给产品和运营一起看。',
      summary: 'Q4 复盘文档周五前发出，重点写三个失败假设。',
      key_points: ['截止：本周五', '核心是三个失败假设，不是罗列成绩', '发给产品与运营'],
      tags: ['复盘', '文档'],
      priority: 1,
      due_date: inDays(3) > today ? inDays(3) : today,
    },
    {
      title: '体检：低密度脂蛋白偏高',
      kind: 'note',
      category: '健康',
      content: '体检报告出来了，低密度脂蛋白偏高（3.8）。医生建议少油、每周三次有氧，三个月后复查。晚饭尽量在八点前吃完。',
      summary: '低密度脂蛋白 3.8 偏高，需少油、每周三次有氧，三个月后复查。',
      key_points: ['LDL 3.8，高于参考值', '每周三次有氧 + 少油', '三个月后复查'],
      tags: ['体检', '运动'],
      priority: 3,
    },
  ];

  try {
    const created = [];
    for (const s of samples) {
      const row = await api.createEntry({ ...s, owner_name: owner });
      created.push(row);
    }
    // 建立几条示例关联，展示「自动串联」的效果
    const [idea, material, todo] = created;
    if (idea && material) await api.updateEntry(idea.id, { related_ids: [material.id, todo?.id].filter(Boolean) });
    if (todo && idea) await api.updateEntry(todo.id, { related_ids: [idea.id] });
    state.entries = await api.listEntries();
    render();
    toast('示例已载入，可以点开看看整理结果');
  } catch (error) {
    toast(error.message || '载入示例失败', 'err');
  } finally {
    state.seeding = false;
  }
}

/* ============================================================
   登录
   ============================================================ */

let channel = 'email'; // Supabase 版只支持邮箱验证码
let pendingOtp = null;
let countdownTimer = null;
let authRecovering = false;

/** 记住的账号：只有渠道对得上时才回填，避免手机号被塞进邮箱框 */
function rememberedFor(next) {
  const saved = keep.readIdentity();
  if (!saved || saved.channel !== next) return null;
  if (next === 'phone' && !/^1\d{10}$/.test(saved.value)) return null;
  if (next === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(saved.value)) return null;
  return saved;
}

function setChannel(next) {
  channel = next;
  pendingOtp = null;
  document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.channel === next));
  const input = $('#identifier');
  if (next === 'phone') {
    input.type = 'tel';
    input.inputMode = 'numeric';
    input.placeholder = '11 位手机号';
    $('#identifier-label').textContent = '手机号';
  } else {
    input.type = 'email';
    input.inputMode = 'email';
    input.placeholder = 'you@example.com';
    $('#identifier-label').textContent = '邮箱';
  }
  $('#code').value = '';
  showLoginError('');
  const saved = rememberedFor(next);
  input.value = saved ? saved.value : '';
  renderRemembered();
}

/** 登录页顶部的「这台设备 / 这个账号」提示条 */
function renderRemembered() {
  const box = $('#remembered');
  if (!box || !keep.storageAvailable()) return;

  if (authRecovering) {
    box.classList.remove('hidden');
    box.innerHTML = `<span class="rm-text">正在自动恢复这台设备的登录…</span>`;
    return;
  }

  const saved = keep.readIdentity();
  if (!saved) {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  const trust = keep.trustState();
  const note = $('#auth-note');
  if (note) {
    // 只有拿到「可续期的令牌」才谈得上自动进入，否则承诺就是空的
    const probe = keep.sessionProbe();
    const renewable = probe.hasCredential && probe.hasRefreshToken;
    if (!trust.trusted) note.textContent = '未注册的账号验证通过后自动创建，无需设置密码。';
    else if (renewable) note.textContent = '本机已保持登录，打开会自动进入；换设备仍需一次验证码。';
    else note.textContent = '本机已记住账号；云端登录凭证过期后仍需取一次验证码（页面开着时会自动续期）。';
  }
  const when = trust.at ? new Date(trust.at) : null;
  const stamp = when ? `${when.getMonth() + 1} 月 ${when.getDate()} 日` : '';
  if (trust.trusted) {
    box.innerHTML = `<span class="rm-text">这台设备已保持登录 · <b>${esc(keep.maskIdentity(saved.value, saved.channel))}</b>${
      stamp ? `（${stamp}登录过）` : ''
    }</span>
      <button type="button" class="rm-link" data-act="forget-device">忘记这台设备</button>`;
  } else {
    box.innerHTML = `<span class="rm-text">已记住 <b>${esc(keep.maskIdentity(saved.value, saved.channel))}</b>，获取验证码即可登录</span>
      <button type="button" class="rm-link" data-act="forget-identity">换账号</button>`;
  }
}

/**
 * 「为什么还要输验证码」的说明。
 * 验证码登录没有密码可存，能不能免验证取决于云端有没有给可续期的令牌；
 * 断了哪一环要让用户看得见，而不是默默回到登录页。
 */
function renderLoginDiag() {
  const box = $('#login-diag');
  if (!box) return;
  const fail = keep.readLastFailure();
  if (!fail) {
    box.classList.add('hidden');
    return;
  }
  const map = {
    'no-credential': '这台设备上没有可恢复的登录凭据（可能被浏览器或清理工具清掉了）',
    'no-refresh-token': '云端下发的登录凭证不支持续期，过期后只能再取一次验证码',
    'refresh-failed': '自动续期被服务端拒绝（凭证已过期或被回收）',
  };
  const text = map[fail.reason] || '自动登录未成功';
  const when = fail.at ? new Date(fail.at) : null;
  const stamp = when
    ? `${when.getMonth() + 1} 月 ${when.getDate()} 日 ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`
    : '';
  box.classList.remove('hidden');
  box.innerHTML = `<b>上次没能自动进入</b>：${esc(text)}，验证一次即可恢复。${
    stamp ? `（${stamp}）` : ''
  }<button type="button" class="diag-more" id="diag-more">技术细节</button>`;
  const more = $('#diag-more');
  if (more) {
    more.onclick = () => {
      const detail = JSON.stringify(fail);
      more.textContent = detail.length > 180 ? `${detail.slice(0, 180)}…` : detail;
      more.disabled = true;
    };
  }
}

function forgetIdentity() {
  keep.clearIdentity();
  $('#identifier').value = '';
  $('#code').value = '';
  pendingOtp = null;
  renderRemembered();
  $('#identifier').focus();
}

/** 「忘记这台设备」：清掉本机信任与会话备份，账号记忆保留 */
function forgetDevice() {
  keep.forgetDevice();
  pendingOtp = null;
  $('#code').value = '';
  renderRemembered();
  toast('已忘记这台设备，下次需要重新验证');
}

function showLoginError(message) {
  $('#login-error').textContent = message || '';
}

function startCountdown(btn) {
  let left = 60;
  btn.disabled = true;
  btn.textContent = `${left}s 后重发`;
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(countdownTimer);
      btn.disabled = false;
      btn.textContent = '获取验证码';
    } else {
      btn.textContent = `${left}s 后重发`;
    }
  }, 1000);
}

async function sendCode() {
  const value = $('#identifier').value.trim();
  showLoginError('');
  if (channel === 'phone' && !/^1\d{10}$/.test(value)) {
    showLoginError('请输入正确的 11 位手机号');
    return;
  }
  if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    showLoginError('请输入正确的邮箱地址');
    return;
  }
  const btn = $('#send-code');
  btn.disabled = true;
  btn.textContent = '发送中…';
  try {
    const payload = channel === 'phone' ? { phone: value } : { email: value };
    const sent = await cloud.auth.sendOtp(payload);
    if (sent.error) {
      showLoginError(sent.error.message || '验证码发送失败');
      btn.disabled = false;
      btn.textContent = '获取验证码';
      return;
    }
    pendingOtp = { channel, value, verificationId: sent.data.verificationId, isExistingUser: sent.data.isExistingUser };
    startCountdown(btn);
    toast('验证码已发送，请查收');
    $('#code').focus();
  } catch (error) {
    showLoginError(error.message || '验证码发送失败');
    btn.disabled = false;
    btn.textContent = '获取验证码';
  }
}

async function submitLogin(event) {
  event.preventDefault();
  const value = $('#identifier').value.trim();
  const code = $('#code').value.trim();
  showLoginError('');

  if (!pendingOtp || pendingOtp.value !== value) {
    showLoginError(`请先获取当前${channel === 'phone' ? '手机号' : '邮箱'}的验证码`);
    return;
  }
  if (!code) {
    showLoginError('请输入验证码');
    return;
  }

  const btn = $('#login-submit');
  btn.disabled = true;
  btn.textContent = '验证中…';

  try {
    const completed = await cloud.auth.verifyOtp({
      [pendingOtp.channel]: pendingOtp.value,
      verificationId: pendingOtp.verificationId,
      isExistingUser: pendingOtp.isExistingUser,
      token: code,
    });
    if (completed.error) {
      showLoginError(completed.error.message || '验证码不正确或已过期');
      btn.disabled = false;
      btn.textContent = '登录 / 注册';
      return;
    }
    // 记住这次用的账号，下次只要取验证码就能进
    keep.saveIdentity({ channel: pendingOtp.channel, value: pendingOtp.value });
    // 勾了「在这台设备上保持登录」就把会话备份落到 localStorage，之后打开自动恢复
    keep.setTrust($('#keep-device') ? $('#keep-device').checked : true);
    pendingOtp = null;
    const { data: session } = await cloud.auth.getSession();
    if (!session) {
      showLoginError('登录状态未建立，请重试');
      btn.disabled = false;
      btn.textContent = '登录 / 注册';
      return;
    }
    keep.clearLastFailure();
    enterApp(session);
  } catch (error) {
    showLoginError(error.message || '登录失败，请重试');
    btn.disabled = false;
    btn.textContent = '登录 / 注册';
  }
}

function displayName(user) {
  if (!user) return '我的账号';
  if (user.name) return user.name;
  const email = user.email || '';
  const phone = user.phone || user.phoneNumber || '';
  if (email) {
    const [name, domain] = email.split('@');
    return `${name.slice(0, 12)}@${domain || ''}`;
  }
  if (phone) return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  return '我的账号';
}

function enterApp(session) {
  state.user = session.user ?? null;
  const name = displayName(state.user);
  $('#user-name').textContent = name;
  $('#user-avatar').textContent = (name[0] || '我').toUpperCase();
  $('#login-screen').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');

  const next = new URLSearchParams(location.search).get('next');

  // 任务跟踪台发现登录态失效时会把用户送回来。先试着自救一次，
  // 只有确实续不上了才回登录页，否则一次偶发 401 就会把登录态永久清掉。
  const needReauth = sessionStorage.getItem('zhiqi.tasks.reauth') === '1';
  if (needReauth) {
    sessionStorage.removeItem('zhiqi.tasks.reauth');
    keep.recover().then(async (ok) => {
      if (ok) {
        try {
          const { data: fresh } = await cloud.auth.getSession();
          if (fresh) {
            state.user = fresh.user ?? state.user;
            const n = displayName(state.user);
            $('#user-name').textContent = n;
            $('#user-avatar').textContent = (n[0] || '我').toUpperCase();
          }
        } catch {
          /* 忽略：取不到就用原来的会话信息 */
        }
      }
      proceed(ok);
    });
    return;
  }

  proceed(true);

  function proceed(alive) {
    if (!alive) {
      $('#app-shell').classList.add('hidden');
      cloud.auth.signOut?.().catch(() => {});
      showLogin();
      showLoginError('登录状态已失效，请重新验证一次');
      return;
    }
    rememberCurrentUser();
    keep.touchTrust();
    keep.syncBackup();
    keep.startKeepAlive(handleSessionExpired);
    loadAll();
    ensureBoard();

    const wanted = new URLSearchParams(location.search).get('view');
    if (next === 'tasks' || wanted === 'tasks') setView('tasks');
  }
}

/** 会话里若能拿到手机号 / 邮箱就顺手记住；已经记住的（本次登录用的那个）不覆盖 */
function rememberCurrentUser() {
  if (keep.readIdentity()) return;
  const user = state.user;
  if (!user) return;
  const phone = user.phone || user.phoneNumber || user.raw?.phone_number || user.raw?.phone || '';
  const email = user.email || user.raw?.email || '';
  if (phone && /^1\d{10}$/.test(phone)) keep.saveIdentity({ channel: 'phone', value: phone });
  else if (email) keep.saveIdentity({ channel: 'email', value: email });
}

/** 续期彻底失败：回到登录页，但保留记住的账号 */
function handleSessionExpired() {
  showLogin();
  showLoginError('登录状态已失效，请重新获取验证码');
}

function showLogin() {
  $('#app-shell').classList.add('hidden');
  $('#login-screen').classList.remove('hidden');
  const trustBox = $('#keep-device');
  // 没设置过就保持默认勾选；只有用户主动取消过才显示未勾
  if (trustBox) {
    const pref = keep.trustPref();
    trustBox.checked = pref === null ? true : pref;
  }
  keep.stopKeepAlive();
  state.entries = [];
  state.summaries = [];
  state.qaLogs = [];
  state.chat.messages = [];
  state.selectedId = null;
  // Supabase 版只有邮箱渠道；记住的邮箱会自动回填
  setChannel('email');
  renderLoginDiag();
}

async function logout() {
  try {
    await cloud.auth.signOut();
  } catch {
    /* 忽略：即使请求失败也回到登录页 */
  }
  // 会话与备份一起清掉，并解除本机信任；账号记忆保留，下次只需验证码
  keep.setTrust(false);
  keep.clearSession();
  keep.stopKeepAlive();
  showLogin();
  toast('已退出登录');
}

/* ============================================================
   事件绑定
   ============================================================ */

function bind() {
  // 登录
  document.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.onclick = () => setChannel(btn.dataset.channel);
  });
  $('#send-code').onclick = sendCode;
  $('#login-form').addEventListener('submit', submitLogin);
  $('#identifier').addEventListener('input', () => showLoginError(''));
  $('#capture-kind')?.addEventListener('change', () => {
    composerKindPinnedView = state.view;
  });

  // 验证码输满 6 位就自动提交，少点一次按钮（收不到验证码时会给出提示，不误触）
  // 也支持直接粘贴邮件里的登录链接（Supabase 默认模板发的是链接而不是验证码）
  $('#code').addEventListener('input', (e) => {
    showLoginError('');
    const raw = e.target.value.trim();
    const linkLike = /^https?:\/\//i.test(raw) || /[?&]token(_hash)?=/i.test(raw);
    const ready = linkLike || raw.replace(/\D/g, '').length >= 6;
    if (ready && pendingOtp && pendingOtp.value === $('#identifier').value.trim()) {
      $('#login-form').requestSubmit();
    }
  });
  $('#remembered')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="forget-identity"]')) forgetIdentity();
    else if (e.target.closest('[data-act="forget-device"]')) forgetDevice();
  });
  // 勾选项本身也要能改信任状态（登录页上临时改，登录后按实际勾选写入）
  $('#keep-device')?.addEventListener('change', (e) => {
    if (!e.target.checked) keep.setTrust(false);
  });

  // 顶部
  $('#user-chip').onclick = () => {
    const trust = keep.trustState();
    confirmDialog({
      title: '退出登录？',
      message: trust.trusted
        ? `这台设备当前处于「保持登录」状态（还剩 ${keep.trustDaysLeft()} 天）。退出后需要重新验证，数据不会被删除。`
        : '退出后需要重新验证才能查看记录，数据不会被删除。',
      confirmText: '退出',
      onConfirm: logout,
    });
  };

  const search = $('#search-input');
  search.addEventListener('input', () => {
    state.query = search.value;
    $('#search-clear').classList.toggle('hidden', !state.query);
    if (state.view === 'summary' || state.view === 'chat') {
      state.view = 'inbox';
      render();
    } else {
      renderHeader();
      renderList();
    }
  });
  $('#search-clear').onclick = () => {
    search.value = '';
    state.query = '';
    $('#search-clear').classList.add('hidden');
    render();
  };

  // 左栏
  $('#nav-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (btn) setView(btn.dataset.view);
  });
  $('#category-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    state.category = state.category === btn.dataset.cat ? null : btn.dataset.cat;
    if (state.view === 'summary' || state.view === 'chat') state.view = 'inbox';
    render();
  });
  $('#tag-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tag]');
    if (!btn) return;
    state.tag = state.tag === btn.dataset.tag ? null : btn.dataset.tag;
    if (state.view === 'summary' || state.view === 'chat') state.view = 'inbox';
    render();
  });

  // 记录
  const input = $('#capture-input');
  input.addEventListener('input', () => autoGrow(input));
  input.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      capture();
    }
  });
  $('#capture-btn').onclick = capture;

  // 内容区（事件委托）
  $('#content').addEventListener('click', async (e) => {
    const taskJump = e.target.closest('[data-task-jump]');
    if (taskJump) {
      const id = String(taskJump.dataset.taskJump);
      if (window.TaskBoard && window.TaskBoard.openTask) window.TaskBoard.openTask(id);
      else setView('tasks');
      return;
    }

    const jump = e.target.closest('[data-jump]');
    if (jump) {
      const id = Number(jump.dataset.jump);
      state.selectedId = id;
      render();
      if (window.innerWidth <= 1180) $('#detail').classList.add('is-open');
      const card = document.querySelector(`.ecard[data-id="${id}"]`);
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const askBtn = e.target.closest('[data-ask]');
    if (askBtn) {
      ask(askBtn.dataset.ask);
      return;
    }

    const delSum = e.target.closest('[data-act="del-summary"]');
    if (delSum) {
      const id = Number(delSum.dataset.id);
      confirmDialog({
        title: '删除这份阶段总结？',
        message: '生成的内容会被删除，原始记录不受影响。',
        confirmText: '删除',
        danger: true,
        onConfirm: async () => {
          try {
            await api.deleteSummary(id);
            state.summaries = state.summaries.filter((s) => s.id !== id);
            render();
            toast('已删除');
          } catch (error) {
            toast(error.message || '删除失败', 'err');
          }
        },
      });
      return;
    }

    const seedBtn = e.target.closest('[data-act="seed"]');
    if (seedBtn) {
      seedSamples();
      return;
    }

    if (e.target.closest('[data-act="open-kind-modal"]')) {
      openKindModal();
      return;
    }

    const askQuery = e.target.closest('[data-act="ask-query"]');
    if (askQuery) {
      ask(state.query);
      return;
    }

    if (e.target.closest('#gen-summary')) {
      generateSummary();
      return;
    }
    if (e.target.closest('#summary-range')) return;

    const act = e.target.closest('[data-act]');
    const card = e.target.closest('.ecard[data-id]');
    if (act && card) {
      const id = Number(card.dataset.id);
      const name = act.dataset.act;
      if (name === 'toggle-done') {
        toggleDone(id);
        return;
      }
      if (name === 'delete') {
        removeEntry(id);
        return;
      }
      if (name === 'breakdown') {
        const entry = state.entries.find((x) => x.id === id);
        if (entry) ideas.openBreakdown(entry);
        return;
      }
      if (name === 'pick-kind') {
        const entry = state.entries.find((x) => x.id === id);
        if (entry) openKindMenu(entry);
        return;
      }
    }
    if (card) selectEntry(Number(card.dataset.id));
  });

  // 详情区
  $('#detail-body').addEventListener('click', (e) => {
    const tagBtn = e.target.closest('[data-act="filter-tag"]');
    if (tagBtn) {
      const tag = tagBtn.dataset.tag;
      state.tag = state.tag === tag ? null : tag;
      state.category = null;
      if (state.view === 'tasks' || state.view === 'summary' || state.view === 'chat') setView('inbox');
      else render();
      return;
    }
    const taskBtn = e.target.closest('[data-task]');
    if (taskBtn) {
      const taskId = taskBtn.dataset.task;
      if (state.view !== 'tasks') setView('tasks');
      if (window.TaskBoard && window.TaskBoard.openTask) {
        window.TaskBoard.openTask(taskId);
      } else {
        toast('任务台还在加载，请稍后再试', 'err');
      }
      return;
    }
    const jump = e.target.closest('[data-jump]');
    if (jump) {
      state.selectedId = Number(jump.dataset.jump);
      render();
      return;
    }
    const askBtn = e.target.closest('[data-ask]');
    if (askBtn) {
      ask(askBtn.dataset.ask);
      return;
    }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const id = state.selectedId;
    // 待评审清单里每条都带自己的 id，操作的对象不一定是当前选中的那条
    const actId = act.dataset.id ? Number(act.dataset.id) : id;
    const actEntry = state.entries.find((x) => x.id === actId) || null;
    switch (act.dataset.act) {
      case 'goto-tasks':
        setView('tasks');
        break;
      case 'breakdown':
        if (actEntry) ideas.openBreakdown(actEntry);
        break;
      case 'merge-idea':
        if (actEntry) ideas.openMerge(actEntry);
        break;
      case 'drop-idea':
        if (actEntry) ideas.setStatus(actEntry, '已放弃');
        break;
      case 'goto-review':
        ideas.openReviewAll();
        break;
      case 'set-kind': {
        const kind = act.dataset.kind;
        if (actEntry && actEntry.kind !== kind) setKind(actEntry, kind);
        break;
      }
      case 'close-detail':
        state.selectedId = null;
        $('#detail').classList.remove('is-open');
        renderDetail();
        break;
      case 'toggle-done':
        toggleDone(id);
        break;
      case 'delete':
        removeEntry(id);
        break;
      case 'edit':
        openEditor(id);
        break;
      case 'points':
        addPoints(id);
        break;
      case 'analyze':
        organize(id);
        break;
      default:
        break;
    }
  });

  // 想法状态切换（详情区里的下拉）
  $('#detail-body').addEventListener('change', (e) => {
    const sel = e.target.closest('[data-idea-status]');
    if (!sel) return;
    const entry = state.entries.find((x) => x.id === Number(sel.dataset.ideaStatus));
    if (entry) ideas.setStatus(entry, sel.value);
  });

  // 详情抽屉：点击主区空白处收起（移动端）
  $('.main').addEventListener('click', (e) => {
    if (window.innerWidth > 1180) return;
    if (e.target.closest('.ecard') || e.target.closest('.rel-item')) return;
    $('#detail').classList.remove('is-open');
  });

  // 阶段总结：记住时间范围选择
  $('#content').addEventListener('change', (e) => {
    if (e.target.id === 'summary-range') state.summary.range = e.target.value;
  });

  // 问答
  $('#content').addEventListener('submit', (e) => {
    if (e.target.id !== 'chat-form') return;
    e.preventDefault();
    const input = $('#chat-input');
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    ask(q);
  });
  $('#content').addEventListener('keydown', (e) => {
    if (e.target.id !== 'chat-input') return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const q = e.target.value.trim();
      if (!q) return;
      e.target.value = '';
      ask(q);
    }
  });
  $('#view-actions').addEventListener('click', (e) => {
    if (e.target.closest('[data-act="batch-kind"]')) openKindModal();
  });
  $('#content').addEventListener('click', (e) => {
    if (e.target.closest('#chat-send') && state.chat.busy) {
      e.preventDefault();
      state.chat.controller?.abort();
    }
    if (e.target.closest('[data-act="reset-chat"]')) {
      state.chat.messages = [];
      render();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $('#modal-root').innerHTML = '';
      if (state.selectedId) {
        state.selectedId = null;
        renderDetail();
      }
      $('#detail').classList.remove('is-open');
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      $('#search-input').focus();
    }
  });
}

/* ============================================================
   启动
   ============================================================ */

async function boot() {
  bind();
  attachIdeas();
  // 切走 / 关掉页面前把最新令牌存一份，下次回来才有得续
  keep.installAutoBackup();

  // 任务详情里点「回到原想法」：切回记录视图并选中那条想法
  window.__zhiqiOpenIdea__ = (id) => {
    const entry = state.entries.find((e) => e.id === Number(id));
    if (!entry) {
      toast('原想法可能已经被删除了', 'err');
      return;
    }
    if (state.view === 'tasks' || state.view === 'summary' || state.view === 'chat') setView('inbox');
    state.selectedId = entry.id;
    render();
  };

  // 任务台读写云端时若发现登录态失效，先自救一次，救不回来才回登录页
  window.addEventListener('zhiqi:auth-expired', () => {
    if (authRecovering) return;
    authRecovering = true;
    keep.recover().then(async (ok) => {
      if (!ok && cloud.autoLoginEnabled) {
        // 备份续不上了：隐式登录模式下直接静默重登，用户无感
        const res = await cloud.auth.autoLogin();
        if (res.data) ok = true;
      }
      authRecovering = false;
      if (ok) {
        keep.startKeepAlive(handleSessionExpired);
        loadAll();
        toast('登录状态已自动恢复');
        return;
      }
      cloud.auth.signOut?.().catch(() => {});
      showLogin();
      showLoginError('登录状态已失效，请重新获取验证码');
    });
  });

  // 任务台自己也会先调它自救，成功就不必回到登录页
  window.__zhiqiAuthRecover__ = () => keep.recover();

  // 侧栏在宽/窄之间的切换：统计卡要跟着搬进搬出
  const mq = window.matchMedia(`(min-width: ${SIDEBAR_MIN}px)`);
  const onSidebarChange = () => {
    if (state.view === 'tasks') applyViewChrome();
    else mountAddCard();
  };
  if (mq.addEventListener) mq.addEventListener('change', onSidebarChange);
  else if (mq.addListener) mq.addListener(onSidebarChange);

  // 任务台单列还是「清单 + 新建任务」两列，取决于主区真实宽度（而不是窗口宽度）：
  // 窄屏抽屉模式下主区反而更宽，需要按容器判断才准
  const mainEl = $('.main');
  if (mainEl) {
    const syncSplit = () => {
      const w = mainEl.clientWidth;
      // 记录列表多列 / 任务台两列，都按主区真实宽度判断（抽屉模式下主区反而更宽）
      mainEl.classList.toggle('is-grid', w >= 760);
      // 1600 这类屏幕上右侧栏常驻会把主区压到 ~990px，阈值定在 1100 就永远排不出右列
      mainEl.classList.toggle('is-split', w >= 960);
    };
    syncSplit();
    if (window.ResizeObserver) new ResizeObserver(syncSplit).observe(mainEl);
    window.addEventListener('resize', syncSplit);
  }

  // Supabase 版未开启 AI：角标直接说明，不再探测模型
  {
    const badge = $('#model-badge');
    if (badge) {
      badge.textContent = ai.AI_ENABLED ? ai.modelLabel() : 'AI 未开启';
      badge.title = ai.AI_ENABLED ? `当前模型：${ai.modelLabel()}` : '本版本未接入大模型；分类与类型由你手动选择';
    }
  }

  try {
    let { data: session } = await cloud.auth.getSession();
    // 网络抖动或 SDK 侧会话被清空时，用备份 + 强制续期自救一次。
    // 信任过本机就先把登录页摆出来（并显示「正在自动恢复」），别让用户盯着白屏。
    if (!session && (keep.restoreBackup() || keep.readBackup())) {
      if (keep.trustState().trusted) {
        authRecovering = true;
        showLogin();
        renderRemembered();
      }
      const ok = await keep.recover();
      authRecovering = false;
      if (ok) ({ data: session } = await cloud.auth.getSession());
    }
    if (session) enterApp(session);
    else if (cloud.autoLoginEnabled) {
      // 隐式登录模式：打开即进，用户全程不感知
      const res = await cloud.auth.autoLogin();
      if (res.data) {
        keep.setTrust(true);
        enterApp(res.data);
      } else {
        console.error('[zhiqi] 自动登录失败', res.error?.message);
        showLogin();
        showLoginError(
          '自动登录没成功：请确认 Supabase → Authentication → Users 里已创建 config.js ' +
            'autoLogin 写的那组邮箱和密码（后台建账号时不要勾「发送确认邮件」）。',
        );
      }
    } else {
      // 记住过账号却拿不出任何凭据：多半是被浏览器清掉了，登录页要说明一句
      if (keep.readIdentity() && !keep.readSdkSession() && !keep.readBackup()) keep.noteFailure({ stage: 'boot' });
      showLogin();
    }
  } catch (error) {
    console.error('[zhiqi] 初始化失败', error?.message);
    showLogin();
  }

  cloud.auth.onAuthStateChange?.((event) => {
    if (event === 'SIGNED_OUT') {
      // 隐式登录模式下不存在「登出」，静默重进；普通模式回登录页
      if (cloud.autoLoginEnabled) {
        cloud.auth.autoLogin().then((res) => {
          if (res.data) enterApp(res.data);
          else showLogin();
        });
      } else {
        showLogin();
      }
    }
  });
}

boot();
