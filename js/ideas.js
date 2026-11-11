/**
 * 想法 → 任务
 *
 * 想法库最容易变成墓地：记进来时很兴奋，之后没人再问它「到底做不做」。
 * 这个模块负责把这层缺口补上，包含四件事：
 *   1. 状态机：孵化中 → 已立项 → 已落地 / 已放弃
 *   2. 拆解面板：AI 出草稿，逐条可改可删可加，勾选后才写入任务台
 *   3. 周评审：超过 7 天没推进的想法自动列出来，逼你做一次决定
 *   4. 完成回流：派生任务全部完成时，想法自动标为「已落地」
 *
 * 依赖（state / esc / render 等）由主应用启动时 attach 注入，
 * 避免和 app.js 形成模块循环引用。
 */
import * as api from './db.js';
import * as ai from './ai.js';

const STATUS = ['孵化中', '已立项', '已落地', '已放弃'];
const REVIEW_DAYS = 7;

let ctx = null;
let syncing = false;

export function attach(context) {
  ctx = context;
}

function need() {
  if (!ctx) throw new Error('想法模块尚未初始化');
  return ctx;
}

export function isIdea(e) {
  return !!e && (e.kind === 'idea' || e.kind === 'note');
}

export function statusOf(e) {
  return isIdea(e) ? e.idea_status || '孵化中' : '';
}

/** 派生任务进度：读任务台在内存里的行，不额外打云端 */
export function progressOf(e) {
  const ids = (e && e.task_ids) || [];
  const total = ids.length;
  if (!total) return { total: 0, done: 0, rows: [] };
  const board = window.TaskBoard;
  const rows = board && board.byIds ? board.byIds(ids) : [];
  const done = rows.filter((r) => r.status === '已完成').length;
  return { total, done, rows };
}

/* ============================================================
   卡片 / 详情上的想法信息
   ============================================================ */

const STATUS_CLASS = {
  孵化中: 'is-incubating',
  已立项: 'is-committed',
  已落地: 'is-landed',
  已放弃: 'is-dropped',
};

export function statusChipHtml(e) {
  const st = statusOf(e);
  if (!st) return '';
  const { esc } = need();
  return `<span class="idea-chip ${STATUS_CLASS[st] || ''}">${esc(st)}</span>`;
}

/** 卡片底部：状态 + 进度 + 拆解入口 */
export function cardExtrasHtml(e) {
  if (!isIdea(e)) return '';
  const { esc } = need();
  const st = statusOf(e);
  const p = progressOf(e);
  const parts = [`<span class="idea-chip ${STATUS_CLASS[st] || ''}">${esc(st)}</span>`];
  if (p.total) {
    parts.push(`<span class="idea-prog${p.done === p.total ? ' is-done' : ''}">${p.done}/${p.total} 已完成</span>`);
  }
  if (st !== '已落地' && st !== '已放弃') {
    parts.push(`<button class="idea-break" data-act="breakdown" title="拆成可执行任务">拆解</button>`);
  }
  return `<span class="idea-extras">${parts.join('')}</span>`;
}

/** 详情区：状态选择 + 拆解 + 派生任务清单 */
export function detailBlockHtml(e) {
  if (!isIdea(e)) return '';
  const { esc } = need();
  const st = statusOf(e);
  const p = progressOf(e);
  const rows = p.rows || [];

  const tasks = rows.length
    ? `<div class="idea-tasks">${rows
        .map(
          (r) => `<button class="idea-task${r.status === '已完成' ? ' is-done' : ''}" data-task="${esc(r.id)}">
            <span class="it-dot"></span>
            <span class="it-body">
              <span class="it-name">${esc(r.name)}</span>
              ${r.nextAction ? `<span class="it-next">下一步：${esc(r.nextAction)}</span>` : ''}
            </span>
            <span class="it-status">${esc(r.status)}</span>
          </button>`,
        )
        .join('')}</div>`
    : `<p class="detail-text" style="color:var(--ink-4)">还没有拆出任务。想法停在名词状态是不会自己开始的——点「拆解」，把它变成几个今晚就能动手的动作。</p>`;

  return `
    <div class="detail-block">
      <div class="block-label">${need().icon('idea')} 这个想法到哪一步了</div>
      <div class="idea-status-row">
        <select class="idea-status-select" data-idea-status="${e.id}">
          ${STATUS.map((s) => `<option value="${s}"${s === st ? ' selected' : ''}>${s}</option>`).join('')}
        </select>
        ${p.total ? `<span class="idea-prog${p.done === p.total ? ' is-done' : ''}">${p.done}/${p.total} 任务已完成</span>` : ''}
      </div>
      ${st === '孵化中' ? `<p class="idea-nudge">孵化中的想法不会自己往前走。要么拆成任务，要么干脆放弃——两个都比吊着强。</p>` : ''}
      ${tasks}
      ${
        st === '已落地' || st === '已放弃'
          ? ''
          : `<button class="btn-ghost idea-break-wide" data-act="breakdown">${need().icon('todo')}拆解为可执行任务</button>`
      }
    </div>`;
}

/* ============================================================
   状态变更
   ============================================================ */

export async function setStatus(entry, status, silent) {
  need();
  if (!STATUS.includes(status)) return null;
  try {
    const saved = await api.updateEntry(entry.id, { idea_status: status });
    ctx.replaceEntry(saved);
    if (!silent) {
      ctx.toast(`已标记为「${status}」`);
      ctx.render();
    }
    return saved;
  } catch (error) {
    if (!silent) ctx.toast(error.message || '状态更新失败', 'err');
    return null;
  }
}

/* ============================================================
   拆解面板
   ============================================================ */

function stepRow(step, index) {
  const { esc } = need();
  const row = document.createElement('div');
  row.className = 'bd-row';
  // AI 可能给出「健康」这种自定义分类，下拉里没有就会把值吞掉，这里补进选项
  const cat = step.category || '其他';
  const cats = [...new Set(['工作', '学习', '生活', '其他', cat])];
  row.innerHTML = `
    <span class="bd-drag" tabindex="0" role="button" aria-label="拖动调整顺序，或用上下方向键" title="按住拖动调整顺序（也可聚焦后用 ↑ ↓）"><svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true"><circle cx="3" cy="3" r="1.3"/><circle cx="7" cy="3" r="1.3"/><circle cx="3" cy="8" r="1.3"/><circle cx="7" cy="8" r="1.3"/><circle cx="3" cy="13" r="1.3"/><circle cx="7" cy="13" r="1.3"/></svg></span>
    <label class="bd-pick"><input type="checkbox" checked /><span class="bd-no">${index + 1}</span></label>
    <div class="bd-main">
      <input class="bd-name" type="text" value="${esc(step.name || '')}" placeholder="用动词开头，例如：列出下周七天晚餐" />
      <div class="bd-extra">
        <input class="bd-next" type="text" value="${esc(step.nextAction || '')}" placeholder="第一个动作：打开什么、先写哪一行" />
        <div class="bd-extra-line">
          <input class="bd-due" type="date" value="${esc(step.due || '')}" />
          <select class="bd-pri">
            ${['P0 紧急', 'P1 高', 'P2 中', 'P3 低'].map((p) => `<option value="${p}"${p === (step.priority || 'P2 中') ? ' selected' : ''}>${p}</option>`).join('')}
          </select>
          <select class="bd-cat">
            ${cats.map((c) => `<option value="${esc(c)}"${c === cat ? ' selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>
    <button class="bd-del" type="button" title="删除这一步">×</button>`;
  row.querySelector('.bd-del').onclick = () => {
    row.remove();
    renumber();
  };
  return row;
}

let bdList = null;

/**
 * 拖拽排序。用指针事件而不是 HTML5 DnD：鼠标和触屏一套代码都能用，
 * 也不用担心输入框里的文字选区把拖拽吃掉。
 */
function enableSorting(list) {
  let dragRow = null;

  /**
   * 监听挂在 window 上，而不是手柄上：
   * 拖动过程中会 insertBefore 移动行节点，浏览器会因此释放指针捕获，
   * 手柄上的 pointerup 就永远收不到，拖完松手后状态清不掉。
   */
  const finish = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    if (!dragRow) return;
    dragRow.classList.remove('is-dragging');
    dragRow = null;
    list.classList.remove('is-sorting');
    renumber();
  };

  function onMove(ev) {
    if (!dragRow) return;
    ev.preventDefault();
    const y = ev.clientY;
    const rows = [...list.querySelectorAll('.bd-row')];
    let before = null;
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      if (r === dragRow) continue;
      const rect = r.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) { before = r; break; }
    }
    if (before) {
      if (before.nextSibling !== dragRow) { list.insertBefore(dragRow, before); renumber(); }
    } else if (list.lastChild !== dragRow) {
      list.appendChild(dragRow);
      renumber();
    }
  }

  list.addEventListener('pointerdown', (ev) => {
    const grip = ev.target.closest ? ev.target.closest('.bd-drag') : null;
    if (!grip || !list.contains(grip)) return;
    const row = grip.closest('.bd-row');
    if (!row) return;
    ev.preventDefault();
    dragRow = row;
    row.classList.add('is-dragging');
    list.classList.add('is-sorting');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  });

  // 键盘也能调顺序：聚焦手柄后按 ↑ / ↓
  list.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
    const grip = ev.target.closest ? ev.target.closest('.bd-drag') : null;
    if (!grip) return;
    const row = grip.closest('.bd-row');
    if (!row) return;
    ev.preventDefault();
    const sibling = ev.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
    if (!sibling) return;
    if (ev.key === 'ArrowUp') list.insertBefore(row, sibling);
    else list.insertBefore(sibling, row);
    grip.focus();
    renumber();
  });
}

function renumber() {
  if (!bdList) return;
  [...bdList.querySelectorAll('.bd-row')].forEach((row, i) => {
    const no = row.querySelector('.bd-no');
    if (no) no.textContent = String(i + 1);
  });
}

function collectSteps() {
  if (!bdList) return [];
  return [...bdList.querySelectorAll('.bd-row')]
    .filter((row) => row.querySelector('.bd-pick input').checked)
    .map((row) => ({
      name: row.querySelector('.bd-name').value.trim(),
      nextAction: row.querySelector('.bd-next').value.trim(),
      due: row.querySelector('.bd-due').value || '',
      priority: row.querySelector('.bd-pri').value,
      category: row.querySelector('.bd-cat').value,
    }))
    .filter((s) => s.name);
}

export function openBreakdown(entry) {
  const { esc, toast } = need();
  if (!entry) return;
  const root = document.getElementById('modal-root');
  if (!root) return;

  const existing = (entry.task_ids || []).length;
  const categoryPool = [...new Set(ctx.state.entries.map((e) => e.category).filter(Boolean))];

  root.innerHTML = `
    <div class="emodal-mask">
      <div class="emodal bd-modal">
        <h3>把这个想法拆成可执行任务</h3>
        <p class="bd-idea">${esc(entry.title || '未命名想法')}</p>
        <p class="bd-tip">想法是名词，任务是动词。每一步都写成能在 25 分钟内直接开始的样子——写不出第一步，说明它其实还是个想法。<br />拖动每行左侧的握把可以调整先后顺序，写入任务台后就是建议的执行顺序。</p>
        ${
          existing
            ? `<p class="bd-has">这个想法已经拆出 ${existing} 条任务，下面新写的会追加进去。</p>`
            : ''
        }
        <div class="bd-list" id="bd-list"></div>
        <button class="bd-add" type="button" id="bd-add">＋ 添加一步</button>
        <div class="emodal-foot">
          <button class="btn-ghost" id="bd-close">取消</button>
          <button class="btn-ghost" id="bd-again">让 AI 再出一版</button>
          <button class="btn-primary" id="bd-save">写入任务台</button>
        </div>
      </div>
    </div>`;

  bdList = root.querySelector('#bd-list');
  enableSorting(bdList);
  const close = () => {
    root.innerHTML = '';
    bdList = null;
  };

  const addRow = (step) => {
    // 手写的那一步默认沿用想法自己的分类，省得每次都重选
    const row = stepRow(step || { category: entry.category || '其他' }, bdList.querySelectorAll('.bd-row').length);
    bdList.appendChild(row);
    return row;
  };

  root.querySelector('#bd-close').onclick = close;
  root.querySelector('#bd-add').onclick = () => {
    const row = addRow({});
    const input = row.querySelector('.bd-name');
    setTimeout(() => input.focus(), 20);
  };
  root.querySelector('.emodal-mask').addEventListener('click', (ev) => {
    if (ev.target.classList.contains('emodal-mask')) close();
  });

  let generating = false;
  const setGenerating = (on) => {
    generating = on;
    const btn = root.querySelector('#bd-again');
    if (btn) btn.textContent = on ? 'AI 正在拆解…' : '让 AI 再出一版';
    if (btn) btn.disabled = on;
  };

  const generate = async (clear) => {
    if (generating) return;
    setGenerating(true);
    if (clear) bdList.innerHTML = '';
    try {
      const steps = await ai.breakdownIdea({
        title: entry.title,
        content: entry.content,
        categories: categoryPool,
      });
      steps.forEach((s) => addRow(s));
      renumber();
    } catch (error) {
      toast(error.message || 'AI 拆解失败，可以直接自己写', 'err');
      if (!bdList.children.length) addRow({});
    } finally {
      setGenerating(false);
    }
  };

  root.querySelector('#bd-again').onclick = () => generate(true);

  root.querySelector('#bd-save').onclick = async () => {
    if (generating) {
      toast('AI 还在拆解，稍等一下', 'err');
      return;
    }
    const steps = collectSteps();
    if (!steps.length) {
      toast('至少写一条任务再写入', 'err');
      return;
    }
    const board = window.TaskBoard;
    if (!board || !board.isStarted || !board.isStarted()) {
      toast('任务台还在加载，请稍后再试', 'err');
      return;
    }
    const btn = root.querySelector('#bd-save');
    btn.disabled = true;
    btn.textContent = '正在写入…';
    board.addMany(
      steps.map((s) => ({
        name: s.name,
        nextAction: s.nextAction,
        status: '待办',
        priority: s.priority,
        category: s.category,
        due: s.due,
        tags: (entry.tags || []).join(' '),
        detail: `来自想法「${entry.title || '未命名想法'}」\n\n${entry.content || ''}`.trim().slice(0, 2000),
        sourceIdea: entry.id,
      })),
      async (error, created) => {
        btn.disabled = false;
        btn.textContent = '写入任务台';
        if (error) {
          toast(error.message || '写入任务失败', 'err');
          return;
        }
        const ids = [...(entry.task_ids || []), ...created.map((c) => Number(c)).filter((n) => Number.isFinite(n))];
        try {
          const saved = await api.updateEntry(entry.id, { task_ids: [...new Set(ids)], idea_status: '已立项' });
          ctx.replaceEntry(saved);
        } catch (err) {
          /* 任务已写入，这里失败下次进入仍可重试 */
        }
        close();
        ctx.render();
        toast(`已写入 ${created.length} 条任务，想法标记为「已立项」`);
      },
    );
  };

  generate(false);
}

/* ============================================================
   周评审
   ============================================================ */

function daysSince(e) {
  const t = new Date(e.updated_at || e.created_at).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / 86400000);
}

/** 超过 7 天没推进、也没拆出任务的想法 —— 它们需要一次决定，而不是继续躺着 */
export function pendingReview() {
  const { state } = need();
  return state.entries
    .filter((e) => isIdea(e) && statusOf(e) === '孵化中' && !(e.task_ids || []).length && daysSince(e) >= REVIEW_DAYS)
    .sort((a, b) => daysSince(b) - daysSince(a));
}

export function reviewPanelHtml() {
  const { esc, icon } = need();
  const list = pendingReview().slice(0, 3);
  if (!list.length) return '';
  return `
    <div class="tk-panel">
      <div class="tk-panel-head">${icon('idea')} 待评审想法
        <button class="tk-more" type="button" data-act="goto-review">查看全部</button>
      </div>
      <div class="rv-list">
        ${list
          .map(
            (e) => `<div class="rv-item" data-review="${e.id}">
              <div class="rv-top">
                <span class="rv-name">${esc(e.title || '未命名想法')}</span>
                <span class="rv-age">${daysSince(e)} 天没动</span>
              </div>
              <div class="rv-acts">
                <button class="rv-btn is-go" data-act="breakdown" data-id="${e.id}">立项拆解</button>
                <button class="rv-btn" data-act="merge-idea" data-id="${e.id}">合并</button>
                <button class="rv-btn is-drop" data-act="drop-idea" data-id="${e.id}">放弃</button>
              </div>
            </div>`,
          )
          .join('')}
      </div>
    </div>`;
}

/** 评审全量清单：一次把积压的想法处理掉 */
export function openReviewAll() {
  const { esc, icon } = need();
  const root = document.getElementById('modal-root');
  let list = pendingReview();

  const paint = () => {
    if (!list.length) {
      root.innerHTML = `
        <div class="emodal-mask">
          <div class="emodal">
            <h3>待评审的想法都处理完了</h3>
            <p class="bd-tip">接下来的一周里，新想法超过 7 天没推进会再次出现在这里。</p>
            <div class="emodal-foot"><button class="btn-primary" data-close>好</button></div>
          </div>
        </div>`;
      const btn = root.querySelector('[data-close]');
      if (btn) btn.onclick = () => { root.innerHTML = ''; };
      return;
    }
    root.innerHTML = `
      <div class="emodal-mask">
        <div class="emodal bd-modal">
          <h3>待评审想法 · ${list.length}</h3>
          <p class="bd-tip">这些都是超过 ${REVIEW_DAYS} 天没有推进的想法。每个只给三个选择：立项拆解、和别的想法合并、或者放弃。</p>
          <div class="rv-list is-wide">
            ${list
              .map(
                (e) => `<div class="rv-item" data-review="${e.id}">
                  <div class="rv-top">
                    <span class="rv-name">${esc(e.title || '未命名想法')}</span>
                    <span class="rv-age">${daysSince(e)} 天没动</span>
                  </div>
                  ${e.summary ? `<p class="rv-sum">${esc(e.summary)}</p>` : ''}
                  <div class="rv-acts">
                    <button class="rv-btn is-go" data-rv="breakdown" data-id="${e.id}">立项拆解</button>
                    <button class="rv-btn" data-rv="merge" data-id="${e.id}">合并</button>
                    <button class="rv-btn is-drop" data-rv="drop" data-id="${e.id}">放弃</button>
                  </div>
                </div>`,
              )
              .join('')}
          </div>
          <div class="emodal-foot"><button class="btn-ghost" data-close>稍后再说</button></div>
        </div>
      </div>`;

    root.querySelector('[data-close]').onclick = () => { root.innerHTML = ''; };
    root.querySelector('.emodal-mask').addEventListener('click', (ev) => {
      if (ev.target.classList.contains('emodal-mask')) root.innerHTML = '';
    });

    root.querySelectorAll('[data-rv]').forEach((btn) => {
      btn.onclick = async () => {
        const id = Number(btn.dataset.id);
        const entry = ctx.state.entries.find((e) => e.id === id);
        if (!entry) return;
        const act = btn.dataset.rv;
        if (act === 'breakdown') {
          openBreakdown(entry);
          return;
        }
        if (act === 'merge') {
          openMerge(entry);
          return;
        }
        const saved = await setStatus(entry, '已放弃', true);
        if (saved) {
          list = list.filter((e) => e.id !== id);
          await ctx.reloadEntries();
          ctx.render();
          paint();
        }
      };
    });
  };

  paint();
}

/* ============================================================
   合并
   ============================================================ */

export function openMerge(entry) {
  const { esc, toast } = need();
  const candidates = ctx.state.entries.filter(
    (e) => isIdea(e) && e.id !== entry.id && statusOf(e) !== '已放弃' && statusOf(e) !== '已落地',
  );
  const root = document.getElementById('modal-root');
  if (!candidates.length) {
    toast('没有可以合并的其他想法', 'err');
    return;
  }
  root.innerHTML = `
    <div class="emodal-mask">
      <div class="emodal">
        <h3>合并到哪个想法？</h3>
        <p class="bd-tip">这条想法会被标为「已放弃」，内容保留，并与目标想法建立关联，之后在详情里还能翻到。</p>
        <div class="mg-list">
          ${candidates
            .map(
              (c) => `<button class="mg-item" data-merge-to="${c.id}">
                <span class="mg-title">${esc(c.title || '未命名想法')}</span>
                <span class="mg-sub">${esc(statusOf(c))} · ${esc(c.category || '未分类')}</span>
              </button>`,
            )
            .join('')}
        </div>
        <div class="emodal-foot"><button class="btn-ghost" data-close>取消</button></div>
      </div>
    </div>`;

  const close = () => {
    root.innerHTML = '';
  };
  root.querySelector('[data-close]').onclick = close;
  root.querySelector('.emodal-mask').addEventListener('click', (ev) => {
    if (ev.target.classList.contains('emodal-mask')) close();
  });
  root.querySelectorAll('[data-merge-to]').forEach((btn) => {
    btn.onclick = async () => {
      const targetId = Number(btn.dataset.mergeTo);
      const target = ctx.state.entries.find((e) => e.id === targetId);
      try {
        await api.updateEntry(targetId, { related_ids: [...new Set([...(target?.related_ids || []), entry.id])] });
        await setStatus(entry, '已放弃', true);
        await ctx.reloadEntries();
        close();
        ctx.render();
        toast('已合并，原想法保留在关联里');
      } catch (error) {
        toast(error.message || '合并失败', 'err');
      }
    };
  });
}

/* ============================================================
   完成回流
   ============================================================ */

/** 派生任务全部完成 → 想法自动「已落地」。任务台每次刷新都会调到这里 */
export async function syncProgress() {
  if (syncing) return;
  const { state } = need();
  const board = window.TaskBoard;
  if (!board || !board.byIds) return;

  const targets = state.entries.filter((e) => {
    const st = statusOf(e);
    return isIdea(e) && (e.task_ids || []).length && st !== '已落地' && st !== '已放弃';
  });
  if (!targets.length) return;

  const done = targets.filter((e) => {
    const p = progressOf(e);
    return p.total > 0 && p.done === p.total;
  });
  if (!done.length) return;

  syncing = true;
  try {
    for (const e of done) {
      const saved = await api.updateEntry(e.id, { idea_status: '已落地' });
      ctx.replaceEntry(saved);
    }
    ctx.render();
  } catch (error) {
    /* 回流失败不影响主流程，下次刷新会再试 */
  } finally {
    syncing = false;
  }
}

/* ============================================================
   阶段总结用
   ============================================================ */

export function conversionDigest() {
  const { state } = need();
  const ideas = state.entries.filter((e) => isIdea(e));
  if (!ideas.length) return '';
  const landed = ideas.filter((e) => statusOf(e) === '已落地').length;
  const committed = ideas.filter((e) => statusOf(e) === '已立项').length;
  const incubating = ideas.filter((e) => statusOf(e) === '孵化中').length;
  const dropped = ideas.filter((e) => statusOf(e) === '已放弃').length;
  const totalTasks = ideas.reduce((n, e) => n + (e.task_ids || []).length, 0);
  return [
    `想法转化：共 ${ideas.length} 个想法，已落地 ${landed} 个`,
    `推进中 ${committed} 个、孵化中 ${incubating} 个、已放弃 ${dropped} 个`,
    `累计从想法拆出 ${totalTasks} 条任务。`,
  ].join('，');
}
