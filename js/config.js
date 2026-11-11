/**
 * Supabase 连接配置
 *
 * !!! 部署前必改 !!!
 * 1. 登录 https://supabase.com → 打开你的项目 → Settings → API
 * 2. 把 Project URL 填到 supabaseUrl，把 anon public key 填到 supabaseAnonKey
 * 3. anon key 是公开密钥，放在前端是安全的——数据由行级安全（RLS）保护，
 *    每个登录用户只能读写自己 owner_id 的行。
 */
export const publicConfig = {
  supabaseUrl: 'https://把你的项目地址填在这里.supabase.co',
  supabaseAnonKey: '把你的 anon public key 粘贴到这里',

  // 仅作 localStorage 键名后缀使用（与原版区分开，两边互不干扰）
  publishableKey: 'supabase',
};
