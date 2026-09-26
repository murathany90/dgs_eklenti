#!/usr/bin/env node
// Read-only Windows Native Messaging chain diagnostic and framed HELLO smoke.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const HOST = 'com.ytbs.powerfactory.solver';
const extensionId = process.argv.find(arg => /^--extension-id=/.test(arg))?.split('=')[1];
const timeoutMs = Number(process.argv.find(arg => /^--timeout-ms=/.test(arg))?.split('=')[1] ?? 30000);
const checks = [];
function check(stage, okay, details = {}) { checks.push({ stage, okay, ...details }); if (!okay) throw Error(`${stage}: ${JSON.stringify(details)}`); }
function registryValue(hive) {
  const key = `${hive}:\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST}`;
  const script = `$key = '${key}'; if (Test-Path -LiteralPath $key) { [Console]::Write((Get-Item -LiteralPath $key).GetValue('')) }`;
  const result = spawnSync('pwsh', ['-NoProfile', '-Command', script], { encoding: 'utf8' });
  if (result.status !== 0) throw Error(`Registry read failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}
function framedHello(executable) {
  return new Promise((resolveResult, reject) => {
    const started = performance.now();
    const child = spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let processStartMs;
    let stdout = Buffer.alloc(0);
    let stderr = '';
    let settled = false;
    const phases = {};
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdin.end();
      child.kill();
      if (error) reject(error); else resolveResult(value);
    };
    const timer = setTimeout(() => finish(Error(`HELLO_TIMEOUT after ${timeoutMs} ms; stderr=${stderr.slice(0, 500)}`)), timeoutMs);
    child.once('error', error => finish(Error(`PROCESS_START_FAILED: ${error.message}`)));
    child.once('spawn', () => {
      processStartMs = performance.now() - started;
      const message = Buffer.from(JSON.stringify({ type: 'HELLO', protocolVersion: '1.0', requestId: 'smoke-request', jobId: 'smoke-job' }));
      const frame = Buffer.allocUnsafe(4 + message.length);
      frame.writeUInt32LE(message.length, 0);
      message.copy(frame, 4);
      child.stdin.write(frame);
    });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.stdout.on('data', chunk => {
      stdout = Buffer.concat([stdout, chunk]);
      while (stdout.length >= 4) {
        const length = stdout.readUInt32LE(0);
        if (length < 2 || length > 512 * 1024) return finish(Error(`PROTOCOL_ERROR: invalid stdout frame length ${length}`));
        if (stdout.length < 4 + length) return;
        const frame = stdout.subarray(4, 4 + length);
        stdout = stdout.subarray(4 + length);
        try {
          const response = JSON.parse(frame.toString('utf8'));
          if (response.type === 'HOST_STARTED') { phases.hostStartedMs = Math.round(performance.now() - started); continue; }
          if (response.requestId !== 'smoke-request' || response.jobId !== 'smoke-job')
            return finish(Error(`PROTOCOL_ERROR: wrong request/job: ${JSON.stringify(response)}`));
          if (response.type === 'HELLO_ACK') { phases.helloAckMs = Math.round(performance.now() - started); continue; }
          if (response.type !== 'CAPABILITIES') return finish(Error(`PROTOCOL_ERROR: unexpected response ${JSON.stringify(response)}`));
          if (stdout.length) return finish(Error('PROTOCOL_ERROR: trailing stdout bytes after CAPABILITIES'));
          return finish(null, { processStartMs: Math.round(processStartMs), ...phases,
            helloResponseMs: Math.round(performance.now() - started), protocolVersion: response.protocolVersion,
            engine: response.engine, engineVersion: response.engineVersion, stdoutOnlyProtocol: true, stderr: stderr.trim() });
        } catch (error) { return finish(error); }
      }
    });
    child.once('exit', (code, signal) => finish(Error(`HOST_CRASHED before CAPABILITIES: exit=${code}, signal=${signal}, stderr=${stderr.slice(0, 500)}`)));
  });
}

try {
  check('PLATFORM', process.platform === 'win32', { platform: process.platform });
  check('TIMEOUT_ARGUMENT', Number.isFinite(timeoutMs) && timeoutMs > 0, { timeoutMs });
  const hkcu = registryValue('HKCU');
  const hklm = registryValue('HKLM');
  const manifestPath = hkcu || hklm;
  check('REGISTRY', Boolean(manifestPath), { hkcu, hklm, selected: hkcu ? 'HKCU' : 'HKLM' });
  check('MANIFEST_PATH', existsSync(manifestPath), { manifestPath });
  const manifestText = readFileSync(manifestPath, 'utf8');
  const hasBom = manifestText.startsWith('\uFEFF');
  if (hasBom && process.argv.includes('--strict-no-bom')) check('MANIFEST_ENCODING', false, { utf8Bom: true });
  else checks.push({ stage: 'MANIFEST_ENCODING', okay: true, utf8Bom: hasBom, tolerated: hasBom });
  const manifest = JSON.parse(manifestText.replace(/^\uFEFF/, ''));
  check('MANIFEST', manifest.name === HOST && manifest.type === 'stdio' && typeof manifest.path === 'string',
    { name: manifest.name, type: manifest.type, path: manifest.path });
  if (extensionId) check('ALLOWED_ORIGIN', manifest.allowed_origins?.includes(`chrome-extension://${extensionId}/`) === true,
    { extensionId, allowedOrigins: manifest.allowed_origins });
  check('EXECUTABLE', existsSync(manifest.path), { path: manifest.path });
  const python = resolve(dirname(manifest.path), 'python.exe');
  check('PYTHON', existsSync(python), { path: python });
  const hello = await framedHello(manifest.path);
  check('CAPABILITIES', hello.protocolVersion === '1.0' && hello.engine === 'pandapower' && hello.engineVersion === '3.5.5', hello);
  const imports = spawnSync(python, ['-c', 'import sys, pandapower, numpy, scipy; print(sys.version.split()[0], pandapower.__version__, numpy.__version__, scipy.__version__)'],
    { encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
  check('IMPORTS', imports.status === 0, { exitCode: imports.status, versions: imports.stdout.trim(), stderr: imports.stderr.trim().slice(0, 500) });
  console.log(JSON.stringify({ okay: true, checks }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ okay: false, checks, error: String(error) }, null, 2));
  process.exitCode = 1;
}
