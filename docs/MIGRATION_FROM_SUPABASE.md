# 迁移出 Supabase 方案

日期：2026-06-29  
目标：降低固定成本，去掉邮件验证码依赖，同时保持 Live Tab Mirror 的个人工具边界。

## 结论

短期先不拆 Supabase 数据层，只把登录改成“本机脚本生成验证码”。这一步成本最低，也能立刻绕开 Supabase 内置邮件的发送限流。

长期迁移已选定 Cloudflare Workers + D1。用户已经有不少小网站挂在 Cloudflare，并且已经开了 Workers 基础套餐，所以这个工具的边际现金成本接近 0；重点是不要再使用 KV，避免叠加已有账号的 KV 用量压力。

- GitHub Pages 继续放 PWA 静态资源。
- Cloudflare Worker 提供登录、上传 snapshot、读取 snapshot 的 API。
- D1 保存当前 snapshot、一次性登录码、session，不保存历史。
- 不使用 Cloudflare KV 存 snapshot、验证码或 session。
- 扩展和 PWA 不再接触 Supabase URL、publishable key，也不再依赖 Supabase Auth。

Cloudflare 当前官方文档显示 Workers Free 有 100,000 requests/day，D1 Free 有 5 million rows read/day、100,000 rows written/day、5 GB storage。这个个人工具的访问量大概率长期在免费额度内；既然账号已经开了 Workers 基础套餐，Worker 请求和 D1 用量更不会成为这个工具的主要成本。需要避开的反而是 KV，因为 KV 写入额度和计费模型不适合频繁覆盖当前状态。

参考：

- Cloudflare Workers Pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare D1 Pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Supabase Auth Admin generateLink: https://supabase.com/docs/reference/javascript/auth-admin-generatelink

## 当前阶段：继续用 Supabase，但不用邮件

现在前端和扩展仍使用 Supabase Auth session 和 RLS。变化是：

- 不再从扩展或 PWA 调 `signInWithOtp` 发邮件。
- 本机脚本调用 Supabase Admin `generateLink` 生成 `email_otp`。
- 扩展和 PWA 继续调用 `verifyOtp({ type: 'email' })` 登录。
- service role key 或 Supabase access token 只存在本机 shell，不进前端、不进 GitHub、不进 `.env.local`。

生成验证码：

```bash
export SUPABASE_ACCESS_TOKEN=your_supabase_access_token
npm run auth:code
```

也可以直接用服务端密钥：

```bash
export SUPABASE_SERVICE_ROLE_KEY=your_service_role_or_secret_key
npm run auth:code
```

检查配置但不生成验证码：

```bash
npm run auth:code -- --check
```

输出的验证码一次性有效，把它填到扩展或手机网页的“验证码”输入框即可。

这一阶段的优点：

- 不改数据库结构。
- 不改 RLS。
- 不触发 Supabase email rate limit。
- 线上 PWA 和本地扩展都能沿用当前登录 session 机制。

这一阶段的缺点：

- 仍然依赖 Supabase 项目。
- 仍然要保留 Supabase Auth 用户和 RLS。
- service role 或 access token 需要由本机脚本安全持有。

## 目标后端：Workers + D1

### API

建议新建 `apps/api`，使用 Wrangler 开发和部署 Worker。

最小 API：

```text
POST /auth/verify
POST /auth/logout
GET  /snapshot/latest
PUT  /snapshot/:deviceId
GET  /health
```

认证方式：

- 本机脚本生成一次性 code。
- code 只为 `zhaowork74@gmail.com` 有效。
- Worker 校验 code 后签发 session token。
- 扩展把 token 存在 `chrome.storage.local`。
- PWA 把 token 存在浏览器本地存储。
- 后续 API 都用 `Authorization: Bearer <token>`。

如果以后把 PWA 也迁到 Cloudflare Pages，并和 Worker 放到同一站点，可以把 PWA session 改成 httpOnly cookie。但扩展端仍然更适合显式 Bearer token。

### D1 表结构

只保存当前状态，不保存历史：

```sql
create table login_codes (
  id text primary key,
  email text not null,
  code_hash text not null,
  expires_at text not null,
  used_at text,
  created_at text not null
);

create table sessions (
  id text primary key,
  email text not null,
  token_hash text not null,
  device_label text,
  expires_at text not null,
  revoked_at text,
  created_at text not null
);

create table desktop_tab_snapshots (
  email text not null,
  device_id text not null,
  device_name text not null,
  snapshot_json text not null,
  synced_at text not null,
  updated_at text not null,
  primary key (email, device_id)
);
```

实现细节：

- code 使用 8 位或 10 位随机数字即可，原文只打印一次。
- D1 只存 `code_hash`，不要存明文 code。
- code TTL 建议 10 到 30 分钟。
- code 校验成功后立刻写 `used_at`，不能重复使用。
- token 只存 hash，返回给客户端的是原文 token。
- token TTL 可以先设 30 天，之后按使用感受调整。
- 所有写入都强制 `email === "zhaowork74@gmail.com"`。

### 安全边界

- Worker 环境变量保存 `SESSION_SECRET`、`ADMIN_GENERATE_CODE_SECRET` 等后端秘密。
- 前端和扩展只保存 session token，不保存后端 secret。
- CORS 只允许 GitHub Pages 域名和已知 Chrome extension origin。
- 即使 CORS 配错，也必须靠 Bearer token 做真正鉴权。
- `PUT /snapshot/:deviceId` 校验 snapshot schema version 和基本 payload 大小。
- `PUT /snapshot/:deviceId` 比对 `snapshot_hash`，payload 没变化时直接返回，不写 D1。
- 扩展端保留事件 debounce，并增加最小上传间隔，避免异常循环造成请求风暴。
- 不新增历史表，不新增审计流水表。
- 不使用 KV。当前 snapshot、验证码和 session 都放 D1。

## 迁移步骤

### 0. 稳住当前 Supabase 版本

已完成方向：

- 登录界面不再展示“发送验证码”主入口。
- 本机脚本生成 Supabase `email_otp`。
- README 说明本机生成验证码的流程。

验收：

- `npm run auth:code -- --check` 能通过。
- 扩展能用脚本生成的验证码登录并同步。
- PWA 能用同一个验证码登录并读取 snapshot。

### 1. 新建 Worker + D1 骨架

新增：

```text
apps/api
apps/api/src/index.ts
apps/api/wrangler.toml
apps/api/migrations/*.sql
```

先实现：

- `/health`
- `/auth/verify`
- `/snapshot/latest`
- `/snapshot/:deviceId`

测试：

- Worker 单元测试校验 code TTL、单次使用、错误 code 拒绝。
- snapshot 写入后读取返回最新数据。
- 非本人 email 拒绝。

### 2. 抽象前端后端客户端

新增共享接口：

```ts
interface TabMirrorBackend {
  verifyLogin(email: string, code: string): Promise<void>;
  getLatestSnapshot(): Promise<SnapshotRow | null>;
  upsertSnapshot(snapshot: TabSnapshot): Promise<void>;
  signOut(): Promise<void>;
}
```

然后提供两个实现：

- `supabaseBackend`
- `workerBackend`

通过环境变量切换：

```text
VITE_BACKEND_PROVIDER=supabase | worker
VITE_WORKER_API_URL=https://live-tab-mirror-api.<account>.workers.dev
```

### 3. 双写验证

扩展先做一段时间双写：

- 主写 Supabase。
- 旁路写 Worker。
- PWA 先保留读 Supabase，也提供切换到 Worker 的构建配置。

验证重点：

- 两边 snapshot tab 数一致。
- `synced_at` 基本一致。
- 手机端搜索和打开链接行为不变。
- 扩展重启、PWA 重开后 session 仍有效。

### 4. 切换生产读取

当 Worker 连续稳定后：

- PWA 生产环境改为读 Worker。
- 扩展生产构建改为只写 Worker。
- Supabase 保留 3 到 7 天作为回滚后端。

### 5. 下线 Supabase

确认 Worker 版本稳定后：

- 删除前端 Supabase env。
- 删除 Supabase publishable key 配置。
- 删除 Supabase migration 运行说明，保留归档文档。
- 撤销本机 Supabase access token 或 service role key。
- 导出或删除 Supabase 项目中的 snapshot 数据。
- 停用或删除 Supabase 项目。

## 备选方案

### 继续 Supabase，只用手动验证码

成本最低，改动最小。适合作为当前过渡方案。缺点是只要这个项目需要付费，就没有解决固定成本问题。

### 自有服务器 + SQLite

实现很直观，一个 Node/Fastify 或 Go 服务加 SQLite 就够。如果已有服务器，现金成本同样接近 0。缺点是要自己维护进程、日志、TLS、系统更新和故障恢复；既然 Cloudflare 基础套餐已经存在，当前把它作为备选而不是首选。

### Cloudflare KV

不建议。这个工具的写入模型是“频繁覆盖当前 snapshot”，KV 的写入额度和计费模型都不适合；用户账号此前也已经遇到过 KV 用量提醒。迁移实现里应明确禁止把 snapshot、验证码或 session 放进 KV。

### GitHub Gist 或私有仓库存 snapshot

不建议。虽然看起来便宜，但移动端和扩展的鉴权会很别扭，token 暴露风险高，写入频率和 API rate limit 也不适合“当前标签页镜像”。

## 推荐执行顺序

先按当前脚本模式跑 1 到 2 天，确认登录、同步、PWA 都顺畅。之后开始 `apps/api` 的 Worker + D1 实现。不要在没验证手动验证码流程之前就拆 Supabase，否则会同时面对登录、数据、部署三条链路的变量。
