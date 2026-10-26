// 웹 앱에서 쓸 수 있는 데스크톱 기능(구글 로그인, 버전)
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nvDesktop', {
  version: () => ipcRenderer.invoke('version'),
  gdToken: (id, secret) => ipcRenderer.invoke('gd-token', id, secret),
  gdLogin: (id, secret) => ipcRenderer.invoke('gd-login', id, secret),
  gdLogout: () => ipcRenderer.invoke('gd-logout'),
  openFolder: () => ipcRenderer.invoke('open-data-folder'),
});
