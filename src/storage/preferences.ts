declare const chrome: { storage: { local: {
  get: (keys: string[]) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
} } };
export interface Preferences { lastModelName?: string; solver?: 'browser-approx'; theme?: 'system' | 'dark' }
export async function readPreferences(): Promise<Preferences> {
  return await chrome.storage.local.get(['lastModelName', 'solver', 'theme']) as Preferences;
}
export async function savePreferences(preferences: Partial<Preferences>): Promise<void> {
  await chrome.storage.local.set(preferences);
}
