# Google Maps summary collector

This collector reads only the selected place's star rating and total review count. It does not collect review text. Each place is selected using the directory's supplied Maps URL; its resolved place token is checked on subsequent readings. Nearby place ratings and counts are excluded.

Apply `supabase/google-public-summary.sql` after `supabase/directory.sql`. Worker routes are `GET /api/google/worker/targets` and `POST /api/google/worker/results`, protected by the existing dedicated worker secret. The source records remain protected by service-role database access.

Both values may be missing independently. A valid rating can be saved even when the total count is absent, and vice versa. Missing values preserve previous data and their original timestamps. The dashboard displays the rating date and total count date separately, and marks an unavailable current count as unverified. Delayed readings do not replace newer field values.

To test only Google Maps, run from `worker`:

```powershell
node --env-file=.env src/run.js --source=google
```

The normal hourly worker reads Google Maps and OTA sources. A Google startup failure does not stop the OTA collectors. Google collection defaults to headed Chromium (`GOOGLE_MAPS_HEADLESS=false`): in the tested Windows setup, the headed browser exposed the total review count while headless mode exposed only the rating. A Chromium window may appear during collection and closes afterwards. An optional `GOOGLE_MAPS_PROFILE_DIR` selects a dedicated local Chromium profile; the user must authorize saving the session and sign in themselves using `src/open-google-login.js`, then close that browser before the collector starts. The profile is private local authentication data, must not be committed or uploaded, and no existing personal browser profile is copied. Google may still restrict access even after sign-in; inaccessible fields stay unverified.

For the initial baseline, current ratings and counts were checked in the user's existing browser, with the readings saved outside the repository in `outputs/google-maps-browser-check.json`. These observations are marked `browser`, distinct from scheduled worker readings. The supplied Mira Boutique Hotel Google URL opens Google Travel search rather than a Maps place profile and must be replaced before collection can run for that source.
