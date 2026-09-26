import { chromium } from 'playwright';
import { resolve, join } from 'node:path';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';

// A small deterministic input network; every numeric assertion uses the real browser solver's emitted values.
const extension = resolve('dist');
const profile = await mkdtemp(join(tmpdir(), 'ga-map-results-'));
const screenshots = resolve('artifacts/ui-review');
await mkdir(screenshots, { recursive: true });
const context = await chromium.launchPersistentContext(profile, {
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chromium' }),
  headless: true, viewport: { width: 1440, height: 900 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-first-run'],
});
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 30000 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`chrome-extension://${new URL(worker.url()).host}/workspace.html`);
  await page.locator('#fileInput').setInputFiles(resolve('tests/fixtures/map-electrical-network.json'));
  await page.locator('#v6Validation').waitFor({ timeout: 120000 });
  await page.locator('#primaryTabs [data-primary="map"]').click();
  await page.locator('#v42LightningButton').click();
  await page.locator('#v42LNote').getByText('Hesap sonucu bulunmuyor.').waitFor();
  const order = await page.locator('#v42LightningPanel .v42Ltabs [data-v42kind]').allTextContents();
  if (order.join('|') !== 'Baralar|Transformatörler|Hatlar') throw Error(`Electrical group order: ${order}`);
  if (await page.locator('#v42LightningPanel > header strong').innerText() !== '⚡ Elektriksel Sonuçlar') throw Error('Electrical results title missing');
  if (await page.locator('#v42LightningPanel .v42Ltabs #v51LightningDelta').count()) throw Error('Scenario delta is mixed into electrical groups');

  await page.locator('#primaryTabs [data-primary="analysis"]').click();
  await page.locator('#v61Run').click();
  await page.waitForFunction(() => !!window.YTBS_AnalysisState?.activeResult?.calculation, null, { timeout: 180000 });
  const emitted = await page.evaluate(() => {
    const result = window.YTBS_AnalysisState.activeResult;
    const bus = result.buses.find(item => item.id === 'B1');
    const line = result.branches.find(item => item.id === 'H1');
    const transformer = result.transformers.find(item => item.id === 'T1');
    return { convergence: result.convergence, bus, line, transformer,
      busName: window.V6Legacy.getActive().get('ElmTerm', 'B1')?.loc_name,
      lineName: window.V6Legacy.getActive().get('ElmLne', 'H1')?.loc_name,
      transformerName: window.V6Legacy.getActive().get('ElmTr2', 'T1')?.loc_name };
  });
  if (emitted.convergence !== 'CONVERGED' || !emitted.bus?.vKv || !emitted.line?.from.pMw || !emitted.line?.to.pMw ||
    !emitted.transformer?.hv.pMw || !emitted.transformer?.lv.pMw) throw Error(`Fixture did not produce a complete browser result: ${JSON.stringify(emitted)}`);
  const fmt = value => value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  await page.locator('#primaryTabs [data-primary="map"]').click();
  await page.locator('#v42LightningPanel [data-v42kind="bus"]').click();
  await page.locator('#v42Search').fill('B1');
  const busText = await page.locator('#v42LBody').innerText();
  if (!busText.includes('Ankara Kuzey TM') || !busText.includes(emitted.busName) || !busText.includes(fmt(emitted.bus.vKv)) || !busText.includes('pu')) throw Error(`Bus result or real names missing: ${busText}`);
  await page.locator('#v42LightningPanel [data-v42kind="trafo"]').click();
  await page.locator('#v42Search').fill('T1');
  const transformerText = await page.locator('#v42LBody').innerText();
  if (!transformerText.includes(emitted.transformerName) || !transformerText.includes(fmt(emitted.transformer.hv.pMw)) ||
    !transformerText.includes(fmt(emitted.transformer.lv.pMw)) || !transformerText.includes('YG ucu') || !transformerText.includes('AG ucu') || !transformerText.includes('—')) throw Error(`Transformer result missing: ${transformerText}`);
  await page.locator('#v42LightningPanel [data-v42kind="line"]').click();
  await page.locator('#v42Search').fill('H1');
  const lineText = await page.locator('#v42LBody').innerText();
  if (!lineText.includes(emitted.lineName) || !lineText.includes('Ankara Kuzey TM') || !lineText.includes('Ankara Güney TM') ||
    !lineText.includes(fmt(emitted.line.from.pMw)) || !lineText.includes(fmt(emitted.line.to.pMw)) ||
    !lineText.includes('İlk uç') || !lineText.includes('Son uç') || !lineText.includes('—')) throw Error(`Line result missing: ${lineText}`);
  if (!(await page.locator('#v42LNote').innerText()).includes('Bu hesap motorunda üretilmiyor.')) throw Error('Missing browser field explanation not shown');
  const lineEndRows = await page.locator('#v42LBody .mapResultEnds tbody tr').allTextContents();
  if (!lineEndRows[0]?.includes(fmt(emitted.line.from.pMw)) || !lineEndRows[0]?.includes(fmt(emitted.line.to.pMw)) ||
    !lineEndRows[1]?.includes(fmt(emitted.line.from.qMvar)) || !lineEndRows[1]?.includes(fmt(emitted.line.to.qMvar))) throw Error(`Paired line endpoint rows missing: ${lineEndRows}`);
  await page.screenshot({ path: join(screenshots, 'map-electrical-results.png'), animations: 'disabled' });
  const authoritative = await page.evaluate(() => ({ p: latestResult('ElmLne', 'H1', 'P', 'from')?.value, qTo: latestResult('ElmLne', 'H1', 'Q', 'to')?.value }));
  if (authoritative.p !== emitted.line.from.pMw || authoritative.qTo !== emitted.line.to.qMvar) throw Error(`Map bypassed activeResult: ${JSON.stringify(authoritative)}`);
  if (emitted.line.loadingPercent === null && await page.evaluate(() => latestResult('ElmLne', 'H1', 'loading'))) throw Error('Legacy loading calculation replaced a missing activeResult value');
  await page.locator('#v42LBody .mapResultEquipment').click();
  const selectedText = await page.locator('#v54CompactLine').innerText();
  if (!selectedText.includes(fmt(emitted.line.from.pMw)) || !selectedText.includes(fmt(emitted.line.to.pMw)) || !selectedText.includes('Ankara Kuzey TM')) throw Error(`Selected equipment popup did not use shared result/display index: ${selectedText}`);
  await page.screenshot({ path: join(screenshots, 'map-electrical-selection.png'), animations: 'disabled' });
  await page.locator('#v54SideTabs [data-side="list"]').click();
  await page.locator('#v51LightningDelta').click();
  await page.locator('#v51LightningDeltaBody').waitFor({ state: 'visible' });
  if (await page.locator('#v42LNote').isVisible()) throw Error('Electrical result content leaked into scenario delta');
  await page.locator('#v42LightningPanel [data-v42kind="line"]').click();
  await page.locator('#v42LNote').waitFor({ state: 'visible' });

  await page.evaluate(() => window.V6Bridge.scenarioChanged());
  await page.locator('#v42LNote').getByText('Model veya senaryo değişti. Yeniden hesaplayın.').waitFor();
  if (await page.locator('#v42LBody tr').count()) throw Error('Stale electrical rows remained visible');
  if (await page.evaluate(() => latestResult('ElmLne', 'H1', 'P', 'from'))) throw Error('Stale map value remained available');
  if (errors.length) throw Error(`Page errors: ${errors.join(' | ')}`);
  console.log('Map electrical results E2E passed');
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
