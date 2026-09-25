import type { CanonicalNetwork } from '../model/types.ts';
import type { ResultSet } from '../analysis/result-set.ts';
import type { LoadFlowOptions, PowerSystemSolver } from './solver-interface.ts';

const HOST = 'com.ytbs.powerfactory.solver';
const VERSION = '1.0';
const CHUNK = 128 * 1024;
interface Message { type: string; protocolVersion: string; requestId: string; jobId: string; [key: string]: unknown }
interface Port { postMessage: (message: Message) => void; disconnect: () => void; onMessage: { addListener: (listener: (message: Message) => void) => void }; onDisconnect: { addListener: (listener: () => void) => void } }
declare const chrome: { runtime: { connectNative: (name: string) => Port; lastError?: { message: string } } };

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
function unbase64(value: string): Uint8Array { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }
function hex(bytes: ArrayBuffer): string { return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join(''); }

export class HostNotInstalledError extends Error { constructor(message = 'HOST NOT INSTALLED') { super(message); this.name = 'HostNotInstalledError'; } }
export class PandapowerSolver implements PowerSystemSolver {
  readonly id = 'pandapower';
  readonly capabilities = { ac: true, dc: true, fullNetwork: true, scenarios: false };
  async runLoadFlow(network: CanonicalNetwork, options: LoadFlowOptions, onProgress?: (phase: string) => void): Promise<ResultSet> {
    if (!network.electrical) throw Error('Electrical CanonicalNetwork yok');
    let port: Port;
    try { port = chrome.runtime.connectNative(HOST); } catch (error) { throw new HostNotInstalledError(String(error)); }
    const requestId = crypto.randomUUID(), jobId = crypto.randomUUID();
    const pending: Message[] = [];
    let wake: ((message: Message) => void) | null = null;
    let disconnected: Error | null = null;
    port.onMessage.addListener(message => {
      if (message.protocolVersion !== VERSION || message.requestId !== requestId || message.jobId !== jobId) return;
      if (wake) { const resolve = wake; wake = null; resolve(message); } else pending.push(message);
    });
    port.onDisconnect.addListener(() => {
      disconnected = new HostNotInstalledError(chrome.runtime.lastError?.message ?? 'Native host bağlantısı kesildi');
      if (wake) { const resolve = wake; wake = null; resolve({ type: 'DISCONNECTED', protocolVersion: VERSION, requestId, jobId }); }
    });
    const send = (type: string, fields: Record<string, unknown> = {}): void => port.postMessage({ type, protocolVersion: VERSION, requestId, jobId, ...fields });
    const next = (): Promise<Message> => {
      if (pending.length) return Promise.resolve(pending.shift()!);
      if (disconnected) return Promise.reject(disconnected);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { wake = null; reject(Error('Native host timeout')); }, 300000);
        wake = message => { clearTimeout(timer); resolve(message); };
      });
    };
    const expect = async (type: string): Promise<Message> => {
      for (;;) {
        const message = await next();
        if (message.type === 'DISCONNECTED') throw disconnected ?? new HostNotInstalledError();
        if (message.type === 'ERROR') throw Error(`${String(message.code)}: ${String(message.message)}`);
        if (message.type === 'PROGRESS') onProgress?.(String(message.phase));
        if (message.type === type) return message;
      }
    };
    try {
      send('HELLO');
      await expect('CAPABILITIES');
      const payload = new TextEncoder().encode(JSON.stringify(network.electrical));
      const sha256 = hex(await crypto.subtle.digest('SHA-256', payload));
      send('CREATE_MODEL', { byteLength: payload.byteLength, sha256 });
      await expect('PROGRESS');
      for (let offset = 0, index = 0; offset < payload.byteLength; offset += CHUNK, index++) {
        send('MODEL_CHUNK', { index, data: base64(payload.subarray(offset, offset + CHUNK)) });
        await expect('PROGRESS');
      }
      send('MODEL_COMPLETE');
      await expect('PROGRESS');
      send('RUN_LOAD_FLOW', { mode: options.mode });
      const summary = await expect('RESULT_SUMMARY');
      const count = Number(summary.chunkCount), byteLength = Number(summary.byteLength);
      if (!Number.isInteger(count) || count < 1 || count > 100000 || !Number.isInteger(byteLength) || byteLength < 2 || byteLength > 256 * 1024 * 1024) throw Error('Geçersiz host sonuç uzunluğu');
      const bytes = new Uint8Array(byteLength);
      let offset = 0;
      for (let index = 0; index < count; index++) {
        const message = await expect('RESULT_CHUNK');
        if (message.index !== index || typeof message.data !== 'string') throw Error('Sonuç parçası sıra hatası');
        const part = unbase64(message.data);
        if (offset + part.byteLength > bytes.byteLength) throw Error('Sonuç boyutu aşıldı');
        bytes.set(part, offset); offset += part.byteLength;
      }
      if (offset !== byteLength || hex(await crypto.subtle.digest('SHA-256', bytes)) !== summary.sha256) throw Error('Sonuç SHA-256 doğrulaması başarısız');
      const result = JSON.parse(new TextDecoder().decode(bytes)) as ResultSet;
      if (result.schemaVersion !== '2.0' || result.modelHash !== network.modelHash || result.engine !== 'pandapower') throw Error('ResultSet V2 kimlik/sürüm uyuşmazlığı');
      return result;
    } finally { port.disconnect(); }
  }
}
