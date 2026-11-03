const { contextBridge, ipcRenderer, webUtils } = require('electron');

// só os canais do próprio app (main.mjs também confere de onde veio cada pedido)
const CALL_OK = /^(wa|app|st|cfg|scripts|win):[A-Za-z]+$/;
const EVENTS = new Set(['wa:event', 'ui:open', 'win:state', 'cfg:changed', 'app:update', 'unread:clear']);

const call = async (ch, ...a) => {
  if (!CALL_OK.test(String(ch))) throw new Error('canal não permitido');
  const r = await ipcRenderer.invoke(ch, ...a);
  if (!r.ok) throw new Error(r.error);
  return r.data;
};

contextBridge.exposeInMainWorld('cw', {
  call,
  on: (ch, fn) => { if (EVENTS.has(ch)) ipcRenderer.on(ch, (_e, d) => fn(d)); },
  filePath: (f) => webUtils.getPathForFile(f)
});
