# Live Tab Mirror

一个个人用的实时标签页镜像工具：桌面 Chrome 扩展同步当前打开的标签页，手机网页/PWA 查看最新列表、搜索、点击打开。

它默认展示“当前 snapshot”，并合并展示最近 48 小时内出现过、但当前不一定还打开的历史链接。它仍然不是稍后读、收藏夹、长期浏览历史或知识库。

需求文档见 [docs/PRD.md](docs/PRD.md)。

## 目录结构

```text
apps/api            Cloudflare Worker + D1 后端
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
5. 扩展和手机网页只负责 `verifyOtp({ type: 'email' })` 登录，不再从客户端发送邮件验证码。
6. 每次登录前，在本机用 `npm run auth:code` 生成一次性验证码。这个脚本使用 Supabase Admin `generateLink`，不会触发 Supabase 邮件发送限流。
7. 复制 Project URL 和 publishable key。不要使用 service_role key 或 secret key 构建前端。

注意：service role key、secret key、Supabase access token 只能放在本机 shell 里给脚本用，不要写进 `apps/*/.env.local`、GitHub Actions 或任何前端代码。

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
VITE_BACKEND_PROVIDER=supabase
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
VITE_ALLOWED_EMAIL=zhaowork74@gmail.com
```

如果切到 Cloudflare Worker + D1：

```bash
VITE_BACKEND_PROVIDER=worker
VITE_WORKER_API_URL=https://live-tab-mirror-api.zhaowork74.workers.dev
VITE_ALLOWED_EMAIL=zhaowork74@gmail.com
```

扩展端还可以配置默认设备名称：

```bash
VITE_DEVICE_NAME=Mac Chrome
```

扩展首次运行时会自动生成安装级 `deviceId`，保存在 `chrome.storage.local`。因此同一份扩展装到不同电脑或不同浏览器配置里，也会作为不同设备同步，不需要为每台设备重新构建。`VITE_DEVICE_ID` 仍可作为高级覆盖项使用，但默认不建议配置。

## 生成登录验证码

推荐使用 Supabase access token，让脚本临时读取当前项目的服务端密钥：

```bash
export SUPABASE_ACCESS_TOKEN=your_supabase_access_token
npm run auth:code
```

也可以直接使用服务端密钥：

```bash
export SUPABASE_SERVICE_ROLE_KEY=your_service_role_or_secret_key
npm run auth:code
```

检查配置但不生成验证码：

```bash
npm run auth:code -- --check
```

脚本会输出 `zhaowork74@gmail.com` 的一次性验证码。打开扩展或手机网页，把这个验证码填进“验证码”输入框即可。验证码有效期以 Supabase Auth 当前配置为准。

## 准备 Cloudflare Worker + D1

Worker 后端在 `apps/api`，只用 D1，不用 KV。D1 保存最新 snapshot、最近 48 小时内用于合并展示的 snapshot 历史、一次性登录码和 session。

1. 创建 D1 数据库：

   ```bash
   cd apps/api
   npx wrangler d1 create live-tab-mirror
   ```

2. 把输出的 `database_id` 填进 `apps/api/wrangler.toml`。
3. 设置 Worker secrets：

   ```bash
   npx wrangler secret put SESSION_SECRET
   npx wrangler secret put ADMIN_CODE_SECRET
   ```

   `SESSION_SECRET` 用于 hash 登录码和 session token；`ADMIN_CODE_SECRET` 用于保护手动生成验证码接口。不要把它们写进前端 env。

   `apps/api/wrangler.toml` 里的 `SNAPSHOT_HISTORY_RETENTION_HOURS` 控制历史保留窗口，当前默认是 48 小时。

4. 应用 D1 migration：

   ```bash
   npx wrangler d1 migrations apply live-tab-mirror --remote
   ```

5. 部署 Worker：

   ```bash
   npm run deploy -w @live-tab-mirror/api
   ```

6. 生成 Worker 登录验证码：

   ```bash
   export WORKER_API_URL=https://live-tab-mirror-api.zhaowork74.workers.dev
   export WORKER_ADMIN_CODE_SECRET=your_admin_code_secret
   npm run auth:worker-code
   ```

7. 把扩展和 PWA 的环境变量切到：

   ```bash
   VITE_BACKEND_PROVIDER=worker
   VITE_WORKER_API_URL=https://live-tab-mirror-api.zhaowork74.workers.dev
   ```

如果 Worker 使用自定义域名，Chrome 扩展的 `apps/extension/public/manifest.json` 还需要把该域名加入 `host_permissions`。默认已经包含 `https://*.workers.dev/*`。

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

扩展 popup 里用 `zhaowork74@gmail.com` 和本机脚本生成的验证码登录，成功后会立即同步一次。这里走的是已有 Auth 用户登录，不走注册逻辑，也不发送邮件。之后打开、关闭、移动、切换标签页会 debounce 后上传；扩展也会每 10 分钟 heartbeat 一次作为兜底。popup 中可以修改设备名称，下一次同步会把新名称带到手机端。

## 运行手机网页/PWA

当前外网地址：

```text
https://walnut-a.github.io/live-tab-mirror/
```

网页登录同样只允许 `zhaowork74@gmail.com`。如果当前使用 Worker 后端，先在本机运行 `npm run auth:worker-code`，再把生成的验证码填进手机网页即可；如果还在使用 Supabase 兼容路径，则运行 `npm run auth:code`。

手机上建议把网页安装成 PWA 使用：在 Android Chrome 打开上面的地址，点浏览器菜单里的“添加到主屏幕”或“安装应用”，之后从主屏幕图标打开。这样会按 `standalone` 模式运行，不再是普通 Chrome 标签页，也就不会在上下滑动时反复显示/隐藏 Chrome 工具栏。

手机端列表会在打开、回到前台、手动刷新时立即读取；页面保持打开时每 30 秒做一次被动刷新。Worker 后端会返回设备列表和最近 48 小时内的合并历史链接；如果有多台桌面设备，手机端会显示设备筛选条，默认跟随“最近同步”的设备，也可以固定查看某一台设备。超过 48 小时的历史会在上传和每日定时任务中清理。

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

GitHub Pages 是公开入口；当前仓库也按低成本方案设为 public。当前线上推荐路径是 Worker + D1：前端 bundle 只公开 Worker URL，数据访问边界是 Worker Bearer session 和服务端邮箱限制，不是 GitHub Pages。Supabase 兼容路径仍只允许使用 project URL + publishable key，不能把 service role key 放进前端代码。

迁移出 Supabase 的方案见 [docs/MIGRATION_FROM_SUPABASE.md](docs/MIGRATION_FROM_SUPABASE.md)。当前推荐路线是先用本机脚本绕开邮件限流，后续再迁到 Cloudflare Workers + D1。

GitHub Pages workflow：`.github/workflows/deploy-mobile.yml`。push 到 `main` 后会自动测试、类型检查、构建 `apps/mobile` 并发布到 Pages。

GitHub repo settings 需要配置：

- Repository variable: `VITE_SUPABASE_URL`
- Repository variable: `VITE_BACKEND_PROVIDER`
- Repository variable: `VITE_WORKER_API_URL`
- Repository secret: `VITE_SUPABASE_PUBLISHABLE_KEY`

publishable key 会被前端打包，这是 Supabase 客户端的正常用法；不要把 service role key 放进 GitHub Actions 或任何前端环境变量。

## 常用命令

```bash
npm run auth:code -- --check
npm run auth:worker-code -- --help
npm test
npm run typecheck
npm run build
```

## 安全边界

- Supabase 模式下，前端和扩展只使用 Supabase project URL + publishable key。
- Worker 模式下，前端和扩展只使用 Worker API URL 和用户 session token。
- 代码里不要放 service_role key、数据库密码或 Dashboard 凭据。
- 扩展只请求 `tabs`、`storage`、`alarms`、Supabase host permission 和 `workers.dev` host permission。
- snapshot 默认过滤 `chrome://`、`file://` 等不可打开或本地敏感 URL。
- 不抓取网页正文、cookie、localStorage、截图或历史记录。
