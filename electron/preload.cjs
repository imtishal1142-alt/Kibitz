// The only things the page can ask the desktop shell for. It has no access to Node or the file system itself.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kibitz', {
  desktop: true,
  platform: process.platform,
  version: ipcRenderer.sendSync('app:version'),
  backup: {
    folder: () => ipcRenderer.invoke('backup:folder'),
    chooseFolder: () => ipcRenderer.invoke('backup:choose'),
    write: (name, text, keep) => ipcRenderer.invoke('backup:write', name, text, keep),
    reveal: () => ipcRenderer.invoke('backup:reveal'),
  },
});
