import { chromium } from 'playwright';
import { resolve, basename, join } from 'node:path';
import { mkdtemp, rm, readFile, mkdir, writeFile, chmod, unlink } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';

const extension = resolve('dist');
const profile = await mkdtemp(join(tmpdir(), 'ytbs-v611-e2e-'));
const screenshots = resolve('artifacts/ui-review');
await mkdir(screenshots, { recursive: true });
const launch = () => chromium.launchPersistentContext(profile, {
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chromium' }),
  headless: true, viewport: { width: 1440, height: 900 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-first-run'],
});
let context = await launch();
let hostManifestPath = null, previousHostManifest = null;
try {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 30000 });
  const id = new URL(worker.url()).host;
  if (process.platform === 'linux' && process.env.YTBS_E2E_INSTALL_NATIVE_HOST === '1') {
    await context.close();
    const registry = join(homedir(), '.config/chromium/NativeMessagingHosts');
    await mkdir(registry, { recursive: true });
    hostManifestPath = join(registry, 'com.ytbs.powerfactory.solver.json');
    try { previousHostManifest = await readFile(hostManifestPath, 'utf8'); } catch {}
    const launcher = resolve('native-host/python/launch_host.py');
    await chmod(launcher, 0o755);
    await writeFile(hostManifestPath, JSON.stringify({ name: 'com.ytbs.powerfactory.solver', description: 'YTBS local pandapower solver', path: launcher,
      type: 'stdio', allowed_origins: [`chrome-extension://${id}/`] }, null, 2));
    context = await launch();
    worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 30000 });
    if (new URL(worker.url()).host !== id) throw Error('Extension ID changed while registering the local host');
  }
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

  const checkTerminology = async label => {
    const visible = await page.locator('body').innerText();
    const forbidden = ['ElmTerm', 'ElmLne', 'ElmTr2', 'ElmSym', 'ElmGenStat', 'ElmLod', 'ElmShnt', 'ElmScap', 'ElmXnet', 'StaCubic', 'TypLne', 'TypTr2',
      'BUS_BRANCH', 'NODE_BREAKER', 'TRANSMISSION_REDUCED', 'COMPLETE_UNVALIDATED', 'NON_CONVERGED'];
    const found = forbidden.filter(token => visible.includes(token));
    if (found.length) throw Error(`${label}: default UI exposes internal terms: ${found.join(', ')}`);
    if (/\bFID\b/i.test(visible)) throw Error(`${label}: default UI exposes the raw FID label`);
  };
  const snap = async name => { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: join(screenshots, name), animations: 'disabled' }); };
  await checkTerminology('model summary');
  await snap('01-model-summary.png');

  await page.locator('#modelSubTabs [data-model-view="static"]').click();
  await page.waitForFunction(() => document.querySelector('#staticTable')?.children.length > 0, null, { timeout: 30000 });
  await checkTerminology('equipment list');
  await snap('02-equipment-list.png');
  if (process.env.DGS_E2E_MODEL) {
    const baseline = await page.evaluate(() => ({ state: window.YTBS_V4_TEST.state(), capacity: window.LineCapacityEngine.report() }));
    if (baseline.state.lines !== 2382 || baseline.capacity.excel !== 315) throw Error(`Model regression: ${JSON.stringify(baseline)}`);
  }

  await page.locator('#primaryTabs [data-primary="map"]').click();
  if (process.env.DGS_E2E_MODEL) {
    await page.evaluate(() => selectLine('H5846'));
    const selected = await page.locator('#mapSelection').innerText();
    const selectedId = await page.evaluate(() => window.YTBS_V4_TEST.state().selectedLine);
    if (selectedId !== 'H5846' || !selected.trim()) throw Error(`H5846 line selection failed: ${selectedId} / ${selected}`);
  }
  await checkTerminology('map');
  await snap('03-map.png');

  await page.locator('#primaryTabs [data-primary="sld"]').click();
  if (process.env.DGS_E2E_MODEL) {
    await page.locator('#sldStation').selectOption({ index: 1 });
    await page.evaluate(() => { const line = window.V6Legacy.getActive().lineById('H5846'); if (line) { selectSite(line.stationA); drawScheme(); } });
    const nodeCount = await page.locator('#schemeSvg').evaluate(svg => svg.childElementCount);
    if (!nodeCount) throw Error('Single-line diagram did not render nodes');
  }
  await checkTerminology('single-line diagram');
  await snap('04-sld.png');

  await page.locator('#primaryTabs [data-primary="analysis"]').click();
  await checkTerminology('analysis before run');
  await snap('05-analysis-before-run.png');
  const metadata = await page.locator('#v6Metadata').innerText();
  if (!metadata.includes('İletim ağına') && !metadata.includes('Tam gerilim kapsamı')) throw Error(`Model scope status missing: ${metadata}`);
  if (process.env.DGS_E2E_MODEL) {
    const scope = await page.locator('#v61Scope').innerText();
    if (!scope.includes('86.479') || !scope.includes('2.382')) throw Error(`Full electrical mapping missing: ${scope}`);
  }
  await page.locator('#v61Engine').selectOption('pandapower');
  const activeEngineMetadata = await page.locator('#v6Metadata').innerText();
  if (!activeEngineMetadata.includes('Yerel Tam Şebeke') || activeEngineMetadata.includes('Tarayıcı Yaklaşık Çözüm')) throw Error(`Active engine metadata is mixed: ${activeEngineMetadata}`);
  await page.locator('#v61Mode').selectOption('DC');
  await page.locator('#v61Run').click();
  const nativeReady = process.env.YTBS_E2E_INSTALL_NATIVE_HOST === '1' || process.env.YTBS_E2E_NATIVE_AVAILABLE === '1';
  if (nativeReady) {
    await page.waitForFunction(() => /DC yük akışı yakınsadı\./.test(document.querySelector('#v61Status')?.textContent ?? ''), null, { timeout: 600000 });
    const diagnostic = await page.locator('#v61Preflight').innerText();
    if (!diagnostic.includes('Elektriksel ada') || !diagnostic.includes('PV / PQ bara')) throw Error('Preflight diagnostics are missing key counts');
    const dcText = await page.locator('#v61DcSuccess').innerText();
    if (!dcText.includes('Gerilim büyüklüğü') || !dcText.includes('reaktif güç')) throw Error(`DC explanation missing: ${dcText}`);
    await checkTerminology('DC result');
    await snap('06-analysis-dc-result.png');
  } else {
    await page.locator('#v61Status').getByText('Yerel hesap motoru kurulu değil.').waitFor({ timeout: 30000 });
    await page.locator('#v61HostActions').getByText('Kurulum Yardımı').waitFor();
    console.log('Native host E2E SKIP: local host not installed; UI install guidance verified.');
  }

  await page.locator('#primaryTabs [data-primary="scenario"]').click();
  if (process.env.DGS_E2E_MODEL) {
    await page.evaluate(() => window.YTBS_V4_TEST.setScenario('H5846', 1));
    const scenario = await page.evaluate(() => window.YTBS_V4_TEST.state().scenario);
    if (!scenario.some(([id]) => id === 'H5846')) throw Error('Scenario line toggle failed');
  }
  await checkTerminology('scenario');
  await snap('07-scenario.png');
  await page.locator('.helperActions [data-primary="settings"]').click();
  await checkTerminology('settings');
  await page.locator('#technicalDgsToggle').check();
  await page.locator('#primaryTabs [data-primary="model"]').click();
  await page.locator('#modelSubTabs [data-model-view="quality"]').click();
  await page.waitForFunction(() => document.body.innerText.includes('ElmTerm'));
  const technicalVisible = await page.locator('body').innerText();
  if (!technicalVisible.includes('ElmTerm')) throw Error('Technical DGS toggle did not reveal source class names');
  await page.locator('.helperActions [data-primary="settings"]').click();
  await page.locator('#technicalDgsToggle').uncheck();
  await checkTerminology('settings default mode');
  await snap('08-settings.png');

  await page.setViewportSize({ width: 1280, height: 720 });
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  if (width > 1280) throw Error(`Responsive horizontal overflow: ${width}px at 1280px viewport`);
  await page.screenshot({ path: join(screenshots, 'responsive-1280x720.png'), animations: 'disabled' });
  if (errors.length) throw Error(`Page errors: ${errors.join(' | ')}`);
  const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
  if (manifest.manifest_version !== 3 || manifest.version !== '6.1.1') throw Error('Manifest V3 / v6.1.1 mismatch');
  console.log(`Extension UI E2E passed; screenshots: ${screenshots}`);
} finally {
  await context.close();
  if (hostManifestPath) {
    if (previousHostManifest === null) await unlink(hostManifestPath).catch(() => {});
    else await writeFile(hostManifestPath, previousHostManifest);
  }
  await rm(profile, { recursive: true, force: true });
}
