import { chromium } from 'playwright';
import { resolve, basename } from 'node:path';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const extension = resolve('dist');
const profile = await mkdtemp(join(tmpdir(), 'ytbs-v6-e2e-'));
const context = await chromium.launchPersistentContext(profile, {
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chromium' }),
  headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-first-run'],
});
try {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 30000 });
  const id = new URL(worker.url()).host;
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${id}/sidepanel.html`);
  await panel.locator('#modelFile').setInputFiles(resolve('docs/fixtures/dgs-smoke-from-20260923.json'));
  await panel.locator('#status').getByText(/hazır/).waitFor({ timeout: 30000 });
  const opened = context.waitForEvent('page');
  await panel.locator('#openWorkspace').click();
  const page = await opened;
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.waitForLoadState();
  await page.waitForFunction(() => window.V6Legacy?.getActive()?.lines?.length > 0, null, { timeout: 180000 });
  if (process.env.DGS_E2E_MODEL) {
    await page.locator('#fileInput').setInputFiles(resolve(process.env.DGS_E2E_MODEL));
    await page.waitForFunction(name => window.V6Legacy?.getActive()?.name === name, basename(process.env.DGS_E2E_MODEL), { timeout: 180000 });
  }
  await page.locator('#v6Validation').waitFor({ timeout: 120000 });
  if (process.env.DGS_E2E_MODEL) await page.waitForFunction(name => document.querySelector('#v6Validation')?.dataset.modelName === name, basename(process.env.DGS_E2E_MODEL), { timeout: 120000 });
  await page.waitForFunction(() => !!document.querySelector('#v6Metadata')?.dataset.components, null, { timeout: 120000 });
  if (process.env.DGS_E2E_MODEL) {
    await page.waitForFunction(() => window.V6Legacy?.getSolver() !== null, null, { timeout: 180000 });
    await page.waitForFunction(() => new Promise(resolve => {
      const open = indexedDB.open('ytbs-dgs-v6');
      open.onsuccess = () => {
        const db = open.result;
        const request = db.transaction('results').objectStore('results').count();
        request.onsuccess = () => { resolve(request.result > 0); db.close(); };
        request.onerror = () => { resolve(false); db.close(); };
      };
      open.onerror = () => resolve(false);
    }), null, { timeout: 60000 });
    const baseline = await page.evaluate(() => ({
      state: window.YTBS_V4_TEST.state(), capacity: window.LineCapacityEngine.report(),
    }));
    if (baseline.state.lines !== 2382 || baseline.capacity.excel !== 315) throw Error(`v5.5 baseline drift: ${JSON.stringify(baseline)}`);
    await page.locator('[data-view="map"]').click();
    await page.evaluate(() => {
      selectLine('H5846');
    });
    const selected = await page.locator('#mapSelection').innerText();
    const selectedId = await page.evaluate(() => window.YTBS_V4_TEST.state().selectedLine);
    if (selectedId !== 'H5846' || !selected.trim()) throw Error(`Line selection failed: ${selectedId} / ${selected}`);
    await page.evaluate(() => window.YTBS_V4_TEST.setScenario('H5846', 1));
    const scenario = await page.evaluate(() => window.YTBS_V4_TEST.state().scenario);
    if (!scenario.some(([id]) => id === 'H5846')) throw Error('Scenario line toggle failed');
  }
  await page.locator('[data-view="map"]').click();
  await page.locator('[data-view="sld"]').click();
  if (process.env.DGS_E2E_MODEL) {
    await page.evaluate(() => {
      const line = window.V6Legacy.getActive().lineById('H5846');
      selectSite(line.stationA);
      drawScheme();
    });
    const nodeCount = await page.locator('#schemeSvg').evaluate(svg => svg.childElementCount);
    if (!nodeCount) throw Error('SLD did not render nodes');
  }
  await page.locator('[data-view="analysis"]').click();
  const metadata = await page.locator('#v6Metadata').innerText();
  if (!metadata.includes('TRANSMISSION')) throw Error('Scope label missing');
  if (errors.length) throw Error(`Page errors: ${errors.join(' | ')}`);
  const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
  if (manifest.manifest_version !== 3) throw Error('MV3 manifest missing');
  console.log('Extension workspace, DGS import, map, SLD and analysis smoke passed');
} finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
