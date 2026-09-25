import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDisconnect, classifyHostResponse, NativeHostError } from '../../src/solvers/pandapower-solver.ts';

test('native host disconnect reasons remain distinct', () => {
  assert.equal(classifyDisconnect('Specified native messaging host not found.', false), 'HOST_NOT_INSTALLED');
  assert.equal(classifyDisconnect('Native host closed the connection.', true), 'HOST_DISCONNECTED');
  assert.equal(classifyDisconnect('Native host exited unexpectedly.', true), 'HOST_CRASHED');
  assert.equal(classifyHostResponse('PROTOCOL_VERSION'), 'PROTOCOL_ERROR');
  assert.equal(classifyHostResponse('UNKNOWN_COMMAND'), 'PROTOCOL_ERROR');
  assert.equal(new NativeHostError('TIMEOUT', 'test').kind, 'TIMEOUT');
});
