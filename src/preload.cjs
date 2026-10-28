const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = async (ch, ...a) => {
  const r = await ipcRenderer.invoke(ch, ...a);
  if (!r.ok) throw new Error(r.error);
  return r.data;
};

contextBridge.exposeInMainWorld('cw', {
  call,
  on: (ch, fn) => ipcRenderer.on(ch, (_e, d) => fn(d)),
  filePath: (f) => webUtils.getPathForFile(f)
});
