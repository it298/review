import { parseRating, parseLocalizedCount, extractCountFromReviewLabel } from './scraperUtils.js';
export async function extractReviewCount(page) {
  // Best source: Google's rating summary block. Current Maps pages render
  // the review count as the second span in .F7nice, e.g. "4.9 (396)".
  const f7nice = page.locator('div.F7nice').first();
  if (await f7nice.count()) {
    const spans = await f7nice.locator('span').allInnerTexts().catch(() => []);
    // Typical Maps structure is rating + review count, e.g. 4.9 + (396).
    for (const text of spans.slice(1)) {
      const clean = String(text).trim();
      // Never interpret a decimal rating such as 4.9 as a review count.
      if (/^\(?\s*\d+[.,]\d+\s*\)?$/.test(clean)) continue;
      if (!/^\([\d.,\s]+\)$/.test(clean)) continue;
      const count = parseLocalizedCount(clean);
      if (count !== null) return { count, source: 'F7nice' };
    }

    const allText = await f7nice.innerText().catch(() => '');
    // Fallback for variants where the count is not the second direct span.
    const matches = [...allText.matchAll(/\(([^)]+)\)/g)];
    for (const match of matches) {
      const count = parseLocalizedCount(match[1]);
      if (count !== null) return { count, source: 'F7nice-text' };
    }
  }

  // Second-best source: aria-labels attached to the rating/review controls.
  const labels = await page.locator('[role="main"] [aria-label]').evaluateAll(nodes =>
    nodes
      .map(node => ({
        label: node.getAttribute('aria-label') || '',
        visible: !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length)
      }))
      .filter(x => x.visible && x.label)
  );

  for (const item of labels) {
    const count = extractCountFromReviewLabel(item.label);
    if (count !== null) return { count, source: 'aria-label' };
  }

  // Last resort: only inspect text inside elements that look like rating
  // summaries. Never scan the entire body because Maps can contain review
  // counts from unrelated/hidden content and sponsored modules.
  const summarySelectors = [
    '[data-value="Rating"]',
    '[role="main"] .F7nice',
    '[role="main"] [aria-label*="reviews"]',
    '[role="main"] [aria-label*="đánh giá"]'
  ];

  for (const selector of summarySelectors) {
    const nodes = await page.locator(selector).allInnerTexts().catch(() => []);
    for (const text of nodes) {
      const count = extractCountFromReviewLabel(text);
      if (count !== null) return { count, source: `summary:${selector}` };
    }
  }

  return null;
}

export async function extractRating(page) {
  const ratingText = await page.locator('div.F7nice span[aria-hidden="true"]').first().innerText().catch(() => '');
  return parseRating(ratingText);
}
