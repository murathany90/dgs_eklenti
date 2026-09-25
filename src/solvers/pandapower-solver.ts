import type { CanonicalNetwork } from '../model/types.ts';
import type { ResultSet, ACPreflightDiagnostics } from '../analysis/result-set.ts';
import type { LoadFlowOptions, PowerSystemSolver } from './solver-interface.ts';

const HOST = 'com.ytbs.powerfactory.solver';
const VERSION = '1.0';
const CHUNK = 128 * 1024;
interface Message { type: string; protocolVersion: string; requestId: string; jobId: string; [key: string]: unknown }
interface Port { postMessage: (message: Message) => void; disconnect: () => void; onMessage: { addListener: (listener: (message: Message) => void) => void }; onDisconnect: { addListener: (listener: () => void) => void } }
declare const chrome: { runtime: { connectNative: (name: string) => Port; lastError?: { message: string } } };
export type NativeHostErrorKind = 'HOST_NOT_INSTALLED' | 'HOST_DISCONNECTED' | 'HOST_CRASHED' | 'PROTOCOL_ERROR' | 'TIMEOUT';

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
function unbase64(value: string): Uint8Array { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }
function hex(bytes: ArrayBuffer): string { return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join(''); }

export class NativeHostError extends Error {
  constructor(readonly kind: NativeHostErrorKind, readonly technicalMessage: string) { super(technicalMessage); this.name = 'NativeHostError'; }
}
export function classifyDisconnect(message: string, connected: boolean): NativeHostErrorKind {
  if (/host (was )?not found|specified native messaging host.*not found|native host.*not installed/i.test(message)) return 'HOST_NOT_INSTALLED';
  if (/exited|crashed|terminated unexpectedly/i.test(message)) return 'HOST_CRASHED';
  return connected ? 'HOST_DISCONNECTED' : 'HOST_NOT_INSTALLED';
}
export function classifyHostResponse(code: string): NativeHostErrorKind {
  return /PROTOCOL|VERSION|UNKNOWN_COMMAND/.test(code) ? 'PROTOCOL_ERROR' : 'HOST_CRASHED';
}

export class PandapowerSolver implements PowerSystemSolver {
  readonly id = 'pandapower';
  readonly capabilities = { ac: true, dc: true, fullNetwork: true, scenarios: false };
  async runLoadFlow(
    network: CanonicalNetwork, options: LoadFlowOptions,
    onProgress?: (phase: string) => void,
    onDiagnostics?: (diagnostics: ACPreflightDiagnostics) => void,
  ): Promise<ResultSet> {
    if (!network.electrical) throw Error('Elektriksel temel model bulunmuyor');
    let port: Port;
    try { port = chrome.runtime.connectNative(HOST); }
    catch (error) { throw new NativeHostError('HOST_NOT_INSTALLED', String(error)); }
    const requestId = crypto.randomUUID(), jobId = crypto.randomUUID();
    const pending: Message[] = [];
    let wake: ((message: Message) => void) | null = null;
    let disconnected: NativeHostError | null = null;
    let connected = false;
    port.onMessage.addListener(message => {
      if (message.requestId !== requestId || message.jobId !== jobId) return;
      if (message.protocolVersion !== VERSION) {
        disconnected = new NativeHostError('PROTOCOL_ERROR', `Native host protocol version mismatch: ${String(message.protocolVersion)}`);
        if (wake) { const resolve = wake; wake = null; resolve({ ...message, type: 'DISCONNECTED' }); }
        return;
      }
      connected = true;
      if (wake) { const resolve = wake; wake = null; resolve(message); } else pending.push(message);
    });
    port.onDisconnect.addListener(() => {
      const details = chrome.runtime.lastError?.message ?? 'Native host connection closed';
      disconnected = new NativeHostError(classifyDisconnect(details, connected), details);
      if (wake) { const resolve = wake; wake = null; resolve({ type: 'DISCONNECTED', protocolVersion: VERSION, requestId, jobId }); }
    });
    const send = (type: string, fields: Record<string, unknown> = {}): void => port.postMessage({ type, protocolVersion: VERSION, requestId, jobId, ...fields });
    const next = (): Promise<Message> => {
      if (pending.length) return Promise.resolve(pending.shift()!);
      if (disconnected) return Promise.reject(disconnected);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { wake = null; reject(new NativeHostError('TIMEOUT', 'Native host response timeout')); }, 300000);
        wake = message => { clearTimeout(timer); resolve(message); };
      });
    };
    const expect = async (type: string): Promise<Message> => {
      for (;;) {
        const message = await next();
        if (message.type === 'DISCONNECTED') throw disconnected ?? new NativeHostError('HOST_DISCONNECTED', 'Native host connection closed');
        if (message.type === 'ERROR') {
          const code = String(message.code ?? '');
          throw new NativeHostError(classifyHostResponse(code), `${code}: ${String(message.message)}`);
        }
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
      send('PREFLIGHT');
      const diagnosticMessage = await expect('DIAGNOSTICS');
      if (!diagnosticMessage.diagnostics || typeof diagnosticMessage.diagnostics !== 'object') throw new NativeHostError('PROTOCOL_ERROR', 'Preflight diagnostic payload missing');
      onDiagnostics?.(diagnosticMessage.diagnostics as ACPreflightDiagnostics);
      send('RUN_LOAD_FLOW', { mode: options.mode });
      const summary = await expect('RESULT_SUMMARY');
      const count = Number(summary.chunkCount), byteLength = Number(summary.byteLength);
      if (!Number.isInteger(count) || count < 1 || count > 100000 || !Number.isInteger(byteLength) || byteLength < 2 || byteLength > 256 * 1024 * 1024) throw new NativeHostError('PROTOCOL_ERROR', 'Geçersiz sonuç boyutu');
      const bytes = new Uint8Array(byteLength);
      let offset = 0;
      for (let index = 0; index < count; index++) {
        const message = await expect('RESULT_CHUNK');
        if (message.index !== index || typeof message.data !== 'string') throw new NativeHostError('PROTOCOL_ERROR', 'Sonuç parçası sırası bozuk');
        const part = unbase64(message.data);
        if (offset + part.byteLength > bytes.byteLength) throw new NativeHostError('PROTOCOL_ERROR', 'Sonuç boyutu aşıldı');
        bytes.set(part, offset); offset += part.byteLength;
      }
      if (offset !== byteLength || hex(await crypto.subtle.digest('SHA-256', bytes)) !== summary.sha256) throw new NativeHostError('PROTOCOL_ERROR', 'Sonuç SHA-256 doğrulaması başarısız');
      const result = JSON.parse(new TextDecoder().decode(bytes)) as ResultSet;
      if (result.schemaVersion !== '2.0' || result.modelHash !== network.modelHash || result.engine !== 'pandapower') throw new NativeHostError('PROTOCOL_ERROR', 'ResultSet V2 kimlik/sürüm uyuşmazlığı');
      return result;
    } catch (error) {
      if (error instanceof NativeHostError) throw error;
      if (error instanceof Error && /timeout/i.test(error.message)) throw new NativeHostError('TIMEOUT', error.message);
      throw new NativeHostError('PROTOCOL_ERROR', String(error));
    } finally { port.disconnect(); }
  }
}
