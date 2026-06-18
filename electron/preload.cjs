'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal, safe API surface to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  onNotification: (cb) => ipcRenderer.on('notification', (_e, data) => cb(data)),
});
