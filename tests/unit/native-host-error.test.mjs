import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDisconnect, classifyHostResponse, NativeHostError, PandapowerSolver } from '../../src/solvers/pandapower-solver.ts';

test('Chrome native host errors remain specific', () => {
  assert.equal(classifyDisconnect('Specified native messaging host not found.', false), 'HOST_NOT_REGISTERED');
  assert.equal(classifyDisconnect('Access to the specified native messaging host is forbidden.', false), 'HOST_ORIGIN_MISMATCH');
  assert.equal(classifyDisconnect('Failed to start native messaging host.', false), 'HOST_START_FAILED');
  assert.equal(classifyDisconnect('Unknown pre-connect failure.', false), 'HOST_START_FAILED');
  assert.equal(classifyDisconnect('Native host closed the connection.', true), 'HOST_DISCONNECTED');
  assert.equal(classifyDisconnect('Native host exited unexpectedly.', true), 'HOST_CRASHED');
  assert.equal(classifyHostResponse('PROTOCOL_VERSION'), 'PROTOCOL_ERROR');
  assert.equal(classifyHostResponse('UNKNOWN_COMMAND'), 'PROTOCOL_ERROR');
  assert.equal(classifyHostResponse('HOST_ERROR'), 'SOLVER_ERROR');
  assert.equal(new NativeHostError('TIMEOUT', 'test').kind, 'TIMEOUT');
});

test('health check exchanges HELLO for capabilities and reports engine version', async () => {
  const previous = globalThis.chrome;
  const install = (engineVersion, overrides = {}) => {
    let listener;
    globalThis.chrome = { runtime: { id: 'abcdefghijklmnopabcdefghijklmnop', connectNative: () => ({
      postMessage: message => queueMicrotask(() => listener({ type: 'CAPABILITIES', protocolVersion: '1.0', requestId: message.requestId, jobId: message.jobId, engine: 'pandapower', engineVersion, ...overrides })),
      disconnect: () => {}, onMessage: { addListener: fn => { listener = fn; } }, onDisconnect: { addListener: () => {} },
    }) } };
  };
  try {
    install('3.5.5');
    assert.deepEqual(await new PandapowerSolver().healthCheck(), {
      status: 'CONNECTED', protocolVersion: '1.0', engine: 'pandapower', engineVersion: '3.5.5', extensionId: 'abcdefghijklmnopabcdefghijklmnop',
    });
    install('3.5.4');
    assert.equal((await new PandapowerSolver().healthCheck()).status, 'ENGINE_VERSION_MISMATCH');
    install('3.5.5', { engine: 'other-engine' });
    assert.equal((await new PandapowerSolver().healthCheck()).status, 'ENGINE_MISMATCH');
    install('3.5.5', { protocolVersion: '2.0' });
    assert.equal((await new PandapowerSolver().healthCheck()).status, 'PROTOCOL_MISMATCH');
  } finally {
    if (previous === undefined) delete globalThis.chrome; else globalThis.chrome = previous;
  }
});
