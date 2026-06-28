# Live Tab Mirror

一个个人用的实时标签页镜像工具：桌面 Chrome 扩展同步当前打开的标签页，手机网页/PWA 查看最新列表、搜索、点击打开。

它只保存“当前 snapshot”，不是稍后读、收藏夹、浏览历史或知识库。

需求文档见 [docs/PRD.md](docs/PRD.md)。

## 目录结构

```text
apps/extension      Chrome Extension Manifest V3
apps/mobile         手机网页/PWA
packages/shared     两端共用的类型、邮箱限制、snapshot、搜索、新鲜度逻辑
supabase/migrations Supabase 表结构、RLS 和 grant
```

## 准备 Supabase

1. 创建 Supabase 项目。
2. 在 Dashboard 里打开 SQL Editor，执行：

   ```sql
   -- supabase/migrations/20260628133000_create_desktop_tab_snapshots.sql
   ```

   这会创建 `public.desktop_tab_snapshots`，主键是 `(user_id, device_id)`，所以每次同步都会覆盖同一设备的最新快照，不保存历史。

3. 在 Authentication / Users 里确认 `zhaowork74@gmail.com` 已存在且邮箱已确认。当前线上项目里这个用户已经创建好了。
4. 执行 `supabase/migrations/20260628142000_restrict_auth_users_to_allowed_email.sql`，限制 Auth 只能创建 `zhaowork74@gmail.com`。
5. 扩展和手机网页都使用登录模式：`signInWithOtp({ shouldCreateUser: false })`，不会从客户端注册新用户。
6. Email OTP 模板要包含 `{{ .Token }}`，这样扩展和手机网页都能输入验证码登录。
   当前线上 Supabase 项目已把 Site URL 设为 GitHub Pages，并把 Magic Link 邮件模板改成显示 OTP 验证码，不再使用 `{{ .ConfirmationURL }}`。如果新建项目，需要在 Supabase Dashboard 的 Auth 邮件模板里按这个格式配置：

   ```html
   <h2>Live Tab Mirror 登录验证码</h2>
   <p>请输入这个验证码：{{ .Token }}</p>
   ```

7. 复制 Project URL 和 publishable key。不要使用 service_role key。

注意：Supabase 内置邮件服务的发送额度很低，当前线上项目没有配置自有 SMTP 时，`rate_limit_email_sent` 只能是 2 封/小时，管理 API 也会拒绝直接调高。测试时不要反复点发送验证码；同一封 OTP 在当前项目里 1 小时内有效。扩展会在本地保存待输入验证码状态，pending 期间不会继续展示重发入口；扩展和网页的验证码输入框都会始终显示，已经收到邮件时可以直接输入。

RLS 已限制：

- 只能 `authenticated` 访问。
- 只能访问自己的 `user_id`。
- JWT email 必须是 `zhaowork74@gmail.com`。
- Auth signup 触发器只允许 `zhaowork74@gmail.com` 创建用户；客户端默认不创建用户，只登录已存在的这个账号。

当前 GitHub 账号里只有一个 `CoBridge` Supabase 项目。这个项目不建议复用给 Live Tab Mirror，避免把个人浏览标签页数据混进 CoBridge 生产后端。建议新建一个单独的 Supabase 项目后再执行本节配置。

## 安装依赖

```bash
npm install
```

## 配置环境变量

分别复制两端的示例配置：

```bash
cp apps/extension/.env.example apps/extension/.env.local
cp apps/mobile/.env.example apps/mobile/.env.local
```

填入：

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
VITE_ALLOWED_EMAIL=zhaowork74@gmail.com
```

扩展端还可以配置：

```bash
VITE_DEVICE_ID=desktop-chrome-main
VITE_DEVICE_NAME=Mac Chrome
```

## 加载 Chrome 扩展

```bash
npm run build -w @live-tab-mirror/extension
```

然后在 Chrome 打开：

```text
chrome://extensions
```

打开 Developer mode，选择 Load unpacked，目录选：

```text
apps/extension/dist
```

扩展 popup 里用 `zhaowork74@gmail.com` 发送验证码，输入 OTP 后会立即同步一次。这里走的是已有 Auth 用户登录，不走注册逻辑。验证码输入框会一直显示；如果已经收到邮件，即使发送按钮因为 Supabase 邮件限流报错，也可以直接输入验证码登录。验证码请求成功后会在扩展本地保存一个待登录状态；即使关掉 popup，再打开也可以继续输入邮箱里的验证码。pending 期间按钮会显示“验证码已发送”，避免重复发信触发 Supabase 内置邮件限额。之后打开、关闭、移动、切换标签页会 debounce 后上传；扩展也会每分钟 heartbeat 一次。

## 运行手机网页/PWA

当前外网地址：

```text
https://walnut-a.github.io/live-tab-mirror/
```

网页登录同样只允许 `zhaowork74@gmail.com`。验证码输入框会一直显示；如果手里已有邮件验证码，不需要再次发送，直接输入后点登录即可。

手机上建议把网页安装成 PWA 使用：在 Android Chrome 打开上面的地址，点浏览器菜单里的“添加到主屏幕”或“安装应用”，之后从主屏幕图标打开。这样会按 `standalone` 模式运行，不再是普通 Chrome 标签页，也就不会在上下滑动时反复显示/隐藏 Chrome 工具栏。

代码仓库：

```text
https://github.com/walnut-a/live-tab-mirror
```

开发模式：

```bash
npm run dev:mobile
```

同一局域网内手机访问电脑的局域网 IP 和 Vite 端口，例如：

```text
http://192.168.1.10:5173
```

生产构建：

```bash
npm run build -w @live-tab-mirror/mobile
```

本项目当前使用 GitHub Pages 部署 `apps/mobile/dist`。PWA manifest 和最小 service worker 已在生产构建里输出；manifest 使用相对 `start_url`、`scope` 和 icon 路径，service worker 会按 Vite base path 注册到 `/live-tab-mirror/sw.js`。

GitHub Pages 是公开入口；当前仓库也按低成本方案设为 public。前端 bundle 会公开 Supabase project URL 和 publishable key，这是 Supabase 浏览器客户端的正常模型。数据访问边界是 Supabase Auth + RLS，不是 GitHub Pages。

GitHub Pages workflow：`.github/workflows/deploy-mobile.yml`。push 到 `main` 后会自动测试、类型检查、构建 `apps/mobile` 并发布到 Pages。

GitHub repo settings 需要配置：

- Repository variable: `VITE_SUPABASE_URL`
- Repository secret: `VITE_SUPABASE_PUBLISHABLE_KEY`

publishable key 会被前端打包，这是 Supabase 客户端的正常用法；不要把 service role key 放进 GitHub Actions 或任何前端环境变量。

## 常用命令

```bash
npm test
npm run typecheck
npm run build
```

## 安全边界

- 前端和扩展只使用 Supabase project URL + publishable key。
- 代码里不要放 service_role key、数据库密码或 Dashboard 凭据。
- 扩展只请求 `tabs`、`storage`、`alarms` 和 Supabase host permission。
- snapshot 默认过滤 `chrome://`、`file://` 等不可打开或本地敏感 URL。
- 不抓取网页正文、cookie、localStorage、截图或历史记录。
