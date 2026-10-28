// Preload da janela escondida do WhatsApp Web.
const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('cwHost', {
  emit: (type, data) => ipcRenderer.send('engine:evt', type, data)
});

// A janela fica escondida: dizemos ao WhatsApp que ela está visível e em foco,
// senão ele não marca como lido e pode pausar atualizações.
webFrame.executeJavaScript(`(() => {
  try {
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    document.hasFocus = () => true;
    for (const t of ['visibilitychange', 'blur', 'pagehide']) {
      window.addEventListener(t, (e) => e.stopImmediatePropagation(), true);
      document.addEventListener(t, (e) => e.stopImmediatePropagation(), true);
    }
  } catch (e) {}
})()`);
