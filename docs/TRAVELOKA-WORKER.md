# Traveloka TERA worker

The worker uses a dedicated local `worker/extranet-profiles/traveloka/`
session. Run `node --env-file=.env src/open-extranet-login.js --source=traveloka`,
sign in yourself, and close the browser before starting the collector.

Deploy the backend with `/api/extranet/worker/targets` and `/results`, then
run `supabase/extranet-workers.sql` after the existing summary/history migrations.
Only the four verified Traveloka TERA mappings are enabled. Tripadvisor mappings
are retained as disabled metadata; no Tripadvisor daemon is started.

Set `TRAVELOKA_EXTRANET_PROPERTY_IDS=20057470,20087897,20096147,20105109` in
the local worker environment. Start `node --env-file=.env src/traveloka-run.js --daemon`.
The default interval is 60 minutes (minimum 15). Keep Windows awake and online.
Stop the process before opening the login helper for the same profile.

The reader verifies the selected TERA ID and name, confirms property switches,
and captures only the overall score card. Filtered “unanswered” counts, guest
comments, bookings, credentials and portal URLs are never uploaded. Only a
successful read advances rating/count timestamps and records `extranet-auto`.
Expired sessions preserve previous values and require the user to sign in again.
Backend errors retry after a minute; successful cycles wait the configured interval.

A local target file is accepted only with `--dry-run`; it never authorizes writes.
The dedicated daemon lock prevents concurrent launches. Never remove its lock
while the owning process is alive.
