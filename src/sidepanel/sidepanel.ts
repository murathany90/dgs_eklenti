import { putRecord } from '../storage/db.ts';
import { readPreferences, savePreferences } from '../storage/preferences.ts';

declare const chrome: { runtime: { getURL: (path: string) => string; lastError?: { message?: string } }; tabs: { create: (options: { url: string }) => Promise<unknown> } };
const status = document.querySelector<HTMLElement>('#status')!;
const fileInput = document.querySelector<HTMLInputElement>('#modelFile')!;
void readPreferences().then(preferences => {
  if (preferences.lastModelName) status.textContent = `Son model: ${preferences.lastModelName}`;
});
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  status.textContent = `${file.name} kaydediliyor…`;
  try {
    await putRecord('models', { id: 'pending', name: file.name, file, savedAt: Date.now() });
    await savePreferences({ lastModelName: file.name, solver: 'browser-approx' });
    status.textContent = `${file.name} hazır.`;
  } catch (error) { status.textContent = `Model kaydedilemedi: ${String(error)}`; }
});
document.querySelector<HTMLButtonElement>('#openWorkspace')!.addEventListener('click', async () => {
  const button = document.querySelector<HTMLButtonElement>('#openWorkspace')!;
  button.disabled = true;
  status.textContent = 'Çalışma alanı açılıyor…';
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL('workspace.html') });
    status.textContent = 'Grid Analyzer çalışma alanı yeni sekmede açıldı.';
  } catch (error) {
    status.textContent = `Çalışma alanı açılamadı: ${String(error)}`;
    button.disabled = false;
  }
});
