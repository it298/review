# TikTok Sandbox integration

Uses the existing Express backend, React Marketing dashboard, AES-GCM token helper, service-role-only marketing RPC and Supabase KV. No database schema migration, new project or package is required. One TikTok account is connected for the shared workspace; this is not a hotel-account mapping module.

## Configure

In the TikTok developer portal, select the app's Sandbox. Add Login Kit Web and Display API. Register this exact Web redirect URI:

`https://hotel-review-tracker-api-gbp.onrender.com/api/tiktok/callback`

Request `user.info.basic`, `user.info.stats`, `video.list`. Add your TikTok account under Target users and apply the Sandbox changes. Use Client key and Client secret from that same Sandbox. Sandbox uses the regular OAuth/Display API endpoints with Sandbox credentials; there is no invented sandbox API host or `sandbox=true` query flag.

Render backend Environment:

```env
TIKTOK_CLIENT_KEY=<Sandbox Client key>
TIKTOK_CLIENT_SECRET=<Sandbox Client secret>
TIKTOK_REDIRECT_URI=https://hotel-review-tracker-api-gbp.onrender.com/api/tiktok/callback
```

Keep existing FRONTEND_URL and TOKEN_ENCRYPTION_KEY. Never prefix TikTok secrets with VITE_. Deploy both frontend and backend. Credentials need not be pasted into chat. The verification text file and `/privacy` remain public.

## Recording a real demonstration

1. Open the deployed app and sign in as admin.
2. Marketing & Tiếp cận → TikTok. Show the connection explanation and privacy link.
3. Click **Connect TikTok**. This opens TikTok's real Login Kit authorization page.
4. Sign in with the Sandbox Target user and consent to the displayed scopes.
5. TikTok redirects to the backend callback. The backend exchanges the code, encrypts and saves tokens, fetches the profile/videos, then returns to the TikTok dashboard.
6. Show current followers, total account likes, public video count, video comparison chart and detail table. Click **Cập nhật TikTok** to show refresh without copying tokens.
7. Optionally demonstrate **Ngắt kết nối**: this revokes access where possible and deletes stored TikTok tokens/reports/snapshots. Confirming this action removes the workspace's TikTok history.

Live consent and real data cannot be demonstrated until TikTok/Render credentials and Target user permissions are configured. Do not use the isolated QA fixture as evidence of a live TikTok connection.

## API

- `POST /api/tiktok/connect`: admin; returns authorize URL only.
- `GET /api/tiktok/callback`: public one-use state callback, exchanges code and initially syncs. Redirect contains only a fixed status, never tokens or provider messages.
- `GET /api/tiktok/status`: authenticated; configuration/connection flags, granted scopes and expiration metadata.
- `GET /api/tiktok/report`: authenticated; saved safe report only, no live TikTok requests.
- `POST /api/tiktok/sync`: admin/manager; refresh token when necessary, fetch and upsert report.
- `POST /api/tiktok/disconnect`: admin; remote revoke attempt plus local deletion.

## Storage and metric meaning

Existing `review_tracker_marketing_set` stores two hash-namespaced records with its existing 366-day expiration: encrypted connection and account-isolated report. Only the existing service role can call this RPC. Daily follower/likes/video snapshots are upserted in the report, one per Vietnam date, retaining 90 observation days. Same-account reauthorization preserves history; switching accounts discards the previous report. A report is saved only after the requested API collection succeeds.

Access tokens refresh on demand during sync, with token rotation persisted. An API invalid-token error receives at most one refresh/retry. Expired/revoked refresh tokens require reconnecting. There is no additional scheduled job in this change.

Profile stats are current account totals. The video list includes up to 200 recent public videos, using documented pagination and duplicate-ID removal. If more remain, the UI explicitly labels incomplete coverage. Views/likes/comments/shares are lifetime totals of the returned videos as observed at capture time. Date controls filter publication dates, not the dates when views occurred. Missing fields remain null; failed sync preserves previous data. No historical views or followers are invented.

## Validation

`cd backend && node --test test/tiktok.test.js`

From project root: `node scripts/check-tiktok.mjs` uses an isolated browser/API/SQL fixture, without production credentials or records. Generated screenshots are in ignored `frontend/dist/`. `npm run build --prefix frontend` builds the production frontend.

Official references: [Web Login Kit](https://developers.tiktok.com/docs/en/login-kit-web), [token management](https://developers.tiktok.com/docs/en/oauth-user-access-token-management), [user info](https://developers.tiktok.com/docs/en/tiktok-api-v2-get-user-info), [video list](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-list), [Sandbox](https://developers.tiktok.com/docs/en/add-a-sandbox).
