/**
 * Supabase 连接配置
 *
 * 1. 登录 https://supabase.com → 打开你的项目 → Settings → API
 * 2. supabaseUrl 填 Project URL：只要到 .supabase.co 为止，
 *    不要带 /rest/v1（这是最容易复制错的地方，填错时程序也会自动帮你剥掉）
 * 3. supabaseAnonKey 填 anon public key 或 publishable key（sb_publishable_ 开头）
 * 4. anon key 是公开密钥，放在前端是安全的——数据由行级安全（RLS）保护，
 *    每个登录用户只能读写自己 owner_id 的行。
 */
export const publicConfig = {
  supabaseUrl: 'https://jjdlxevrfpdmoeujvyiu.supabase.co',
  supabaseAnonKey: 'sb_publishable_NbIrB7bDrTQN4CEbq_dLSQ_cuh2DXjB',

  // 隐式登录（推荐）：打开网页直接进入，不再出现邮箱验证码。
  // 使用前在 Supabase → Authentication → Users → Add user 里
  // 用「完全相同」的邮箱和密码建一个账号（不要勾 Send email to confirm signup）。
  // 这个邮箱不用真实存在、不会收到任何邮件，仅作登录标识。
  autoLogin: {
    email: 'owner@zhiqi.app',
    password: 'Zq-wVrecxpSArgJ',
  },

  // 仅作 localStorage 键名后缀使用（与原版区分开，两边互不干扰）
  publishableKey: 'supabase',
};
