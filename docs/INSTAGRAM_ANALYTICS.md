# Instagram Sontra

Existing Meta transport, authenticated API, marketing RPC and Supabase KV are reused. No schema migration or new dependency is needed. Tokens are backend environment values only; Page-to-Instagram linkage is verified before reading insights.

Render backend: META_PAGE_ACCESS_TOKEN, META_PAGE_ID=115021051629190, INSTAGRAM_USER_ID=17841460619682729, META_GRAPH_VERSION=v26.0. Keep existing Facebook envs. Enable INSTAGRAM_AUTO_SYNC=true for the existing 08:30 Vietnam Facebook workflow's independent Instagram step (7 and 30 completed days). Manual sync does not require this switch.

GET /api/instagram/status; GET /api/instagram/report?from=YYYY-MM-DD&to=YYYY-MM-DD; POST /api/instagram/sync with JSON {"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}. Read requires app authentication, sync requires manager/admin. GET /api/instagram/cron uses CRON_SECRET.

Marketing & Tiếp cận → Instagram Sontra Sea Hotel → select 7/30 days or a custom completed range → Cập nhật Instagram. Reopening the same period reads the saved report. Up to 30 days, within 89 days of today. Meta reach is a period aggregate, never a sum of daily unique accounts. Followers/media count represent current account totals at capture time, not historical growth. Partial unavailable metrics display —, never fabricated zero; complete insights failure preserves the previous stored report.

The Facebook Login token needs access to the linked professional Instagram account including instagram_basic and instagram_manage_insights. Missing permission must be resolved at Meta, not by inventing data. Live API permissions and returned metrics require verification after deployment; local test fixtures are not production data.
