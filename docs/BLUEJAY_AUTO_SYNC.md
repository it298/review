# Automatic Bluejay report collection

Code supports authenticated GET `/api/bluejay/cron`, using the existing `CRON_SECRET` bearer header. Disabled until backend `BLUEJAY_AUTO_SYNC=true` AND an external scheduler calls it. Browser or Windows worker is not required.

Call every five minutes during the configured API windows. Current windows are inherited from the original integration: 08:00–08:30, 16:00–16:59, 00:00–00:59 Asia/Ho_Chi_Minh. Confirm these with Bluejay. Each call collects today's occupancy and stay-night reservation report for one configured hotel. Four successful calls finish a window; failures retry next call. A persisted slot marker prevents repeated completed collection; a distributed lock prevents concurrent execution. Cache and logs use the existing Bluejay store.

This job does not produce ADR/RevPAR, daily room revenue or no-show metrics. Nor does it collect all booking creation/cancellation events. Those require verified provider fields and explicit date semantics. Multi-day report filters still use exact-period snapshots and are not reconstructed by adding bookings across daily reports.

Configure an HTTP scheduler with the Authorization header kept secret. Do not place CRON_SECRET in URLs or Git. Actual scheduling has not been enabled by adding this code. A failed collection returns HTTP 502; skipped/completed slots return 200.
