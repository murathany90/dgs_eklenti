import { chromium } from 'playwright';
import { resolve, basename, join, sep } from 'node:path';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const modelPath = process.env.DGS_E2E_MODEL;
if (!modelPath) throw new Error('Set DGS_E2E_MODEL to a local full DGS JSON file.');
const source = resolve(modelPath);
const modelName = basename(source);
const modelBytes = (await stat(source)).size;
const extension = resolve('dist');
const flows = process.env.DGS_E2E_FLOW ? [process.env.DGS_E2E_FLOW] : ['direct', 'sidepanel'];
if (flows.some(flow => !['direct', 'sidepanel'].includes(flow))) throw new Error('DGS_E2E_FLOW must be direct or sidepanel.');
const readyBudgetMs = Number(process.env.DGS_E2E_READY_BUDGET_MS ?? 60000);

function instrumentWorkspace(expectedName) {
  if (!location.pathname.endsWith('/workspace.html')) return;
  const metrics = window.__largeModelMetrics = {
    timeOrigin: performance.timeOrigin, inputStartMs: null, firstProgressMs: null,
    workerReadyMs: null, activeMs: null, loadHiddenMs: null, topologyMs: null, analysisReadyMs: null,
    phases: [], longTaskCount: 0, longTaskTotalMs: 0, longestTaskMs: 0,
    maxHeartbeatGapMs: 0, heartbeatGapsOver200Ms: 0,
  };
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        metrics.longTaskCount++;
        metrics.longTaskTotalMs += entry.duration;
        metrics.longestTaskMs = Math.max(metrics.longestTaskMs, entry.duration);
      }
    }).observe({ entryTypes: ['longtask'] });
  } catch { /* Long Task API may be unavailable in extension pages. */ }
  let lastTick = performance.now();
  setInterval(() => {
    const now = performance.now();
    const gap = now - lastTick;
    lastTick = now;
    metrics.maxHeartbeatGapMs = Math.max(metrics.maxHeartbeatGapMs, gap);
    if (gap > 200) metrics.heartbeatGapsOver200Ms++;
    if (metrics.activeMs === null && window.V6Legacy?.getActive()?.name === expectedName) metrics.activeMs = now;
    if (metrics.loadHiddenMs === null && metrics.firstProgressMs !== null && document.querySelector('#loadProgress')?.classList.contains('hidden')) metrics.loadHiddenMs = now;
    if (metrics.topologyMs === null && document.querySelector('#v6Metadata')?.dataset.components) metrics.topologyMs = now;
    if (metrics.analysisReadyMs === null && metrics.loadHiddenMs !== null && metrics.topologyMs !== null &&
        window.YTBS_AnalysisState?.activeCalculationKeyId && document.querySelector('#v61BusSelect')?.options.length > 1) metrics.analysisReadyMs = now;
  }, 50);
  const attach = () => {
    const progress = document.querySelector('#progressText');
    if (!progress) return;
    let previous = '';
    const capture = () => {
      const message = progress.textContent || '';
      if (!message || message === previous) return;
      previous = message;
      const now = performance.now();
      metrics.phases.push({ message, ms: now });
      if (metrics.firstProgressMs === null && message.includes(expectedName)) metrics.firstProgressMs = now;
      if (message.endsWith(' · READY')) metrics.workerReadyMs = now;
    };
    new MutationObserver(capture).observe(progress, { childList: true, characterData: true, subtree: true });
    capture();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
  else attach();
}

async function pendingExists(page) {
  return page.evaluate(() => new Promise((resolvePending, reject) => {
    const open = indexedDB.open('ytbs-dgs-v6', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const request = db.transaction('models', 'readonly').objectStore('models').get('pending');
      request.onerror = () => { db.close(); reject(request.error); };
      request.onsuccess = () => { db.close(); resolvePending(Boolean(request.result)); };
    };
  }));
}

async function measureObserver(page) {
  return page.evaluate(async () => {
    const bodyElementCount = document.body.querySelectorAll('*').length;
    const original = document.createTreeWalker;
    const roots = [];
    let nodesVisited = 0;
    const probe = document.createElement('div');
    probe.id = 'performanceObserverProbe';
    const child = document.createElement('span');
    child.title = 'ElmLne';
    const textNode = document.createTextNode('ElmLne');
    child.append(textNode);
    probe.append(child);
    document.createTreeWalker = function (root, ...args) {
      roots.push(root === document.body ? 'body' : root.id || root.nodeName);
      const walker = original.call(this, root, ...args);
      const next = walker.nextNode.bind(walker);
      walker.nextNode = () => { const node = next(); if (node) nodesVisited++; return node; };
      return walker;
    };
    try {
      document.body.append(probe);
      await new Promise(resolve => setTimeout(resolve, 0));
      const addedSubtreeNodesVisited = nodesVisited;
      const addedRoots = [...roots];
      textNode.data = 'ElmTr2';
      await new Promise(resolve => setTimeout(resolve, 0));
      const textMutationTreeWalks = roots.length - addedRoots.length;
      if (addedRoots.includes('body') || addedSubtreeNodesVisited > 2 || textMutationTreeWalks !== 0) {
        throw new Error(`Presentation observer rescanned the page: ${JSON.stringify({ addedRoots, addedSubtreeNodesVisited, textMutationTreeWalks })}`);
      }
      return { bodyElementCount, addedRoots, addedSubtreeNodesVisited, textMutationTreeWalks };
    } finally {
      document.createTreeWalker = original;
      probe.remove();
    }
  });
}

async function measureWorkspace(page, flow, startEpochMs) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.bringToFront();
  await page.waitForFunction(name => window.V6Legacy?.getActive()?.name === name, modelName, { timeout: 240000 });
  await page.waitForFunction(() => document.querySelector('#loadProgress')?.classList.contains('hidden'), null, { timeout: 240000 });
  await page.waitForFunction(() => Boolean(document.querySelector('#v6Metadata')?.dataset.components), null, { timeout: 120000 });
  await page.waitForFunction(() => typeof window.__largeModelMetrics?.analysisReadyMs === 'number', null, { timeout: 30000 });
  if (await page.evaluate(() => window.YTBS_V3_TEST?.solver()) !== null) throw new Error('AC-PQ started automatically during model load.');
  const observerProbe = await measureObserver(page);

  const clickTimes = {};
  for (const tab of ['map', 'sld', 'analysis', 'scenario', 'model']) {
    const started = performance.now();
    await page.locator(`#primaryTabs [data-primary="${tab}"]`).click({ timeout: 10000 });
    await page.waitForFunction(value => document.querySelector(`#primaryTabs [data-primary="${value}"]`)?.classList.contains('active'), tab, { timeout: 5000 });
    clickTimes[tab] = Math.round(performance.now() - started);
    if (clickTimes[tab] > 5000) throw new Error(`Tab click stalled for ${clickTimes[tab]} ms: ${tab}`);
  }
  await page.locator('#primaryTabs [data-primary="analysis"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#v61BusSelect option').length > 1, null, { timeout: 30000 });
  const optionCount = await page.locator('#v61BusSelect option').count();
  if (optionCount > 101) throw new Error(`Bus dropdown rendered too many entries: ${optionCount}`);
  const busId = process.env.DGS_E2E_BUS_ID ?? 'B3308';
  const searchStarted = performance.now();
  await page.locator('#v61BusSearch').fill(busId);
  await page.waitForFunction(() => document.querySelector('#v61BusSelect')?.options[0]?.textContent?.includes('eşleşme'), null, { timeout: 10000 });
  await page.waitForFunction(value => Array.from(document.querySelector('#v61BusSelect').options).some(option => option.value === value), busId, { timeout: 10000 });
  const busSearchMs = Math.round(performance.now() - searchStarted);
  await page.locator('#v61BusSelect').selectOption(busId);
  if (await page.locator('#v61BusSelect').inputValue() !== busId) throw new Error(`Bus selection failed: ${busId}`);
  if (errors.length) throw new Error('Workspace JavaScript errors: ' + errors.join(' | '));

  const measured = await page.evaluate(name => ({ ...window.__largeModelMetrics,
    legacyModelReadyMs: performance.getEntriesByName('ytbs:legacy-model-ready').filter(entry => entry.detail?.modelName === name).at(-1)?.startTime ?? null,
    jsHeapBytes: performance.memory?.usedJSHeapSize ?? null,
  }), modelName);
  const fromEpoch = ms => ms == null ? null : Math.round(measured.timeOrigin + ms - startEpochMs);
  const workerReadyMs = fromEpoch(measured.workerReadyMs);
  const dataReadyMs = fromEpoch(measured.loadHiddenMs);
  const topologyReadyMs = fromEpoch(measured.topologyMs);
  const analysisReadyMs = fromEpoch(measured.analysisReadyMs);
  const legacyModelReadyMs = fromEpoch(measured.legacyModelReadyMs);
  if ([workerReadyMs, dataReadyMs, topologyReadyMs, analysisReadyMs, legacyModelReadyMs].some(value => value === null)) throw new Error('A required model-readiness stage was not observed.');
  const totalReadyMs = Math.max(dataReadyMs, topologyReadyMs, analysisReadyMs);
  // Parser worker emits MAPPING after JSON.parse and VALIDATING after mapElectricalNetwork.
  const phaseTime = phase => fromEpoch(measured.phases.find(item => item.message.endsWith(` · ${phase}`))?.ms);
  const legacyRows = measured.phases.filter(phase => /\d[\d.]* kayıt$/.test(phase.message));
  const terminals = measured.phases.filter(phase => /\d[\d.]* terminal$/.test(phase.message));
  const report = {
    flow, modelName, modelBytes, readyBudgetMs, readyWithinBudget: totalReadyMs < readyBudgetMs,
    workerReadyMs, activeMs: fromEpoch(measured.activeMs), dataReadyMs, topologyReadyMs, totalReadyMs,
    markers: { PARSE_COMPLETE: phaseTime('MAPPING'), ELECTRICAL_READY: phaseTime('VALIDATING'), LEGACY_MODEL_READY: legacyModelReadyMs, UI_READY: totalReadyMs },
    postWorkerUiMs: totalReadyMs - workerReadyMs,
    legacyRowProgressMs: [fromEpoch(legacyRows[0]?.ms), fromEpoch(legacyRows.at(-1)?.ms)],
    terminalProgressMs: [fromEpoch(terminals[0]?.ms), fromEpoch(terminals.at(-1)?.ms)],
    clickTimes, optionCount, busSearchMs, busSearch: busId, observerProbe,
    longTaskCount: measured.longTaskCount, longestTaskMs: Math.round(measured.longestTaskMs),
    longTaskTotalMs: Math.round(measured.longTaskTotalMs),
    maxHeartbeatGapMs: Math.round(measured.maxHeartbeatGapMs),
    heartbeatGapsOver200Ms: measured.heartbeatGapsOver200Ms,
    jsHeapMb: measured.jsHeapBytes === null ? null : Math.round(measured.jsHeapBytes / 1048576),
    phases: measured.phases.filter(phase => / · (Dosya okunuyor|READING|HASHING|PARSING|MAPPING|VALIDATING|READY|DGS sınıf ve kayıtları doğrulanıyor)$/.test(phase.message) || phase.message === 'Tamamlandı')
      .map(phase => ({ stage: phase.message.split(' · ').at(-1), ms: fromEpoch(phase.ms) })),
  };
  if (flow === 'sidepanel') {
    report.pendingDeletedAfterSuccessfulLoad = !(await pendingExists(page));
    if (!report.pendingDeletedAfterSuccessfulLoad) throw new Error('Pending model was not deleted after successful sidepanel load.');
  }
  console.log('Large DGS responsive UI', JSON.stringify(report));
  if (!report.readyWithinBudget) throw new Error(`${flow} UI READY exceeded ${readyBudgetMs} ms budget: ${totalReadyMs} ms`);
  if (flow === 'direct') {
    const international = await page.evaluate(() => window.YTBS_V3_TEST.graph(window.V6Legacy.getActive()).findings.internationalConnections);
    if (international.total !== 12 || international.inService !== 8 || international.mapped !== 8 ||
        Math.abs(international.pLoadMw - 785.98) > 1e-8 || Math.abs(international.qLoadMvar + 137.49) > 1e-8) {
      throw new Error(`BrowserApprox ElmVac fixed-PQ input regression failed: ${JSON.stringify(international)}`);
    }
    console.log('BrowserApprox ElmVac input audit', JSON.stringify(international));
  }
}

const failures = [];
for (const flow of flows) {
  const profile = await mkdtemp(join(tmpdir(), 'ga-large-model-e2e-'));
  const profilePath = resolve(profile);
  if (!profilePath.startsWith(resolve(tmpdir()) + sep) || !basename(profilePath).startsWith('ga-large-model-e2e-')) throw new Error(`Unexpected test profile path: ${profilePath}`);
  let context;
  try {
    context = await chromium.launchPersistentContext(profilePath, {
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chromium' }),
      headless: true, viewport: { width: 1440, height: 900 },
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--no-first-run'],
    });
    await context.addInitScript(instrumentWorkspace, modelName);
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 30000 });
    const id = new URL(worker.url()).host;
    let page;
    let startEpochMs;
    if (flow === 'sidepanel') {
      const panel = await context.newPage();
      await panel.goto(`chrome-extension://${id}/sidepanel.html`);
      startEpochMs = Date.now();
      await panel.locator('#modelFile').setInputFiles(source);
      await panel.locator('#status').getByText(/hazır/).waitFor({ timeout: 120000 });
      const opened = context.waitForEvent('page');
      await panel.locator('#openWorkspace').click();
      page = await opened;
    } else {
      page = await context.newPage();
      await page.goto(`chrome-extension://${id}/workspace.html`);
      startEpochMs = await page.evaluate(() => {
        window.__largeModelMetrics.inputStartMs = performance.now();
        return performance.timeOrigin + window.__largeModelMetrics.inputStartMs;
      });
      await page.locator('#fileInput').setInputFiles(source);
    }
    await measureWorkspace(page, flow, startEpochMs);
  } catch (error) {
    failures.push(`${flow}: ${error instanceof Error ? error.stack : String(error)}`);
  } finally {
    await context?.close();
    await rm(profilePath, { recursive: true, force: true });
  }
}
if (failures.length) throw new Error(failures.join('\n'));
