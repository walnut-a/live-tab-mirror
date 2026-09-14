# 云端标签页与 Inbox API Ready 记录

> 后续变更：2026-09-14 已调整产品边界，标签快照和最近 48 小时历史中的有效 HTTP/HTTPS 链接改为默认进入云端 Inbox。下文“不会自动写入”的描述仅记录本次验证时的状态。

> 日期：2026-09-13
> 分支：`walnut/inbox-sync-api`
> 范围：Cloudflare Worker、D1 migration、这台 Mac 的 Chrome 扩展标签页同步
> 部署源提交：`d7d72d7c330e0fe211452bf55fd32510c9caf826`

## Ready 结论

- 状态：**Ready**。`live-tab-mirror-api` 已重新部署到 `https://live-tab-mirror-api.zhaowork74.workers.dev`，当前 Worker Version ID 为 `00b06b29-60c3-4131-909d-ad35d6ba3ca3`。
- 远端 D1 已应用 `0003_inbox.sql`；部署后再次执行 migration 检查，结果为 `No migrations to apply`。
- Worker 当前代码同时包含 snapshot、48 小时 history 和 Inbox 路由；线上 `/health` 返回 200 与 `{"ok":true}`。
- 未携带 Bearer session 时，`GET /snapshot/latest`、`GET /snapshots/history`、`GET /inbox/changes`、`POST /inbox/items` 和 `POST /inbox/push` 均返回 401；对 snapshot 路由携带无效 Bearer token 也返回 401。
- Cloudflare 仅确认 `SESSION_SECRET`、`ADMIN_CODE_SECRET`、`LOGIN_PASSWORD` 三个 secret 名称已配置；检查和记录均未读取或输出 secret 值。
- 远端 D1 的只读检查显示，这台 Mac 的 `Mac Chrome` 最新 snapshot 在 `2026-09-13T12:26:10.824Z` 完成服务端写入，包含 1 个窗口、41 个标签页；历史表最新写入时间与该批次一致。该结果证明当前电脑扩展的已登录上传链路仍在线。

## 构建与自动化

- `npm test`：12 个测试文件、45 项测试通过。
- `npm run typecheck`：API、扩展、移动网页和 shared workspace 全部通过。
- `npm run build`：Worker dry-run、Chrome 扩展和移动网页构建全部通过。
- `npm run deploy -w @live-tab-mirror/api`：上传并启用 Worker Version `00b06b29-60c3-4131-909d-ad35d6ba3ca3`，定时清理触发器保持为 `23 19 * * *`。

## 边界

- 标签页 snapshot 与 48 小时历史同步已经在线打通；它们不会自动写入 Glade Inbox。
- Inbox migration 和 API 已上线，但本次没有创建、修改或删除任何 Inbox 数据。Chrome 扩展仍只在用户明确点击“将当前页加入 Glade Inbox”后写入。
- 本轮没有读取或复用客户端 session token，也没有用真实账号主动调用受保护的读取接口；鉴权结论来自线上匿名/无效 token 拒绝结果、服务端路由实现、自动化测试，以及扩展成功写入的远端 D1 元数据。
- 当前 Worker 是从工作分支部署。该分支尚未合并到 `main`；未来若从旧 `main` 再次部署，可能覆盖 Inbox 路由，合并仍须遵循仓库流程另行处理。
