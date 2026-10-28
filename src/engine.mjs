// Motor do CyberWhats: o WhatsApp Web oficial roda numa janela escondida do
// Electron e é controlado pelos módulos internos dele (via engine/bridge.cjs).
// Expõe a mesma interface que a interface espera (eventos 'wa').
import { BrowserWindow, ipcMain, session } from 'electron';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { LoadUtils } = require('./engine/wwebjs-utils.cjs');
const { ExposeAuthStore } = require('./engine/wwebjs-authstore.cjs');
const { CWBridge, CWAuth } = require('./engine/bridge.cjs');

const WA_URL = process.env.CW_WA_URL || 'https://web.whatsapp.com/';
export const PARTITION = 'persist:cyberwhats';
const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska', '3gp': 'video/3gpp',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac',
  pdf: 'application/pdf', zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
  txt: 'text/plain', csv: 'text/csv', doc: 'application/msword', xls: 'application/vnd.ms-excel', ppt: 'application/vnd.ms-powerpoint',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'application/pdf': '.pdf' };
const num = (j) => String(j || '').split('@')[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class WhatsAppEngine extends EventEmitter {
  constructor(dataDir, downloadDir) {
    super();
    this.dataDir = dataDir;
    this.downloadDir = downloadDir;
    this.logDir = path.join(dataDir, 'logs');
    fs.mkdirSync(this.logDir, { recursive: true });
    this.state = 'offline';
    this.me = null;
    this.win = null;
    this.chats = [];
    this.groups = new Map();
    this.ready = false;
    this.lastQr = null;
    this.debugLog = path.join(this.logDir, 'conexao.log');
    ipcMain.on('engine:evt', (e, type, data) => {
      if (this.win && !this.win.isDestroyed() && e.sender === this.win.webContents) this.onEvt(type, data);
    });
  }

  log(...a) { try { fs.appendFileSync(this.debugLog, `[${new Date().toISOString()}] ${a.join(' ')}\r\n`); } catch {} }
  info(text) { this.log('info', text); this.emit('wa', { type: 'info', text }); }
  setState(s, extra = {}) { this.state = s; this.log('estado', s, extra.reason || ''); this.emit('wa', { type: 'state', state: s, me: this.me, ...extra }); }
  hasSession() { return fs.existsSync(path.join(this.dataDir, 'Partitions', 'cyberwhats')); }

  // ---------------- janela do WhatsApp Web ----------------
  async connect({ pairingNumber } = {}) {
    if (this.win && !this.win.isDestroyed()) return;
    this.pairingNumber = pairingNumber ? String(pairingNumber).replace(/\D/g, '') : null;
    this.ready = false;
    this.injected = false;
    this.setState('connecting');
    const ses = session.fromPartition(PARTITION);
    ses.setPermissionRequestHandler((_wc, perm, cb) => cb(['clipboard-read', 'clipboard-sanitized-write'].includes(perm)));
    const win = (this.win = new BrowserWindow({
      width: 1100, height: 800, show: false, title: 'WhatsApp Web (motor do CyberWhats)',
      webPreferences: { partition: PARTITION, preload: path.join(__dirname, 'engine', 'preload.cjs'), contextIsolation: true, sandbox: false, backgroundThrottling: false }
    }));
    win.removeMenu();
    win.webContents.setAudioMuted(false);
    win.webContents.setBackgroundThrottling(false);
    win.on('close', (e) => { if (!this.closing) { e.preventDefault(); win.hide(); } });
    win.webContents.setWindowOpenHandler(({ url }) => { import('electron').then(({ shell }) => shell.openExternal(url)); return { action: 'deny' }; });
    win.webContents.on('did-finish-load', () => { this.log('página carregada', win.webContents.getURL()); this.injected = false; this.ready = false; this.boot(); });
    win.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => {
      if (!isMain) return;
      this.log('falha ao carregar', code, desc);
      this.emit('wa', { type: 'error', text: `Não consegui abrir web.whatsapp.com (${desc} ${code}). Tentando de novo em 10s...` });
      setTimeout(() => { if (this.win === win && !win.isDestroyed()) win.loadURL(WA_URL); }, 10000);
    });
    win.webContents.on('render-process-gone', (_e, d) => {
      this.log('renderer caiu', d.reason);
      this.emit('wa', { type: 'error', text: 'O WhatsApp Web travou (' + d.reason + '), recarregando...' });
      setTimeout(() => { if (this.win === win && !win.isDestroyed()) win.loadURL(WA_URL); }, 2000);
    });
    win.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 3 || /\[cw\]/.test(e.message || '')) this.log('console', e.message); });
    this.info('Carregando web.whatsapp.com...');
    win.loadURL(WA_URL);
  }

  exec(code) { return this.win.webContents.executeJavaScript(code, true); }
  async call(fn, ...args) {
    if (!this.win || this.win.isDestroyed()) throw new Error('Não conectado');
    if (!this.ready) throw new Error('O WhatsApp ainda está carregando');
    const r = await this.exec(`(async () => { try { return { ok: true, v: await window.CW.${fn}(...${JSON.stringify(args)}) }; } catch (e) { return { ok: false, e: String((e && (e.message || e.text)) || e) }; } })()`);
    if (!r?.ok) throw new Error(r?.e || 'erro desconhecido');
    return r.v;
  }

  async boot() {
    const win = this.win;
    // espera o WhatsApp Web carregar os módulos internos
    let ok = false;
    for (let i = 0; i < 150 && this.win === win && !win.isDestroyed(); i++) {
      try { ok = await this.exec("typeof window.require === 'function' && !!(window.Debug && window.Debug.VERSION) && (() => { try { return !!window.require('WAWebSocketModel').Socket; } catch { return false; } })()"); } catch {}
      if (ok) break;
      await sleep(400);
    }
    if (!ok) {
      this.emit('wa', { type: 'error', text: 'O WhatsApp Web não carregou em 60s. Use /web para ver a página.' });
      return;
    }
    try {
      const ver = await this.exec('window.Debug.VERSION');
      this.info(`WhatsApp Web ${ver} carregado.`);
      await this.exec(`(${ExposeAuthStore.toString()})()`);
      await this.exec(`(${CWAuth.toString()})()`);
    } catch (e) { this.log('erro AuthStore', e.message); }
    // estado inicial
    let st = null;
    for (let i = 0; i < 100; i++) {
      try { st = await this.exec("window.require('WAWebSocketModel').Socket.state"); } catch {}
      if (st && !['OPENING', 'UNLAUNCHED', 'PAIRING'].includes(st)) break;
      await sleep(300);
    }
    this.log('estado do socket', st);
    this.onSocketState(st);
    // se já estava logado e sincronizado
    try { if (await this.exec("!!window.require('WAWebSocketModel').Socket.hasSynced")) this.onSynced(); } catch {}
  }

  async onSocketState(st) {
    if (!st) return;
    if (st === 'UNPAIRED' || st === 'UNPAIRED_IDLE') {
      if (this.ready) { this.ready = false; this.me = null; this.setState('offline', { reason: 'Sessão encerrada no celular' }); this.emit('wa', { type: 'loggedOut' }); this.setState('connecting'); }
      if (this.pairingNumber) {
        try {
          const code = await this.exec(`window.__cwPair(${JSON.stringify(this.pairingNumber)})`);
          this.emit('wa', { type: 'pairing', code });
        } catch (e) { this.emit('wa', { type: 'error', text: 'Falha no código de pareamento: ' + e.message }); }
        this.pairingNumber = null;
      } else {
        try { await this.exec('window.__cwSendQR && window.__cwSendQR()'); } catch {}
        setTimeout(() => this.qrFallback(), 8000);
      }
    } else if (st === 'CONFLICT') {
      this.info('O WhatsApp Web está aberto em outro lugar — assumindo a conexão aqui...');
      setTimeout(() => this.exec("window.require('WAWebSocketModel').Socket.takeover()").catch(() => {}), 1500);
    } else if (['TOS_BLOCK', 'SMB_TOS_BLOCK', 'PROXYBLOCK', 'DEPRECATED_VERSION'].includes(st)) {
      this.emit('wa', { type: 'error', text: 'O WhatsApp Web recusou a conexão: ' + st + '. Use /web para ver a página.' });
    } else if (st === 'TIMEOUT') {
      this.info('Conexão instável com o WhatsApp (TIMEOUT), aguardando...');
    }
  }

  // se o QR interno não veio, pega o desenho do QR da própria página
  async qrFallback() {
    if (this.ready || !this.win || this.win.isDestroyed()) return;
    if (this.lastQr && Date.now() - this.lastQr < 30000) return;
    try {
      const url = await this.exec("(() => { const c = document.querySelector('canvas[aria-label], div[data-ref] canvas, canvas'); return c ? c.toDataURL() : null; })()");
      if (url) { this.lastQr = Date.now(); this.emit('wa', { type: 'qr', dataUrl: url }); return; }
    } catch {}
    this.emit('wa', { type: 'info', text: 'Não consegui capturar o QR code. Digite /web para abrir a tela do WhatsApp Web e escanear por lá.' });
  }

  async onSynced() {
    if (this.ready || !this.win) return;
    try {
      const has = await this.exec("typeof window.WWebJS !== 'undefined'");
      if (!has) await this.exec(`(${LoadUtils.toString()})()`);
      const r = await this.exec(`(${CWBridge.toString()})()`);
      this.log('bridge', r);
      this.ready = true;
      this.me = await this.call('me');
      await this.refreshChats();
      this.setState('online');
      this.startHeartbeat();
      if (this.win.isVisible() && this.webShownForQr) { this.win.hide(); this.webShownForQr = false; }
    } catch (e) {
      this.log('erro ao preparar', e.stack || e.message);
      this.emit('wa', { type: 'error', text: 'Erro ao preparar o WhatsApp Web: ' + e.message + ' (use /web para ver a página)' });
    }
  }

  startHeartbeat() {
    clearInterval(this._hb);
    let misses = 0, n = 0;
    this._hb = setInterval(async () => {
      if (!this.win || this.win.isDestroyed() || !this.ready) return;
      const t = Date.now();
      const r = await Promise.race([this.exec('window.CW ? window.CW.health() : null').catch(() => null), sleep(10000).then(() => 'timeout')]);
      if (r === 'timeout' || r === null) {
        misses++;
        this.log('heartbeat falhou', misses, r);
        if (misses >= 2) {
          misses = 0;
          this.emit('wa', { type: 'info', text: 'O WhatsApp Web parou de responder — recarregando...' });
          this.ready = false;
          this.win.webContents.reloadIgnoringCache();
        }
        return;
      }
      misses = 0;
      if (++n % 10 === 1) this.log('saúde', JSON.stringify(r), 'resposta em', Date.now() - t, 'ms');
      if (r.state && r.state !== 'CONNECTED') this.log('socket não conectado:', r.state);
    }, 30000);
  }

  async refreshChats() {
    try { this.chats = await this.call('chats'); this.emit('wa', { type: 'chats', chats: this.listChats() }); } catch (e) { this.log('chats', e.message); }
  }

  onEvt(type, d) {
    switch (type) {
      case 'state':
        this.log('socket', d);
        this.onSocketState(d);
        if (d === 'CONNECTED' && !this.ready) setTimeout(() => this.exec("!!window.require('WAWebSocketModel').Socket.hasSynced").then((s) => s && this.onSynced()).catch(() => {}), 1500);
        break;
      case 'synced': this.onSynced(); break;
      case 'qr':
        this.lastQr = Date.now();
        QRCode.toDataURL(d, { margin: 1, scale: 5 }).then((dataUrl) => this.emit('wa', { type: 'qr', dataUrl })).catch(() => this.qrFallback());
        break;
      case 'qr-fallback': this.log('qr interno falhou', d); this.qrFallback(); break;
      case 'message': {
        if (d.fromMe && this.pendingLocal) {
          const k = d.chat + '|' + (d.text || '');
          const loc = this.pendingLocal.get(k);
          if (loc) { this.pendingLocal.delete(k); this.emit('wa', { type: 'msg-id', chat: d.chat, oldId: loc, newId: d.id }); this.log('msg enviada (confirmada)', d.chat); break; }
        }
        this.log('msg', d.fromMe ? 'enviada' : 'recebida', d.chat, d.alt !== d.chat ? '(alt ' + d.alt + ')' : '', d.kind);
        const c = this.chats.find((x) => x.id === d.chat || x.id === d.alt);
        if (c) { c.ts = d.ts; if (!d.fromMe) c.unread = (c.unread || 0) + 1; } else this.chats.unshift({ id: d.chat, name: d.chatName, group: d.group, ts: d.ts, unread: 1, size: 0, topic: '' });
        this.appendLog(d);
        this.emit('wa', { type: 'message', msg: d });
        break;
      }
      case 'gp2': this.onGp2(d); break;
      case 'dbg': this.log('motor', d); break;
      case 'revoke': case 'edit': case 'reaction': case 'presence': case 'call':
        this.emit('wa', { type, ...d });
        break;
      case 'chats-changed':
        clearTimeout(this._chatsT); this._chatsT = setTimeout(() => this.refreshChats(), 2000);
        break;
    }
  }

  async onGp2(e) {
    const old = this.groups.get(e.chat);
    let group = null;
    try { group = await this.call('group', e.chat); if (group) this.groups.set(e.chat, group); } catch {}
    const map = { add: 'add', invite: 'add', linked_group_join: 'add', remove: 'remove', leave: 'remove', promote: 'promote', demote: 'demote', subject: 'subject', description: 'topic' };
    const kind = map[e.subtype];
    if (!kind) { if (group) this.emit('wa', { type: 'group', group }); return; }
    const ev = { type: 'group-event', chat: e.chat, kind, nick: e.nick, authorId: e.subtype === 'leave' ? (e.targets[0]?.id || e.sender) : e.sender, targets: e.targets, group };
    if (kind === 'subject') { ev.from = old?.subject || e.chatName; ev.text = e.text || group?.subject || ''; }
    if (kind === 'topic') ev.text = group?.desc ?? e.text ?? '';
    if (e.subtype === 'leave' && !e.targets.length) ev.targets = [{ id: e.sender, nick: e.nick }];
    this.emit('wa', ev);
  }

  appendLog(e) {
    try {
      const t = new Date(e.ts * 1000).toTimeString().slice(0, 8);
      const name = (e.group ? '#' : '') + String(e.chatName || num(e.chat)).replace(/[\\/:*?"<>|]/g, '_');
      const body = e.kind === 'media' ? `[${e.media}] ${e.caption || e.fileName || ''}` : e.text;
      fs.appendFileSync(path.join(this.logDir, name + '.log'), (e.kind === 'action' ? `[${t}] * ${e.nick} ${body}` : `[${t}] <${e.nick}> ${body}`) + '\r\n');
    } catch {}
  }

  showWeb() {
    if (!this.win || this.win.isDestroyed()) throw new Error('Use /server primeiro');
    this.win.show(); this.win.focus();
  }
  async disconnect() {
    clearInterval(this._hb);
    if (this.win && !this.win.isDestroyed()) { this.closing = true; this.win.destroy(); this.closing = false; }
    this.win = null; this.ready = false;
    this.setState('offline', { reason: 'Desconectado pelo usuário' });
  }
  async logout() {
    try { if (this.ready) await this.call('logout'); } catch {}
    await this.disconnect();
    try { await session.fromPartition(PARTITION).clearStorageData(); } catch {}
    this.me = null;
    this.setState('offline', { reason: 'Sessão encerrada' });
  }
  flush() {}

  // ---------------- API usada pela interface ----------------
  listChats() { return [...this.chats].sort((a, b) => (b.ts || 0) - (a.ts || 0)); }
  contactList() { return this.chats.filter((c) => !c.group).map((c) => ({ id: c.id, nick: c.name })); }
  async contactsAll() { return this.ready ? this.call('contacts') : []; }
  async history_(jid) { return this.ready ? this.call('history', jid, 80) : []; }
  async getGroup(jid) { const g = await this.call('group', jid); if (g) this.groups.set(jid, g); return g; }
  async send(jid, text, quotedId) {
    const mentions = [...text.matchAll(/@(\d{6,})/g)].map((m) => m[1] + '@c.us');
    const e = await this.call('send', jid, text, quotedId || null, mentions);
    this.log('send', jid, e ? (e.local ? 'enviada (eco local)' : 'ok ' + e.chat) : 'sem retorno');
    if (e?.local) { this.pendingLocal = this.pendingLocal || new Map(); this.pendingLocal.set(e.chat + '|' + text, e.id); }
    if (e) this.appendLog(e);
    return e;
  }
  async sendFile(jid, file, caption = '') {
    const ext = path.extname(file).slice(1).toLowerCase();
    const buf = fs.readFileSync(file);
    if (buf.length > 100 * 1024 * 1024) throw new Error('arquivo maior que 100 MB');
    return this.call('sendFile', jid, { mimetype: MIME[ext] || 'application/octet-stream', data: buf.toString('base64'), filename: path.basename(file), filesize: buf.length }, caption);
  }
  async download(_jid, id) {
    const r = await this.call('download', id);
    const mime = String(r.mimetype || '').split(';')[0];
    let name = r.filename || `${r.type || 'midia'}_${new Date((r.t || Date.now() / 1000) * 1000).toISOString().slice(0, 19).replace(/[:T]/g, '-')}${EXT[mime] || ''}`;
    name = name.replace(/[\\/:*?"<>|]/g, '_');
    const dir = path.join(this.downloadDir, 'Recebidos');
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, name);
    fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
    return out;
  }
  async mediaData() { return null; }
  async markRead(jid) { const c = this.chats.find((x) => x.id === jid); if (c) c.unread = 0; if (this.ready) await this.call('seen', jid); }
  async whois(jid) { return this.call('whois', jid); }
  async pic(jid) { if (!this.ready) return null; try { const u = await this.call('pic', jid); if (!u) return null; const { net } = await import('electron'); const r = await net.fetch(u); if (!r.ok) return null; const b = Buffer.from(await r.arrayBuffer()); return 'data:' + (r.headers.get('content-type') || 'image/jpeg') + ';base64,' + b.toString('base64'); } catch { return null; } }
  async resolveNumber(n) { return this.call('exists', String(n).replace(/\D/g, '')); }
  async presence(jid, type) {
    if (!this.ready) return;
    if (type === 'composing') return this.call('chatstate', jid, 'typing');
    if (type === 'paused') return this.call('chatstate', jid, 'stop');
    return this.call('presence', type);
  }
  async subscribe(jid) { if (this.ready) return this.call('watch', jid); }
  async groupAction(jid, action, ids) { return this.call('groupAction', jid, action, ids); }
  async setSubject(jid, s) { return this.call('subject', jid, s); }
  async setDesc(jid, s) { return this.call('desc', jid, s); }
  async leave(jid) { return this.call('leave', jid); }
  async invite(jid) { return 'https://chat.whatsapp.com/' + (await this.call('invite', jid)); }
  async setName(n) { await this.call('setName', n); if (this.me) this.me.name = n; }
  async setStatus(s) { return this.call('setStatus', s); }
}
