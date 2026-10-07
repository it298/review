import { chromium } from 'playwright';
import { validateMapsUrl } from './scraperUtils.js';

import { extractReviewCount, extractRating } from './mapsExtract.js';

let browserPromise;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true }).then(browser => {
      browser.on('disconnected', () => { browserPromise = null; });
      return browser;
    }).catch(error => { browserPromise = null; throw error; });
  }
  return browserPromise;
}

async function scrape(url) {
  url = validateMapsUrl(url);

  const browser = await getBrowser();
  const context = await browser.newContext({
    locale: 'vi-VN',
    viewport: { width: 1440, height: 1000 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36'
  });
  try {
    const page = await context.newPage();
    await context.route('**/*', async route => {
      if (route.request().isNavigationRequest() && route.request().frame() === page.mainFrame()) {
        try { validateMapsUrl(route.request().url()); } catch { return route.abort(); }
      }
      return route.continue();
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Wait for the actual place panel rather than guessing from arbitrary body text.
    await page.waitForSelector('h1.DUwDvf, div.F7nice', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1800);

    const result = await extractReviewCount(page);
    if (!result) {
      throw new Error('Không đọc được số lượng review trong khối thông tin của địa điểm. Google có thể đang yêu cầu xác minh hoặc đã thay đổi giao diện.');
    }

    const title = await page.locator('h1.DUwDvf').first().innerText().catch(() => '');
    if (!title.trim()) throw new Error('Không xác định được địa điểm. Hãy dùng URL trang chi tiết Google Maps.');
    const pageTitle = await page.title().catch(() => '');
    const name = title.trim() || pageTitle.replace(/\s*-\s*Google Maps\s*$/i, '').trim();
    const rating = await extractRating(page);
    const address = await page.locator('[data-item-id*="address"], button[data-item-id*="address"]').first().getAttribute('aria-label').catch(() => null);

    return {
      name: name || 'Google Maps place',
      reviewCount: result.count,
      rating,
      address: address || '',
      source: result.source,
      url: page.url()
    };
  } finally {
    await context.close();
  }
}

export async function closeScraper() {
  if (browserPromise) {
    const browser = await browserPromise.catch(() => null);
    browserPromise = null;
    await browser?.close();
  }
}

let active = 0;
const pending = [];
const parsedLimit = Number(process.env.SCRAPER_WORKERS || 3);
const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 5) : 3;
function drain() {
  while (active < limit && pending.length) {
    const { url, resolve, reject } = pending.shift();
    active++;
    scrape(url).then(resolve, reject).finally(() => { active--; drain(); });
  }
}
export function scrapeGoogleMaps(url) {
  validateMapsUrl(url);
  if (pending.length >= 50) throw new Error('Hàng đợi đã đầy. Vui lòng thử lại sau.');
  return new Promise((resolve, reject) => { pending.push({ url, resolve, reject }); drain(); });
}
