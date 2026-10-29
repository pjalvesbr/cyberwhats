import { app, BrowserWindow, ipcMain, dialog, shell, Notification, protocol, net } from 'electron';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WhatsAppEngine } from './engine.mjs';
import { WhatsAppGo } from './engine-go.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.setAppUserModelId('org.cyberwhats.app');
// O WhatsApp Web só aceita navegadores conhecidos: nos apresentamos como Chrome
app.userAgentFallback = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// a janela do WhatsApp Web fica escondida: impede o Chromium de congelá-la ou desacelerá-la
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,IntensiveWakeUpThrottling');
if (!app.requestSingleInstanceLock()) app.quit();
// cwmedia:// serve fotos/vídeos/áudios baixados (com suporte a avançar o vídeo)
protocol.registerSchemesAsPrivileged([{ scheme: 'cwmedia', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }]);

let win;
let wa;
const dataDir = app.getPath('userData');
const downloadDir = path.join(app.getPath('documents'), 'CyberWhats');
const cfgFile = path.join(dataDir, 'config.json');
const defaults = {
  timestamp: true, sounds: true, readReceipts: true, typing: true, notifyPopups: true,
  awayAutoReply: false, showMotd: true, showRecent: true, inlineMedia: true, autoDownload: true, awayMessage: 'Estou away no momento, respondo assim que voltar.',
  notify: [], ignore: [], autojoin: [], nicklistWidth: 140, fontSize: 16, uiSize: 13, theme: 'padrao', iconSet: 'modern', engine: 'go'
};
const loadCfg = () => { try { return { ...defaults, ...JSON.parse(fs.readFileSync(cfgFile, 'utf8')) }; } catch { return { ...defaults }; } };
let cfg = loadCfg();
const saveCfg = () => fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));

function createWindow() {
  win = new BrowserWindow({
    width: 1024, height: 720, minWidth: 640, minHeight: 420,
    frame: false, backgroundColor: '#c0c0c0', show: false,
    title: 'CyberWhats 3.2',
    icon: path.join(__dirname, 'renderer/assets/app.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  win.removeMenu();
  if (process.env.CW_DEBUG) win.webContents.on('console-message', (e) => console.log('[renderer]', e.level, e.message, e.lineNumber));
  win.loadFile(path.join(__dirname, 'renderer/index.html'), process.env.CW_DEMO ? { hash: 'demo' } : undefined);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; app.quit(); });
  win.on('maximize', () => win.webContents.send('win:state', 'max'));
  win.on('unmaximize', () => win.webContents.send('win:state', 'normal'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  protocol.handle('cwmedia', (req) => {
    const name = path.basename(decodeURIComponent(new URL(req.url).pathname));
    const file = path.join(app.getPath('userData'), 'media-cache', name);
    return net.fetch(pathToFileURL(file).toString(), { headers: req.headers, bypassCustomProtocolHandlers: true });
  });
  wa = cfg.engine === 'web' ? new WhatsAppEngine(dataDir, downloadDir) : new WhatsAppGo(dataDir, downloadDir);
  wa.engineName = cfg.engine === 'web' ? 'web' : 'go';
  wa.on('wa', (ev) => {
    if (!win || win.isDestroyed()) return;
    win.webContents.send('wa:event', ev);
    if (ev.type === 'message' && !ev.msg.fromMe && cfg.notifyPopups && !win.isFocused() && Notification.isSupported()) {
      const title = ev.msg.group ? `#${ev.msg.chatName} — ${ev.msg.nick}` : `Pvt de ${ev.msg.nick}`;
      const n = new Notification({ title, body: ev.msg.text || `[${ev.msg.media}] ${ev.msg.caption || ''}`, silent: true });
      n.on('click', () => { win.show(); win.focus(); win.webContents.send('ui:open', ev.msg.chat); });
      n.show();
      win.flashFrame(true);
    }
  });
  createWindow();

  const h = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => {
    try { return { ok: true, data: await fn(...a) }; } catch (e) { return { ok: false, error: e?.message || String(e) }; }
  });
  h('wa:connect', (opts) => { wa.connect(opts || {}); return true; });
  h('wa:showWeb', () => wa.showWeb());
  h('wa:disconnect', () => wa.disconnect());
  h('wa:logout', () => wa.logout());
  h('wa:status', () => ({ state: wa.state, me: wa.me, hasSession: wa.hasSession(), engine: wa.engineName }));
  h('app:relaunch', () => { app.relaunch(); app.quit(); });
  h('wa:chats', () => wa.listChats());
  h('wa:history', (jid) => wa.history_(jid));
  h('wa:group', (jid) => wa.getGroup(jid));
  h('wa:send', (jid, text, quoted) => wa.send(jid, text, quoted));
  h('wa:sendFile', async (jid, file, caption) => {
    if (!file) {
      const r = await dialog.showOpenDialog(win, { title: 'Enviar arquivo (DCC Send)', properties: ['openFile', 'multiSelections'] });
      if (r.canceled) return [];
      const out = [];
      for (const f of r.filePaths) out.push(await wa.sendFile(jid, f, caption));
      return out;
    }
    return [await wa.sendFile(jid, file, caption)];
  });
  h('wa:open', async (jid, id) => { const f = await wa.download(jid, id); await shell.openPath(f); return f; });
  h('wa:read', (jid) => (cfg.readReceipts ? wa.markRead(jid) : null));
  h('wa:whois', (jid) => wa.whois(jid));
  h('wa:pic', (jid) => wa.pic(jid));
  h('wa:media', (jid, id) => wa.mediaData(jid, id));
  h('wa:resolve', (n) => wa.resolveNumber(n));
  h('wa:presence', (jid, t) => (cfg.typing || t === 'available' || t === 'unavailable' ? wa.presence(jid, t) : null));
  h('wa:subscribe', (jid) => wa.subscribe(jid));
  h('wa:groupAction', (jid, action, ids) => wa.groupAction(jid, action, ids));
  h('wa:subject', (jid, s) => wa.setSubject(jid, s));
  h('wa:desc', (jid, s) => wa.setDesc(jid, s));
  h('wa:leave', (jid) => wa.leave(jid));
  h('wa:invite', (jid) => wa.invite(jid));
  h('wa:setName', (n) => wa.setName(n));
  h('wa:setStatus', (s) => wa.setStatus(s));
  h('wa:contacts', () => wa.contactsAll());
  h('cfg:get', () => cfg);
  h('cfg:set', (patch) => { cfg = { ...cfg, ...patch }; saveCfg(); return cfg; });
  h('app:openLogs', () => shell.openPath(path.join(dataDir, 'logs')));
  h('app:openDownloads', () => { fs.mkdirSync(path.join(downloadDir, 'Recebidos'), { recursive: true }); return shell.openPath(path.join(downloadDir, 'Recebidos')); });
  h('app:openUrl', (u) => shell.openExternal(u));
  h('app:logError', (txt) => { try { fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true }); fs.appendFileSync(path.join(dataDir, 'logs', 'erros.log'), `[${new Date().toISOString()}] ${String(txt).slice(0, 2000)}\r\n`); } catch {} return true; });
  h('app:version', () => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).cwVersion || app.getVersion(); } catch { return app.getVersion(); } });
  const motdFile = path.join(dataDir, 'motd.txt');
  // MOTD padrão antigo (não editado pelo usuário) é trocado pelo novo
  const OLD_MOTDS = ['41b2f9839bbed7ce80301b755e44d62660225a97', '0fcb8177a93d4adafb3f2189a545c3c915d9820c'];
  const ensureMotd = () => {
    const def = path.join(__dirname, 'renderer/assets/motd-default.txt');
    if (!fs.existsSync(motdFile)) return fs.copyFileSync(def, motdFile);
    try { if (OLD_MOTDS.includes(crypto.createHash('sha1').update(fs.readFileSync(motdFile)).digest('hex'))) fs.copyFileSync(def, motdFile); } catch {}
  };
  h('app:motd', () => { ensureMotd(); return fs.readFileSync(motdFile, 'utf8'); });
  h('app:editMotd', () => { ensureMotd(); return shell.openPath(motdFile); });
  h('app:resetMotd', () => { fs.copyFileSync(path.join(__dirname, 'renderer/assets/motd-default.txt'), motdFile); return true; });
  h('app:sysinfo', () => {
    const total = Math.round(os.totalmem() / 1048576), used = total - Math.round(os.freemem() / 1048576);
    const u = Math.floor(os.uptime());
    const uptime = (u >= 86400 ? Math.floor(u / 86400) + 'd ' : '') + (u >= 3600 ? (Math.floor(u / 3600) % 24) + 'hr ' : '') + (Math.floor(u / 60) % 60) + 'mins ' + (u % 60) + 'secs';
    let ip = '127.0.0.1';
    for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) { ip = n.address; break; }
    const rel = os.release().split('.');
    const osName = process.platform === 'win32' ? (Number(rel[2]) >= 22000 ? 'Win11' : 'Win10') : os.type();
    return { total, used, pct: ((used / total) * 100).toFixed(2), uptime, ip, os: osName };
  });
  // ---- CyberWhats Script (.cws): pasta de scripts editáveis em userData/scripts
  const scriptsDir = path.join(dataDir, 'scripts');
  const defScripts = path.join(__dirname, 'scripts');
  const walk = (dir, base = '') => {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = base ? base + '/' + e.name : e.name;
      if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel)); else out.push(rel);
    }
    return out;
  };
  const safeRel = (rel) => {
    const full = path.resolve(scriptsDir, String(rel).replace(/\\/g, '/'));
    if (!full.startsWith(path.resolve(scriptsDir) + path.sep)) throw new Error('caminho inválido');
    return full;
  };
  // versões antigas dos scripts padrão: se o arquivo do usuário for igual a uma delas (não editado), atualiza
  const OLD_DEFAULTS = {"frases.cws": ["fb950ba940ab7fcf966e15504abb7d8b69f97eea", "5a106692901537e11dae76b257d7d63cc2b298e4", "39bb7cee9360065442ec5886d5d2bda8c2b43ea8"], "gamagame.cws": ["022fc1e1ef231f8be08ba52527b9570c64b3d61a", "771cf3589d9f315ffc5d98e3b9b00640dd48d308"], "frases/pontinho.txt": ["dcac4990c2855d255fdf70167d268a52d1a78edb"], "frases/peido.txt": ["c375366b24d461d467f3fe8a12774e6565881012"], "frases/cumulos.txt": ["9bb2cd9dc73c355cec86d0da67b9b19caa7bcf9e"], "frases/legais.txt": ["1485bc028f7ef126d25ee0c0a248adb8d6dcc68c"], "frases/quits.txt": ["c2f2aa024ba13a088f6967e50e22744165891e02"], "frases/taglines.txt": ["8d3f63f17aa522fb4be346c789b8c8b2b717299d"], "gamagame/temas.txt": ["dbf49f06cea91d3f7abff8abd059806d1528bf25"]};
  const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
  // dados padrão que saíram do app: apaga a cópia do usuário se ele não editou
  const REMOVED_DEFAULTS = {"frases/loiras.txt": "76700e9a7085658718bbfbfb5f26a28467674500", "frases/machista.txt": "d493567bc1fc2425b534715879c1e2028954b513", "frases/mae.txt": "01d76c7e9b90f6e8c28f9133eb506011cfc46482", "frases/feminista.txt": "d442f336f735cd1f11b0b58a49e5eab34264e144", "frases/portugues.txt": "16da507dacefe41e533c1ac11682ce31204d3bfe", "frases/corno.txt": "1390e662b0b631623cc514dc574e88ea0c94af5a", "frases/pinto.txt": "d352f11f3ad0e18d05d5b4a3d1387f69b2b675eb"};
  const ensureScripts = () => {
    fs.mkdirSync(scriptsDir, { recursive: true });
    const mark = path.join(scriptsDir, '.instalados');
    let done = {};
    try { const j = JSON.parse(fs.readFileSync(mark, 'utf8')); done = Array.isArray(j) ? Object.fromEntries(j.map((r) => [r, null])) : j; } catch {}
    for (const rel of walk(defScripts)) {
      const src = fs.readFileSync(path.join(defScripts, rel));
      const h = sha1(src);
      const dst = path.join(scriptsDir, rel);
      if (!(rel in done)) {
        if (!fs.existsSync(dst)) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, src); }
        done[rel] = h; continue;
      }
      if (done[rel] === h || !fs.existsSync(dst)) continue; // atual, ou o usuário apagou
      const mine = sha1(fs.readFileSync(dst));
      if (mine === done[rel] || (OLD_DEFAULTS[rel] || []).includes(mine)) fs.writeFileSync(dst, src);
      done[rel] = h;
    }
    for (const [rel, h] of Object.entries(REMOVED_DEFAULTS)) {
      const dst = path.join(scriptsDir, rel);
      try { if (fs.existsSync(dst) && (sha1(fs.readFileSync(dst)) === h || done[rel] === sha1(fs.readFileSync(dst)))) fs.unlinkSync(dst); } catch {}
      delete done[rel];
    }
    fs.writeFileSync(mark, JSON.stringify(done));
  };
  const scriptName = (n) => { n = path.basename(String(n || '')).replace(/[<>:"/\\|?*]/g, '').trim(); if (!n) throw new Error('nome inválido'); return n.toLowerCase().endsWith('.cws') ? n : n + '.cws'; };
  h('scripts:load', () => {
    ensureScripts();
    const scripts = [], data = {};
    for (const rel of walk(scriptsDir)) {
      if (rel.startsWith('.') || rel === 'variaveis.json') continue;
      const full = path.join(scriptsDir, rel);
      if (rel.toLowerCase().endsWith('.cws') && !rel.includes('/')) scripts.push({ name: rel, text: fs.readFileSync(full, 'utf8') });
      else if (/\.(txt|ini|dat|lst)$/i.test(rel) && fs.statSync(full).size < 4 * 1048576) data[rel] = fs.readFileSync(full, 'utf8');
    }
    scripts.sort((a, b) => a.name.localeCompare(b.name));
    let vars = {};
    try { vars = JSON.parse(fs.readFileSync(path.join(scriptsDir, 'variaveis.json'), 'utf8')); } catch {}
    const defaults = fs.readdirSync(defScripts).filter((f) => f.endsWith('.cws'));
    return { scripts, data, vars, defaults };
  });
  h('scripts:save', (name, text) => { ensureScripts(); const n = scriptName(name); fs.writeFileSync(path.join(scriptsDir, n), String(text ?? '')); return n; });
  h('scripts:delete', (name) => { const f = path.join(scriptsDir, scriptName(name)); if (fs.existsSync(f)) fs.unlinkSync(f); return true; });
  h('scripts:restore', (name) => { const n = scriptName(name); const src = path.join(defScripts, n); if (!fs.existsSync(src)) throw new Error('não é um script padrão'); fs.copyFileSync(src, path.join(scriptsDir, n)); return fs.readFileSync(src, 'utf8'); });
  h('scripts:openFolder', () => { ensureScripts(); return shell.openPath(scriptsDir); });
  h('scripts:saveVars', (vars) => { fs.mkdirSync(scriptsDir, { recursive: true }); fs.writeFileSync(path.join(scriptsDir, 'variaveis.json'), JSON.stringify(vars || {}, null, 1)); return true; });
  h('scripts:writeData', (rel, text) => { const f = safeRel(rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, String(text ?? '')); return true; });
  h('win:min', () => win.minimize());
  h('win:max', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
  h('win:close', () => win.close());
  h('win:flash', () => { if (!win.isFocused()) win.flashFrame(true); });
});

app.on('before-quit', () => { try { wa?.shutdown?.(); if (wa?.win && !wa.win.isDestroyed()) { wa.closing = true; wa.win.destroy(); } } catch {} });
app.on('window-all-closed', () => { try { wa?.flush(); } catch {} app.quit(); });
