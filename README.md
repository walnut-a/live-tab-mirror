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
```

## 当前后端

当前唯一后端是 Cloudflare Worker + D1：

- Worker API: `https://live-tab-mirror-api.zhaowork74.workers.dev`
- D1 数据库：`live-tab-mirror`
- 登录方式：本机脚本手动生成一次性验证码，不发邮件。
- 数据范围：保存每台桌面设备的最新 snapshot，并合并展示最近 48 小时内出现过的历史链接。

旧 Supabase 项目已经删除，代码里不再保留 Supabase 运行路径。

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
VITE_WORKER_API_URL=https://live-tab-mirror-api.zhaowork74.workers.dev
VITE_ALLOWED_EMAIL=zhaowork74@gmail.com
```

扩展端还可以配置默认设备名称：

```bash
VITE_DEVICE_NAME=Mac Chrome
```

扩展首次运行时会自动生成安装级 `deviceId`，保存在 `chrome.storage.local`。因此同一份扩展装到不同电脑或不同浏览器配置里，也会作为不同设备同步，不需要为每台设备重新构建。`VITE_DEVICE_ID` 仍可作为高级覆盖项使用，但默认不建议配置。

## 生成登录验证码

登录码由 Worker 管理接口生成，不依赖邮件服务：

```bash
export WORKER_API_URL=https://live-tab-mirror-api.zhaowork74.workers.dev
export WORKER_ADMIN_CODE_SECRET=your_admin_code_secret
npm run auth:code
```

脚本会输出 `zhaowork74@gmail.com` 的一次性验证码。打开扩展或手机网页，把这个验证码填进“验证码”输入框即可。验证码有效期由 Worker 的 `LOGIN_CODE_TTL_MINUTES` 控制，当前默认 20 分钟。

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

6. 生成登录验证码：

   ```bash
   export WORKER_API_URL=https://live-tab-mirror-api.zhaowork74.workers.dev
   export WORKER_ADMIN_CODE_SECRET=your_admin_code_secret
   npm run auth:code
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

扩展 popup 里用 `zhaowork74@gmail.com` 和本机脚本生成的验证码登录，成功后会立即同步一次。这里走 Worker 一次性验证码，不走注册逻辑，也不发送邮件。之后打开、关闭、移动、切换标签页会 debounce 后上传；扩展也会每 10 分钟 heartbeat 一次作为兜底。popup 中可以修改设备名称，下一次同步会把新名称带到手机端。

## 运行手机网页/PWA

当前外网地址：

```text
https://walnut-a.github.io/live-tab-mirror/
```

网页登录同样只允许 `zhaowork74@gmail.com`。先在本机运行 `npm run auth:code`，再把生成的验证码填进手机网页即可。

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

GitHub Pages 是公开入口；当前仓库也按低成本方案设为 public。前端 bundle 只公开 Worker URL，数据访问边界是 Worker Bearer session 和服务端邮箱限制，不是 GitHub Pages。

GitHub Pages workflow：`.github/workflows/deploy-mobile.yml`。push 到 `main` 后会自动测试、类型检查、构建 `apps/mobile` 并发布到 Pages。

GitHub repo settings 需要配置：

- Repository variable: `VITE_WORKER_API_URL`

## 常用命令

```bash
npm run auth:code
npm run auth:code -- --json
npm run auth:worker-code -- --help
npm test
npm run typecheck
npm run build
```

## 安全边界

- 前端和扩展只使用 Worker API URL 和用户 session token。
- 代码里不要放 service_role key、数据库密码或 Dashboard 凭据。
- 扩展只请求 `tabs`、`storage`、`alarms` 和 `workers.dev` host permission。
- snapshot 默认过滤 `chrome://`、`file://` 等不可打开或本地敏感 URL。
- 不抓取网页正文、cookie、localStorage、截图或历史记录。
