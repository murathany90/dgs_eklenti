import { chromium } from 'playwright';
import { resolve, basename, join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const modelPath = process.env.DGS_E2E_MODEL;
if (!modelPath) throw new Error('Set DGS_E2E_MODEL to a local full DGS JSON file.');
const extension = resolve('dist');
const profile = await mkdtemp(join(tmpdir(), 'ga-large-model-e2e-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, viewport: { width: 1440, height: 900 },
  args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension, '--no-first-run'],
});
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 30000 });
  const id = new URL(worker.url()).host;
  const panel = await context.newPage();
  await panel.goto('chrome-extension://' + id + '/sidepanel.html');
  await panel.locator('#modelFile').setInputFiles(resolve('docs/fixtures/dgs-smoke-from-20260923.json'));
  await panel.locator('#status').getByText(/hazır/).waitFor({ timeout: 30000 });
  const opened = context.waitForEvent('page');
  await panel.locator('#openWorkspace').click();
  const page = await opened;
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.waitForLoadState();
  const modelName = basename(resolve(modelPath));
  await page.locator('#fileInput').setInputFiles(resolve(modelPath));
  await page.waitForFunction(name => window.V6Legacy?.getActive()?.name === name, modelName, { timeout: 240000 });
  await page.waitForFunction(() => document.querySelector('#loadProgress')?.classList.contains('hidden'), null, { timeout: 240000 });
  await page.waitForFunction(() => !!document.querySelector('#v6Metadata')?.dataset.components, null, { timeout: 120000 });
  if (await page.evaluate(() => window.YTBS_V3_TEST?.solver()) !== null) throw new Error('AC-PQ started automatically during model load.');

  const clickTimes = {};
  for (const tab of ['map', 'sld', 'analysis', 'scenario', 'model']) {
    const started = Date.now();
    await page.locator('#primaryTabs [data-primary="' + tab + '"]').click({ timeout: 10000 });
    await page.waitForFunction(value => document.querySelector('#primaryTabs [data-primary="' + value + '"]')?.classList.contains('active'), tab, { timeout: 5000 });
    clickTimes[tab] = Date.now() - started;
    if (clickTimes[tab] > 5000) throw new Error('Tab click stalled for ' + clickTimes[tab] + ' ms: ' + tab);
  }

  await page.locator('#primaryTabs [data-primary="analysis"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#v61BusSelect option').length > 1, null, { timeout: 30000 });
  const optionCount = await page.locator('#v61BusSelect option').count();
  if (optionCount > 501) throw new Error('Bus dropdown rendered too many entries at once: ' + optionCount);
  const busId = await page.locator('#v61BusSelect option').nth(1).getAttribute('value');
  await page.locator('#v61BusSearch').fill(busId);
  await page.waitForFunction(value => Array.from(document.querySelector('#v61BusSelect').options).some(option => option.value === value), busId, { timeout: 10000 });
  await page.locator('#v61BusSelect').selectOption(busId);
  if (errors.length) throw new Error('Workspace JavaScript errors: ' + errors.join(' | '));
  console.log('Large DGS responsive UI PASS', JSON.stringify({ modelName, clickTimes, optionCount, busSearch: busId }));
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
