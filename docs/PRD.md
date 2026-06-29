# Live Tab Mirror PRD

版本：v1.0  
日期：2026-06-28  
目标用户：仅本人，邮箱 `zhaowork74@gmail.com`  
产品形态：桌面 Chrome 扩展 + 手机网页/PWA + Cloudflare Worker + D1 后端

> 状态说明：本文保留了第一版 Supabase 方案的部分历史决策记录。当前线上实现已经迁移到 Cloudflare Worker + D1，旧 Supabase 项目已删除，运行时不再依赖 Supabase Auth/Postgres/RLS。

## 1. 背景

用户经常在桌面 Chrome 中打开大量文章和网页，但在手机 Chrome 上很难高效查看“电脑此刻打开了哪些页面”。Chrome 自带的跨设备标签页入口较深，列表体验、搜索体验和实时感都不够好。现成的稍后读、收藏夹、知识库、工作区管理工具又会把问题扩大，混入阅读队列、标签、分类、历史沉淀等额外概念。

本项目只解决一个很窄的问题：在手机上快速查看桌面 Chrome 当前打开的标签页列表，并能一键打开需要的页面。

## 2. 产品定位

Live Tab Mirror 是一个个人用的实时标签页镜像工具。

它不是稍后读工具，不是书签管理器，不是长期浏览历史工具，也不是资料库。它默认显示桌面 Chrome 当前打开的页面状态，并合并展示最近 48 小时内出现过的短历史链接。

一句话目标：

> 手机打开一个网页，就能看到电脑 Chrome 此刻打开的所有标签页。

## 3. 用户与场景

### 3.1 用户

唯一目标用户是本人：

- 邮箱：`zhaowork74@gmail.com`
- 使用桌面 Chrome 浏览和积累文章
- 使用手机 Chrome 在外面继续查看、打开或找回桌面端已打开的页面

### 3.2 核心场景

1. 用户在电脑 Chrome 打开很多文章。
2. 用户离开电脑后，在手机上想找其中一个页面。
3. 用户打开 Live Tab Mirror 手机网页。
4. 页面展示电脑 Chrome 当前标签页列表。
5. 用户搜索标题或 URL，找到目标页面。
6. 用户点击链接，在手机 Chrome 中打开该页面。

### 3.3 次要场景

- 用户想确认某篇文章是否还在电脑端打开。
- 用户想看当前电脑端 Chrome 有几个窗口、每个窗口分别有哪些标签页。
- 用户想找到当前电脑端 active tab 或 pinned tab。
- 用户想知道同步是否还新鲜，例如“最后同步：12 秒前”。

## 4. 目标

### 4.1 产品目标

- 用手机网页查看桌面 Chrome 当前打开的标签页。
- 同步足够实时，普通使用下延迟控制在几秒级。
- 登录和权限足够简单，只服务本人。
- 数据最小化，只保存当前快照和最近 48 小时内用于合并展示的短历史数据。
- 不引入稍后读、收藏、标签管理、阅读状态等功能。

### 4.2 工程目标

- Chrome 扩展负责采集和上传 tab snapshot。
- Cloudflare Worker 负责认证、读写 API、历史合并和访问控制，D1 负责存储。
- 手机网页负责展示和本地搜索。
- 不把任何后端管理密钥暴露到前端或扩展。
- 后端不需要自建服务器。
- 第一版优先用轮询读取，Realtime 作为后续增强。

## 5. 非目标

第一版明确不做：

- 不做稍后读。
- 不做书签收藏。
- 不做历史记录。
- 不抓取网页正文。
- 不做 AI 总结。
- 不做网页快照存档。
- 不做多人账号体系。
- 不做分享链接。
- 不做跨浏览器支持。
- 不支持手机端向桌面端远程打开标签页。
- 不同步隐身窗口。
- 不长期保存已关闭标签页；短历史最多保留 48 小时。
- 不追踪阅读进度。
- 不做复杂的 workspace/session 管理。

## 6. 产品边界

### 6.1 当前状态优先，短历史辅助

系统优先展示最新的桌面 Chrome tab snapshot。Worker + D1 后端同时保存最近 48 小时内发生变化的 snapshot 历史，用于合并出历史链接集合；超过 48 小时的历史应被删除。

如果一个标签页在桌面端关闭，下一次同步后它会从当前列表中消失，但可能进入最近 48 小时的历史链接集合。

历史不是每次同步的时间线，不按同步批次切换，只做去重合并展示。

### 6.2 显示链接，而不是管理内容

手机端只展示网页标题、URL、favicon、窗口分组、active/pinned 状态等信息。它不理解文章内容，也不做内容沉淀。

### 6.3 个人认证，而不是开放注册

系统只允许 `zhaowork74@gmail.com` 登录。其他邮箱不应该自动注册或访问数据。

## 7. 核心体验

### 7.1 桌面 Chrome 扩展

扩展需要提供：

- 登录入口：输入邮箱和本机脚本生成的验证码。
- 同步状态：显示已登录、最近同步时间、同步成功或失败。
- 设备名称：首次安装自动生成设备 ID，允许用户给当前浏览器改一个好认的设备名称。
- 手动同步按钮：出现异常时可立即上传一次当前快照。
- 登出按钮：清除本地 session。

扩展后台能力：

- 读取所有普通窗口中的标签页。
- 监听标签页和窗口变化。
- debounce 后上传最新 snapshot。
- 上传失败时重试或等待下次事件触发。

### 7.2 手机网页/PWA

手机网页需要提供：

- 登录入口：同样使用 `zhaowork74@gmail.com` + 本机脚本生成的验证码。
- 最近同步时间。
- 多设备筛选：默认查看最近同步的桌面设备，也可以固定查看某一台设备。
- 搜索框，支持标题和 URL 本地搜索。
- 最近 48 小时历史链接合并展示。
- 按 Chrome 窗口分组展示 tabs。
- 每个 tab 显示 favicon、标题、域名/URL。
- 点击 tab 后在手机 Chrome 中打开原链接。
- 标识 active tab、pinned tab。
- 无数据、未登录、同步过期、网络错误等状态。

### 7.3 手机端默认首页

登录后首页即为标签页列表，不做 landing page。

顶部信息：

- 标题：Live Tabs
- 同步状态：例如“刚刚同步”“12 秒前”“5 分钟前”
- 搜索框

主体：

- 窗口 1
- 窗口 2
- 每个窗口下展示该窗口的 tabs

底部或设置区：

- 当前登录邮箱
- 退出登录
- 版本信息

## 8. 功能需求

### 8.1 认证

需求：

- 当前系统使用 Supabase Auth。
- 登录方式采用 Supabase Email OTP 的校验机制，但验证码由本机脚本通过 Admin API 生成，不通过邮件发送。
- 插件和手机网页都使用同一个 Supabase Auth 用户。
- 只允许 `zhaowork74@gmail.com` 创建或登录。
- 前端调用登录时应禁止自动创建其他新用户。
- session 存储在各端本地安全存储中。

验收标准：

- 本机脚本能为 `zhaowork74@gmail.com` 生成验证码，扩展和网页能用该验证码登录。
- 使用其他邮箱不能创建新用户，不能读写 snapshot。
- 登出后不能继续读取数据。

### 8.2 桌面端 tab 采集

需求：

- 扩展使用 Chrome Extension Manifest V3。
- 读取普通 Chrome 窗口中的 tabs。
- 不读取隐身窗口。
- 支持多个窗口。
- 保留每个窗口内标签页顺序。
- 保留 active、pinned、audible 等轻量状态。
- 尽量读取 favicon。
- 不抓取网页正文。

建议字段：

```json
{
  "schemaVersion": 1,
  "device": {
    "deviceId": "desktop-chrome-main",
    "deviceName": "Mac Chrome",
    "browser": "Chrome"
  },
  "syncedAt": "2026-06-28T11:24:32.000Z",
  "windows": [
    {
      "windowId": 1,
      "focused": true,
      "incognito": false,
      "tabs": [
        {
          "id": 123,
          "index": 0,
          "title": "Example Article",
          "url": "https://example.com/article",
          "favIconUrl": "https://example.com/favicon.ico",
          "active": true,
          "pinned": false,
          "audible": false,
          "groupId": -1
        }
      ]
    }
  ]
}
```

验收标准：

- 打开新标签页后，手机端能看到新增项。
- 关闭标签页后，手机端列表消失。
- 移动标签页顺序后，手机端顺序更新。
- 多窗口时，手机端按窗口分组展示。

### 8.3 同步策略

需求：

- 使用事件触发同步，不做固定高频全量上传。
- 监听 tab 创建、更新、关闭、激活、移动、替换、窗口焦点变化等事件。
- 变化发生后 debounce 1-2 秒再上传。
- 页面频繁更新标题时应合并上传，避免过度请求。
- 每 30-60 秒可发送一次 heartbeat 或轻量同步，用于保证状态新鲜。
- 上传时覆盖当前用户、当前设备的最新 snapshot，并在稳定 URL 结构变化时追加历史来源；标题流式变化不应制造历史记录。

建议同步规则：

- tab 结构变化：1-2 秒后上传。
- URL/title/favicon 变化：2 秒 debounce。
- 无变化时：60 秒 heartbeat，可选。
- 浏览器启动或扩展启动：立即上传一次。
- 网络失败：记录状态，下次事件或手动同步时重试。

验收标准：

- 常规打开/关闭/切换标签页后，手机端 3-5 秒内可看到变化。
- 快速连续打开多个标签页时，不会为每个事件都立即发请求。
- 离线后恢复网络，能重新上传最新 snapshot。

### 8.4 手机端读取

需求：

- 登录后读取当前用户最新 snapshot。
- Worker 后端下读取最近 48 小时内合并后的历史链接集合。
- Worker 后端下读取当前设备列表，并支持按 `device_id` 读取最新 snapshot 和历史 snapshot。
- 第一版使用 3-5 秒轮询刷新。
- 页面在后台时降低或暂停刷新。
- 页面重新回到前台时立即刷新一次。
- 搜索在前端本地执行，不请求服务器。
- 支持清空搜索。

验收标准：

- 手机页面打开后能展示最新 tab snapshot。
- 手机页面能展示最近 48 小时内合并去重后的历史链接。
- 多台桌面设备同步后，手机端能切换设备，历史集合按当前设备过滤。
- 搜索标题关键词能过滤列表。
- 搜索 URL 或域名能过滤列表。
- 点击结果能打开原 URL。
- 网络失败时有明确状态，不清空已有列表。

### 8.5 状态展示

手机端需要展示：

- 未登录。
- 登录中。
- 无 snapshot。
- 正常同步。
- 同步过期。
- 网络错误。
- 权限错误。

同步新鲜度建议：

- 0-15 秒：刚刚同步。
- 15-60 秒：N 秒前。
- 1-10 分钟：N 分钟前。
- 超过 10 分钟：显示“同步可能已过期”。
- 超过 24 小时：显示“很久没有同步”。

### 8.6 设置

第一版设置保持很少：

- 当前登录邮箱。
- 手动刷新。
- 退出登录。
- 显示 device name。

可选设置：

- 手机端轮询间隔。
- 是否显示完整 URL。
- 是否隐藏特殊 URL，例如 `chrome://`、`file://`。

## 9. 数据模型

### 9.1 表：desktop_tab_snapshots

建议字段：

```sql
create table public.desktop_tab_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  device_name text not null,
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id)
);
```

个人版只有一台桌面设备时，也可以用 `user_id` 做主键。但建议保留 `device_id`，以后多电脑时不用迁移核心模型。

### 9.2 RLS 策略

需要开启 RLS。

建议策略：

```sql
alter table public.desktop_tab_snapshots enable row level security;

create policy "read own tab snapshot"
on public.desktop_tab_snapshots
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "insert own tab snapshot"
on public.desktop_tab_snapshots
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "update own tab snapshot"
on public.desktop_tab_snapshots
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
```

### 9.3 账号限制

为了个人使用，需要限制只有 `zhaowork74@gmail.com` 可用。

建议做法：

- 在 Supabase Auth 中预先创建 `zhaowork74@gmail.com` 用户。
- 客户端登录时只校验本机脚本生成的 Email OTP，不从客户端发邮件，也不自动创建新用户。
- 本机脚本通过 Supabase Admin `generateLink` 生成 `email_otp`，避免依赖 Supabase 邮件发送额度。
- 如果需要更硬的限制，可增加数据库 trigger 或后台检查，但第一版可先不引入 Edge Function。

## 10. 权限与安全

### 10.1 Chrome 扩展权限

预计需要：

- `tabs`：读取 tab 的 URL、标题、favicon 等信息。
- `storage`：保存 Supabase session、deviceId、配置。
- `alarms`：可选，用于 heartbeat 或周期同步。
- host permissions：连接 Supabase project URL。

不需要：

- 不需要读取网页正文的 content scripts。
- 不需要 `history` 权限。
- 不需要 `bookmarks` 权限。
- 不需要 `webRequest` 权限。

### 10.2 Supabase Key 管理

前端和扩展只允许保存：

- Supabase project URL。
- Supabase publishable key。

绝对不能放：

- service_role key。
- database password。
- Supabase Dashboard 登录凭据。

### 10.3 数据最小化

系统只上传：

- title
- url
- favIconUrl
- tab 状态
- window 状态
- device 信息
- syncedAt

系统不上传：

- 页面正文。
- cookie。
- localStorage。
- 表单内容。
- 页面截图。
- Chrome 原生浏览历史。
- 超过 48 小时的已关闭 tab 历史。

### 10.4 隐私边界

- 默认排除 incognito 窗口。
- 默认可过滤 `chrome://`、`edge://`、`about:` 等浏览器内部 URL。
- 默认可过滤 `file://` 本地文件 URL，避免泄露本机路径。
- 如果 URL 为空或 Chrome API 不返回 URL，则该 tab 显示为不可打开项。

## 11. 技术架构

### 11.1 架构图

```text
Desktop Chrome Extension
  - chrome.tabs / chrome.windows
  - local session storage
  - snapshot builder
  - debounced uploader
        |
        | Supabase JS client
        v
Supabase
  - Auth: manually generated Email OTP
  - Postgres: desktop_tab_snapshots
  - RLS: user_id = auth.uid()
        ^
        | Supabase JS client
        |
Mobile Web / PWA
  - login
  - polling fetch
  - local search
  - grouped tab list
```

### 11.2 推荐技术栈

Chrome 扩展：

- Manifest V3
- TypeScript
- Vite 或 Plasmo，可二选一
- Supabase JS client

手机网页：

- React + Vite
- TypeScript
- Supabase JS client
- CSS 可以先手写，不需要重组件库

Supabase：

- Auth
- Postgres
- RLS
- Realtime 暂不作为第一版必需项

### 11.3 为什么第一版不用 Edge Functions

本需求的数据读写模型很简单：

- 登录用户写自己的 snapshot。
- 登录用户读自己的 snapshot。

Supabase Auth + Postgres + RLS 已经能表达这个权限模型。引入 Edge Functions 会增加部署、鉴权、日志和维护成本，对个人工具不划算。

## 12. UX 规格

### 12.1 手机端列表项

每个 tab item 展示：

- favicon
- title，最多两行
- domain 或简短 URL
- active 标记
- pinned 标记

点击行为：

- 点击 item 打开 URL。
- 长按或菜单可复制 URL，第一版可选。

### 12.2 搜索

搜索范围：

- title
- url
- domain

搜索行为：

- 输入即时过滤。
- 匹配结果按原窗口和原顺序展示。
- 没有结果时显示空状态。

### 12.3 窗口分组

窗口标题：

- `Window 1`
- `Window 2`
- 如果有 focused window，可显示 `Current on desktop`

每组显示：

- tab 数量。
- 是否 focused。

### 12.4 空状态

未登录：

> 输入邮箱验证码后查看电脑 Chrome 当前标签页。

无数据：

> 还没有收到桌面端同步。请确认 Chrome 扩展已登录并运行。

同步过期：

> 上次同步已超过 10 分钟，列表可能不是最新。

错误：

> 暂时无法刷新，已保留上次看到的列表。

## 13. 关键流程

### 13.1 首次设置流程

1. 创建 Supabase 项目。
2. 创建数据库表并启用 RLS。
3. 预创建 `zhaowork74@gmail.com` 用户。
4. 准备本机验证码生成脚本。
5. 安装 Chrome 扩展。
6. 本机生成验证码，扩展登录。
7. 扩展上传首次 snapshot。
8. 本机生成验证码，手机网页登录。
9. 手机网页展示 snapshot。

### 13.2 日常使用流程

1. 桌面 Chrome 标签页发生变化。
2. 扩展等待 debounce。
3. 扩展读取当前窗口和标签页。
4. 扩展 upsert snapshot 到 Supabase。
5. 手机网页轮询读取最新 snapshot。
6. 手机网页更新列表。

### 13.3 异常恢复流程

网络失败：

1. 扩展上传失败。
2. 扩展保留错误状态。
3. 下次 tab 变化、heartbeat 或手动同步时重试。

session 失效：

1. 上传或读取返回认证错误。
2. 对应端显示需要重新登录。
3. 用户重新输入邮箱验证码登录。

## 14. 验收标准

### 14.1 MVP 验收

MVP 完成时必须满足：

- Chrome 扩展可以用 `zhaowork74@gmail.com` 登录。
- 手机网页可以用同一邮箱登录。
- 扩展能上传当前所有普通窗口 tabs。
- Worker + D1 能保存最新 snapshot 和最近 48 小时内的历史来源。
- 手机网页能展示最新 snapshot。
- 手机网页能展示最近 48 小时内合并去重后的历史链接。
- 打开、关闭、移动标签页后，手机端能在几秒内反映。
- 手机端能搜索标题和 URL。
- 点击手机端 tab 可以打开原链接。
- 服务端鉴权生效，非当前用户不能读写数据。
- 代码里没有 service_role key。

### 14.2 手动测试用例

1. 登录插件，确认 session 保存。
2. 打开 3 个普通标签页，确认手机端出现 3 项。
3. 新建第二个 Chrome 窗口，确认手机端出现第二个窗口分组。
4. 关闭一个标签页，确认手机端移除。
5. 移动标签页顺序，确认手机端顺序变化。
6. pin 一个标签页，确认手机端显示 pinned。
7. 搜索域名，确认只显示匹配项。
8. 断网后改动标签页，恢复网络后手动同步成功。
9. 使用其他邮箱登录失败或不能读写。
10. 检查数据库中没有历史快照堆积。

## 15. 指标

个人工具不需要复杂增长指标，只关注可用性。

核心指标：

- 同步延迟：常规变化 3-5 秒内手机可见。
- 登录成功率：本人设备可稳定登录。
- 数据新鲜度：手机页面能清楚显示最后同步时间。
- 错误可恢复：网络或 session 问题后能重新登录或手动同步。

非核心指标：

- 用户增长。
- 留存。
- 分享次数。
- 收藏数量。

## 16. 分期

### Phase 1: MVP

- Supabase 项目、表、RLS。
- Chrome 扩展登录、采集、上传。
- 手机网页登录、读取、搜索、打开链接。
- 3-5 秒轮询。
- 基础错误状态。

### Phase 2: 体验增强

- PWA 安装到手机桌面。
- 更好的 favicon fallback。
- 复制链接。
- 显示 tab group 名称和颜色。
- 更稳的 heartbeat 和同步状态。
- 可选隐藏 `chrome://`、`file://`。

### Phase 3: 可选实时增强

- Supabase Realtime 替换或补充轮询。
- 多桌面设备切换。
- 手动命名设备。
- 最近一次 snapshot 本地缓存。

## 17. 风险与应对

### 17.1 Chrome 扩展后台被挂起

Manifest V3 service worker 可能被 Chrome 挂起。应对方式：

- 依赖事件触发同步。
- 扩展启动时主动同步一次。
- 可选使用 alarms 做 heartbeat。
- 手机端显示最后同步时间，让用户知道是否新鲜。

### 17.2 同步请求过多

如果每个 tab update 都上传，会产生过多请求。应对方式：

- debounce 合并事件。
- title/favicon 更新使用更长 debounce。
- 无变化时不上传完整 snapshot。

### 17.3 邮件 OTP 体验麻烦

OTP 比 Magic Link 更适合插件，但 Supabase 内置邮件额度太低，不适合反复测试。应对方式：

- 用本机脚本生成验证码，不走邮件发送。
- session 尽量长期保存。
- 登录失效时才重新验证。

### 17.4 敏感 URL 泄露

标签页 URL 本身可能包含敏感信息。应对方式：

- 数据只进入本人 Worker + D1 后端。
- 服务端限制本人访问。
- 历史只保留最近 48 小时。
- 可过滤本地文件和浏览器内部 URL。

## 18. 实现备注

### 18.1 Worker Auth

- 使用本机脚本调用 Worker 管理接口生成一次性验证码。
- Worker 只允许 `zhaowork74@gmail.com` 登录。
- 前端和扩展只保存 Worker session token。
- `ADMIN_CODE_SECRET` 和 `SESSION_SECRET` 只保存在本机 shell 或 Cloudflare Worker secrets 中，不能进入前端代码。

### 18.2 Chrome API

- 使用 `chrome.tabs` 获取和监听标签页。
- 使用 `chrome.windows` 获取窗口结构。
- 使用 `chrome.storage` 保存扩展本地状态。
- 如需 tab group 信息，再增加 `chrome.tabGroups`。

### 18.3 手机网页部署

可选部署方式：

- Vercel
- Netlify
- GitHub Pages

个人版当前使用 GitHub Pages，后端访问统一通过 Cloudflare Worker。

## 19. 参考资料

- Cloudflare Workers: https://developers.cloudflare.com/workers/
- Cloudflare D1: https://developers.cloudflare.com/d1/
- Chrome Tabs API: https://developer.chrome.com/docs/extensions/reference/api/tabs
- Chrome Windows API: https://developer.chrome.com/docs/extensions/reference/api/windows
- Chrome Storage API: https://developer.chrome.com/docs/extensions/reference/api/storage
- Chrome Tab Groups API: https://developer.chrome.com/docs/extensions/reference/api/tabGroups
