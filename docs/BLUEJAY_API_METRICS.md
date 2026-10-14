# Bluejay API metrics

Occupancy is read from `report-room-occupancy`, reservations from `reservation` (all pages), service totals from `extraservice-sumary`. Reports retain the existing authenticated API, exact-date cache and manual refresh flow. Scheduled collection remains opt-in and is not enabled by this change.

The reservation screen summarizes the currently filtered rows by source and provider status. Booking counts use distinct nonempty booking codes. Room rows are separate from booking counts; they are not daily occupied room nights. One booking may occur in multiple status/source groups, so grouped booking counts are not additive. Cancellation and no-show groups describe provider statuses within the selected report, not cancellation/no-show events occurring on the selected date. Missing codes are shown separately; missing monetary fields remain unavailable rather than zero.

Identical complete provider rows are removed. Different rooms, states or monetary amounts are preserved. Amounts include the entire reservation stay, even when only part overlaps the report period. Do not use these sums as daily realized revenue or ADR. No ADR/RevPAR calculation is introduced.

M-Standard variants, including `M - STANDARD BED ROOM`, are excluded from occupancy totals and reservation data every time a cached or live response is normalized. Raw provider cache remains unchanged. All charts and reservation totals use the same search/status filters; CSV exports the same filtered rows including deposits. Saved timestamps include the date and time in Asia/Ho_Chi_Minh.

Validation: normalization tests cover multi-room/group bookings, exact duplicates, mixed cancellation statuses, unknown booking codes, missing financial fields and Gia Lai spaced M-Standard. The 14 October source audit found legitimate grouped bookings and differences between 08:16 cached data and later PMS updates; this change does not claim historical snapshots are current.
