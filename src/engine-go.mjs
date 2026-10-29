// Motor "whatsmeow": um executável em Go (bin/cw-engine.exe) fala o protocolo do
// WhatsApp diretamente (sem WhatsApp Web escondido). Este módulo conversa com ele por
// JSON em stdin/stdout e guarda conversas/histórico localmente.
import { app, net } from 'electron';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_CAP = 400;
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'application/pdf': '.pdf' };
const MIMEOF = Object.fromEntries(Object.entries({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'application/pdf': '.pdf' }).map(([k, v]) => [v, k]));
const num = (j) => String(j || '').split('@')[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function binPath() {
  if (process.env.CW_ENGINE_BIN) return process.env.CW_ENGINE_BIN;
  const exe = process.platform === 'win32' ? 'cw-engine.exe' : 'cw-engine';
  const cands = [
    path.join(process.resourcesPath || '', 'bin', exe),
    path.join(__dirname, '..', 'bin', exe)
  ];
  return cands.find((p) => fs.existsSync(p)) || cands[cands.length - 1];
}

export class WhatsAppGo extends EventEmitter {
  constructor(dataDir, downloadDir) {
    super();
    this.dataDir = dataDir;
    this.goDir = path.join(dataDir, 'whatsmeow');
    this.downloadDir = downloadDir;
    this.logDir = path.join(dataDir, 'logs');
    this.histDir = path.join(dataDir, 'history-go');
    for (const d of [this.goDir, this.logDir, this.histDir]) fs.mkdirSync(d, { recursive: true });
    this.debugLog = path.join(this.logDir, 'conexao.log');
    this.state = 'offline';
    this.me = null;
    this.ready = false;
    this.proc = null;
    this.pending = new Map();
    this.seq = 0;
    this.chats = new Map();
    this.history = new Map();
    this.dirty = new Set();
    this.pendingReacts = new Map();
    this.loadStore();
    setInterval(() => this.flush(), 5000);
  }

  log(...a) { try { fs.appendFileSync(this.debugLog, `[${new Date().toISOString()}] [go] ${a.join(' ')}\r\n`); } catch {} }
  setState(s, extra = {}) { this.state = s; this.log('estado', s, extra.reason || ''); this.emit('wa', { type: 'state', state: s, me: this.me, ...extra }); }
  hasSession() { return fs.existsSync(path.join(this.goDir, 'whatsmeow.db')); }

  // ---------------- persistência local ----------------
  storeFile() { return path.join(this.dataDir, 'store-go.json'); }
  loadStore() {
    try { const s = JSON.parse(fs.readFileSync(this.storeFile(), 'utf8')); for (const c of s.chats || []) this.chats.set(c.id, c); } catch {}
  }
  flush() {
    try { fs.writeFileSync(this.storeFile(), JSON.stringify({ chats: [...this.chats.values()] })); } catch {}
    for (const jid of this.dirty) { try { fs.writeFileSync(this.histFile(jid), JSON.stringify(this.history.get(jid) || [])); } catch {} }
    this.dirty.clear();
  }
  histFile(jid) { return path.join(this.histDir, jid.replace(/[^a-z0-9@._-]/gi, '_') + '.json'); }
  getHistory(jid) {
    if (!this.history.has(jid)) {
      let h = [];
      try { h = JSON.parse(fs.readFileSync(this.histFile(jid), 'utf8')); } catch {}
      this.history.set(jid, h);
    }
    return this.history.get(jid);
  }
  applyReaction(o, d) {
    o.reactions = o.reactions || {};
    const key = d.fromMe ? 'me' : (d.sender || d.nick || '?');
    if (d.emoji) o.reactions[key] = { nick: d.nick || '', emoji: d.emoji, fromMe: !!d.fromMe }; else delete o.reactions[key];
    this.dirty.add(o.chat);
  }
  store(e) {
    const h = this.getHistory(e.chat);
    if (h.some((x) => x.id === e.id)) return false;
    const pk = e.chat + '|' + e.id;
    if (this.pendingReacts.has(pk)) { for (const d of this.pendingReacts.get(pk)) this.applyReaction(e, d); this.pendingReacts.delete(pk); }
    h.push(e);
    if (h.length > 1 && h[h.length - 2].ts > e.ts) h.sort((a, b) => a.ts - b.ts);
    if (h.length > HISTORY_CAP) h.splice(0, h.length - HISTORY_CAP);
    this.dirty.add(e.chat);
    const c = this.chats.get(e.chat) || { id: e.chat, group: !!e.group, unread: 0, ts: 0 };
    if (e.group && e.chatName) c.name = e.chatName;
    if (!e.group && !e.fromMe && e.nick && !c.name) c.name = e.nick;
    c.ts = Math.max(c.ts || 0, e.ts || 0);
    this.chats.set(e.chat, c);
    return true;
  }
  pub(e) { if (!e) return e; const { raw, senderRaw, ...rest } = e; return rest; }

  // ---------------- processo Go ----------------
  start() {
    if (this.proc) return;
    const bin = binPath();
    this.log('iniciando motor', bin);
    const isJs = bin.endsWith('.js');
    const p = (this.proc = spawn(isJs ? process.execPath : bin, isJs ? [bin] : [], { env: isJs ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : process.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }));
    let buf = '';
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        let m; try { m = JSON.parse(line); } catch { this.log('saída inválida', line.slice(0, 200)); continue; }
        if (m.event) this.onEvt(m.event, m.data || {});
        else if (m.id && this.pending.has(m.id)) { const { res, rej, t } = this.pending.get(m.id); clearTimeout(t); this.pending.delete(m.id); m.ok ? res(m.data) : rej(new Error(m.error)); }
      }
    });
    p.stderr.on('data', (d) => this.log('stderr', String(d).trim().slice(0, 500)));
    p.on('error', (e) => { this.log('erro ao iniciar motor', e.message); this.emit('wa', { type: 'error', text: 'Não consegui iniciar o motor (cw-engine): ' + e.message }); });
    p.on('exit', (code) => {
      this.log('motor saiu', code);
      this.proc = null; this.ready = false;
      for (const { rej, t } of this.pending.values()) { clearTimeout(t); rej(new Error('motor encerrado')); }
      this.pending.clear();
      if (!this.quitting) {
        this.setState('offline', { reason: 'o motor parou (código ' + code + ')' });
        if (this.wantOnline) setTimeout(() => this.connect({}), 3000);
      }
    });
  }
  call(cmd, args = {}, timeout = 60000) {
    if (!this.proc) return Promise.reject(new Error('Não conectado'));
    const id = ++this.seq;
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.pending.delete(id); rej(new Error('tempo esgotado (' + cmd + ')')); }, timeout);
      this.pending.set(id, { res, rej, t });
      this.proc.stdin.write(JSON.stringify({ id, cmd, args }) + '\n');
    });
  }

  async connect({ pairingNumber } = {}) {
    this.wantOnline = true;
    this.start();
    clearTimeout(this.retryT);
    try {
      await this.call('connect', { dataDir: this.goDir, pairPhone: pairingNumber ? String(pairingNumber).replace(/\D/g, '') : '' }, 90000);
      this.retries = 0;
    } catch (e) {
      this.log('falha ao conectar', e.message);
      this.retries = (this.retries || 0) + 1;
      const s = Math.min(60, 3 * 2 ** Math.min(this.retries - 1, 4));
      this.setState('offline', { reason: e.message });
      this.emit('wa', { type: 'retry', seconds: s });
      this.retryT = setTimeout(() => { if (this.wantOnline) this.connect({}); }, s * 1000);
    }
  }
  async disconnect() {
    this.wantOnline = false;
    clearTimeout(this.retryT);
    try { await this.call('disconnect', {}, 5000); } catch {}
    this.ready = false;
    this.setState('offline', { reason: 'Desconectado pelo usuário' });
  }
  async logout() {
    this.wantOnline = false;
    try { await this.call('logout', {}, 15000); } catch {}
    this.ready = false; this.me = null;
    this.quitting = true; try { this.proc?.kill(); } catch {} this.proc = null; this.quitting = false;
    try { fs.rmSync(path.join(this.goDir, 'whatsmeow.db'), { force: true }); fs.rmSync(path.join(this.goDir, 'whatsmeow.db-wal'), { force: true }); fs.rmSync(path.join(this.goDir, 'whatsmeow.db-shm'), { force: true }); } catch {}
    this.setState('offline', { reason: 'Sessão encerrada' });
  }
  shutdown() { this.quitting = true; this.flush(); try { this.proc?.stdin.end(); setTimeout(() => this.proc?.kill(), 1500); } catch {} }

  // ---------------- eventos do motor ----------------
  onEvt(type, d) {
    switch (type) {
      case 'state':
        if (d.state === 'online') {
          this.me = d.me;
          this.ready = true;
          this.setState('online');
        } else if (d.state === 'connecting') {
          this.ready = false;
          this.setState('connecting', { reason: d.reason });
        } else {
          this.ready = false;
          this.setState('offline', { reason: d.reason });
        }
        break;
      case 'qr':
        QRCode.toDataURL(d.code, { margin: 1, scale: 5 }).then((dataUrl) => this.emit('wa', { type: 'qr', dataUrl }));
        break;
      case 'pairing': case 'info': case 'error': case 'loggedOut': case 'call': case 'presence':
        if (type === 'error' || type === 'info') this.log(type, d.text);
        this.emit('wa', { type, ...d });
        break;
      case 'message': {
        const isNew = this.store(d);
        if (!isNew) break;
        const c = this.chats.get(d.chat);
        if (c && !d.fromMe) c.unread = (c.unread || 0) + 1;
        this.appendLog(d);
        this.log('msg', d.fromMe ? 'enviada' : 'recebida', d.chat, d.kind);
        this.emit('wa', { type: 'message', msg: this.pub(d) });
        break;
      }
      case 'history': {
        let n = 0;
        for (const e of d.messages || []) if (this.store(e)) n++;
        this.log('histórico', n, 'mensagens');
        break;
      }
      case 'chats':
        for (const c of d || []) {
          const old = this.chats.get(c.id) || {};
          const merged = { ...old, ...Object.fromEntries(Object.entries(c).filter(([, v]) => v !== '' && v != null)) };
          merged.ts = Math.max(Number(old.ts || 0), Number(c.ts || 0));
          if (!merged.name) merged.name = old.name || '';
          this.chats.set(c.id, merged);
        }
        this.emit('wa', { type: 'chats', chats: this.listChats() });
        break;
      case 'sync':
        this.emit('wa', { type: 'sync', progress: d.progress, chats: this.listChats() });
        break;
      case 'revoke':
        this.emit('wa', { type: 'revoke', ...d });
        break;
      case 'edit': {
        const h = this.getHistory(d.chat);
        const o = h.find((x) => x.id === d.id);
        if (o) { o.text = d.text; o.edited = true; this.dirty.add(d.chat); }
        this.emit('wa', { type: 'edit', ...d });
        break;
      }
      case 'reaction': {
        // guarda a reação na mensagem (aparece mesmo se a janela abrir depois); se a mensagem ainda não chegou, espera por ela
        const o = this.getHistory(d.chat).find((x) => x.id === d.targetId);
        if (o) this.applyReaction(o, d);
        else { const k = d.chat + '|' + d.targetId; const l = this.pendingReacts.get(k) || []; l.push(d); this.pendingReacts.set(k, l); if (this.pendingReacts.size > 5000) this.pendingReacts.delete(this.pendingReacts.keys().next().value); }
        if (d.live !== false) this.emit('wa', { type: 'reaction', ...d, target: o ? String(o.text || o.caption || '').slice(0, 40) : '' });
        break;
      }
      case 'group': this.emit('wa', { type: 'group', group: d }); break;
      case 'group-event': this.emit('wa', { type: 'group-event', ...d }); break;
    }
  }

  appendLog(e) {
    try {
      const t = new Date(e.ts * 1000).toTimeString().slice(0, 8);
      const name = (e.group ? '#' : '') + String(e.chatName || this.chats.get(e.chat)?.name || num(e.chat)).replace(/[\\/:*?"<>|]/g, '_');
      const body = e.kind === 'media' ? `[${e.media}] ${e.caption || e.fileName || ''}` : e.text;
      fs.appendFileSync(path.join(this.logDir, name + '.log'), (e.kind === 'action' ? `[${t}] * ${String(body).toLowerCase().startsWith(String(e.nick).toLowerCase() + ' ') ? body : e.nick + ' ' + body}` : `[${t}] <${e.nick}> ${body}`) + '\r\n');
    } catch {}
  }

  // ---------------- API usada pela interface ----------------
  listChats() {
    return [...this.chats.values()]
      .filter((c) => c.id && !/@(broadcast|newsletter)$/.test(c.id))
      .map((c) => ({ id: c.id, name: c.name || (c.group ? num(c.id) : '+' + num(c.id)), group: !!c.group || c.id.endsWith('@g.us'), unread: c.unread || 0, ts: Number(c.ts || 0), size: c.size || 0, topic: c.topic || '' }))
      .sort((a, b) => b.ts - a.ts);
  }
  contactList() { return this.listChats().filter((c) => !c.group).map((c) => ({ id: c.id, nick: c.name })); }
  async contactsAll() { return this.ready ? this.call('contacts') : []; }
  async history_(jid) { return this.getHistory(jid).map((e) => this.pub(e)); }
  async getGroup(jid) {
    const g = await this.call('group', { jid });
    const c = this.chats.get(jid) || { id: jid, group: true };
    Object.assign(c, { name: g.subject, size: g.participants.length, topic: g.desc, group: true });
    this.chats.set(jid, c);
    return g;
  }
  async send(jid, text, quotedId) {
    const args = { jid, text };
    if (quotedId) {
      const q = this.getHistory(jid).find((x) => x.id === quotedId);
      if (q) Object.assign(args, { quoteId: q.id, quoteSender: q.fromMe ? this.me?.id : (q.senderRaw || q.sender), quoteRaw: q.raw || '' });
    }
    const mentions = [...text.matchAll(/@(\d{6,})/g)].map((m) => m[1] + '@s.whatsapp.net');
    if (mentions.length) args.mentions = mentions;
    const e = await this.call('send', args);
    if (e) { this.store(e); this.appendLog(e); this.log('send ok', jid); }
    return this.pub(e);
  }
  async sendFile(jid, file, caption = '') {
    const e = await this.call('sendFile', { jid, path: file, caption }, 300000);
    if (e) { this.store(e); this.appendLog(e); }
    return this.pub(e);
  }
  async download(jid, id) {
    const e = this.getHistory(jid).find((x) => x.id === id);
    if (!e?.raw) throw new Error('Mídia não disponível');
    const r = await this.call('download', { raw: e.raw }, 300000);
    const mime = String(r.mimetype || '').split(';')[0];
    let name = r.filename || e.fileName || `${e.media || 'midia'}_${new Date(e.ts * 1000).toISOString().slice(0, 19).replace(/[:T]/g, '-')}${EXT[mime] || ''}`;
    name = name.replace(/[\\/:*?"<>|]/g, '_');
    const dir = path.join(this.downloadDir, 'Recebidos');
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, name);
    fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
    return out;
  }
  // mídia para mostrar no chat: baixa uma vez para media-cache/ e devolve uma URL cwmedia://
  async mediaData(jid, id) {
    const e = this.getHistory(jid).find((x) => x.id === id);
    if (!e?.raw) return null;
    const dir = path.join(this.dataDir, 'media-cache');
    fs.mkdirSync(dir, { recursive: true });
    const safe = String(id).replace(/[^a-z0-9_-]/gi, '_');
    const hit = fs.readdirSync(dir).find((f) => f.startsWith(safe + '.'));
    const mk = (f) => ({ mime: MIMEOF[path.extname(f)] || '', url: 'cwmedia://m/' + encodeURIComponent(f) });
    if (hit) return mk(hit);
    if ((e.size || 0) > 64 * 1024 * 1024) return null;
    const r = await this.call('download', { raw: e.raw }, 300000);
    const mime = String(r.mimetype || e.mimetype || '').split(';')[0];
    const f = safe + (EXT[mime] || '.bin');
    fs.writeFileSync(path.join(dir, f), Buffer.from(r.data, 'base64'));
    return mk(f);
  }
  async markRead(jid) {
    const c = this.chats.get(jid); if (c) c.unread = 0;
    if (!this.ready) return;
    const inc = this.getHistory(jid).filter((x) => !x.fromMe).slice(-10);
    if (!inc.length) return;
    const bySender = new Map();
    for (const m of inc) { const k = jid.endsWith('@g.us') ? (m.senderRaw || m.sender) : ''; if (!bySender.has(k)) bySender.set(k, []); bySender.get(k).push(m.id); }
    for (const [sender, ids] of bySender) { try { await this.call('read', { jid, ids, sender }); } catch (e) { this.log('read falhou', e.message); } }
  }
  async whois(jid) { return this.call('whois', { jid }); }
  async pic(jid) {
    if (!this.ready) return null;
    try {
      const u = await this.call('pic', { jid });
      if (!u) return null;
      const r = await net.fetch(u);
      if (!r.ok) return null;
      return 'data:' + (r.headers.get('content-type') || 'image/jpeg') + ';base64,' + Buffer.from(await r.arrayBuffer()).toString('base64');
    } catch { return null; }
  }
  async resolveNumber(n) { return this.call('exists', { number: String(n) }); }
  async presence(jid, type) {
    if (!this.ready) return;
    if (type === 'composing' || type === 'paused') return this.call('chatstate', { jid, state: type });
    return this.call('presence', { type });
  }
  async subscribe(jid) { if (this.ready) return this.call('subscribe', { jid }).catch(() => {}); }
  async groupAction(jid, action, ids) { return this.call('groupAction', { jid, action, ids }); }
  async setSubject(jid, text) { return this.call('subject', { jid, text }); }
  async setDesc(jid, text) { return this.call('desc', { jid, text }); }
  async leave(jid) { return this.call('leave', { jid }); }
  async invite(jid) { return this.call('invite', { jid }); }
  async setName(text) { await this.call('setName', { text }); if (this.me) this.me.name = text; }
  async setStatus(text) { return this.call('setStatus', { text }); }
  showWeb() { throw new Error('O motor whatsmeow não usa WhatsApp Web. Para usar o modo antigo: Ferramentas > Opções > Motor.'); }
}
