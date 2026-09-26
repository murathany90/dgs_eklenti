import { chromium } from 'playwright';
import { resolve, join } from 'node:path';
import { mkdtemp, rm, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

if (process.platform !== 'win32') { console.log('Native health E2E SKIP: Windows required'); process.exit(0); }
const existing = process.argv.includes('--existing');
const extension = resolve('dist');
const hostRoot = resolve('native-host/python');
const manifestPath = join(hostRoot, 'com.ytbs.powerfactory.solver.json');
const registryPath = 'HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.ytbs.powerfactory.solver';
const profile = await mkdtemp(join(tmpdir(), 'ytbs-native-health-'));
const backup = async path => { try { await access(path); return await readFile(path); } catch { return null; } };
const oldManifest = await backup(manifestPath);
const oldRegistry = execFileSync('pwsh', ['-NoProfile', '-Command', `$key = '${registryPath}'; if (Test-Path -LiteralPath $key) { [Console]::Write((Get-Item -LiteralPath $key).GetValue('')) }`], { encoding: 'utf8' }).trim();
let context;
let installed = false;
try {
  if (!existing) execFileSync(process.execPath, [resolve('tools/build.mjs')], { stdio: 'inherit' });
  context = await chromium.launchPersistentContext(profile, { headless: true, channel: 'chromium',
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-first-run'] });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 30000 });
  const id = new URL(worker.url()).host;
  if (!existing) {
    await context.close(); context = null;
    const python = join(hostRoot, '.venv', 'Scripts', 'python.exe');
    installed = true;
    const installerArgs = ['-NoProfile', '-File', resolve('native-host/python/scripts/install-windows.ps1'), '-ExtensionId', id];
    try { await access(python); installerArgs.push('-PythonPath', python); } catch { /* Installer creates the venv. */ }
    execFileSync('pwsh', installerArgs, { stdio: 'inherit' });
    context = await chromium.launchPersistentContext(profile, { headless: true, channel: 'chromium',
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-first-run'] });
    worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 30000 });
  }
  const start = performance.now();
  const native = await worker.evaluate(() => new Promise((resolveResult, reject) => {
    const port = chrome.runtime.connectNative('com.ytbs.powerfactory.solver');
    const requestId = crypto.randomUUID(), jobId = crypto.randomUUID();
    const timer = setTimeout(() => { port.disconnect(); reject(Error('Chrome HELLO timed out after 65 seconds')); }, 65000);
    port.onMessage.addListener(message => {
      if (message.requestId !== requestId || message.jobId !== jobId) return;
      if (message.type !== 'CAPABILITIES' && message.type !== 'ERROR') return;
      clearTimeout(timer); port.disconnect(); resolveResult(message);
    });
    port.onDisconnect.addListener(() => { clearTimeout(timer); reject(Error(chrome.runtime.lastError?.message ?? 'Chrome native port disconnected')); });
    port.postMessage({ type: 'HELLO', protocolVersion: '1.0', requestId, jobId });
  }));
  const helloResponseMs = Math.round(performance.now() - start);
  if (native.type !== 'CAPABILITIES' || native.protocolVersion !== '1.0' || native.engine !== 'pandapower' || native.engineVersion !== '3.5.5')
    throw Error(`Unexpected Chrome CAPABILITIES: ${JSON.stringify(native)}`);
  console.log(`Chrome HELLO→CAPABILITIES: ${helloResponseMs} ms · ${native.engine} ${native.engineVersion} · Extension ID ${id}`);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/workspace.html`);
  await page.locator('#primaryTabs [data-primary="analysis"]').click();
  await page.locator('#v61Engine').selectOption('pandapower');
  await page.locator('#v61HostHealthButton').click();
  await page.waitForFunction(() => {
    const text = document.querySelector('#v61HostHealth')?.textContent ?? '';
    return (text.includes('Motor: pandapower') && text.includes('Sürüm: 3.5.5')) || text.includes('ZAMAN AŞIMI') || text.includes('BAĞLANTI YOK');
  }, null, { timeout: 65000 });
  const health = await page.locator('#v61HostHealth').innerText();
  if (!health.includes('Motor: pandapower') || !health.includes('Sürüm: 3.5.5')) throw Error(`UI health failed: ${health}`);
  console.log(JSON.stringify({ extensionId: id, helloResponseMs, protocolVersion: native.protocolVersion,
    engine: native.engine, engineVersion: native.engineVersion, uiHealth: health }, null, 2));
} finally {
  await context?.close();
  if (installed) {
    if (oldRegistry) {
      const escaped = oldRegistry.replaceAll("'", "''");
      execFileSync('pwsh', ['-NoProfile', '-Command', `New-Item -Path '${registryPath}' -Force | Out-Null; Set-Item -Path '${registryPath}' -Value '${escaped}'`]);
    } else {
      execFileSync('pwsh', ['-NoProfile', '-File', resolve('native-host/python/scripts/uninstall-windows.ps1')], { stdio: 'inherit' });
    }
    if (oldManifest) await writeFile(manifestPath, oldManifest);
    else await rm(manifestPath, { force: true });
  }
  await rm(profile, { recursive: true, force: true });
}
