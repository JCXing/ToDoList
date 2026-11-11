/**
 * Supabase 垫片：把应用里调用的 cloud.* 接口翻译成 supabase-js。
 *
 * 应用代码（db.js / tasks-adapter.js / app.js / session.js）全部面向
 * PostgREST 风格接口编写，supabase-js 天然就是这套接口，所以：
 *   - database:   直接透传 supabase-js，一行不改
 *   - auth:      把 sendOtp / verifyOtp / getSession / refreshSession / signOut
 *                包装成应用期望的 { data, error } 形状
 *   - storage:   映射到 Supabase Storage 的 files 存储桶（按用户 id 分目录）
 *   - llm:       此版本未开启 AI，占位并给出明确报错
 *
 * 另外做了一层「会话镜像」：supabase-js 把会话存在它自己的
 * `sb-<ref>-auth-token` 键里，而 session.js 的备份/恢复逻辑读的是
 * 旧格式的键。这里在每次会话变化时把会话同步镜像成旧格式，
 * 让「在这台设备上保持登录」的备份机制原样工作；启动时发现旧键
 * 而新键为空，也把它搬回去，跨刷新恢复不受影响。
 */
import { publicConfig } from './config.js';

/** 显示致命错误页，并把诊断信息写进去，方便照着实修 */
function showFatal(message, detail) {
  const box = document.getElementById('fatal');
  if (box) {
    box.classList.remove('hidden');
    const msg = box.querySelector('[data-fatal-msg]');
    if (msg && message) msg.textContent = message;
    const det = box.querySelector('#fatal-detail');
    if (det) det.textContent = detail || '';
  }
}

/** SDK 是否可用（本地文件被 CDN 兜底时也能等到） */
async function ensureSdk() {
  const ready = () => !!(window.supabase && typeof window.supabase.createClient === 'function');
  if (ready()) return true;
  if (window.__sdkReady) {
    await Promise.race([window.__sdkReady, new Promise((r) => setTimeout(r, 10000))]);
  }
  return ready();
}

if (!(await ensureSdk())) {
  showFatal(
    '未能加载 Supabase SDK（本地文件和两个 CDN 备用地址都失败了），请检查网络后刷新。',
    [
      'SDK 来源：' + (window.__sdkSource || 'none'),
      '线上实际地址：' + location.origin + location.pathname,
      '本地文件：assets/vendor/supabase.js',
      '网络状态：' + (navigator.onLine ? '在线' : '离线'),
    ].join('\n'),
  );
  throw new Error('Supabase SDK 未能加载');
}

if (!/^https:\/\/[\w-]+\.supabase\.co$/.test(publicConfig.supabaseUrl)) {
  console.error('[zhiqi] config.js 里的 supabaseUrl 还没有填写，请先完成部署配置');
  showFatal(
    '还没有填写 Supabase 项目的地址和密钥。',
    '打开 js/config.js，把 supabaseUrl 和 supabaseAnonKey 换成你自己项目的值（Project Settings → API）。\n当前值：' +
      (publicConfig.supabaseUrl || '(空)'),
  );
  throw new Error('Supabase 配置未填写');
}

/** 项目 ref：https://<ref>.supabase.co 中的 <ref> */
const REF = publicConfig.supabaseUrl.replace(/^https:\/\//, '').replace(/\.supabase\.co$/, '');

const sb = window.supabase.createClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey, {
  auth: {
    autoRefreshToken: true, // 访问令牌快过期时自动续
    persistSession: true, // 会话写入 localStorage，刷新不丢
    detectSessionInUrl: false, // 我们用 6 位验证码，不走魔法链接跳转
  },
});

/* --------------------------- 会话镜像 --------------------------- */

const LEGACY_KEY = 'workbuddy-cloud.session.' + publicConfig.publishableKey; // session.js 读的键
const SB_KEY = 'sb-' + REF + '-auth-token'; // supabase-js 自己的键

/** supabase 会话 → 旧格式（session.js 与 tasks-adapter.js 认这个） */
function mirrorSession(session) {
  try {
    if (session) {
      localStorage.setItem(
        LEGACY_KEY,
        JSON.stringify({
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresAt: (session.expires_at || 0) * 1000,
          user: session.user,
        }),
      );
    } else {
      localStorage.removeItem(LEGACY_KEY);
    }
  } catch {
    /* 隐私模式下写入失败，静默忽略 */
  }
}

/** 旧格式 → supabase-js 的键（启动时兜底迁移，双格式并存以兼容新旧版本） */
function migrateLegacyToSupabase() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (!s || !s.accessToken || !s.refreshToken) return;
    if (localStorage.getItem(SB_KEY)) return; // supabase 自己有会话，不覆盖
    const inner = {
      access_token: s.accessToken,
      refresh_token: s.refreshToken,
      expires_at: Math.floor((s.expiresAt || Date.now()) / 1000),
      token_type: 'bearer',
      user: s.user || null,
    };
    // 同时写新旧两种内部结构，兼容不同版本的 supabase-js
    localStorage.setItem(
      SB_KEY,
      JSON.stringify({ ...inner, currentSession: inner, expiresAt: s.expiresAt || Date.now() }),
    );
  } catch {
    /* 忽略 */
  }
}

migrateLegacyToSupabase();
sb.auth.onAuthStateChange((_event, session) => mirrorSession(session));

/** 首次启动时如果 supabase 里有会话，也镜像一份 */
sb.auth
  .getSession()
  .then(({ data }) => mirrorSession(data?.session))
  .catch(() => {});

/* --------------------------- auth --------------------------- */

function wrapError(error) {
  if (!error) return null;
  return { message: error.message || '请求失败', code: error.code || error.status, raw: error };
}

/**
 * 邮件里如果发出来的是「点击链接」而不是 6 位验证码（Supabase 默认模板就是链接），
 * 允许用户直接把整条链接粘进输入框。从链接里取出 token_hash + type 走校验。
 * 形如：https://<ref>.supabase.co/auth/v1/verify?token=<hash>&type=magiclink&redirect_to=...
 */
function parseOtpLink(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const looksLikeLink = /^https?:\/\//i.test(s) || /[?&]token(_hash)?=/i.test(s);
  if (!looksLikeLink) return null;
  try {
    const url = new URL(s, typeof location !== 'undefined' ? location.href : 'https://localhost/');
    const hash = url.searchParams.get('token_hash') || url.searchParams.get('token');
    if (!hash) return null;
    const type = url.searchParams.get('type') || 'magiclink';
    return { token_hash: hash, type };
  } catch {
    return null;
  }
}

const auth = {
  /** 应用调用：cloud.auth.sendOtp({ email }) */
  async sendOtp(payload) {
    const email = payload?.email;
    if (!email) return { data: null, error: { message: '请填写邮箱地址' } };
    try {
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) return { data: null, error: wrapError(error) };
      // 应用只校验 error；这两个字段是占位，Supabase 验证码无需 verificationId
      return { data: { verificationId: 'supabase-email-otp', isExistingUser: true }, error: null };
    } catch (e) {
      return { data: null, error: wrapError(e) };
    }
  },

  /** 应用调用：cloud.auth.verifyOtp({ email, token, ... }) */
  async verifyOtp(payload) {
    try {
      const link = parseOtpLink(payload?.token);
      const { data, error } = link
        ? // 用户粘的是登录链接：用链接里的 token_hash 换会话
          await sb.auth.verifyOtp({ token_hash: link.token_hash, type: link.type })
        : await sb.auth.verifyOtp({
            email: payload?.email,
            token: String(payload?.token || '').replace(/\s+/g, ''),
            type: 'email',
          });
      if (error) return { data: null, error: wrapError(error) };
      if (data?.session) mirrorSession(data.session);
      return { data, error: null };
    } catch (e) {
      return { data: null, error: wrapError(e) };
    }
  },

  /** 应用期望 { data: session }（supabase-js 返回 { data: { session } }，这里摊平） */
  async getSession() {
    const { data, error } = await sb.auth.getSession();
    if (data?.session) mirrorSession(data.session);
    return { data: data?.session ?? null, error: error ? wrapError(error) : null };
  },

  async refreshSession() {
    const { data, error } = await sb.auth.refreshSession();
    if (data?.session) mirrorSession(data.session);
    return { data: data?.session ?? null, error: error ? wrapError(error) : null };
  },

  async signOut() {
    mirrorSession(null);
    return sb.auth.signOut();
  },

  onAuthStateChange(handler) {
    const { data } = sb.auth.onAuthStateChange((event) => handler(event));
    return data?.unsubscribe ? () => data.unsubscribe() : () => {};
  },
};

/* --------------------------- database --------------------------- */

const database = {
  from(table) {
    return sb.from(table);
  },
};

/* --------------------------- storage --------------------------- */

const BUCKET = 'files';

const storage = {
  /** 用户专属目录：<userId>/tasks/xxx.png */
  userPath(uid, rel) {
    return `${uid}/${rel}`;
  },

  async upload(path, file, opts = {}) {
    const { data, error } = await sb.storage.from(BUCKET).upload(path, file, {
      contentType: opts.contentType || 'application/octet-stream',
      upsert: opts.upsert !== false,
      cacheControl: '3600',
    });
    if (error) throw new Error(error.message || '上传失败');
    return { path: data?.path || path };
  },

  async download(path) {
    const { data, error } = await sb.storage.from(BUCKET).download(path);
    if (error) throw new Error(error.message || '下载失败');
    return data; // Blob
  },
};

/* --------------------------- llm（未开启） --------------------------- */

const AI_OFF_MSG = 'AI 功能未开启（本版本不含大模型）';

const llm = {
  models: {
    async list() {
      throw new Error(AI_OFF_MSG);
    },
  },
  chat: {
    completions: {
      async *create() {
        throw new Error(AI_OFF_MSG);
      },
    },
  },
};

/* --------------------------- 导出 --------------------------- */

export const cloud = { auth, database, storage, llm };

// 任务适配层（js/tasks-adapter.js，经典脚本）登录后从这里取客户端
window.__zhiqiCloud__ = cloud;
