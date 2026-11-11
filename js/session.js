/**
 * 登录态保持
 *
 * 云端用的是「验证码登录」，没有可保存的密码，所以「记住登录状态」只能靠：
 *   1. 把 SDK 写在 localStorage 里的会话做一份备份，被意外清掉时能写回去；
 *   2. 在令牌过期之前主动续期（回到前台 / 网络恢复时补一次），
 *      避免走到「过期才去刷新、刷新失败就被清空」的死路；
 *   3. 记住上次登录的手机号 / 邮箱，即使会话真的失效，也只要点一下「获取验证码」；
 *   4. 「在这台设备上保持登录」：勾上时备份写 localStorage 并保留 30 天，
 *      不勾则只写 sessionStorage，关掉标签页就失效 —— 相当于一次性的临时会话。
 */

import { cloud } from './cloud.js';
import { publicConfig } from './config.js';

const SDK_KEY = 'workbuddy-cloud.session.' + publicConfig.publishableKey;
const BACKUP_KEY = 'zhiqi.session.backup';
const IDENTITY_KEY = 'zhiqi.identity';
const TRUST_KEY = 'zhiqi.device.trust';

const KEEPALIVE_MS = 8 * 60 * 1000; // 令牌过期前主动续期
const TRUST_KEEPALIVE_MS = 4 * 60 * 1000; // 已信任的设备续得更勤，尽量不让令牌过期
const STALE_MS = 2 * 60 * 1000; // 回到前台时，距上次续期超过这个时长就补一次
const TRUST_DAYS = 30; // 设备信任有效期
const LASTFAIL_KEY = 'zhiqi.auth.lastfail'; // 自动登录失败的原因，登录页要显示出来

/** 备份写到哪里：已信任 → localStorage（长期）；否则 → sessionStorage（关标签即失效） */
function backupStore() {
  try {
    return trustState().trusted ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}

function get(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 隐私模式下 localStorage 不可写，静默降级为不记住 */
  }
}

function del(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* 同上 */
  }
}

function parse(raw) {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return s && s.accessToken ? s : null;
  } catch {
    return null;
  }
}

export function storageAvailable() {
  try {
    const probe = '__zhiqi_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/* --------------------------- 设备信任 --------------------------- */

/**
 * 读取本机信任状态。超过 30 天没用过就当作没信任过（此时备份也视为过期）。
 * @returns {{trusted:boolean, at:number|null}}
 */
export function trustState() {
  const raw = get(TRUST_KEY);
  if (!raw) return { trusted: false, at: null };
  try {
    const o = JSON.parse(raw);
    const at = typeof o.at === 'number' ? o.at : 0;
    if (!o.on || !at) return { trusted: false, at: null };
    if (Date.now() - at > TRUST_DAYS * 86400000) return { trusted: false, at };
    return { trusted: true, at };
  } catch {
    return { trusted: false, at: null };
  }
}

/**
 * 「保持登录」这个勾选项的显式偏好：用户主动取消过才是 false；
 * 没设置过（或已过期）返回 null —— 登录页据此显示默认勾选。
 * 少了这一层，首屏会把 HTML 里的默认勾选改成未勾，用户以为勾着，
 * 结果备份只写进 sessionStorage，关掉标签页就没了。
 */
export function trustPref() {
  const raw = get(TRUST_KEY);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (typeof o.at === 'number' && Date.now() - o.at > TRUST_DAYS * 86400000) return null;
    return o.on === true;
  } catch {
    return null;
  }
}

/** 勾选 / 取消「在这台设备上保持登录」；切换介质时把备份跟着搬过去 */
export function setTrust(on) {
  const before = backupStore();
  // 取消也要留痕（on:false），登录页才好区分「主动取消」和「还没设置过」
  set(TRUST_KEY, JSON.stringify({ on: !!on, at: Date.now() }));
  const after = backupStore();
  if (before && after && before !== after) {
    const raw = before.getItem(BACKUP_KEY);
    if (raw) {
      try {
        after.setItem(BACKUP_KEY, raw);
      } catch {
        /* 忽略 */
      }
    }
    before.removeItem(BACKUP_KEY);
  }
  return trustState();
}

/** 刷新信任时间戳：每次成功进入应用都算「还在常用设备上」 */
export function touchTrust() {
  if (trustState().trusted) set(TRUST_KEY, JSON.stringify({ on: true, at: Date.now() }));
}

/** 忘记这台设备：清掉信任与会话备份，账号记忆保留（下次只需验证码） */
export function forgetDevice() {
  del(TRUST_KEY);
  clearSession();
}

export function trustDaysLeft() {
  const { at } = trustState();
  if (!at) return 0;
  return Math.max(0, Math.ceil((at + TRUST_DAYS * 86400000 - Date.now()) / 86400000));
}

/* --------------------------- 会话备份 --------------------------- */

export function readSdkSession() {
  return parse(get(SDK_KEY));
}

export function readBackup() {
  const store = backupStore();
  if (!store) return null;
  let raw = null;
  try {
    raw = store.getItem(BACKUP_KEY);
  } catch {
    raw = null;
  }
  // 信任关系曾经存在过、但备份落在另一个介质里：兜底再找一次
  if (!raw && store === sessionStorage) raw = get(BACKUP_KEY);
  const s = parse(raw);
  if (!s) return null;
  // 未信任设备上的备份不设时限；已信任的超过 30 天就不再自动恢复
  if (trustState().trusted && typeof s.savedAt === 'number' && Date.now() - s.savedAt > TRUST_DAYS * 86400000) {
    try {
      store.removeItem(BACKUP_KEY);
    } catch {
      /* 忽略 */
    }
    // 备份都放凉了，等于这台设备很久没来过，信任一并作废，别再显示「已保持登录」
    del(TRUST_KEY);
    return null;
  }
  return s;
}

/** 每次拿到新会话后都同步一份备份 */
export function syncBackup() {
  const s = readSdkSession();
  const store = backupStore();
  if (s && store) {
    try {
      store.setItem(BACKUP_KEY, JSON.stringify({ ...s, savedAt: Date.now() }));
    } catch {
      /* 忽略 */
    }
  }
  return s;
}

/** SDK 那边的会话没了、但备份还在时，把备份写回去 */
export function restoreBackup() {
  if (readSdkSession()) return false;
  const backup = readBackup();
  if (!backup) return false;
  set(SDK_KEY, JSON.stringify(backup));
  return true;
}

export function clearSession() {
  del(SDK_KEY);
  try {
    localStorage.removeItem(BACKUP_KEY);
    sessionStorage.removeItem(BACKUP_KEY);
  } catch {
    /* 忽略 */
  }
}

/* --------------------------- 记住账号 --------------------------- */

export function readIdentity() {
  const o = parse0(get(IDENTITY_KEY));
  return o && o.value ? o : null;
}

function parse0(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveIdentity(identity) {
  if (!identity || !identity.value) return;
  set(IDENTITY_KEY, JSON.stringify({ ...identity, at: Date.now() }));
}

export function clearIdentity() {
  del(IDENTITY_KEY);
}

export function maskIdentity(value, channel) {
  const v = String(value || '');
  if (channel === 'email') {
    const [name, domain] = v.split('@');
    if (!domain) return v;
    if (name.length <= 2) return `${name.slice(0, 1)}***@${domain}`;
    return `${name.slice(0, 2)}***${name.slice(-1)}@${domain}`;
  }
  return v.length > 7 ? `${v.slice(0, 3)}****${v.slice(-4)}` : v;
}

/* --------------------------- 失败原因诊断 --------------------------- */

/**
 * 自动登录为什么没成功。验证码登录没有可保存的密码，能不能免验证完全取决于
 * 服务端有没有下发「可续期的令牌」；到底是哪一环断了，得让用户（和我们）看得见。
 */
function classifyFailure() {
  const sdk = readSdkSession();
  const backup = readBackup();
  const s = sdk || backup;
  if (!s) {
    return {
      reason: 'no-credential',
      detail: '这台设备上没有可恢复的登录凭据（浏览器可能清理了本地存储）',
    };
  }
  const hasRefresh = typeof s.refreshToken === 'string' && s.refreshToken.length > 0;
  if (!hasRefresh) {
    return {
      reason: 'no-refresh-token',
      detail: '云端下发的登录凭证不支持续期，一旦过期只能重新验证一次',
    };
  }
  return {
    reason: 'refresh-failed',
    detail: '续期请求被拒绝（刷新凭据本身可能也已经过期）',
  };
}

/** 记录一次自动登录失败；登录页会据此给出人话解释 */
export function noteFailure(extra = {}) {
  const { reason, detail } = classifyFailure();
  const s = readSdkSession() || readBackup();
  const payload = {
    reason,
    detail,
    at: Date.now(),
    hasSdkSession: !!readSdkSession(),
    hasBackup: !!readBackup(),
    trusted: trustState().trusted,
    expiresAt: s && typeof s.expiresAt === 'number' ? s.expiresAt : null,
    ...extra,
  };
  try {
    localStorage.setItem(LASTFAIL_KEY, JSON.stringify(payload));
  } catch {
    /* 忽略 */
  }
  console.warn('[zhiqi] 自动登录未成功', payload);
  return payload;
}

export function readLastFailure() {
  const raw = get(LASTFAIL_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearLastFailure() {
  del(LASTFAIL_KEY);
}

/** 当前这台设备的登录凭据状况，给登录页做「还能不能免验证」的判断 */
export function sessionProbe() {
  const s = readSdkSession() || readBackup();
  return {
    hasCredential: !!s,
    hasRefreshToken: !!(s && typeof s.refreshToken === 'string' && s.refreshToken.length > 0),
    leftMs: s && typeof s.expiresAt === 'number' ? s.expiresAt - Date.now() : null,
    trusted: trustState().trusted,
  };
}

/* --------------------------- 续期与恢复 --------------------------- */

let timer = null;
let timeout = null;
let lastRefresh = 0;
let expiredHandler = null;
let running = false;
let failures = 0;

/**
 * 主动续期一次；成功则顺手刷新备份。
 *
 * 注意：续期失败 ≠ 登录失效。服务端没给 refresh_token、或网络抖动时，
 * 只要手上的访问令牌还没过期就应该继续用，否则每次续期失败都会把用户踢回登录页。
 */
export async function refreshNow() {
  // 一次网络抖动不该判定为「登录失效」，先重试一轮再下结论
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { data } = await cloud.auth.refreshSession();
      if (data) {
        lastRefresh = Date.now();
        syncBackup();
        touchTrust();
        return true;
      }
    } catch {
      /* 落到下面的兜底判断 */
    }
    if (attempt === 0) await sleep(600);
  }
  try {
    const { data } = await cloud.auth.getSession();
    if (data) {
      lastRefresh = Date.now();
      syncBackup();
      touchTrust();
      return true;
    }
  } catch {
    /* 同上 */
  }
  // 网络层面的失败：本地令牌还没到期就再撑一会儿，下一轮继续试
  const local = readSdkSession();
  if (local && typeof local.expiresAt === 'number' && local.expiresAt - Date.now() > 60 * 1000) {
    return true;
  }
  return false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 401 / 令牌失效后的自救：
 * 先把备份写回 SDK，再强制续期；续期不通就看看现有令牌是不是还能用。
 */
export async function recover() {
  restoreBackup();
  if (await refreshNow()) return true;
  // 冷启动时网络往往还没就绪，隔一会儿再试一次，别急着把用户送回验证码
  await sleep(500);
  restoreBackup();
  if (await refreshNow()) return true;
  try {
    const { data } = await cloud.auth.getSession();
    if (data) {
      lastRefresh = Date.now();
      syncBackup();
      return true;
    }
  } catch {
    /* 忽略 */
  }
  noteFailure({ stage: 'recover' });
  return false;
}

/** 页面被切走 / 关掉前把最新令牌存好，下次回来才有得用 */
export function installAutoBackup() {
  const save = () => syncBackup();
  window.addEventListener('pagehide', save);
  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
}

function onVisible() {
  if (document.visibilityState !== 'visible') return;
  if (Date.now() - lastRefresh < STALE_MS) return;
  refreshNow().then((ok) => {
    if (ok) return;
    noteFailure({ stage: 'visible' });
    fireExpired();
  });
}

function onOnline() {
  refreshNow().then((ok) => {
    if (ok) return;
    noteFailure({ stage: 'online' });
    fireExpired();
  });
}

function fireExpired() {
  stopKeepAlive();
  const handler = expiredHandler;
  expiredHandler = null;
  if (handler) handler();
}

/**
 * 下一次续期的时间点：如果拿得到令牌到期时间，就赶在它过期前一分钟续；
 * 拿不到才退回固定间隔。令牌寿命很短时，固定间隔很容易「还没轮到就过期了」。
 */
function nextDelay() {
  const s = readSdkSession();
  if (s && typeof s.expiresAt === 'number') {
    const left = s.expiresAt - Date.now() - 60 * 1000;
    if (left > 30 * 1000) return Math.min(left, 30 * 60 * 1000);
    if (left > 0) return left;
  }
  return trustState().trusted ? TRUST_KEEPALIVE_MS : KEEPALIVE_MS;
}

function tick() {
  if (!running) return;
  timeout = setTimeout(async () => {
    if (!running) return;
    const ok = await refreshNow();
    if (!running) return;
    if (ok) {
      failures = 0;
      tick();
      return;
    }
    failures += 1;
    // 已信任的设备更宽容：连续失败三次才认定登录失效
    if (failures >= (trustState().trusted ? 3 : 2)) {
      noteFailure({ stage: 'keepalive' });
      fireExpired();
      return;
    }
    tick();
  }, nextDelay());
}

export function startKeepAlive(handler) {
  expiredHandler = handler;
  stopKeepAlive();
  lastRefresh = Date.now();
  failures = 0;
  running = true;
  tick();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
}

export function stopKeepAlive() {
  running = false;
  if (timeout) clearTimeout(timeout);
  timeout = null;
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('online', onOnline);
}
