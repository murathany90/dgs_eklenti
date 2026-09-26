import { chromium } from 'playwright';
import { resolve, join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const extension = resolve('dist');
const profile = await mkdtemp(join(tmpdir(), 'ga-state-e2e-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-first-run'],
});

try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 30000 });
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.addInitScript(() => {
    const stalledPort = () => ({
      postMessage() {}, disconnect() {},
      onMessage: { addListener() {} }, onDisconnect: { addListener() {} },
    });
    Object.defineProperty(chrome.runtime, 'connectNative', { configurable: true, value: stalledPort });
  });
  await page.goto(`chrome-extension://${extensionId}/workspace.html`);
  await page.locator('#fileInput').setInputFiles(resolve('docs/fixtures/dgs-smoke-from-20260923.json'));
  await page.waitForFunction(() => document.querySelector('#v6Validation')?.dataset.modelName === 'dgs-smoke-from-20260923.json', null, { timeout: 120000 });
  await page.locator('#primaryTabs [data-primary="analysis"]').click();

  await page.locator('#v61Run').click();
  await page.waitForFunction(() => !!window.YTBS_AnalysisState?.activeResult?.calculation, null, { timeout: 180000 });
  if (await page.evaluate(() => window.YTBS_AnalysisState.activeResult.engine) !== 'browser-approx') throw Error('Browser calculation has the wrong engine');

  await page.locator('#v61Engine').selectOption('pandapower');
  await page.waitForFunction(() => window.YTBS_AnalysisState?.activeCalculationKeyId !== null);
  if (await page.evaluate(() => window.YTBS_AnalysisState.activeResult !== null)) throw Error('Browser result leaked into the native engine');
  if (await page.locator('#v61DisplayedResult').isVisible()) throw Error('Browser result remained visible under the native engine');
  if (!(await page.locator('#v61JobState').innerText()).includes('Hesap bekleniyor')) throw Error('Previous engine job remained visible');

  await page.locator('#v61HostHealthButton').click();
  await page.waitForFunction(() => window.YTBS_AnalysisState?.hostState === 'TIMEOUT', null, { timeout: 25000 });
  const nativeState = await page.evaluate(() => ({
    host: window.YTBS_AnalysisState.hostState,
    calculation: window.YTBS_AnalysisState.calculationState,
    result: window.YTBS_AnalysisState.activeResult,
    status: document.querySelector('#v61Status')?.textContent,
    health: document.querySelector('#v61HostHealth')?.textContent,
  }));
  if (nativeState.calculation !== 'IDLE' || nativeState.result !== null || /hesap zaman aşımına uğradı/i.test(nativeState.status ?? '')) {
    throw Error(`Host timeout contaminated calculation state: ${JSON.stringify(nativeState)}`);
  }
  if (!nativeState.health?.includes('Yerel hesap motoru: ZAMAN AŞIMI')) throw Error(`Host timeout is not labeled: ${nativeState.health}`);

  await page.locator('#v61Engine').selectOption('browser');
  await page.waitForFunction(() => window.YTBS_AnalysisState?.activeCalculationKeyId !== null);
  await page.locator('#v61Run').click();
  await page.locator('#v61CachePrompt').waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#v61ShowCached').click();
  const cached = await page.evaluate(() => ({
    host: window.YTBS_AnalysisState.hostState,
    resultEngine: window.YTBS_AnalysisState.activeResult?.engine,
    cached: window.YTBS_AnalysisState.displayedResultIsCached,
    shown: document.querySelector('#v61DisplayedResult')?.textContent,
    status: document.querySelector('#v61Status')?.textContent,
  }));
  if (cached.host !== 'TIMEOUT' || cached.resultEngine !== 'browser-approx' || !cached.cached ||
    !cached.shown?.includes('Önceki Tarayıcı Yaklaşık Çözüm sonucu gösteriliyor.') ||
    /Yerel Tam Şebeke/.test(cached.shown) || /Hesap zaman aşımına uğradı/.test(cached.status ?? '')) {
    throw Error(`Cached result and host state were mixed: ${JSON.stringify(cached)}`);
  }

  await page.locator('#v61Engine').selectOption('pandapower');
  if (await page.evaluate(() => window.YTBS_AnalysisState.activeResult !== null) || await page.locator('#v61DisplayedResult').isVisible()) {
    throw Error('Cached browser result leaked after switching engines');
  }
  if (pageErrors.length) throw Error(`Page errors: ${pageErrors.join(' | ')}`);
  console.log('Conflicting calculation states E2E passed');
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
