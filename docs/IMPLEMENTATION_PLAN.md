# MVP Implementation Plan

Goal: build the first usable Live Tab Mirror path: desktop Chrome uploads the current tab snapshot to Supabase, and the mobile web app reads, searches, and opens those tabs.

Architecture:
- Use an npm workspace with `apps/extension`, `apps/mobile`, and `packages/shared`.
- Keep Supabase access client-side only with project URL and publishable key.
- Store only the latest row per `(user_id, device_id)` in `desktop_tab_snapshots`.

Steps:
1. Add shared types and pure helpers for email restriction, snapshot shaping, search, and sync freshness.
2. Add a Supabase migration for the snapshot table, RLS policies, and API grants.
3. Build the MV3 extension background worker and popup login/status UI.
4. Build the mobile React/PWA UI with OTP login, polling, search, grouped tabs, and link opening.
5. Verify with tests, type checks, production builds, and README setup instructions.
