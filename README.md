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

3. 在 Authentication 里预创建用户：`zhaowork74@gmail.com`。
4. Email OTP 模板要包含 `{{ .Token }}`，这样扩展和手机网页都能输入验证码登录。
5. 复制 Project URL 和 publishable key。不要使用 service_role key。

RLS 已限制：

- 只能 `authenticated` 访问。
- 只能访问自己的 `user_id`。
- JWT email 必须是 `zhaowork74@gmail.com`。

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

扩展 popup 里用 `zhaowork74@gmail.com` 发送验证码，输入 OTP 后会立即同步一次。之后打开、关闭、移动、切换标签页会 debounce 后上传；扩展也会每分钟 heartbeat 一次。

## 运行手机网页/PWA

当前外网地址：

```text
https://walnut-a.github.io/live-tab-mirror/
```

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

部署 `apps/mobile/dist` 到 Vercel、Netlify、GitHub Pages 等静态站点即可。PWA manifest 和最小 service worker 已在生产构建里输出。

本仓库已经配置 GitHub Pages workflow：`.github/workflows/deploy-mobile.yml`。push 到 `main` 后会自动测试、类型检查、构建 `apps/mobile` 并发布到 Pages。

上线前需要在 GitHub repo settings 配置：

- Repository variable: `VITE_SUPABASE_URL`
- Repository secret: `VITE_SUPABASE_PUBLISHABLE_KEY`

配置后重新运行 `Deploy Mobile PWA` workflow，线上页面就会连接真实 Supabase 后端。publishable key 会被前端打包，这是 Supabase 客户端的正常用法；不要把 service role key 放进 GitHub Actions 或任何前端环境变量。

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
