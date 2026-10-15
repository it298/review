# Thu–chi & HĐKD

## Workflow
Properties enter receipts and payments directly. They save as drafts. A workspace admin verifies documentary evidence and posts or voids each entry with a reason. Only posted entries affect financial summaries. Posted entries are immutable; cancel and create a documented correction rather than overwriting. Negative entries preserve signed corrections. Duplicate submission of the same request UUID is idempotent; conflicting payloads are rejected. Reusing a voucher number with a new request is not automatically blocked because split receipts may share a voucher.

Admins have finance access to configured managed properties. Other users need explicit per-property finance editor/viewer access from the Finance screen. General workspace viewers cannot write. Revenue recognition and noncash expense/allocation input are restricted to admins. All persistent reads/writes go through the authenticated backend using a private service-role-only RPC. No public database policies are added. Entries and audits have no cache expiry.

## Accounting boundaries
Receipts are not revenue, payments are not automatically operating expenses. Deposits and funding are cash movements. Purchasing inventory/assets does not automatically expense the whole payment. An ordinary payment may explicitly recognize expense in the same entry, avoiding a second input; management must verify the period/category. Revenue and noncash expense entries are independent management inputs. Partial operating result is explicitly provisional and not presented as complete financial statements. Cash change excludes opening balances, so is not an ending cash balance. VAT and gross/net mapping, stock costing, payroll allocations, depreciation and rent allocation are not automated in this first implementation.

Bluejay occupancy and booking figures are read from valid exact-period cached API reports, with timestamps. Users do not retype them. No provider calls are triggered by viewing finance. Booking amounts are shown only as operational references, never added to recognized daily revenue or receipts. Mini marts have no PMS/POS integration automatically inferred.

## Reviewed source files (August 2026)
`KT THU CHI SƠN TRÀ ĐN T8_2026.xlsx`: BK THU KS A:R has date, booking ID, channel, method, service, room, already-used deposits, cash receipts, future deposits, bank/card and deductions. BK CHI KS A:I separates cash/bank/Visa payments from platform commission/card fees. These columns cannot all be added as cash movements.

`KT THU CHI MINI MART SƠN TRÀ ĐN T8_2026.xlsx`: THU CHI MINIMART A:I receipts (cash/bank/Shopee/Grab, canceled goods, float rental and notes), J:N payments (date/category/description/cash/bank). There are negative platform settlement adjustments and undated opening carryovers. TK MINI MART includes older dates; filename alone is not a period filter.

`QL HĐKD SƠN TRÀ ĐN T8_2026.xlsx`: BK THU/CHI copies are linked via exported IMPORTRANGE formulas and must not be imported as additional transactions. DOANH THU KS. supplies separate stay/service revenue. KQ HĐKD uses inventory consumption, payroll, insurance and manually allocated rent. BC Doanh thu, CP includes stale July labels and week references requiring independent reconciliation. Sample totals are cached results, not fresh recomputation.

`QL HĐKD MINI MART SƠN TRÀ ĐN T8_2026.xlsx`: DT MINI MART provides sale invoice amounts, VAT and deductions separately from cash receipts; QL copies of THU CHI are not independent sources. KQ HĐ KD MN MART includes cost of goods and rent/management allocations. Some headers and helpers contain old May/March references. Do not copy these stale period formulas into the new application.

Existing workbooks remain unchanged. Their financial data is not seeded into production. This is a new direct-input ledger and initial reports, not a complete reproduction of all workbook schedules or automatic source reconnection to external Sheets. Initial month-end categories and allocations require management review.

## Deployment
1. Execute `supabase/finance-module.sql` in the existing project SQL editor. It is rerunnable and does not modify existing review/Bluejay data.
2. Deploy frontend and backend from Git.
3. Admin opens Thu–chi & HĐKD, assigns the employee to the intended property and tests one draft before posting.
4. Reconcile receipts/payments independently to bank/cash totals and supply revenue/COGS/payroll schedules before relying on provisional results as a complete P&L.

Validation: PGlite checks migration replay, service-only grants, cross-property denial, editor/admin review separation, idempotency and audit history. UI fixtures verify draft creation/review, deposit not becoming revenue, operational API references and mobile width. No claim of source-workbook total reconciliation or live production use until schema and deployment are verified.

Deployment record (2026-10-15): migration executed successfully through the existing Supabase project SQL editor. Function execution grants checked on production: anon=false, authenticated=false, service_role=true. Frontend/backend deployment still requires pushing the local commit; no financial workbook rows were imported.


## Workflow upgrade (2026-10-15)
Run **finance-workflow.sql** after the initial schema. This migration preserves existing entries, adds returned entries, daily handover reports, private document metadata, monthly locks and a serialized per-unit mutation guard. It preserves the old RPC under a private v1 name. Rerun the workflow migration when upgrading; do not reapply the initial base migration afterwards without reapplying the workflow migration.

The UI is organized into Nhập liệu, Báo cáo ngày, Tổng hợp HĐKD, Sổ nghiệp vụ, Kho & cọc and Lịch sử & quyền. Properties report one day at a time and can describe multiple shifts/handover staff in that daily report. A report includes opening balances and counted/reconciled ending balances for cash, bank, card and platform. A submitted day freezes writes; admin returns it for correction or closes it and posts all pending entries in one transaction. Days with no activity still need a submitted report with a note. Opening balances must match the previous closed day. Later closed days must be reopened first. An entire month locks only when all its calendar days are closed.

Editors can amend their own draft/returned entries, never posted records or entries of another employee. Admin can return a draft with a reason. Posted records require a void and a documented replacement. The most recent 100 property audit events are visible; the database retains the full trail. Switching property/date range or leaving with an unfinished entry prompts before discarding edits.

An entry supports counterparty, shift, voucher, booking, linked deposit reference, room/source, signed correction and optional quantity × unit price. Optional payment splits must equal the actual receipt/payment. Gross less commission/card fees/discount must equal actual settlement; VAT is disclosed as included in gross, not subtracted twice. These settlement fields do not independently recognize revenue or expense. Identical date/voucher/kind/amount is blocked unless a duplicate reason is supplied; request UUID retry remains idempotent. Bluejay booking metadata can fill booking/room/source without creating a cash movement or recognized revenue.

Documents: up to five PNG/JPEG/PDF files per draft entry, max 5 MB each; MIME signature checked. Bytes go to a private Supabase Storage bucket, metadata to RLS-protected tables, and authorized downloads go through the backend. There are no public/signed URLs. File uploads occur after saving the entry; a failed upload keeps the entry and reports the failure so it can be retried. A failed metadata operation after upload can leave a private unreferenced object; automated orphan cleanup is not included.

Inventory: separate opening/inbound/consumption/loss slips, per SKU and consistent unit. No automatic cash payment is inferred. Posted stock is valued by moving weighted average in date/entry-ID order, per outbound rounded to VND. Consumed stock and loss feed operating expenses once. Sales details do not automatically issue stock, so staff must enter/verify outbound slips. Negative stock, repeated opening balance and backdated mutation before later posted stock are blocked. Deposits are checked chronologically; application/refund cannot exceed receipts already posted. Applying deposits has no cash/revenue effect by itself.

These additions replace the basic input/approval gaps described above. They do not add a POS connector, automatic payroll/insurance calculation, full VAT accounting or statutory financial statements. Management still supplies recognized revenue and remaining expense allocations. No source workbook financial rows or synthetic QA transactions were inserted into the live ledger.

Validation: finance workflow tests cover settlement math, document signatures, weighted stock costing, cross-property/role separation, duplicate controls, edit/return history, submitted-day freeze, close/reopen order, full-month locks and negative stock/deposit rollback. Browser fixtures exercise employee multi-method receipt, booking autofill, PDF attachment, edit, daily handover submission, admin close and mobile layout. These fixture tests do not establish reconciliation with the original workbook totals.

Production schema upgrade verified on 2026-10-15: finance-workflow-v2, four additional tables with RLS enabled; RPC execution anon=false, authenticated=false, service_role=true. SQL editor query 17f85206-6520-4307-985b-f6d72bfc3bad. Application code still needs Git push/Render deployment.
