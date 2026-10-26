// 웹 앱에서 쓸 수 있는 데스크톱 기능(구글 로그인, 버전)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nvDesktop', {
  version: () => ipcRenderer.invoke('version'),
  gdToken: (id, secret) => ipcRenderer.invoke('gd-token', id, secret),
  gdLogin: (id, secret, scope) => ipcRenderer.invoke('gd-login', id, secret, scope),
  libPick: () => ipcRenderer.invoke('lib-pick'),
  libScan: p => ipcRenderer.invoke('lib-scan', p),
  gdLogout: () => ipcRenderer.invoke('gd-logout'),
  openFolder: () => ipcRenderer.invoke('open-data-folder'),
  naiGen: (token, body) => ipcRenderer.invoke('nai-gen', token, body),
});
