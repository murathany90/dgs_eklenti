import { chromium } from 'playwright';
import { resolve, join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

if (process.platform !== 'win32') { console.log('Native Chrome host E2E SKIP: Windows required'); process.exit(0); }
const model = resolve(process.env.DGS_E2E_MODEL ?? 'kontrol1/20260923_1200_SN3_TR0.json');
const extension = resolve('dist');
const profile = await mkdtemp(join(tmpdir(), 'ytbs-v61-native-'));
const args = [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-first-run'];
const launch = () => chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args });
let context = await launch();
let installed = false;
try {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 30000 });
  const id = new URL(worker.url()).host;
  await context.close();
  const python = resolve('.venv/Scripts/python.exe');
  execFileSync('pwsh', ['-NoProfile', '-File', resolve('native-host/python/scripts/install-windows.ps1'), '-ExtensionId', id, '-PythonPath', python], { stdio: 'inherit' });
  installed = true;
  context = await launch();
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/workspace.html`);
  await page.locator('#fileInput').setInputFiles(model);
  await page.waitForFunction(() => document.querySelector('#v61Scope')?.textContent?.includes('86479'), null, { timeout: 180000 });
  await page.locator('[data-view="analysis"]').click();
  await page.locator('#v61Engine').selectOption('pandapower');
  await page.locator('#v61Run').click();
  await page.waitForFunction(() => /CONVERGED|Hesap başarısız|HOST NOT INSTALLED/.test(document.querySelector('#v61Status')?.textContent ?? ''), null, { timeout: 300000 });
  const status = await page.locator('#v61Status').innerText();
  if (!/pandapower AC · (CONVERGED|NON_CONVERGED)/.test(status)) throw Error(`Native host E2E failed: ${status}`);
  console.log(`Native Chrome messaging, full DGS transfer, pandapower AC: ${status}`);
  await page.locator('#v61Mode').selectOption('DC');
  await page.locator('#v61Run').click();
  await page.waitForFunction(() => /pandapower DC · CONVERGED/.test(document.querySelector('#v61Status')?.textContent ?? ''), null, { timeout: 300000 });
  const dcStatus = await page.locator('#v61Status').innerText();
  if (!(await page.locator('#v61Comparison').innerText()).includes('Bus ')) throw Error('Typed DC results missing from comparison');
  console.log(`Native Chrome messaging, full DGS transfer, pandapower DC: ${dcStatus}`);
} finally {
  await context.close();
  if (installed) execFileSync('pwsh', ['-NoProfile', '-File', resolve('native-host/python/scripts/uninstall-windows.ps1')], { stdio: 'inherit' });
  await rm(profile, { recursive: true, force: true });
}
