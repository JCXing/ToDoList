# 部署到 Supabase + GitHub Pages

这个文件夹是「知栖」的 Supabase 版：数据和登录都放在**你自己的** Supabase 项目里，
网页文件放在 GitHub Pages 上。全程免费，不需要服务器，不需要写代码。

> 与 WorkBuddy 云服务版的区别：登录改为**邮箱验证码**；AI 整理/总结/问答暂未开启
> （类型、分类手动选；任务台全部功能保留）。

---

## 你需要准备

- 一个能收邮件的邮箱（注册 Supabase、登录应用都用它）
- 一个 GitHub 账号

---

## 第一步：创建 Supabase 项目（约 3 分钟）

1. 打开 <https://supabase.com> → 右上角 **Start your project** → 用 GitHub 或邮箱注册/登录
2. 点 **New project**：
   - **Name**：`zhiqi`（随意）
   - **Database Password**：点 Generate 生成一个，**复制保存到备忘录**（平时用不到，但别丢）
   - **Region**：选 **Southeast Asia (Singapore)**（离国内最近，访问最快）
3. 点 **Create new project**，等 1～2 分钟初始化完成

---

## 第二步：建表（约 2 分钟）

1. 左侧菜单 → **SQL Editor** → **New query**
2. 打开本项目里的 `schema.sql`，**全选复制**，粘贴到编辑框
3. 点右下角 **Run**（或 Ctrl+Enter）
4. 看到 `Success. No rows returned` 就成功了
5. 可以到左侧 **Table Editor** 确认出现了 4 张表：`entries`、`tasks`、`summaries`、`qa_logs`

> 这个脚本已经包含：建表、行级安全（每个人只能看到自己的数据）、权限授权、附件存储桶。
> 重复执行也没问题。

---

## 第三步：配置登录（约 3 分钟）

Supabase 的登录设置分散在两个页面，按顺序点：

### 3.1 确认邮箱登录是开的

左侧 **Authentication** → **Sign In / Providers** → 点 **Email** → 确认
**Enable Email provider** 是打开状态（新建项目默认就是开的，看一眼即可）。

### 3.2 关掉「注册后还要验证邮箱」

左侧 **Authentication** → **Emails** → 页面上方的 **Authentication** 分组里，
点第一项 **Confirm sign up**（*Ask users to confirm their email address after signing up*），
把开关**关掉**，Save。

> 这就是旧版界面里叫 **Confirm email** 的那一项，改名了。
> 不关的话，新邮箱第一次登录会走「确认注册」流程，容易卡住。

### 3.3 把邮件模板改成「6 位验证码」⭐ 最关键

**默认模板发出去的是一条登录链接，不是一个码**，不改这一步你收不到 6 位数字。

1. 左侧 **Authentication** → **Emails** → 顶部切到 **Templates** 页签
2. 模板下拉选 **Magic link or OTP**（旧版叫 **Magic Link**）
3. 把正文（Subject 和 Body 都可以）整体替换成下面这段，然后 **Save**：

```html
<h2>登录验证码</h2>
<p>请在「知栖」登录页输入下面这组验证码（1 小时内有效）：</p>
<p style="font-size: 28px; letter-spacing: 6px; font-weight: 700">{{ .Token }}</p>
<p>如果不是你本人操作，忽略这封邮件即可。</p>
```

4. 如果你在 3.2 里**没有**关掉 Confirm sign up，那么新用户第一封信走的是
   **Confirm sign up** 模板——同样要把它改成含 `{{ .Token }}` 的正文。

> 懒得分模板也行：应用支持把邮件里那条链接**整条粘进验证码框**直接登录，
> 但改成验证码体验更好，尤其是链接在手机上打开会跳到浏览器另一个标签。

### 3.4 可选：调长验证码有效期

**Authentication** → **Sign In / Providers** → **Email** → **Email OTP expiration**
（默认 3600 秒 = 1 小时，够用）。

⚠️ **重要提醒**：Supabase 免费项目自带的发信服务限额很低（每小时几封），
只给自己用完全够；如果多人使用、经常收不到验证码，去
**Authentication → Emails → SMTP Settings** 接一个免费的发信服务（如 Resend、Brevo，免费额度够用）。

---

## 第四步：填配置（1 分钟）

打开 `js/config.js`，把两个值填进去：

1. Supabase 左下角 **Project Settings**（齿轮）→ **API**（新版叫 **API Keys**）
2. 复制 **Project URL**（形如 `https://abcdefgh.supabase.co`）→ 填到 `supabaseUrl`
3. 复制 **anon public**（新版可能显示为 **publishable key**，形如 `sb_publishable_...`）
   → 填到 `supabaseAnonKey`。两种都能用，填哪个都行

```js
export const publicConfig = {
  supabaseUrl: 'https://abcdefgh.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...（很长一串）',
  publishableKey: 'supabase',
};
```

> anon key 是**公开**密钥，放在前端是安全的——数据由行级安全（RLS）保护，
> 别人拿到这个 key 也读不到你的记录。
> **千万不要**把 `service_role` 密钥放进前端（那个能绕过所有权限）。

---

## 第五步：部署到 GitHub Pages（约 5 分钟）

### 方式 A：网页上传（不用装任何软件，推荐）

1. 打开 <https://github.com> → 右上角 **+** → **New repository**
2. **Repository name** 填 `zhiqi`（随意）→ 选 **Public** → **Create repository**
3. 点 **uploading an existing file**（或 Add file → Upload files）
4. 把 `supabase-app` 文件夹**里面的所有内容**拖进浏览器窗口：
   ```
   index.html
   tasks.html
   js/
   assets/
   data/
   schema.sql
   DEPLOY.md
   ```
   ⚠️ 拖的是文件夹**里面的东西**，不要把 `supabase-app` 这一层也拖进去
5. 点 **Commit changes**
6. 仓库页 → **Settings** → 左侧 **Pages**
   - **Source** 选 `Deploy from a branch`
   - **Branch** 选 `main`，目录选 `/ (root)` → **Save**
7. 等 1～2 分钟，刷新页面，顶部会出现：
   `Your site is live at https://你的用户名.github.io/zhiqi/`

### 方式 B：命令行（会用 git 的话）

```bash
cd supabase-app
git init
git add .
git commit -m "deploy"
git branch -M main
git remote add origin https://github.com/你的用户名/zhiqi.git
git push -u origin main
```

然后在 GitHub 仓库 Settings → Pages 里同样开启即可。

---

## 第六步：首次登录

1. 打开 `https://你的用户名.github.io/zhiqi/`
2. 输入邮箱 → 点 **获取验证码**
3. 去邮箱收信（没看到就翻垃圾箱）：
   - 如果是一封含 **6 位数字**的邮件 → 直接输入，满 6 位自动登录；
   - 如果是一封只有「Log In / 登录」按钮的邮件（说明第 3.3 步模板还没改）→
     右键复制按钮的链接地址，**整条粘进验证码框**，也会自动登录。
4. 勾着「在这台设备上保持登录」，30 天内打开不用再验证

> 第一次进入任务页时，会自动导入 `data/tasks-seed.json` 里 10 月 20 日那批任务
> （18 条历史数据）。不想要的话逐条删，或点统计卡底部的「清空示例数据」。

---

## 以后怎么更新

改完代码后，到 GitHub 仓库 → **Add file → Upload files** 覆盖对应文件 → Commit，
Pages 大约 1 分钟后自动生效。

---

## 常见问题

| 现象 | 原因 / 解决 |
| --- | --- |
| 页面提示「Supabase 配置未填写」 | `js/config.js` 还是占位内容，按第四步填好 |
| 收不到验证码 | ① 翻垃圾箱；② 免费版每小时限额（等一小时）；③ 接自定义 SMTP |
| 邮件里只有一个「登录」按钮、没有 6 位数字 | 邮件模板没改，按第三步 3.3 改成 `{{ .Token }}`；或直接把按钮链接整条粘进验证码框 |
| 新建项目找不到 `anon key`，只有 `sb_publishable_...` | 新版改名叫 publishable key，直接填到 `supabaseAnonKey` 即可 |
| 提示「验证码不正确或已过期」 | Supabase 默认有效期 1 小时，超时重新获取；确认 6 位数字完整 |
| 登录后列表报错、提示「没有权限」（42501） | `schema.sql` 没跑完整，重跑一遍（含末尾 GRANT 与存储桶段落） |
| 数据存哪了？怎么备份 | Supabase → **Table Editor** → 选表 → 右上角导出 CSV；免费版有 7 天自动备份 |
| 换设备 / 换浏览器登录 | 用同一个邮箱登录即可，数据全在云端 |
| GitHub Pages 打不开 | 国内访问 GitHub Pages 时好时坏；可把整个文件夹拖到 <https://app.netlify.com/drop> 换一个域名，代码不用改 |
| 想恢复 AI 功能 | 把原版 `js/ai.js` 拷回来，并在 `cloud.js` 的 `llm` 里接一个 OpenAI 兼容接口（DeepSeek / 智谱 / Kimi 等），应用其余代码不用动 |

---

## 可选：把旧的云端数据搬过来

WorkBuddy 云服务的资源点恢复后，原应用里的数据可以导出来再灌进 Supabase。
需要时告诉我，我帮你写导入脚本（四张表：记录、任务、总结、问答记录）。
