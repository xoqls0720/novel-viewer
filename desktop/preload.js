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
  naiCapture: () => ipcRenderer.invoke('nai-capture'),
  libInfo: p => ipcRenderer.invoke('lib-info', p),
  libFind: p => ipcRenderer.invoke('lib-find', p),
  libRepick: p => ipcRenderer.invoke('lib-repick', p),
  odToken: (id, scope) => ipcRenderer.invoke('od-token', id, scope),
  odLogin: (id, scope) => ipcRenderer.invoke('od-login', id, scope),
  odLogout: () => ipcRenderer.invoke('od-logout'),
});
