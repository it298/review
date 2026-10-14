# Google Business marketing reports

The Marketing & Tiếp cận module reads Google Business Profile Performance API using the existing encrypted Google OAuth connection. GA4 and social networks are not connected by this module.

## Setup

1. Apply `supabase/marketing-module.sql` after `supabase/schema.sql`. This stores exact-period reports privately for 366 days; service_role alone can write.
2. Enable Business Profile Performance API in the existing Google Cloud OAuth project and ensure the project is approved for Business Profile API access.
3. In the application, connect Google with a property-manager account, then link locations under Kết nối Google. Browser sign-in by itself does not connect backend OAuth.
4. Open Marketing & Tiếp cận and use Đồng bộ Google Business. Check real results before enabling a schedule.

## Automatic collection

Set `MARKETING_AUTO_SYNC=true` on the backend, then schedule a daily authenticated GET to `/api/marketing/cron` using `Authorization: Bearer <CRON_SECRET>`. Do not put the secret in the URL. The job fetches the previous seven complete days for linked locations, persists successful reports and marks the period complete only when every location succeeds. Repeated calls on the same day then skip. No Render scheduled service is created by this code.

The default page period matches the scheduled seven-day window. Other periods must be requested explicitly with Đồng bộ Google Business; never sum overlapping snapshots to create a larger-period report.

## Metric meaning

Call clicks are not completed calls, website clicks are not website users, and Reserve with Google bookings are not all booking-link clicks. Keep impression device/platform groups separate; their totals are not deduplicated unique users. Unsupported or omitted metrics remain unavailable. Returned date values omitted by Google protobuf default to zero. Recent data can be delayed; today's partial data is excluded.

API references: https://developers.google.com/my-business/reference/performance/rest/v1/locations/fetchMultiDailyMetricsTimeSeries and https://developers.google.com/my-business/reference/performance/rest/v1/DailyMetric.
