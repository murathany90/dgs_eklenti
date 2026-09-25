declare const chrome: {
  action: { onClicked: { addListener: (callback: (tab: { windowId?: number }) => void) => void } };
  sidePanel: { open: (options: { windowId: number }) => Promise<void> };
};

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId !== undefined) void chrome.sidePanel.open({ windowId: tab.windowId });
});
