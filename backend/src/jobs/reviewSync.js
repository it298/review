import cron from 'node-cron';
import { TIMEZONE } from '../utils/date.js';
import { syncAll } from '../services/placeService.js';

export function startReviewSync() {
  const expression = process.env.UPDATE_CRON || '0 2 * * 1';

  if (!cron.validate(expression)) throw new Error('UPDATE_CRON không hợp lệ.');
  cron.schedule(expression, async () => {
    console.log('[review-sync] starting');
    try {
      const summary = await syncAll();
      if (summary.skipped) {
        console.log('[review-sync] skipped:', summary.reason);
        return;
      }
      const ok = summary.results.filter(r => r.ok).length;
      const failed = summary.results.length - ok;
      console.log(`[review-sync] finished: ${ok} ok, ${failed} failed, ${summary.total} total, ${summary.workers} workers`);
    } catch (error) {
      console.error('[review-sync] failed:', error);
    }
  }, { timezone: TIMEZONE });

  console.log(`[review-sync] scheduled: ${expression}`);
}
