# Company location directory

The directory imported from the supplied review workbook contains 21 locations: 14 in the main tracking group and 7 competitors or comparison locations. Main locations include four hotels, three cafés, three stores and four activity locations. Each location has one explicit entity key across its registered platforms.

Apply `supabase/directory.sql` after the base schema, then `supabase/company-directory-seed.sql` after the OTA automation schema. Both scripts can be rerun without duplicating locations or deleting existing reviews. The server exposes the directory through authenticated `GET /api/directory`; database reads remain restricted to the service role.

The dashboard defaults to the main group. Category filters show relevant columns, and the comparison filter keeps competitors separate. Missing links, registered links without collection, first sync pending and collection failures are displayed separately. The workbook's historical scores were not imported as current observations.

The existing Windows worker reads twelve registered OTA targets for the four managed hotels. Registering a target does not guarantee successful collection: Agoda screenshot OCR now successfully reads and saves summaries for all four managed hotels; its screenshot reading is checked against the displayed source card and exact Agoda property ID. Trip.com has succeeded for Yzistel, Quy Nhon and Sontra. Traveloka still fails source validation. Google Maps now has a separate browser collector for public star ratings and total review counts; an authorized Business Profile connection remains available for the official API features. TripAdvisor, Booking.com, Expedia, Grab and ShopeeFood links are registered, but collectors for those sources have not been connected.

The workbook's TripAdvisor link for “Cho thuê phao bơi” points to Sontra Sea Hotel. This link is flagged and not presented as a valid source link. Trandoc mini Mart has no Grab link in the supplied workbook. Google records are joined only by explicit `google_place_id`; a similar name is not enough to merge locations.

`data/company-directory.json` preserves source-cell provenance. Instructions embedded in the workbook were treated as document content and were not executed.
