import { chromium } from 'playwright';
import { resolve, join } from 'node:path';
import { mkdtemp, rm, readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

if (process.platform !== 'win32') { console.log('Native Chrome host E2E SKIP: Windows required'); process.exit(0); }
const model = resolve(process.env.DGS_E2E_MODEL ?? 'kontrol1/20260923_1200_SN3_TR0.json');
const extension = resolve('dist');
const profile = await mkdtemp(join(tmpdir(), 'ytbs-v612-native-'));
const args = [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-first-run'];
const launch = () => chromium.launchPersistentContext(profile, { viewport: { width: 1440, height: 900 }, channel: 'chromium', headless: true, args });
const hostRoot = resolve('native-host/python');
const manifestPath = join(hostRoot, 'com.ytbs.powerfactory.solver.json');
const registryPath = 'HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.ytbs.powerfactory.solver';
const python = resolve('.venv/Scripts/python.exe');
const backup = async path => { try { await access(path); return await readFile(path); } catch { return null; } };
const oldManifest = await backup(manifestPath);
let oldRegistry = '';
try {
  oldRegistry = execFileSync('pwsh', ['-NoProfile', '-Command', `if (Test-Path -LiteralPath '${registryPath}') { (Get-Item -LiteralPath '${registryPath}').GetValue('') }`], { encoding: 'utf8' }).trim();
} catch {}
let context = await launch();
let installed = false;
try {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 30000 });
  const id = new URL(worker.url()).host;
  await context.close();
  execFileSync('pwsh', ['-NoProfile', '-File', resolve('native-host/python/scripts/install-windows.ps1'), '-ExtensionId', id, '-PythonPath', python], { stdio: 'inherit' });
  installed = true;
  context = await launch();
  const page = await context.newPage();
  page.on('pageerror', error => console.error(`Native E2E page error: ${error}`));
  await page.goto(`chrome-extension://${id}/workspace.html`);
  await page.locator('#fileInput').setInputFiles(model);
  await page.waitForFunction(() => document.querySelector('#v61Scope')?.textContent?.includes('86.479'), null, { timeout: 180000 });
  await page.locator('#primaryTabs [data-primary="analysis"]').click();
  await page.locator('#v61Engine').selectOption('pandapower');
  await page.locator('#v61HostHealthButton').click();
  await page.locator('#v61HostHealth').getByText('Bağlı').waitFor({ timeout: 15000 });
  const health = await page.locator('#v61HostHealth').innerText();
  if (!health.includes('Protocol 1.0') || !health.includes('pandapower 3.5.5')) throw Error(`Native health metadata missing: ${health}`);
  await page.locator('#v61Run').click();
  await page.waitForFunction(() => {
    const status = document.querySelector('#v61Status')?.textContent ?? '';
    return /AC çözümü 30 Newton iterasyonunda yakınsamadı|Chrome’a kayıtlı değil|izinli değil|beklenmedik biçimde kapandı|uyumlu değil|zaman aşımına uğradı/.test(status);
  }, null, { timeout: 600000 });
  const acStatus = await page.locator('#v61Status').innerText();
  if (!acStatus.includes('AC çözümü 30 Newton iterasyonunda yakınsamadı')) throw Error(`Native host AC did not return the default AC result: ${acStatus}`);
  const acSummary = await page.locator('#v61NonConvergence').innerText();
  if (!acSummary.includes('86.479') || !acSummary.includes('2.382') || !acSummary.includes('30')) throw Error(`Non-convergence model counts missing: ${acSummary}`);
  if ((await page.locator('#v61Comparison').innerText()).trim()) throw Error('Non-converged AC must not show numeric comparison rows');
  console.log(`Native host full DGS AC: ${acStatus} · ${acSummary}`);

  await page.locator('#v61Mode').selectOption('DC');
  await page.locator('#v61Run').click();
  await page.waitForFunction(() => {
    const status = document.querySelector('#v61Status')?.textContent ?? '';
    return /DC yük akışı yakınsadı|Chrome’a kayıtlı değil|izinli değil|beklenmedik biçimde kapandı|uyumlu değil|zaman aşımına uğradı/.test(status);
  }, null, { timeout: 600000 });
  const dcStatus = await page.locator('#v61Status').innerText();
  console.log(`Native full DGS DC status received: ${dcStatus}; waiting for the result table`);
  await page.locator('#v61Filter').selectOption('line');
  await page.waitForFunction(() => document.querySelector('#v61Comparison')?.textContent?.includes('Aktif güç'), null, { timeout: 180000 })
    .catch(async error => {
      const state = await page.evaluate(() => Object.fromEntries(['v61Status', 'v61Comparison', 'v61Pager', 'v61DcSuccess'].map(id => [id, document.getElementById(id)?.textContent ?? ''])));
      throw new Error(`DC result table did not render: ${JSON.stringify(state)} · ${error}`);
    });
  if (!(await page.locator('#v61Comparison').innerText()).includes('Aktif güç')) throw Error('Typed DC result table is missing active-power metrics');
  if (!(await page.locator('#v61DcSuccess').innerText()).includes('Gerilim büyüklüğü ve reaktif güç')) throw Error('DC null-value explanation is missing');
  const busId = await page.locator('#v61BusSelect option').nth(1).getAttribute('value');
  if (busId) await page.locator('#v61BusSelect').selectOption(busId);
  await page.locator('#v61BusAvailability').getByText('DC yük akışı gerilim büyüklüğü hesaplamaz.').waitFor();
  console.log(`Native host full DGS DC: ${dcStatus}`);
  await mkdir('artifacts/ui-review', { recursive: true });
  await page.screenshot({ path: resolve('artifacts/ui-review/10-result-unavailable-reason.png'), animations: 'disabled' });
  await page.close();

  execFileSync('pwsh', ['-NoProfile', '-File', resolve('native-host/python/scripts/uninstall-windows.ps1')], { stdio: 'inherit' });
  const screenshotRun = execFileSync(process.execPath, [resolve('tests/e2e/extension.mjs')], { encoding: 'utf8', stdio: 'inherit',
    env: { ...process.env, DGS_E2E_MODEL: '', YTBS_E2E_NATIVE_AVAILABLE: '' } });
  void screenshotRun;
} finally {
  await context.close();
  if (installed) {
    execFileSync('pwsh', ['-NoProfile', '-File', resolve('native-host/python/scripts/uninstall-windows.ps1')], { stdio: 'inherit' });
    if (oldManifest) await writeFile(manifestPath, oldManifest);
    if (oldRegistry) execFileSync('pwsh', ['-NoProfile', '-Command', `New-Item -Path '${registryPath}' -Force | Out-Null; Set-Item -Path '${registryPath}' -Value '${oldRegistry.ReplaceAll("'", "''")}'`]);
  }
  await rm(profile, { recursive: true, force: true });
}
