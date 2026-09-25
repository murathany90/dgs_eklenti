import test from 'node:test';
import assert from 'node:assert/strict';

test('toolbar action opens the side panel and falls back to the workspace tab', async () => {
  const previous = globalThis.chrome;
  let onClicked;
  const openedPanels = [];
  const openedTabs = [];
  let shouldReject = false;
  globalThis.chrome = {
    action: { onClicked: { addListener: listener => { onClicked = listener; } } },
    sidePanel: { open: options => {
      openedPanels.push(options);
      return shouldReject ? Promise.reject(new Error('side panel unavailable')) : Promise.resolve();
    } },
    tabs: { create: options => { openedTabs.push(options); return Promise.resolve(); } },
    runtime: { getURL: path => `chrome-extension://test-id/${path}` },
  };
  try {
    await import(`../../src/background/service-worker.ts?test=${Date.now()}`);
    onClicked({ windowId: 8 });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(openedPanels, [{ windowId: 8 }]);
    assert.deepEqual(openedTabs, []);

    shouldReject = true;
    onClicked({ windowId: 8 });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(openedTabs, [{ url: 'chrome-extension://test-id/workspace.html' }]);

    onClicked({});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(openedTabs.length, 2);
  } finally {
    if (previous === undefined) delete globalThis.chrome;
    else globalThis.chrome = previous;
  }
});
