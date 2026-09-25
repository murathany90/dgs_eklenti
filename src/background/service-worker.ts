declare const chrome: {
  action: { onClicked: { addListener: (callback: (tab: { windowId?: number }) => void) => void } };
  sidePanel: { open: (options: { windowId: number }) => Promise<void> };
  tabs: { create: (options: { url: string }) => Promise<unknown> };
  runtime: { getURL: (path: string) => string };
};

chrome.action.onClicked.addListener((tab) => {
  const workspaceUrl = chrome.runtime.getURL('workspace.html');
  if (tab.windowId === undefined) {
    void chrome.tabs.create({ url: workspaceUrl });
    return;
  }
  void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => chrome.tabs.create({ url: workspaceUrl }));
});
