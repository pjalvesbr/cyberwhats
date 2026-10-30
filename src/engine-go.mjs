// Motor "whatsmeow": um executável em Go (bin/cw-engine.exe) fala o protocolo do
// WhatsApp diretamente (sem WhatsApp Web escondido). Este módulo conversa com ele por
// JSON em stdin/stdout e guarda conversas/histórico localmente.
import { app, net } from 'electron';
import { linkPreview } from './linkpreview.mjs';
import crypto from 'node:crypto';
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
    this.pendingVotes = new Map();
    this.stickDir = path.join(dataDir, 'stickers');
    this.mineDir = path.join(this.stickDir, 'minhas');
    try { this.favs = JSON.parse(fs.readFileSync(path.join(this.stickDir, 'favoritas.json'), 'utf8')); } catch { this.favs = {}; }
    this.getCfg = () => ({});
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
  // voto de enquete: os hashes (sha256 do nome da opção) viram os nomes das opções
  applyVote(o, d) {
    if (!o.poll) return;
    const byHash = new Map((o.poll.options || []).map((n) => [crypto.createHash('sha256').update(n).digest('hex'), n]));
    const key = d.fromMe ? 'me' : (d.sender || d.nick || '?');
    const prev = o.poll.votes?.[key];
    if (prev && prev.ts && d.ts && prev.ts > d.ts) return; // voto mais antigo chegando depois
    o.poll.votes = o.poll.votes || {};
    const opts = (d.options || (d.hashes || []).map((h) => byHash.get(h)).filter(Boolean));
    if (opts.length) o.poll.votes[key] = { nick: d.nick || '', options: opts, fromMe: !!d.fromMe, ts: d.ts || 0 }; else delete o.poll.votes[key];
    this.dirty.add(o.chat);
  }
  store(e) {
    const h = this.getHistory(e.chat);
    if (h.some((x) => x.id === e.id)) return false;
    const pk = e.chat + '|' + e.id;
    if (this.pendingReacts.has(pk)) { for (const d of this.pendingReacts.get(pk)) this.applyReaction(e, d); this.pendingReacts.delete(pk); }
    if (this.pendingVotes.has(pk)) { for (const d of this.pendingVotes.get(pk)) this.applyVote(e, d); this.pendingVotes.delete(pk); }
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
      case 'sticker-fav': {
        if (d.fav) this.favs[d.key || d.raw.slice(-40)] = { raw: d.raw, w: d.w, h: d.h, ts: d.ts || 0, hash: d.hash || '', hasKey: d.hasKey !== false };
        else delete this.favs[d.key];
        clearTimeout(this._favT);
        this._favT = setTimeout(() => { try { fs.mkdirSync(this.stickDir, { recursive: true }); fs.writeFileSync(path.join(this.stickDir, 'favoritas.json'), JSON.stringify(this.favs)); } catch {} this.emit('wa', { type: 'stickers' }); }, 800);
        break;
      }
      case 'poll-vote': {
        const o = this.getHistory(d.chat).find((x) => x.id === d.pollId);
        if (o) this.applyVote(o, d);
        else { const k = d.chat + '|' + d.pollId; const l = this.pendingVotes.get(k) || []; l.push(d); this.pendingVotes.set(k, l); if (this.pendingVotes.size > 2000) this.pendingVotes.delete(this.pendingVotes.keys().next().value); }
        if (o && d.live !== false) this.emit('wa', { type: 'poll', chat: d.chat, id: d.pollId, poll: o.poll, nick: d.nick, fromMe: d.fromMe, voted: (o.poll.votes?.[d.fromMe ? 'me' : d.sender]?.options) || [] });
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

  // busca em todos os históricos (e nos logs, para o que já saiu do histórico)
  search(q, max = 500) {
    const fold = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const nq = fold(q).trim(); if (!nq) return [];
    this.flush();
    const out = [], seen = new Set();
    let files = []; try { files = fs.readdirSync(this.histDir).filter((f) => f.endsWith('.json')); } catch {}
    for (const f of files) {
      const jid = f.slice(0, -5);
      const h = this.history.get(jid) || (() => { try { return JSON.parse(fs.readFileSync(path.join(this.histDir, f), 'utf8')); } catch { return []; } })();
      const c = this.chats.get(jid);
      for (const e of h) {
        const body = e.kind === 'media' ? [e.caption, e.fileName].filter(Boolean).join(' ') : e.text;
        if (!body || !fold(body).includes(nq)) continue;
        const chatName = e.chatName || c?.name || '';
        seen.add(fold(chatName + '|' + body).trim());
        out.push({ chat: jid, group: !!(e.group || c?.group), chatName, nick: e.nick || '', fromMe: !!e.fromMe, sender: e.sender || '', ts: e.ts || 0, id: e.id, text: body, mentions: e.mentions });
      }
    }
    // logs: o histórico guarda só as últimas mensagens de cada conversa
    let logs = []; try { logs = fs.readdirSync(this.logDir).filter((f) => f.endsWith('.log') && !/^(conexao|erros)\.log$/i.test(f)); } catch {}
    for (const f of logs) {
      let txt = ''; try { txt = fs.readFileSync(path.join(this.logDir, f), 'utf8'); } catch { continue; }
      if (!fold(txt).includes(nq)) continue;
      const name = f.slice(0, -4);
      const chatName = name.replace(/^#/, '');
      const chat = [...this.chats.values()].find((c) => (c.name || '').replace(/[\\/:*?"<>|]/g, '_') === chatName || num(c.id) === chatName);
      for (const ln of txt.split(/\r?\n/)) {
        const m = /^\[(\d\d:\d\d:\d\d)\] (?:<([^>]*)> |\* (\S+) )?([\s\S]*)$/.exec(ln);
        if (!m || !fold(m[4]).includes(nq)) continue;
        if (seen.has(fold(chatName + '|' + m[4]).trim())) continue;
        out.push({ chat: chat?.id || '', group: name.startsWith('#'), chatName, nick: m[2] || m[3] || '', ts: 0, time: m[1], log: f, text: m[4] });
      }
    }
    out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return out.slice(0, max);
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
    // prévia do link para quem recebe (título/descrição/miniatura), se der tempo de buscar
    const url = this.getCfg().linkPreviews !== false && (/https?:\/\/[^\s]+/i.exec(text) || [])[0];
    if (url) { try { const lp = await linkPreview(url, { timeout: 3500 }); if (lp) args.link = { url, title: lp.title, desc: lp.desc, thumb: lp.thumb || '' }; } catch {} }
    const e = await this.call('send', args);
    if (e) { this.store(e); this.appendLog(e); this.log('send ok', jid); }
    return this.pub(e);
  }
  // ---------------- figurinhas: favoritas do WhatsApp, recebidas e as "minhas" (guardadas no PC)
  async listStickers() {
    const recv = [];
    let files = []; try { files = fs.readdirSync(this.histDir).filter((f) => f.endsWith('.json')); } catch {}
    for (const f of files) {
      const jid = f.slice(0, -5);
      const h = this.history.get(jid) || (() => { try { return JSON.parse(fs.readFileSync(path.join(this.histDir, f), 'utf8')); } catch { return []; } })();
      for (const e of h) if (e.media === 'Figurinha' && e.raw) recv.push({ kind: 'recv', chat: jid, id: e.id, ts: e.ts || 0, size: e.size || 0, raw: e.raw });
    }
    recv.sort((a, b) => b.ts - a.ts);
    // hash de cada figurinha recebida (guardado), para casar com as favoritas antigas que vêm sem chave
    if (!this.shaCache) { try { this.shaCache = JSON.parse(fs.readFileSync(path.join(this.stickDir, 'hashes.json'), 'utf8')); } catch { this.shaCache = {}; } }
    const miss = recv.filter((r) => !(r.id in this.shaCache));
    for (let i = 0; i < miss.length && this.ready; i += 300) {
      try { const r = await this.call('stickerShas', { items: miss.slice(i, i + 300).map((x) => ({ id: x.id, raw: x.raw })) }, 60000); for (const x of miss.slice(i, i + 300)) this.shaCache[x.id] = r?.[x.id] || ''; } catch { break; }
    }
    if (miss.length) { try { fs.mkdirSync(this.stickDir, { recursive: true }); fs.writeFileSync(path.join(this.stickDir, 'hashes.json'), JSON.stringify(this.shaCache)); } catch {} }
    const toHex = (v) => {
      v = String(v || '').trim(); if (!v) return '';
      if (/^[0-9a-f]{64}$/i.test(v)) return v.toLowerCase();
      try { const b = Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); return b.length === 32 ? b.toString('hex') : ''; } catch { return ''; }
    };
    const byHash = new Map();
    for (const r of recv) { const hx = toHex(this.shaCache[r.id]); if (hx && !byHash.has(hx)) byHash.set(hx, r); }
    const strip = ({ raw, ...x }) => x;
    this._favMatch = {};
    const favs = []; let hidden = 0;
    for (const [key, v] of Object.entries(this.favs).sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0))) {
      const m = byHash.get(toHex(key)) || byHash.get(toHex(v.hash));
      if (m) this._favMatch[key] = strip(m);
      if (v.hasKey !== false) favs.push({ kind: 'fav', key, w: v.w, h: v.h });
      else if (m) favs.push({ ...strip(m), fav: true });
      else hidden++;
    }
    const seen = new Set(); const bySize = new Set();
    const recvU = recv.filter((r) => { if (seen.has(r.id)) return false; seen.add(r.id); if (!r.size) return true; if (bySize.has(r.size)) return false; bySize.add(r.size); return true; }).slice(0, 150).map(strip);
    let mine = []; try { mine = fs.readdirSync(this.mineDir).filter((f) => /\.webp$/i.test(f)).map((f) => ({ kind: 'mine', file: f, ts: fs.statSync(path.join(this.mineDir, f)).mtimeMs })).sort((a, b) => b.ts - a.ts); } catch {}
    return { favs, recv: recvU, mine, hiddenFavs: hidden, stale: Object.values(this.favs).some((v) => !('hasKey' in v)) };
  }
  async refreshFavStickers() {
    // sincronização completa: a lista volta inteira, então começa do zero (e devolve a antiga se falhar)
    const old = this.favs; this.favs = {};
    try { await this.call('favStickers', {}, 120000); } catch (e) { if (!Object.keys(this.favs).length) this.favs = old; throw e; }
    try { fs.mkdirSync(this.stickDir, { recursive: true }); fs.writeFileSync(path.join(this.stickDir, 'favoritas.json'), JSON.stringify(this.favs)); } catch {}
    return Object.keys(this.favs).length;
  }
  // caminho local da figurinha (baixa se precisar)
  async stickerFile(src) {
    const dir = path.join(this.dataDir, 'media-cache');
    fs.mkdirSync(dir, { recursive: true });
    if (src.kind === 'tmp') { const f = path.join(this.dataDir, 'tmp', path.basename(src.file)); if (!fs.existsSync(f)) throw new Error('arquivo não encontrado'); return f; }
    if (src.kind === 'mine') { const f = path.join(this.mineDir, path.basename(src.file)); if (!fs.existsSync(f)) throw new Error('figurinha não encontrada'); return f; }
    if (src.kind === 'recv') { const r = await this.mediaData(src.chat, src.id); if (!r) throw new Error('figurinha não disponível'); return path.join(dir, decodeURIComponent(r.url.split('/').pop())); }
    const v = this.favs[src.key]; if (!v) throw new Error('figurinha não encontrada');
    const name = 'fav-' + crypto.createHash('sha1').update(src.key).digest('hex').slice(0, 16) + '.webp';
    const out = path.join(dir, name);
    if (!fs.existsSync(out)) {
      try { const r = await this.call('download', { raw: v.raw }, 120000); fs.writeFileSync(out, Buffer.from(r.data, 'base64')); }
      catch (e) { const m = this._favMatch?.[src.key]; if (m) return this.stickerFile(m); throw e; } // expirou no servidor: usa a cópia de uma conversa
    }
    return out;
  }
  async stickerUrl(src) {
    const f = await this.stickerFile(src);
    return src.kind === 'mine' ? 'cwmedia://s/' + encodeURIComponent(path.basename(f)) : 'cwmedia://m/' + encodeURIComponent(path.basename(f));
  }
  async sendSticker(jid, src) {
    const f = await this.stickerFile(src);
    const v = src.kind === 'fav' ? this.favs[src.key] : null;
    const isAnim = (() => { try { const b = fs.readFileSync(f); return b.includes(Buffer.from('ANIM')); } catch { return false; } })();
    const e = await this.call('sendSticker', { jid, path: f, w: v?.w || 512, h: v?.h || 512, animated: isAnim }, 120000);
    if (e) { this.store(e); this.appendLog(e); }
    return this.pub(e);
  }
  async addMineSticker(src) {
    const f = await this.stickerFile(src);
    fs.mkdirSync(this.mineDir, { recursive: true });
    const name = (src.id || src.key || Date.now()).toString().replace(/[^a-z0-9_-]/gi, '_').slice(0, 40) + '.webp';
    fs.copyFileSync(f, path.join(this.mineDir, name));
    return name;
  }
  saveMineSticker(bytes) {
    fs.mkdirSync(this.mineDir, { recursive: true });
    const name = 'cw-' + Date.now() + '.webp';
    fs.writeFileSync(path.join(this.mineDir, name), Buffer.from(bytes));
    return name;
  }
  removeMineSticker(file) { const f = path.join(this.mineDir, path.basename(String(file))); if (fs.existsSync(f)) fs.unlinkSync(f); return true; }
  async pollVote(jid, id, options) {
    const o = this.getHistory(jid).find((x) => x.id === id);
    if (!o?.poll) throw new Error('enquete não encontrada');
    await this.call('pollVote', { chat: o.alt || o.chat, sender: o.fromMe ? '' : (o.senderRaw || o.sender), id, fromMe: !!o.fromMe, options });
    this.applyVote(o, { fromMe: true, nick: this.me?.name || 'eu', options, ts: Math.floor(Date.now() / 1000) });
    if (!options.length) delete o.poll.votes?.me;
    return o.poll;
  }
  async sendPoll(jid, name, options, multi) {
    const e = await this.call('sendPoll', { jid, name, options, multi: !!multi });
    if (e) { this.store(e); this.appendLog(e); }
    return this.pub(e);
  }
  async sendFile(jid, file, caption = '', opts = {}) {
    const e = await this.call('sendFile', { jid, path: file, caption, ...(opts?.ptt ? { ptt: true, seconds: opts.seconds || 0, waveform: opts.waveform || '' } : {}) }, 300000);
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
