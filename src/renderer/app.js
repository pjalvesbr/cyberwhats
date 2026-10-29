/* CyberWhats 3.2 — interface estilo CyberScript 3.2 */
'use strict';
const { B, C, O, U, I, R, esc, codesToHtml, strip, waToCodes, codesToWa } = window.F;
const $ = (s, el = document) => el.querySelector(s);
const h = (tag, attrs = {}, html) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); } if (html != null) e.innerHTML = html; return e; };
const api = (ch, ...a) => window.cw.call(ch, ...a);
const pad = (n) => String(n).padStart(2, '0');
const hms = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const num = (jid) => (jid || '').split('@')[0];

// ---------------- estado ----------------
const S = {
  cfg: {}, me: null, conn: 'offline', away: null, wins: new Map(), order: [], active: null,
  maxed: true, chats: [], groups: new Map(), nickIdx: new Map(), awayReplied: new Set(),
  zTop: 10, tips: [], typingOut: new Map(), lastPvt: null, lag: null, lastInput: Date.now(), frases: []
};

// ---------------- theme "Padrão" (sistema/tema.cst) ----------------
const PRE = `${O}${U}${C}3>${O}${C}10>${C}1>${O}`;
const T = {
  pre: PRE,
  info: (t) => `${PRE} ${C}2${t}`,
  err: (t) => `${PRE} ${C}4${t}`,
  joinSelf: (ch) => `${PRE} ${C}2Agora falando no${C}12 ${ch}`,
  join: (n, a) => `${PRE} ${C}3Entrou: ${n} ${O}[${a}]`,
  part: (n, a, why) => `${PRE} ${C}3Saiu: ${n} ${O}[${a}]${why ? ` (${why}${O})` : ''}`,
  kick: (by, n) => `${PRE} ${C}3${by} kickou ${n} [${O}removido do grupo${O}]`,
  mode: (by, m) => `${PRE} ${C}3${by} define modo: ${m}`,
  topic: (by, t) => `${PRE} ${C}3${by} Mudou o topic para ${C}1"${t}${O}${C}1"`,
  subject: (by, from, to) => `${PRE} ${C}3${by} renomeou o canal ${from} para ${C}12${to}`,
  topicIs: (ch, t) => `${PRE} ${C}02Tópico do${C}12 ${ch} ${C}1"${t}${O}${C}1"`,
  topicBy: (by, when) => `${PRE} ${C}02Tópico posto por:${C}12 ${by} ${C}2em${C}12 ${when}`,
  notify: (n, a) => `${PRE} ${C}2Está no WhatsApp ${n} ${C}12${U}(${U}${C}02${a}${C}12${U})${U}`,
  unotify: (n, a) => `${PRE} ${C}2Saiu do WhatsApp ${n} ${C}12${U}(${U}${C}02${a}${C}12${U})${U}`,
  away: () => `${PRE} ${C}12${U}Away${U}:${C}02 você está marcado como away.`,
  back: () => `${PRE} ${C}12${U}back${U}:${C}02 você acabou de retornar do away.`,
  wrow: (k, v) => `${C}12${U}(${O}${C}2 ${k} ${C}12${U}):${O}${C}2 ${v}`,
  nickCol: (adm) => (adm === 'superadmin' ? '10' : adm === 'admin' ? '12' : '1'),
  nickMode: (adm) => (adm === 'superadmin' ? `${C}10.` : adm === 'admin' ? `${C}12@` : ''),
  textChan: (nick, adm, text, hl) => `${C}1<${C}${T.nickCol(adm)}${T.nickMode(adm)}${nick}${C}1>${O}${hl ? C + '5' : ''} ${text}`,
  textChanSelf: (nick, adm, text) => `${C}12<${C}02${T.nickMode(adm)}${C}02${nick}${C}12>${C}1 ${text}`,
  textQuery: (nick, text) => `${C}12<${C}1${nick}${C}12>${O} ${text}`,
  textQuerySelf: (nick, text) => `${C}12<${C}02${nick}${C}12>${C}1 ${text}`,
  action: (nick, text) => `${C}6* ${nick} ${text}`
};

// ---------------- sons (SOUNDS/ do CyberScript) ----------------
const SND = { pvt: 'pvt.wav', join: 'join.wav', notice: 'notice.wav', connect: 'conectar.wav', disconnect: 'desconectar.wav', online: 'online.wav', kick: 'kick.wav', op: 'ops.wav', error: 'erro.wav', start: 'start.mp3', msg: 'newmsg.wav' };
const audioPool = {};
function play(k) {
  if (!S.cfg.sounds || !SND[k]) return;
  try { const a = audioPool[k] || (audioPool[k] = new Audio('assets/sounds/' + SND[k])); a.currentTime = 0; a.volume = 0.6; a.play().catch(() => {}); } catch {}
}

// ---------------- nicks ----------------
const cleanNick = (n) => (n || '?').trim().replace(/\s+/g, '_').replace(/[,]/g, '');
const chanName = (subject) => '#' + (subject || 'grupo').trim().replace(/\s+/g, '_');
// apelidos locais (só no CyberWhats, não mudam nada no WhatsApp) — cfg.aliases { jid: apelido }
const alias = (jid) => (jid && S.cfg.aliases ? S.cfg.aliases[jid] : '') || '';
const myNick = () => cleanNick(alias(S.me?.id) || S.me?.name || 'eu');
const chanOf = (jid, subject) => (alias(jid) ? chanName(alias(jid)) : chanName(subject));
const nickFor = (jid, fallback) => cleanNick(alias(jid) || fallback);
function indexNick(nick, jid) { if (nick && jid && jid.endsWith('@s.whatsapp.net')) S.nickIdx.set(cleanNick(nick).toLowerCase(), jid); }
function findNick(q) {
  if (!q) return null;
  const k = q.toLowerCase().replace(/^[@.+]/, '');
  if (S.nickIdx.has(k)) return S.nickIdx.get(k);
  for (const [n, j] of S.nickIdx) if (n.startsWith(k)) return j;
  for (const [n, j] of S.nickIdx) if (n.includes(k)) return j;
  return null;
}
function findChan(q) {
  if (!q) return null;
  const k = q.toLowerCase().replace(/^#/, '').replace(/_/g, ' ');
  const groups = S.chats.filter((c) => c.group);
  const byAlias = groups.find((c) => alias(c.id) && alias(c.id).toLowerCase().replace(/_/g, ' ') === k);
  if (byAlias) return byAlias.id;
  return (groups.find((c) => c.name.toLowerCase() === k) || groups.find((c) => c.name.toLowerCase().startsWith(k)) || groups.find((c) => c.name.toLowerCase().includes(k)))?.id || null;
}

// ======================================================================
//  Janelas MDI
// ======================================================================
class Win {
  constructor(id, type, name, opts = {}) {
    this.id = id; this.type = type; this.name = name; this.jid = opts.jid || null;
    this.activity = null; this.lines = 0; this.nicks = []; this.hist = []; this.histPos = -1;
    this.quote = null; this.group = null;
    const el = this.el = h('div', { class: 'mdiwin' });
    const icon = { status: S.conn === 'online' ? 'online' : 'offline', channel: '85', query: 'query', list: '38', custom: 'custom' }[type] || 'cyber';
    this.iconName = icon;
    this.title = h('div', { class: 'mtitle' }, `<img src="${iconSrc(icon)}"><span class="mt"></span>`);
    for (const [k, g] of [['min', 'g-min'], ['max', 'g-max'], ['close', 'g-close']]) {
      const b = h('button', { class: 'cap' + (k === 'close' ? ' close' : '') }, `<span class="${g}"></span>`);
      b.addEventListener('mousedown', (e) => e.stopPropagation());
      b.addEventListener('click', () => (k === 'min' ? this.minimize() : k === 'max' ? setMaxed(!S.maxed, this) : this.close()));
      this.title.appendChild(b);
    }
    this.title.addEventListener('dblclick', () => setMaxed(!S.maxed, this));
    el.appendChild(this.title);
    this.body = h('div', { class: 'mbody' });
    el.appendChild(this.body);
    if (type !== 'list') this.buildChat();
    for (const d of ['e', 's', 'se']) { const r = h('div', { class: 'rs ' + d }); r.addEventListener('mousedown', (e) => startResize(e, this, d)); el.appendChild(r); }
    this.title.addEventListener('mousedown', (e) => startMove(e, this));
    // clicar no texto/nicklist não pode roubar o foco (senão a seleção some no meio do arrasto)
    el.addEventListener('mousedown', (e) => activate(this.id, !!e.target.closest('.buffer, .nicklist, .listview, .wbtns')));
    const n = S.order.length;
    Object.assign(el.style, { left: 20 * (n % 8) + 'px', top: 20 * (n % 8) + 'px', width: '70%', height: '70%' });
    $('#mdi').appendChild(el);
    this.sw = h('div', { class: 'sw', title: name }, `<img src="${iconSrc(icon)}"><span></span>`);
    this.sw.addEventListener('click', () => {
      // clicar de novo no botão da janela ativa volta para a janela anterior
      if (S.active === this.id && !this.el.classList.contains('min')) {
        if (S.prevActive && S.prevActive !== this.id && S.wins.has(S.prevActive)) activate(S.prevActive);
        else if (!S.maxed) this.minimize();
      } else activate(this.id);
    });
    this.sw.addEventListener('contextmenu', (e) => { e.preventDefault(); activate(this.id); popup(e, this.windowMenu()); });
    // Contatos Recentes fica sempre logo depois do Status na switchbar
    const stSw = S.wins.get('status')?.sw;
    if (id === 'recent' && stSw) stSw.after(this.sw); else $('#switchbar').appendChild(this.sw);
    if (S.maxed) el.classList.add('max');
    this.setTitle(name);
  }
  buildChat() {
    const B_ = {
      away: ['+Away', () => askRun('Away', 'Mensagem de away:', S.cfg.awayMessage || '', (v) => run('/away ' + v, this))],
      back: ['-Away', () => run('/back', this)],
      onotice: ['Link de convite', () => run('/convite', this)],
      protecao: ['Informações do grupo', () => cmdInfo(this)],
      limpar: ['Limpar', () => this.clear()],
      log: ['Ver Log', () => api('app:openLogs')],
      enviar: ['Enviar arquivo', () => run('/enviar', this)],
      ignorar: ['Ignorar', () => run('/ignore', this)],
      whois: ['Whois', () => run('/whois', this)],
      novostatus: ['Pasta de recebidos', () => api('app:openDownloads')],
      servidores: ['Conectar', () => run('/server', this)]
    };
    const btns = { channel: ['away', 'back', 'onotice', 'protecao', 'limpar', 'log'], query: ['away', 'back', 'enviar', 'ignorar', 'limpar', 'log', 'whois'],
      status: ['novostatus', 'servidores', 'limpar'], custom: ['limpar', 'log'] }[this.type] || [];
    const wb = h('div', { class: 'wbtns' });
    for (const img of btns) {
      const [tip, fn] = B_[img];
      const i = h('img', { src: `assets/btn/${img}.png`, title: tip, draggable: 'false' });
      i.addEventListener('mouseenter', () => (i.src = `assets/btn/${img}_b.png`));
      i.addEventListener('mouseleave', () => (i.src = `assets/btn/${img}.png`));
      i.addEventListener('click', fn);
      wb.appendChild(i);
    }
    const content = h('div', { class: 'content' });
    const bw = h('div', { class: 'bufwrap' });
    this.buf = h('div', { class: 'buffer' + (this.type === 'status' ? ' wm' : '') });
    bw.append(this.buf);
    if (this.type === 'query') {
      this.photo = h('img', { class: 'pvtphoto hidden', title: 'Foto do contato (clique para ampliar)', draggable: 'false' });
      this.photo.addEventListener('click', () => { if (this.photo.src) dialog({ title: 'Foto - ' + this.name, width: 460, body: `<img src="${this.photo.src}" style="display:block;width:420px;height:auto;margin:0 auto;border:1px solid #000">` }); });
      bw.appendChild(this.photo);
      bw.classList.add('has-photo');
    }
    if (btns.length) bw.appendChild(wb);
    content.appendChild(bw);
    this.buf.addEventListener('click', (e) => this.bufClick(e));
    this.buf.addEventListener('scroll', () => requestAnimationFrame(drawSelection));
    // igual ao IRC das antigas: selecionou e soltou o botão = copiado
    this.buf.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      if (e.detail > 1) return; // duplo-clique é tratado à parte
      const sel = window.getSelection();
      const t = sel ? sel.toString() : '';
      if (!t.trim() || !this.buf.contains(sel.anchorNode)) {
        // clique simples sem seleção: foco volta para a caixa de texto (igual ao IRC das antigas)
        if (!e.target.closest('a')) setTimeout(() => { if (!window.getSelection()?.toString()) this.edit?.focus(); }, 250);
        return;
      }
      copyText(t.replace(/\u00a0/g, ' ').replace(/\n{2,}/g, '\n').replace(/\s+$/, ''));
      sel.removeAllRanges();
      this.edit?.focus();
    });
    this.buf.addEventListener('dblclick', (e) => this.bufDbl(e));
    this.buf.addEventListener('scroll', () => { if (!S.maxed || S.active === this.id) this.atBottom = this.buf.scrollTop + this.buf.clientHeight >= this.buf.scrollHeight - 20; });
    this.buf.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      const ln = e.target.closest('.ln');
      const extra = ln?.dataset.id && this.jid ? [['Responder esta mensagem (citar)', () => this.quoteLine(ln)], ['Copiar linha', () => copyText(ln.textContent)], '-'] : [];
      const type = this.type === 'channel' ? 'channel' : this.type === 'query' ? 'query' : 'status';
      const selNick = this.nl?.querySelector('.nk.sel')?.dataset.nick || '';
      const sm = await scriptMenu(type, this, this.type === 'query' ? { args: [this.name] } : this.type === 'channel' ? { askArgs: 'Para quem? (nick)', askDefault: selNick } : {});
      popup(e, [...extra, ...(sm.length ? [...sm, '-'] : []), ...this.windowMenu()]);
    });
    if (this.type === 'channel') {
      const sp = h('div', { class: 'splitter' });
      this.nl = h('div', { class: 'nicklist' });
      this.nl.style.width = (S.cfg.nicklistWidth || 140) + 'px';
      sp.addEventListener('mousedown', (e) => startSplit(e, this));
      content.append(sp, this.nl);
      this.nl.addEventListener('dblclick', (e) => { const n = e.target.closest('.nk'); if (n) openQuery(n.dataset.jid, n.dataset.nick, true); });
      this.nl.addEventListener('mousedown', (e) => { const n = e.target.closest('.nk'); if (!n) return; this.nl.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel')); n.classList.add('sel'); });
      this.nl.addEventListener('contextmenu', async (e) => {
        e.preventDefault(); const n = e.target.closest('.nk'); if (!n) return;
        const sm = await scriptMenu('nicklist', this, { nick: n.dataset.nick, args: [n.dataset.nick] });
        popup(e, [...this.nickMenu(n.dataset.jid, n.dataset.nick), ...(sm.length ? ['-', ...sm] : [])]);
      });
    }
    this.body.appendChild(content);
    this.replyEl = h('div', { class: 'replying hidden' });
    this.body.appendChild(this.replyEl);
    this.edit = h('input', { class: 'edit', type: 'text', spellcheck: 'false' });
    this.edit.addEventListener('keydown', (e) => this.onKey(e));
    this.edit.addEventListener('input', () => this.onTyping());
    this.body.appendChild(this.edit);
    this.body.addEventListener('dragover', (e) => e.preventDefault());
    this.body.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!this.jid) return;
      for (const f of e.dataTransfer.files) sendFile(this, window.cw.filePath(f));
    });
  }
  setTitle(t) {
    this.fullTitle = t;
    $('.mt', this.title).textContent = t;
    $('span', this.sw).textContent = this.name;
    this.sw.title = t;
    if (S.active === this.id) updateAppTitle();
  }
  setIcon(name) { this.iconName = name; $('img', this.title).src = $('img', this.sw).src = iconSrc(name); }
  addDay(d, before) {
    const hoje = new Date(), ontem = new Date(Date.now() - 864e5);
    const dia = d.toLocaleDateString('pt-BR', { weekday: 'long' });
    const label = d.toDateString() === hoje.toDateString() ? 'Hoje' : d.toDateString() === ontem.toDateString() ? 'Ontem' : dia[0].toUpperCase() + dia.slice(1);
    const ln = h('div', { class: 'ln daysep' });
    ln.innerHTML = codesToHtml(`${C}14—————— ${label}, ${d.toLocaleDateString('pt-BR')} ——————`);
    if (before) this.buf.insertBefore(ln, before); else this.buf.appendChild(ln);
    this.lines++;
    return ln;
  }
  add(line, opts = {}) {
    if (!this.buf) return;
    // janela escondida (outra maximizada na frente): não dá para medir, usa a última posição conhecida
    const hidden = S.maxed && S.active !== this.id;
    const stick = hidden ? this.atBottom !== false : this.buf.scrollTop + this.buf.clientHeight >= this.buf.scrollHeight - 20;
    const d = opts.date || new Date();
    // separador quando muda o dia (só para mensagens com data)
    if (opts.date && !opts.cont) {
      const day = d.toDateString();
      if (this._lastDay !== day) { this._lastDay = day; this.addDay(d, opts.before); }
    }
    const ts = S.cfg.timestamp !== false && !opts.nots && !opts.cont && line !== '' ? `[${hms(d)}] ` : '';
    const ln = h('div', { class: 'ln' + (opts.hist ? ' hist' : '') + (opts.cls ? ' ' + opts.cls : '') + (opts.cont ? ' cont' : '') });
    // recuo: linhas que quebram (e as continuações) alinham com o começo do texto, depois do <nick>
    if (opts.indent != null) {
      const n = opts.indent + (opts.cont ? 0 : ts.length);
      const pre = opts.cont ? opts.indent + (S.cfg.timestamp !== false ? 11 : 0) : n;
      ln.style.paddingLeft = pre + 'ch';
      if (!opts.cont) ln.style.textIndent = -pre + 'ch';
    }
    if (opts.id) ln.dataset.id = opts.id;
    if (opts.nick) ln.dataset.nick = opts.nick;
    if (opts.jid) ln.dataset.jid = opts.jid;
    ln.innerHTML = codesToHtml(ts + line) + (opts.html || '');
    if (opts.before) this.buf.insertBefore(ln, opts.before); else this.buf.appendChild(ln);
    if (++this.lines > 2000) { this.buf.firstChild?.remove(); this.lines--; }
    if (stick || opts.forceScroll) this.buf.scrollTop = this.buf.scrollHeight;
    if (opts.activity && S.active !== this.id) this.setActivity(opts.activity);
    return ln;
  }
  setActivity(a) {
    const rank = { event: 1, msg: 2, hl: 3 };
    if (this.activity && rank[this.activity] >= rank[a]) return;
    this.activity = a;
    this.sw.classList.remove('act-msg', 'act-event', 'act-hl');
    this.sw.classList.add('act-' + a);
  }
  clear() { if (this.buf) { this.buf.innerHTML = ''; this.lines = 0; } }
  minimize() { this.el.classList.add('min'); const next = S.order.filter((i) => i !== this.id && !S.wins.get(i).el.classList.contains('min')).pop(); if (next) activate(next); else { S.active = null; this.el.classList.remove('active'); this.sw.classList.remove('active'); updateAppTitle(); } }
  close() {
    if (this.type === 'status') { if (!confirm('Fechar o CyberWhats?')) return; api('win:close'); return; }
    this.el.remove(); this.sw.remove();
    S.wins.delete(this.id); S.order = S.order.filter((i) => i !== this.id);
    if (S.active === this.id) { S.active = null; const n = S.wins.has(S.prevActive) ? S.prevActive : S.order[S.order.length - 1]; if (n) activate(n); }
    updateAppTitle();
  }
  bufClick(e) {
    if (e.target.closest('video, audio')) return;
    // áudio ainda não carregado: clique carrega e toca
    const au = e.target.closest('.inmedia.audio');
    if (au && !au.querySelector('audio')) {
      const ln = au.closest('.ln');
      const m = ln?._media || { media: 'Áudio', chat: au.dataset.chat, id: au.dataset.id };
      if (ln) { ln._autoplay = true; queueMedia(this, m, ln, false, true); }
      return;
    }
    const im = e.target.closest('.inmedia:not(.audio)');
    if (im && !window.getSelection()?.toString()) {
      const full = im.querySelector('img.mfull');
      if (full && !im.classList.contains('video')) { dialog({ title: 'Mídia', width: Math.min(innerWidth - 60, Math.max(320, full.naturalWidth + 40)), body: `<img src="${full.src}" style="display:block;max-width:100%;max-height:${innerHeight - 180}px;margin:0 auto">`, buttons: [['Salvar / abrir', () => api('wa:open', im.dataset.chat, im.dataset.id)], ['Fechar', null]] }); }
      else api('wa:open', im.dataset.chat, im.dataset.id).catch((err) => this.add(T.err(friendlyError(err, 'abrir a mídia'))));
      return;
    }
    const a = e.target.closest('a.url');
    if (a) { api('app:openUrl', a.dataset.url); return; }
    const m = e.target.closest('a.media');
    if (m) {
      m.textContent = '(baixando...)';
      api('wa:open', m.dataset.chat, m.dataset.id).then((f) => { m.textContent = '(abrir)'; this.add(T.info(`Arquivo salvo em: ${C}12${f}`)); })
        .catch((err) => { m.textContent = '(abrir)'; this.add(T.err(friendlyError(err, 'baixar o arquivo'))); });
    }
  }
  bufDbl(e) {
    const word = wordAt(e);
    window.getSelection()?.removeAllRanges();
    // duplo-clique num #canal escrito na tela (MOTD, /list, mensagens) = entra no canal
    if (word && word.startsWith('#') && word.length > 1) { const j = findChan(word); if (j) { openChannel(j, true); return; } }
    // igual ao IRC das antigas: duplo-clique no pvt = whois
    if (this.type === 'query') { run('/whois', this); return; }
    const ln = e.target.closest('.ln');
    // duplo-clique no nick de alguém (no texto do canal) = abre o pvt
    if (this.type === 'channel' && ln?.dataset.jid && e.target.closest('.nk-click')) { openQuery(ln.dataset.jid, ln.dataset.nick, true); return; }
    if (ln?.dataset.id && this.jid) this.quoteLine(ln);
    else if (this.type === 'channel') cmdInfo(this);
    else if (this.type === 'status' && S.conn !== 'online') run('/server', this);
  }
  quoteLine(ln) { this.setQuote(ln.dataset.id, ln.dataset.nick, strip(ln.textContent).replace(/^\[[\d:]+\] /, '').slice(0, 70)); }
  setQuote(id, nick, text) {
    this.buf.querySelectorAll('.selq').forEach((x) => x.classList.remove('selq'));
    if (!id) { this.quote = null; this.replyEl.classList.add('hidden'); return; }
    this.quote = id;
    this.buf.querySelector(`.ln[data-id="${CSS.escape(id)}"]`)?.classList.add('selq');
    this.replyEl.innerHTML = `Respondendo a <b>${esc(nick || '')}</b>: ${esc(text)} <span class="x" title="Cancelar (Esc)">✕</span>`;
    $('.x', this.replyEl).onclick = () => this.setQuote(null);
    this.replyEl.classList.remove('hidden');
    this.edit.focus();
  }
  onKey(e) {
    const ed = this.edit;
    if (e.key === 'Enter') {
      const v = ed.value; ed.value = '';
      // ao enviar, desce a rolagem até o fim para ver o que foi escrito
      if (v && this.buf) { this.buf.scrollTop = this.buf.scrollHeight; this.atBottom = true; }
      if (v.trim()) { this.hist.push(v); if (this.hist.length > 50) this.hist.shift(); }
      this.histPos = -1;
      if (v) (async () => { for (const line of v.split(/\r?\n/)) await inputLine(line, this); })().catch((err) => this.add(T.err(friendlyError(err))));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      if (!this.hist.length) return;
      this.histPos = this.histPos < 0 ? this.hist.length - 1 : Math.max(0, this.histPos - 1);
      ed.value = this.hist[this.histPos]; e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      if (this.histPos < 0) return;
      this.histPos++; if (this.histPos >= this.hist.length) { this.histPos = -1; ed.value = ''; } else ed.value = this.hist[this.histPos];
      e.preventDefault();
    } else if (e.key === 'Tab') {
      e.preventDefault(); this.complete();
    } else if (e.key === 'Escape') {
      this.setQuote(null);
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      this.buf.scrollTop += (e.key === 'PageUp' ? -1 : 1) * (this.buf.clientHeight - 32); e.preventDefault();
    } else if (e.ctrlKey && !e.altKey && ['b', 'k', 'u', 'i', 'o', 'r'].includes(e.key.toLowerCase())) {
      const code = { b: B, k: C, u: U, i: I, o: O, r: R }[e.key.toLowerCase()];
      const s = ed.selectionStart; ed.setRangeText(code, s, ed.selectionEnd, 'end'); e.preventDefault();
    }
  }
  complete() {
    const ed = this.edit, pos = ed.selectionStart;
    // Tab de novo logo depois de completar: passa para o próximo nick da lista
    const cycling = !!(this._tab && this._tab.end === pos && ed.value.slice(this._tab.start, pos) === this._tab.inserted);
    if (cycling) this._tab.i = (this._tab.i + 1) % this._tab.list.length;
    else {
      const m = /(\S+)$/.exec(ed.value.slice(0, pos)); if (!m) return;
      let frag = m[1], pre = '';
      if (frag.startsWith('@')) { pre = '@'; frag = frag.slice(1); } // @nick = menção
      const f = frag.toLowerCase();
      let pool = this.type === 'channel' ? this.nicks.map((n) => n.nick) : this.type === 'query' ? [this.name] : [...S.nickIdx.keys()];
      if (!pre && f.startsWith('#')) pool = S.chats.filter((c) => c.group).map((c) => chanOf(c.id, c.name));
      const list = pool.filter((n) => n.toLowerCase().startsWith(f.replace(/^[.@]/, '')) || n.toLowerCase().startsWith(f)).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
      if (!list.length) return;
      this._tab = { start: pos - m[1].length, list, i: 0, pre, first: pos - m[1].length === 0 };
    }
    const t = this._tab, pick = t.list[t.i];
    const suffix = t.first && !t.pre && this.type === 'channel' && !pick.startsWith('#') ? ': ' : ' ';
    const after = ed.value.slice(pos);
    t.inserted = t.pre + pick + suffix;
    ed.value = ed.value.slice(0, t.start) + t.inserted + after;
    t.end = t.start + t.inserted.length; ed.setSelectionRange(t.end, t.end);
  }
  onTyping() {
    this._tab = null;
    S.lastInput = Date.now();
    if (!this.jid || S.conn !== 'online' || this.edit.value.startsWith('/')) return;
    const now = Date.now();
    if (!this._typingSent || now - this._typingSent > 8000) { this._typingSent = now; api('wa:presence', this.jid, 'composing').catch(() => {}); }
    clearTimeout(this._typingStop);
    this._typingStop = setTimeout(() => { this._typingSent = 0; api('wa:presence', this.jid, 'paused').catch(() => {}); }, 6000);
  }
  setTyping(nick, on) {
    this._typers = this._typers || new Map();
    clearTimeout(this._typers.get(nick));
    if (on) this._typers.set(nick, setTimeout(() => this.setTyping(nick, false), 15000)); else this._typers.delete(nick);
    const names = [...this._typers.keys()];
    const txt = names.length ? `${names.join(', ')} ${names.length > 1 ? 'estão' : 'está'} digitando...` : '';
    $('.mt', this.title).textContent = this.fullTitle + (txt ? '  —  ' + txt : '');
  }
  setNicks(group) {
    this.group = group;
    const rank = (a) => (a === 'superadmin' ? 0 : a === 'admin' ? 1 : 2);
    const seen = new Map();
    this.nicks = group.participants.map((p) => {
      let nick = p.me ? myNick() : nickFor(p.id, p.nick);
      if (seen.has(nick.toLowerCase())) nick += '|' + num(p.id).slice(-4);
      seen.set(nick.toLowerCase(), 1);
      indexNick(nick, p.id);
      return { ...p, nick };
    }).sort((a, b) => rank(a.admin) - rank(b.admin) || a.nick.localeCompare(b.nick, 'pt-BR', { sensitivity: 'base' }));
    this.nl.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const n of this.nicks) {
      const d = h('div', { class: 'nk' + (n.admin === 'superadmin' ? ' owner' : n.admin ? ' op' : '') + (n.me ? ' me' : '') });
      d.textContent = (n.admin === 'superadmin' ? '.' : n.admin ? '@' : '') + n.nick;
      d.dataset.jid = n.id; d.dataset.nick = n.nick; d.title = '+' + num(n.id);
      frag.appendChild(d);
    }
    this.nl.appendChild(frag);
    this.name = chanOf(this.jid || group.id, group.subject);
    const modes = '+' + (group.announce ? 'm' : '') + (group.restrict ? 't' : '') + 'n';
    this.setTitle(`${this.name} [${this.nicks.length}] [${modes}]${group.desc ? ': ' + group.desc.replace(/\s+/g, ' ') : ''}`);
  }
  nickOf(jid) { return this.nicks.find((n) => n.id === jid); }
  windowMenu() {
    const items = [];
    if (this.type === 'channel') items.push(['Definir apelido do canal...', () => aliasDialog(this.jid, this.name)], ['Remover apelido do canal', () => setAlias(this.jid, ''), !alias(this.jid)], ['Informações do canal', () => cmdInfo(this)], ['Listar nicks (/names)', () => run('/names', this)], ['Link de convite', () => run('/convite', this)], '-', ['Mudar tópico...', () => askRun('Tópico', 'Novo tópico (descrição do grupo):', this.group?.desc || '', (v) => run('/topic ' + v, this))], ['Renomear canal...', () => askRun('Renomear', 'Novo nome do grupo:', this.group?.subject || '', (v) => run('/assunto ' + v, this))], '-', ['Sair do grupo (/sairgrupo)', () => run('/sairgrupo', this)], '-');
    if (this.type === 'query') items.push(['Definir apelido local...', () => aliasDialog(this.jid, this.name)], ['Remover apelido local', () => setAlias(this.jid, ''), !alias(this.jid)], ['Enviar arquivo...', () => run('/enviar', this)], ['Ignorar', () => run('/ignore', this)], ['Adicionar ao notify', () => run('/notify', this)], '-');
    items.push(['Limpar', () => this.clear()], ['Abrir logs', () => api('app:openLogs')], '-', ['Fechar', () => this.close()]);
    return items;
  }
  nickMenu(jid, nick) {
    const me = this.nickOf(S.me?.id);
    const amOp = !!me?.admin;
    return [
      ['Query (pvt)', () => openQuery(jid, nick, true)], ['Whois', () => run('/whois ' + nick, this)], ['Copiar número', () => copyText('+' + num(jid))],
      ['Mencionar', () => { this.edit.value += '@' + num(jid) + ' '; this.edit.focus(); }], '-',
      ['Op (tornar admin)', () => run('/op ' + nick, this), !amOp], ['Deop (remover admin)', () => run('/deop ' + nick, this), !amOp], ['Kick (remover do grupo)', () => run('/kick ' + nick, this), !amOp], '-',
      ['Notify', () => run('/notify ' + nick, this)], ['Ignorar', () => run('/ignore ' + nick, this)], '-',
      ['Definir apelido local...', () => aliasDialog(jid, nick)], ['Remover apelido local', () => setAlias(jid, ''), !alias(jid)]
    ];
  }
}

function getWin(id) { return S.wins.get(id); }
// ---------- mídia no chat (figurinhas, fotos, vídeos, áudios) ----------
const AUTO_KINDS = ['Imagem', 'Figurinha', 'Áudio', 'Vídeo'];
function inlineMediaHtml(m) {
  const cls = m.media === 'Figurinha' ? 'sticker' : m.media === 'Imagem' ? 'photo' : m.media === 'Vídeo' ? 'video' : m.media === 'Áudio' ? 'audio' : '';
  if (!cls) return '';
  const th = m.thumb ? `<img class="mthumb" src="${esc(m.thumb)}" draggable="false">` : '';
  const play = cls === 'video' ? '<span class="play">▶</span>' : '';
  if (cls === 'audio') return `<div class="inmedia audio" data-chat="${esc(m.chat)}" data-id="${esc(m.id)}"><span class="mload" title="Clique para carregar o áudio">▶ ouvir áudio</span></div>`;
  return `<div class="inmedia ${cls}" data-chat="${esc(m.chat)}" data-id="${esc(m.id)}" title="Clique para abrir">${th}${play}</div>`;
}
const mediaQueue = [];
let mediaBusy = 0;
function queueMedia(w, m, ln, hist, force) {
  if (!AUTO_KINDS.includes(m.media)) return;
  if (!force && S.cfg.autoDownload === false) return;
  if (!force && m.media === 'Vídeo' && (m.size || 0) > (S.cfg.videoMaxMB || 25) * 1024 * 1024) return; // vídeo grande: só a capa, clique para abrir
  ln._media = m; ln._win = w;
  const job = { w, m, ln };
  if (hist && !force) {
    // no histórico baixa só as 40 mais recentes (o histórico chega do mais antigo para o mais novo)
    w._histJobs = w._histJobs || [];
    w._histJobs.push(job);
    if (w._histJobs.length > 40) { const old = w._histJobs.shift(); const i = mediaQueue.indexOf(old); if (i >= 0) mediaQueue.splice(i, 1); }
  }
  const lb = ln.querySelector('.inmedia .mload'); if (lb) lb.textContent = 'carregando áudio...';
  mediaQueue.push(job);
  pumpMedia();
}
// áudio que não carregou: volta a ser um botão "ouvir"
function mediaIdle(ln, msg) { const b = ln.querySelector('.inmedia .mload'); if (b) b.textContent = msg || '▶ ouvir áudio'; }
function pumpMedia() {
  while (mediaBusy < 2 && mediaQueue.length) {
    const { w, m, ln } = mediaQueue.pop(); // mais novas primeiro
    mediaBusy++;
    api('wa:media', m.chat, m.id).then((r) => {
      const box = ln.querySelector('.inmedia');
      if (!box) return;
      if (!r) { mediaIdle(ln, '▶ ouvir áudio (clique para tentar de novo)'); return; }
      const stick = w.buf.scrollTop + w.buf.clientHeight >= w.buf.scrollHeight - 40;
      if (m.media === 'Áudio') { box.innerHTML = `<audio controls preload="metadata" src="${r.url}"></audio>`; if (ln._autoplay) box.querySelector('audio').play().catch(() => {}); }
      else if (m.media === 'Vídeo' || /^video\//.test(r.mime)) {
        const v = document.createElement('video');
        v.className = 'mvideo'; v.src = r.url; v.preload = 'metadata';
        if (m.thumb) v.poster = m.thumb;
        if (m.gif) { v.autoplay = true; v.loop = true; v.muted = true; v.playsInline = true; } else v.controls = true;
        v.addEventListener('loadedmetadata', () => { if (stick) w.buf.scrollTop = w.buf.scrollHeight; });
        box.innerHTML = ''; box.appendChild(v); box.classList.add('playing');
      }
      else { const img = new Image(); img.className = 'mfull'; img.draggable = false; img.onload = () => { box.innerHTML = ''; box.appendChild(img); if (stick) w.buf.scrollTop = w.buf.scrollHeight; }; img.src = r.url; }
      if (stick) w.buf.scrollTop = w.buf.scrollHeight;
    }).catch(() => mediaIdle(ln, '▶ ouvir áudio (clique para tentar de novo)'))
      .finally(() => { mediaBusy--; pumpMedia(); });
  }
}
// foto do contato no canto do pvt (como os addons de "foto no pvt" da época)
async function loadPhoto(w) {
  if (!w?.photo || S.conn !== 'online' || w._photoLoaded) return;
  w._photoLoaded = true;
  try {
    const url = await api('wa:pic', w.jid);
    if (url) { w.photo.src = url; w.photo.classList.remove('hidden'); w.photo.parentElement.classList.add('photo-on'); }
  } catch { w._photoLoaded = false; }
}
// seleção com cores invertidas (igual ao IRC das antigas): caixas com mix-blend-mode difference
function drawSelection() {
  document.querySelectorAll('.selbox').forEach((b) => b.remove());
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const anc = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
  const buf = anc?.closest('.buffer') || (anc?.classList?.contains('buffer') ? anc : null);
  if (!buf) return;
  const wrap = buf.parentElement, wr = wrap.getBoundingClientRect();
  const walker = document.createTreeWalker(buf, NodeFilter.SHOW_TEXT);
  const frag = document.createDocumentFragment();
  let n;
  while ((n = walker.nextNode())) {
    if (!range.intersectsNode(n) || !n.nodeValue) continue;
    const r = document.createRange();
    r.selectNodeContents(n);
    if (n === range.startContainer) r.setStart(n, range.startOffset);
    if (n === range.endContainer) r.setEnd(n, range.endOffset);
    for (const rc of r.getClientRects()) {
      if (rc.width < 1 || rc.bottom < wr.top || rc.top > wr.bottom) continue;
      const b = document.createElement('div');
      b.className = 'selbox';
      b.style.cssText = `left:${rc.left - wr.left}px;top:${rc.top - wr.top}px;width:${rc.width}px;height:${rc.height}px`;
      frag.appendChild(b);
    }
  }
  wrap.appendChild(frag);
}
document.addEventListener('selectionchange', () => requestAnimationFrame(drawSelection));
// envolve o nick da linha num <span> clicável (duplo-clique abre o pvt)
function markNick(ln, nick) {
  const walker = document.createTreeWalker(ln, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const i = n.nodeValue.indexOf(nick);
    if (i < 0) continue;
    const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + nick.length);
    const sp = document.createElement('span'); sp.className = 'nk-click';
    try { r.surroundContents(sp); } catch {}
    return;
  }
}
function copyText(t) {
  navigator.clipboard.writeText(t).catch(() => {
    const ta = h('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  });
}
// palavra sob o cursor (sem pontuação nas pontas)
function wordAt(e) {
  const r = document.caretRangeFromPoint?.(e.clientX, e.clientY);
  if (!r || r.startContainer.nodeType !== 3) return '';
  const t = r.startContainer.textContent, i = r.startOffset;
  let a = i, b = i;
  while (a > 0 && !/\s/.test(t[a - 1])) a--;
  while (b < t.length && !/\s/.test(t[b])) b++;
  return t.slice(a, b).replace(/^[("'«\[]+|[)"'»\],.:;!?]+$/g, '');
}
function makeWin(id, type, name, opts) {
  if (S.wins.has(id)) return S.wins.get(id);
  const w = new Win(id, type, name, opts);
  S.wins.set(id, w);
  if (id === 'recent' && S.order[0] === 'status') S.order.splice(1, 0, id); else S.order.push(id);
  return w;
}
function activate(id, noFocus = false) {
  const w = S.wins.get(id); if (!w) return;
  if (S.active && S.active !== id) {
    const o = S.wins.get(S.active); o?.el.classList.remove('active'); o?.sw.classList.remove('active'); if (o) S.prevActive = S.active;
    // saindo da janela: tudo que estava nela foi visto; a próxima mensagem nova ganha uma linha nova
    if (o?.jid) { setSeen(o.jid); if (o._newMark) { o._newMark.remove(); o._newMark = null; o.lines--; } }
  }
  S.active = id;
  w.el.classList.remove('min'); w.el.classList.add('active'); w.sw.classList.add('active');
  w.el.style.zIndex = ++S.zTop;
  w.activity = null; w.sw.classList.remove('act-msg', 'act-event', 'act-hl');
  if (S.maxed) w.el.classList.add('max');
  // tem mensagens novas: abre mostrando a linha "mensagens novas" no topo (como o WhatsApp)
  if (w.buf && w._newMark && !w._newMark._shown) requestAnimationFrame(() => { w._newMark._shown = true; w.buf.scrollTop += w._newMark.getBoundingClientRect().top - w.buf.getBoundingClientRect().top - 2; w.atBottom = w.buf.scrollTop + w.buf.clientHeight >= w.buf.scrollHeight - 20; });
  else if (w.buf && w.atBottom !== false) requestAnimationFrame(() => { w.buf.scrollTop = w.buf.scrollHeight; });
  updateAppTitle();
  if (w.jid && S.conn === 'online') {
    api('wa:read', w.jid).catch(() => {});
    api('wa:subscribe', w.jid).catch(() => {});
  }
  if (!noFocus) setTimeout(() => { if (!window.getSelection()?.toString()) w.edit?.focus(); }, 0);
}
function setMaxed(on, w) {
  S.maxed = on;
  document.body.classList.toggle('child-max', on);
  for (const x of S.wins.values()) x.el.classList.toggle('max', on);
  if (w) activate(w.id);
  updateAppTitle();
}
function startMove(e, w) {
  if (S.maxed || e.button !== 0) return;
  const r = w.el.getBoundingClientRect(), mdi = $('#mdi').getBoundingClientRect();
  const dx = e.clientX - r.left, dy = e.clientY - r.top;
  const mv = (ev) => { w.el.style.left = Math.max(-r.width + 60, ev.clientX - mdi.left - dx) + 'px'; w.el.style.top = Math.max(0, ev.clientY - mdi.top - dy) + 'px'; };
  const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
  addEventListener('mousemove', mv); addEventListener('mouseup', up);
}
function startResize(e, w, dir) {
  e.stopPropagation(); e.preventDefault();
  const r = w.el.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
  const mv = (ev) => { if (dir.includes('e')) w.el.style.width = Math.max(200, r.width + ev.clientX - x0) + 'px'; if (dir.includes('s')) w.el.style.height = Math.max(120, r.height + ev.clientY - y0) + 'px'; };
  const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
  addEventListener('mousemove', mv); addEventListener('mouseup', up);
}
function startSplit(e, w) {
  e.preventDefault();
  const x0 = e.clientX, w0 = w.nl.offsetWidth;
  const mv = (ev) => { w.nl.style.width = Math.min(400, Math.max(60, w0 - (ev.clientX - x0))) + 'px'; };
  const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); api('cfg:set', { nicklistWidth: w.nl.offsetWidth }).then((c) => (S.cfg = c)); };
  addEventListener('mousemove', mv); addEventListener('mouseup', up);
}
function tile() {
  setMaxed(false);
  const ws = S.order.map((i) => S.wins.get(i)).filter((w) => !w.el.classList.contains('min'));
  const n = ws.length; if (!n) return;
  const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
  const W = $('#mdi').clientWidth, H = $('#mdi').clientHeight;
  ws.forEach((w, i) => { const c = i % cols, r = Math.floor(i / cols); Object.assign(w.el.style, { left: (c * W) / cols + 'px', top: (r * H) / rows + 'px', width: W / cols + 'px', height: H / rows + 'px' }); });
}
function cascade() {
  setMaxed(false);
  S.order.forEach((id, i) => { const w = S.wins.get(id); w.el.classList.remove('min'); Object.assign(w.el.style, { left: i * 22 + 'px', top: i * 22 + 'px', width: '65%', height: '65%' }); w.el.style.zIndex = ++S.zTop; });
  if (S.active) activate(S.active);
}

function updateAppTitle() {
  const w = S.wins.get(S.active);
  const lag = S.lag != null ? (S.lag / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') : '0';
  $('#title').textContent = `CyberWhats - Conectado-[ ${S.conn === 'online' ? 'Sim' : 'Não'} ] Lag-[ ${S.conn === 'online' ? lag : '-'} ] Away-[ ${S.away ? 'Sim' : 'Não'} ]`;
  document.title = w ? `CyberWhats - ${w.name}` : 'CyberWhats';
  const idle = Math.floor((Date.now() - S.lastInput) / 1000);
  const fmtIdle = idle < 60 ? idle + 's' : idle < 3600 ? Math.floor(idle / 60) + 'm' + pad(idle % 60) + 's' : Math.floor(idle / 3600) + 'h' + pad(Math.floor(idle / 60) % 60) + 'm';
  const mi = $('#m-idle'); if (mi) { mi.textContent = 'Inativo: ' + fmtIdle; $('#m-idle-bar').style.width = Math.min(100, idle / 6) + '%'; }
  const ml = $('#m-lag'); if (ml) { ml.textContent = `Lag: ${S.conn === 'online' ? lag + ' seg' : '-'}`; $('#m-lag-bar').style.width = Math.min(100, (S.lag || 0) / 30) + '%'; }
}

// ======================================================================
//  Menus / popups
// ======================================================================
function fillMenu(p, items, level) {
  p.innerHTML = '';
  let prev = '-';
  for (const it of items) {
    if (it === '-') { if (prev !== '-') p.appendChild(h('div', { class: 'sep' })); prev = '-'; continue; }
    prev = it;
    const [label, fn, disabled, opts = {}] = it;
    const sub = Array.isArray(opts.children) && opts.children.length;
    const d = h('div', { class: 'mi' + (disabled ? ' dis' : '') + (opts.checked ? ' chk' : '') + (sub ? ' sub' : '') });
    d.innerHTML = (opts.icon ? `<img src="${iconSrc(opts.icon)}">` : '') + `<span>${esc(label)}</span>` + (opts.key ? `<span class="k">${esc(opts.key)}</span>` : '') + (sub ? '<span class="arr">▶</span>' : '');
    d.addEventListener('mouseenter', () => {
      closeSubmenus(level + 1);
      p.querySelectorAll('.mi.hover').forEach((x) => x.classList.remove('hover'));
      if (!sub || disabled) return;
      d.classList.add('hover');
      const sp = h('div', { class: 'menu submenu' });
      sp.dataset.level = level + 1;
      document.body.appendChild(sp);
      fillMenu(sp, opts.children, level + 1);
      const r = d.getBoundingClientRect(), sr = sp.getBoundingClientRect();
      // continua abrindo para o mesmo lado do menu pai (esquerda/direita), virando só se não couber
      let left = p.dataset.dir === 'l' ? r.left - sr.width + 2 : r.right - 2;
      if (left + sr.width > innerWidth) left = r.left - sr.width + 2;
      if (left < 0) left = r.right - 2;
      sp.dataset.dir = left < r.left ? 'l' : 'r';
      sp.style.left = Math.max(0, left) + 'px';
      sp.style.top = Math.max(0, Math.min(r.top - 3, innerHeight - sr.height - 2)) + 'px';
    });
    if (!disabled && !sub) d.addEventListener('mouseup', (ev) => { ev.stopPropagation(); hidePopup(); setTimeout(() => { if (!document.querySelector('#modal-layer.on')) cur()?.edit?.focus(); }, 0); Promise.resolve().then(fn).catch((err) => cur()?.add(`${C}4* Erro: ${err.message || err}`)); });
    p.appendChild(d);
  }
  while (p.lastChild?.classList.contains('sep')) p.lastChild.remove();
}
function closeSubmenus(level) { document.querySelectorAll('.menu.submenu').forEach((x) => { if (Number(x.dataset.level) >= level) x.remove(); }); }
function popup(e, items, x, y) {
  const p = $('#popup');
  closeSubmenus(1);
  fillMenu(p, items, 0);
  p.classList.remove('hidden');
  const px = x ?? e.clientX, py = y ?? e.clientY;
  const r = p.getBoundingClientRect();
  p.style.left = Math.min(px, innerWidth - r.width - 2) + 'px';
  p.style.top = Math.max(0, Math.min(py, innerHeight - r.height - 2)) + 'px';
}
function hidePopup() { closeSubmenus(1); $('#popup').classList.add('hidden'); document.querySelectorAll('#menubar .mitem.open').forEach((m) => m.classList.remove('open')); }
addEventListener('mousedown', (e) => { if (!e.target.closest('.menu') && !e.target.closest('#menubar .mitem')) hidePopup(); });

const MENUS = {
  Arquivo: () => [
    ['Conectar', () => run('/server', st()), S.conn !== 'offline', { icon: '144' }],
    ['Conectar com código de pareamento...', () => askRun('Conectar', 'Seu número com DDI e DDD (ex: 5519999999999):', '', (v) => run('/server ' + v, st())), S.conn !== 'offline'],
    ['Desconectar', () => run('/disconnect', st()), S.conn === 'offline'],
    ['Mostrar WhatsApp Web original', () => run('/web', st()), S.conn === 'offline'],
    '-',
    ['Abrir pasta de logs', () => api('app:openLogs'), false, { icon: 'logs' }],
    ['Abrir pasta de recebidos', () => api('app:openDownloads'), false, { icon: 'recebidos' }],
    '-',
    ['Encerrar sessão (deslogar aparelho)', () => run('/logout', st())],
    ['Sair', () => api('win:close'), false, { key: 'Alt+F4' }]
  ],
  Exibir: () => [
    ['Toolbar', () => toggleBar('toolbar'), false, { checked: !$('#toolbar').classList.contains('hidden') }],
    ['Switchbar', () => toggleBar('switchbar'), false, { checked: !$('#switchbar').classList.contains('hidden') }],
    ['Timestamp', () => setCfg({ timestamp: !S.cfg.timestamp }), false, { checked: S.cfg.timestamp }],
    '-',
    ['Status', () => activate('status')],
    ['@Away', () => activate(awayWin().id)],
    ['Limpar janela', () => cur().clear(), false, { key: 'Ctrl+L' }]
  ],
  Favoritos: () => [
    ['Pasta de Canais...', dlgFavorites, false, { icon: '20' }],
    ['Listar Canais', () => run('/list', cur()), S.conn !== 'online' && !S.chats.length, { icon: '38' }],
    ['Listar Contatos', () => run('/contatos', cur()), S.conn !== 'online', { icon: 'msn' }],
    ['Auto-Join...', dlgAutojoin, false, { icon: '35' }],
    '-',
    ...S.chats.filter((c) => c.group && (S.cfg.autojoin || []).includes(c.id)).map((c) => [chanOf(c.id, c.name), () => openChannel(c.id, true)])
  ],
  Ferramentas: () => [
    ['Opções...', dlgOptions, false, { icon: '21', key: 'Alt+O' }],
    ['Notify List...', dlgNotify, false, { icon: 'notify' }],
    ['Ignore List...', dlgIgnore, false, { icon: '147' }],
    ['Temas / Cores...', dlgTheme, false, { icon: 'cores' }],
    ['Editor de scripts...', () => scriptEditor(), false, { icon: 'editor', key: 'Alt+R' }],
    ['Recarregar scripts', () => loadScripts(true, cur())],
    '-',
    ['Mudar nick (nome do perfil)...', () => askRun('Nick', 'Novo nick (nome no WhatsApp):', S.me?.name || '', (v) => run('/nick ' + v, cur())), S.conn !== 'online', { icon: 'nick' }],
    ['Meu apelido local...', () => S.me ? aliasDialog(S.me.id, myNick()) : null, !S.me],
    ['Mudar recado...', () => askRun('Recado', 'Novo recado (status):', '', (v) => run('/recado ' + v, cur())), S.conn !== 'online']
  ],
  Comandos: async () => [
    [S.away ? 'Back (voltar do away)' : 'Away...', () => (S.away ? run('/back', cur()) : askRun('Away', 'Mensagem de away:', S.cfg.awayMessage || '', (v) => run('/away ' + v, cur()))), false],
    ['Query (pvt)...', () => askRun('Query', 'Nick ou número (com DDI):', '', (v) => run('/query ' + v, cur())), false, { icon: '85' }],
    ['Join (abrir grupo)...', () => askRun('Join', 'Nome do grupo:', '#', (v) => run('/join ' + v, cur()))],
    ['Whois...', () => askRun('Whois', 'Nick ou número:', '', (v) => run('/whois ' + v, cur()))],
    ['Enviar arquivo...', () => run('/enviar', cur()), !cur()?.jid, { icon: '16' }],
    ...(await (async () => { const sm = await scriptMenu('menubar', cur()); return sm.length ? ['-', ...sm] : []; })())
  ],
  Janela: () => [
    ['Lado-a-lado', tile, false, { icon: '142' }],
    ['Cascata', cascade, false, { icon: '143' }],
    [S.maxed ? 'Restaurar' : 'Maximizar', () => setMaxed(!S.maxed, cur())],
    '-',
    ...S.order.map((id, i) => [`${i + 1} ${S.wins.get(id).name}`, () => activate(id), false, { checked: id === S.active, key: i < 9 ? 'Alt+' + (i + 1) : '' }])
  ],
  Ajuda: () => [
    ['Comandos', () => run('/ajuda', cur()), false, { icon: '83' }],
    ['Atalhos', () => run('/atalhos', cur()), false, { icon: 'fkeys' }],
    ['Linguagem dos scripts', () => run('/ajuda scripts', cur()), false],
    ['Dicas', () => run('/dicas', cur()), false, { icon: 'dicas' }],
    '-',
    ['Sobre o CyberWhats...', dlgAbout, false, { icon: 'about' }]
  ]
};
function buildMenubar() {
  const m = $('#menubar .menus');
  for (const name of Object.keys(MENUS)) {
    const it = h('div', { class: 'mitem' }, name);
    it.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const wasOpen = it.classList.contains('open');
      hidePopup(); if (wasOpen) return;
      it.classList.add('open');
      const r = it.getBoundingClientRect();
      Promise.resolve(MENUS[name]()).then((items) => { if (it.classList.contains('open')) popup(e, items, r.left, r.bottom); });
    });
    it.addEventListener('mouseenter', () => {
      const open = $('#menubar .mitem.open');
      if (open && open !== it) { hidePopup(); it.classList.add('open'); const r = it.getBoundingClientRect(); Promise.resolve(MENUS[name]()).then((items) => { if (it.classList.contains('open')) popup(null, items, r.left, r.bottom); }); }
    });
    m.appendChild(it);
  }
  $('#childctl').addEventListener('click', (e) => {
    const b = e.target.closest('[data-child]'); if (!b) return;
    const w = cur(); if (!w) return;
    ({ min: () => w.minimize(), restore: () => setMaxed(false, w), close: () => w.close() })[b.dataset.child]();
  });
}

// toolbar baseada em sistema/tb1.txt do CyberScript
const TOOLBAR = [
  ['144', 'Conectar / Desconectar', () => run(S.conn === 'offline' ? '/server' : '/disconnect', st())], '-',
  ['21', 'Opções', () => dlgOptions()], ['20', 'Pasta de Canais', () => dlgFavorites()], ['notify', 'Notify+', () => dlgNotify()], ['147', 'Ignore+', () => dlgIgnore()], '-',
  ['35', 'Auto-Join', () => dlgAutojoin()], ['ginfo', 'Informações do grupo', () => cmdInfo(cur())], ['cores', 'Cores', () => dlgTheme()], ['38', 'Listar Canais', () => run('/list', cur())], ['msn', 'Listar Contatos', () => run('/contatos', cur())], '-',
  ['16', 'Enviar Arquivo', () => run('/enviar', cur())], ['85', 'Chat (abrir pvt)', () => MENUS.Comandos().then((m) => m[1][1]())], ['142', 'Janelas Lado-a-Lado', tile], ['143', 'Janelas em Cascata', cascade], '-',
  ['157', 'Theme Manager', () => dlgTheme()], ['nick', 'Nick / Recado', () => dlgProfile()], ['recebidos', 'Recebidos', () => api('app:openDownloads')], ['logs', 'Logs', () => api('app:openLogs')], '-',
  ['fkeys', 'Atalhos', () => run('/atalhos', cur())], ['dicas', 'Dicas', () => run('/dicas', cur())], ['about', 'About', () => dlgAbout()], ['83', 'Ajuda?', () => run('/ajuda', cur())]
];
// ícones: conjunto moderno (padrão) ou clássico do CyberScript; alguns papéis usam desenhos diferentes em cada conjunto
const ICON_ROLES = { notify: ['online', '59'], nick: ['59', 'av2'], ginfo: ['62', '122'], cores: ['146', '148'], recebidos: ['do', 'get'], logs: ['7', '33'], dicas: ['99', '89'], about: ['75', 'about'], query: ['userl', 'av'], editor: ['cyber', '83'], custom: ['7', '89'] };
function iconSrc(n) {
  const cl = S.cfg?.iconSet === 'classic';
  const r = ICON_ROLES[n];
  return `assets/${cl ? 'icons-classic' : 'icons'}/${r ? r[cl ? 1 : 0] : n}.png`;
}
function refreshIcons() {
  document.querySelectorAll('img[data-icon]').forEach((i) => { i.src = iconSrc(i.dataset.icon); });
  for (const w of S.wins.values()) if (w.iconName) w.setIcon(w.iconName);
}
function buildToolbar() {
  const tb = $('#toolbar');
  for (const t of TOOLBAR) {
    if (t === '-') { tb.appendChild(h('div', { class: 'tsep' })); continue; }
    const b = h('div', { class: 'tb', title: t[1] }, `<img src="${iconSrc(t[0])}" data-icon="${t[0]}" draggable="false">`);
    b.addEventListener('click', t[2]);
    tb.appendChild(b);
  }
  tb.appendChild(h('div', { class: 'meters' }, '<div class="meter"><span id="m-idle">Inativo: 0s</span><div class="bar"><i id="m-idle-bar"></i></div></div><div class="meter"><span id="m-lag">Lag: -</span><div class="bar"><i id="m-lag-bar"></i></div></div>'));
}
function toggleBar(id) { $('#' + id).classList.toggle('hidden'); }

const cur = () => S.wins.get(S.active) || st();
const st = () => S.wins.get('status');

// ======================================================================
//  Diálogos estilo Win9x
// ======================================================================
function dialog({ title, body, buttons = [['OK', true]], width = 360, onOpen }) {
  return new Promise((resolve) => {
    const layer = $('#modal-layer');
    layer.classList.add('on');
    const d = h('div', { class: 'dlg' });
    d.style.width = width + 'px';
    const t = h('div', { class: 'mtitle' }, `<span class="mt">${esc(title)}</span>`);
    const cb = h('button', { class: 'cap close' }, '<span class="g-close"></span>');
    t.appendChild(cb);
    const b = h('div', { class: 'dbody' }); if (typeof body === 'string') b.innerHTML = body; else b.appendChild(body);
    const bb = h('div', { class: 'dbtns' });
    const done = (v) => { d.remove(); if (!layer.children.length) layer.classList.remove('on'); resolve(v); };
    for (const [label, val] of buttons) { const x = h('button', { class: 'btn' }, esc(label)); x.onclick = () => done(typeof val === 'function' ? val(d) : val); bb.appendChild(x); }
    cb.onclick = () => done(null);
    d.append(t, b, bb);
    layer.appendChild(d);
    d.style.left = Math.max(10, (innerWidth - d.offsetWidth) / 2) + 'px';
    d.style.top = Math.max(10, (innerHeight - d.offsetHeight) / 2.5) + 'px';
    t.addEventListener('mousedown', (e) => {
      const dx = e.clientX - d.offsetLeft, dy = e.clientY - d.offsetTop;
      const mv = (ev) => { d.style.left = ev.clientX - dx + 'px'; d.style.top = ev.clientY - dy + 'px'; };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
    });
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(null); if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') bb.querySelector('.btn')?.click(); });
    onOpen?.(d);
    (d.querySelector('input,textarea,select') || bb.querySelector('.btn'))?.focus();
  });
}
async function ask(title, label, def = '') {
  return dialog({ title, body: `<div>${esc(label)}</div><div class="drow"><input type="text" style="flex:1" value="${esc(def)}"></div>`, buttons: [['OK', (d) => $('input', d).value], ['Cancelar', null]] });
}
async function askRun(title, label, def, fn) { const v = await ask(title, label, def); if (v != null && v.trim()) fn(v.trim()); }
async function setCfg(patch) { S.cfg = await api('cfg:set', patch); applyTheme(); }

function dlgOptions() {
  const c = S.cfg;
  const chk = (k, l) => `<label><input type="checkbox" data-k="${k}" ${c[k] ? 'checked' : ''}> ${l}</label>`;
  dialog({
    title: 'Opções do CyberWhats - /opcoes', width: 420,
    body: `<fieldset><legend>Geral</legend>${chk('timestamp', 'Mostrar timestamp [HH:nn:ss]')}${chk('sounds', 'Sons do CyberScript (pvt, join, conectar...)')}${chk('notifyPopups', 'Balões de aviso do Windows')}${chk('autojoinAll', 'Auto-join: entrar em todos os meus grupos ao conectar')}${chk('showMotd', 'Mostrar LUSERS e MOTD ao conectar (/motd editar para personalizar)')}${chk('showRecent', 'Mostrar os contatos recentes ao conectar (/recentes)')}</fieldset>
      <fieldset><legend>Mídia</legend>${chk('inlineMedia', 'Mostrar fotos, figurinhas e vídeos no chat')}${chk('autoDownload', 'Baixar automaticamente fotos, figurinhas, áudios e vídeos')}<div class="drow">Vídeos até <input type="text" data-k="videoMaxMB" style="width:40px" value="${esc(String(c.videoMaxMB || 25))}"> MB (maiores: clique para abrir)</div></fieldset>
      <fieldset><legend>Privacidade</legend>${chk('readReceipts', 'Enviar confirmação de leitura (tique azul)')}${chk('typing', 'Mostrar "digitando..." para os outros')}</fieldset>
      <fieldset><legend>Motor de conexão (precisa reiniciar)</legend><label><input type="radio" name="eng" value="go" ${c.engine !== 'web' ? 'checked' : ''}> whatsmeow — conexão direta (recomendado)</label><label><input type="radio" name="eng" value="web" ${c.engine === 'web' ? 'checked' : ''}> WhatsApp Web escondido (modo antigo)</label></fieldset>
      <fieldset><legend>Away</legend>${chk('awayAutoReply', 'Responder pvts automaticamente quando away')}<div class="drow">Msg: <input type="text" data-k="awayMessage" style="flex:1" value="${esc(c.awayMessage || '')}"></div></fieldset>`,
    buttons: [['OK', (d) => {
      const p = {}; d.querySelectorAll('[data-k]').forEach((i) => (p[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.value));
      const eng = $('input[name=eng]:checked', d)?.value || 'go';
      const changed = eng !== (S.cfg.engine === 'web' ? 'web' : 'go');
      p.engine = eng;
      setCfg(p).then(() => { if (changed && confirm('Trocar o motor exige reiniciar o CyberWhats (você vai precisar escanear o QR code de novo na primeira vez). Reiniciar agora?')) api('app:relaunch'); });
    }], ['Cancelar', null]]
  });
}
function listEditor(title, key, help) {
  const items = [...(S.cfg[key] || [])];
  const body = h('div');
  body.innerHTML = `<div>${esc(help)}</div><div class="drow"><select size="8" style="flex:1;height:130px"></select><div style="display:flex;flex-direction:column;gap:4px"><button class="btn" data-a="add">Adicionar</button><button class="btn" data-a="del">Remover</button></div></div>`;
  const sel = $('select', body);
  const render = () => { sel.innerHTML = items.map((j, i) => `<option value="${i}">${esc(labelFor(j))}</option>`).join(''); };
  render();
  body.addEventListener('click', async (e) => {
    const a = e.target.dataset.a;
    if (a === 'add') { const v = await ask(title, 'Nick ou número:'); if (v) { const j = await resolveTarget(v); if (j) { items.push(j); render(); } } }
    if (a === 'del' && sel.value !== '') { items.splice(+sel.value, 1); render(); }
  });
  dialog({ title, body, width: 380, buttons: [['OK', () => setCfg({ [key]: items }).then(() => key === 'notify' && subscribeNotify())], ['Cancelar', null]] });
}
function labelFor(jid) {
  const c = S.chats.find((x) => x.id === jid);
  if (c) return c.group ? chanOf(c.id, c.name) : `${alias(jid) || c.name} (+${num(jid)})`;
  for (const [n, j] of S.nickIdx) if (j === jid) return `${n} (+${num(jid)})`;
  return '+' + num(jid);
}
const dlgNotify = () => listEditor('Notify List', 'notify', 'Avisar quando estes contatos ficarem online:');
const dlgIgnore = () => listEditor('Ignore List', 'ignore', 'Ignorar mensagens destes contatos:');
function groupPicker(title, help, selected, multi, onOk, extra = '') {
  const groups = S.chats.filter((c) => c.group).sort((a, b) => a.name.localeCompare(b.name));
  const body = h('div');
  body.innerHTML = `<div>${esc(help)}</div><div class="drow"><input type="text" placeholder="filtrar..." style="flex:1"></div><select ${multi ? 'multiple' : ''} size="12" style="width:100%;height:220px">${groups.map((g) => `<option value="${g.id}" ${selected.includes(g.id) ? 'selected' : ''}>${esc(chanOf(g.id, g.name))}  [${g.size || '?'}]</option>`).join('')}</select>${extra ? '<div style="margin-top:6px">' + extra + '</div>' : ''}`;
  $('input', body).addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); body.querySelectorAll('option').forEach((o) => (o.hidden = !o.textContent.toLowerCase().includes(q))); });
  $('select', body).addEventListener('dblclick', () => { if (!multi) body.closest('.dlg').querySelector('.btn').click(); });
  return dialog({ title, body, width: 400, buttons: [['OK', (d) => onOk([...$('select', d).selectedOptions].map((o) => o.value), d)], ['Cancelar', null]] });
}
const dlgFavorites = () => groupPicker('Pasta de Canais', 'Escolha um grupo para entrar (duplo-clique):', [], false, (ids) => ids[0] && openChannel(ids[0], true));
const dlgAutojoin = () => groupPicker('Auto-Join', 'Grupos abertos automaticamente ao conectar (Ctrl+clique para vários):', S.cfg.autojoin || [], true,
  (ids, d) => { const all = $('#aj-all', d).checked; setCfg({ autojoin: ids, autojoinAll: all }); if ($('#aj-now', d).checked && S.conn === 'online') autoJoin(all ? true : undefined); },
  `<label><input type="checkbox" id="aj-all" ${S.cfg.autojoinAll ? 'checked' : ''}> Entrar automaticamente em <b>TODOS</b> os meus grupos ao conectar</label><label><input type="checkbox" id="aj-now"> Entrar agora</label>`);
function dlgTheme() {
  dialog({
    title: 'Theme Manager', width: 340,
    body: `<fieldset><legend>Tema</legend><label><input type="radio" name="t" value="padrao" ${S.cfg.theme !== 'dark' && S.cfg.theme !== 'classico' ? 'checked' : ''}> Padrão (CyberScript)</label><label><input type="radio" name="t" value="classico" ${S.cfg.theme === 'classico' ? 'checked' : ''}> Clássico (branco)</label><label><input type="radio" name="t" value="dark" ${S.cfg.theme === 'dark' ? 'checked' : ''}> Dark</label></fieldset>
    <fieldset><legend>Ícones</legend><label><input type="radio" name="ic" value="modern" ${S.cfg.iconSet !== 'classic' ? 'checked' : ''}> Modernos</label><label><input type="radio" name="ic" value="classic" ${S.cfg.iconSet === 'classic' ? 'checked' : ''}> Clássicos (CyberScript)</label></fieldset>
    <fieldset><legend>Tamanho</legend><label>Fonte do bate-papo: <select data-k="fontSize"><option>12</option><option>14</option><option>16</option><option>18</option><option>20</option><option>24</option></select></label>
    <label>Interface (menus, barras, listas): <select data-k="uiSize"><option value="11">Pequena (clássica)</option><option value="13">Normal</option><option value="15">Grande</option><option value="17">Muito grande</option><option value="20">Enorme</option></select></label></fieldset>`,
    onOpen: (d) => { $('[data-k=fontSize]', d).value = String(S.cfg.fontSize || 16); $('[data-k=uiSize]', d).value = String(S.cfg.uiSize || 13); },
    buttons: [['OK', (d) => setCfg({ theme: $('input[name=t]:checked', d).value, iconSet: $('input[name=ic]:checked', d).value, fontSize: +$('[data-k=fontSize]', d).value, uiSize: +$('[data-k=uiSize]', d).value })], ['Cancelar', null]]
  });
}
function applyTheme() {
  const r = document.documentElement.style;
  const t = S.cfg.theme;
  const dark = t === 'dark';
  r.setProperty('--buf-bg', dark ? '#000000' : '#ffffff');
  r.setProperty('--buf-fg', dark ? '#d0d0d0' : '#000000');
  r.setProperty('--nick-bg', dark ? '#000000' : t === 'classico' ? '#ffffff' : '#d0d0d0');
  r.setProperty('--nick-fg', dark ? '#d0d0d0' : '#000000');
  r.setProperty('--edit-bg', dark ? '#000000' : '#ffffff');
  r.setProperty('--edit-fg', dark ? '#ffffff' : t === 'classico' ? '#000000' : '#000080');
  r.setProperty('--mono-size', (S.cfg.fontSize || 16) + 'px');
  const ui = S.cfg.uiSize || 13;
  r.setProperty('--ui-size', ui + 'px');
  r.setProperty('--z', (ui / 11).toFixed(3));
  // paleta do chat em variáveis CSS: trocar o tema recolore também as linhas já escritas
  const DARK = ['#000000', '#d0d0d0', '#7f9cff', '#3cc83c', '#ff5050', '#e07050', '#e070e0', '#ff9c30', '#ffff40', '#60ff60', '#30c8c8', '#60ffff', '#58a8ff', '#ff60ff', '#a8a8a8', '#606060'];
  window.F.PALETTE.forEach((c, i) => r.setProperty('--c' + i, dark ? DARK[i] : c));
  refreshIcons();
}
function dlgAbout() {
  api('app:version').then((v) => dialog({
    title: 'About - CyberWhats', width: 420,
    body: `<img class="about-logo" src="assets/about.png" width="389"><div style="text-align:center;line-height:1.6"><b>CyberWhats ${esc(v)}</b><br>Por <b>Paulo Johnny Alves</b><br><a class="url" data-url="mailto:johnny.alves@gmail.com">johnny.alves@gmail.com</a> · <a class="url" data-url="https://www.cyberwhats.org">www.cyberwhats.org</a><br><br><i>"Saudades do #brasil na BRASnet..."</i><br><br><span style="color:#808080">Baseado no <b>CyberScript 3.2</b>: artes, ícones, sons, temas, frases e todo o estilo visual são criação da equipe original do CyberScript — os créditos são todos deles. Esta é só uma homenagem.<br>Fonte: Fixedsys Excelsior 3.01 · Motor: whatsmeow<br>Projeto não-oficial, sem afiliação com o WhatsApp/Meta.</span></div>`
  }));
}
function dlgProfile() {
  dialog({
    title: 'Nick-Senhas (Perfil)', width: 360,
    body: `<div class="drow">Nick: <input type="text" data-k="nick" style="flex:1" value="${esc(S.me?.name || '')}"></div><div class="drow">Recado: <input type="text" data-k="recado" style="flex:1"></div><div style="color:#808080">Deixe o recado em branco para não alterar.</div>`,
    buttons: [['OK', (d) => { const n = $('[data-k=nick]', d).value.trim(), r = $('[data-k=recado]', d).value.trim(); if (n && n !== S.me?.name) run('/nick ' + n, cur()); if (r) run('/recado ' + r, cur()); }], ['Cancelar', null]]
  });
}

// ======================================================================
//  Abertura de janelas de chat
// ======================================================================
async function openChannel(jid, focus) {
  let w = getWin(jid);
  const chat = S.chats.find((c) => c.id === jid);
  if (!w) {
    w = makeWin(jid, 'channel', chanOf(jid, chat?.name), { jid });
    w.add(T.joinSelf(chanOf(jid, chat?.name)));
    try {
      const g = await api('wa:group', jid);
      if (g) {
        S.groups.set(jid, g); w.setNicks(g);
        const adm = g.participants.filter((p) => p.admin).length;
        w.add(`${PRE} Status [${U}Admins(${adm})${U} ${U}Normais(${g.participants.length - adm})${U} ${U}Total(${g.participants.length})${U}]`, { nots: true });
        if (g.desc) w.add(T.topicIs(w.name, g.desc.replace(/\s+/g, ' ')));
        if (g.creation) w.add(T.topicBy((g.owner && w.nickOf(g.owner)?.nick) || (g.owner ? '+' + num(g.owner) : '?'), new Date(g.creation * 1000).toLocaleString('pt-BR')));
      }
    } catch (e) { w.add(T.err(friendlyError(e, 'obter os participantes'))); }
    await loadHistory(w);
  }
  if (focus) activate(jid);
  return w;
}
async function openQuery(jid, nick, focus) {
  let w = getWin(jid);
  if (!w) {
    const name = nickFor(jid, nick || labelFor(jid));
    indexNick(name, jid);
    w = makeWin(jid, 'query', name, { jid });
    w.setTitle(`${name} (+${num(jid)})`);
    S.pvtCount = (S.pvtCount || 0) + 1;
    loadPhoto(w);
    const common = [...S.groups.values()].filter((g) => g.participants?.some((p) => p.id === jid)).map((g) => (g.participants.find((p) => p.id === jid).admin ? '@' : '') + chanOf(g.id, g.subject));
    w.add(`${C}14>>> ${name}`, { nots: true });
    w.add(`${C}14>>> Pvt nº ${S.pvtCount} - [+${num(jid)}]`, { nots: true });
    w.add(`${C}14>>> Canais em comum: ${common.length ? common.join(' ') : '-'}`, { nots: true });
    w.add('', { nots: true });
    await loadHistory(w);
  }
  if (focus) activate(jid);
  return w;
}
async function loadHistory(w) {
  try {
    const hist = await api('wa:history', w.jid);
    if (hist.length) {
      w.add(`${C}14---- Histórico (${hist.length} mensagens) ----`, {});
      for (const m of hist) renderMsg(w, m, true);
      w.add(`${C}14---- Fim do histórico ----`, { forceScroll: true });
    }
  } catch {}
}

// "/me" vai para o WhatsApp como "* Nick ação" (para quem não usa o CyberWhats entender);
// ao exibir, tira o nick repetido do começo
function actionText(t) { return `* ${myNick()} ${t}`; }
function actionBody(m, shown, t) {
  const cands = [shown, m.nick, m.fromMe ? myNick() : '', m.fromMe ? S.me?.name : ''].filter(Boolean).flatMap((n) => [n, cleanNick(n), String(n).replace(/_/g, ' ')]);
  const lt = t.toLowerCase();
  for (const c of cands.sort((a, b) => b.length - a.length)) if (lt.startsWith(c.toLowerCase() + ' ')) return t.slice(c.length + 1);
  return t;
}
// ---- "mensagens novas": até onde cada conversa já foi vista (guardado no navegador do app)
const SEEN = (() => { try { return JSON.parse(localStorage.getItem('cw.seen') || '{}'); } catch { return {}; } })();
const LAST_RUN = (() => { try { return Number(localStorage.getItem('cw.lastRun')) || 0; } catch { return 0; } })();
let seenTimer = null;
function setSeen(jid, ts = Date.now() / 1000) {
  if (!jid) return;
  if ((SEEN[jid] || 0) >= ts) return;
  SEEN[jid] = ts;
  clearTimeout(seenTimer);
  seenTimer = setTimeout(() => { try { localStorage.setItem('cw.seen', JSON.stringify(SEEN)); } catch {} }, 1000);
}
function saveRun() { try { localStorage.setItem('cw.lastRun', String(Date.now() / 1000)); localStorage.setItem('cw.seen', JSON.stringify(SEEN)); } catch {} }
setInterval(saveRun, 60000);
addEventListener('beforeunload', () => { const w = S.wins.get(S.active); if (w?.jid) SEEN[w.jid] = Date.now() / 1000; saveRun(); });
// coloca a linha "mensagens novas" antes da primeira mensagem não vista da conversa
function markNew(w, m, ln, hist) {
  if (!w.jid || !ln || m.fromMe) return;
  const watching = S.active === w.id && document.hasFocus() && !(S.wins.get(S.active)?.el.classList.contains('min'));
  if (watching && !hist) { setSeen(w.jid, m.ts); return; }
  if (w._newMark) return;
  const since = SEEN[w.jid] ?? LAST_RUN;
  if (!since || m.ts <= since) return;
  const sep = h('div', { class: 'ln newsep' });
  sep.innerHTML = codesToHtml(`${C}4—————————— mensagens novas ——————————`);
  w.buf.insertBefore(sep, ln);
  w._newMark = sep; w.lines++;
}
function setReaction(ln, who, emoji) {
  ln._reacts = ln._reacts || new Map();
  if (emoji) ln._reacts.set(who, emoji); else ln._reacts.delete(who);
  let sp = ln.querySelector(':scope > .reacts');
  if (!ln._reacts.size) { sp?.remove(); return; }
  if (!sp) { sp = h('span', { class: 'reacts' }); const media = ln.querySelector(':scope > .inmedia'); if (media) ln.insertBefore(sp, media); else ln.appendChild(sp); }
  const count = new Map();
  for (const e of ln._reacts.values()) count.set(e, (count.get(e) || 0) + 1);
  sp.textContent = ' ' + [...count].map(([e, n]) => e + (n > 1 ? n : '')).join(' ');
  sp.title = [...ln._reacts].map(([n, e]) => `${n}: ${e}`).join('\n');
}
// ---- mensagens de erro: traduz os códigos do WhatsApp para algo legível e guarda o original no log
const ACTION_OF = { topic: 'mudar o tópico', t: 'mudar o tópico', assunto: 'renomear o grupo', subject: 'renomear o grupo', rename: 'renomear o grupo',
  op: 'dar admin', deop: 'tirar admin', kick: 'remover alguém do grupo', k: 'remover alguém do grupo', invite: 'adicionar alguém ao grupo', add: 'adicionar alguém ao grupo',
  convite: 'pegar o link de convite', link: 'pegar o link de convite', sairgrupo: 'sair do grupo', leave: 'sair do grupo', nick: 'mudar seu nome', recado: 'mudar seu recado', status: 'mudar seu recado',
  msg: 'enviar a mensagem', m: 'enviar a mensagem', r: 'enviar a mensagem', whois: 'buscar as informações', w: 'buscar as informações', names: 'listar os participantes', enviar: 'enviar o arquivo', dcc: 'enviar o arquivo', send: 'enviar o arquivo', join: 'abrir o grupo', j: 'abrir o grupo', query: 'abrir o pvt', q: 'abrir o pvt' };
function friendlyError(err, action) {
  const raw = String(err?.message || err || '').replace(/^Error invoking remote method '[^']+': /, '').replace(/^(Error: )+/, '').trim();
  const a = action ? ' ' + action : '';
  const tests = [
    [/upload/i, 'Não consegui enviar o arquivo. Tente de novo.'],
    [/download|\b410\b|\bgone\b/i, 'Essa mídia não está mais disponível no WhatsApp.'],
    [/outdated|client.?version/i, 'Esta versão do CyberWhats ficou desatualizada para o WhatsApp. Atualize o app.'],
    [/logged.?out|unpaired|device.?removed/i, 'A sessão foi encerrada pelo celular. Use /server para conectar de novo.'],
    [/\b40[13]\b|not-authorized|forbidden|not.?admin/i, action ? `Você não tem permissão para${a}: só os admins do grupo podem.` : 'Você não tem permissão para isso: só os admins do grupo podem.'],
    [/\b404\b|item-not-found|not found/i, 'O WhatsApp não encontrou isso (o contato, grupo ou mensagem pode não existir mais).'],
    [/\b409\b|conflict/i, 'Isso já está feito (por exemplo, a pessoa já está no grupo).'],
    [/\b406\b|not-acceptable|bad-request|\b400\b/i, action ? `O WhatsApp recusou o pedido para${a}.` : 'O WhatsApp recusou o pedido.'],
    [/\b429\b|rate-?overlimit|too many/i, 'Muitas tentativas seguidas. Espere um pouco e tente de novo.'],
    [/\b5\d\d\b|internal-server-error|service-unavailable/i, 'O WhatsApp está com problema agora. Tente de novo em instantes.'],
    [/no such host|dial tcp|network is unreachable|connection refused|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH|i\/o timeout/i, 'Sem conexão com a internet (ou o WhatsApp está fora do ar). Confira sua rede.'],
    [/timed? ?out|deadline exceeded|tempo esgotado|timeout/i, 'O WhatsApp demorou demais para responder. Tente de novo.'],
    [/not connected|websocket|not logged in|disconnected|connection (closed|reset)/i, 'Você não está conectado. Use /server.'],
    [/not on whatsapp/i, 'Esse número não está no WhatsApp.'],
    [/ENOENT|no such file/i, 'Arquivo não encontrado.'],
    [/EACCES|EPERM|permission denied/i, 'Sem permissão para acessar o arquivo.'],
    [/ENOSPC/i, 'O disco está cheio.'],
    [/EPIPE|exited|motor/i, 'O motor do WhatsApp parou. Tente reconectar com /server.']
  ];
  let msg = null;
  for (const [re, txt] of tests) if (re.test(raw)) { msg = txt; break; }
  // mensagens que já são nossas (em português) passam direto
  if (!msg && raw && !/\b(the|failed|error|to|of|with|status|returned|connection|refused|unexpected|invalid|could|cannot|unable|while|got|expected|is|was)\b|[a-z]+-[a-z]+-?[a-z]*\b.*\d{3}/i.test(raw)) msg = raw;
  if (!msg) msg = (action ? `Não foi possível${a}.` : 'Algo deu errado.') + ' Detalhes em /log.';
  if (raw && msg !== raw) api('app:logError', `${action || '-'} :: ${raw}`).catch(() => {});
  return msg;
}
// texto numa linha só, cortado no fim de uma palavra
function shortText(t, max = 60, cutAlready = false) {
  t = strip(waToCodes(String(t || ''))).replace(/\s+/g, ' ').trim();
  if (t.length <= max && !cutAlready) return t;
  let cut = t.slice(0, max);
  if (cut.lastIndexOf(' ') > max * 0.6 || (cutAlready && cut.lastIndexOf(' ') > 0)) cut = cut.slice(0, cut.lastIndexOf(' '));
  return cut.replace(/[\s.,;:!?-]+$/, '') + '...';
}
function senderNick(w, m) {
  if (m.fromMe) return myNick();
  if (w.type === 'channel') { const n = w.nickOf(m.sender); if (n) return n.nick; }
  if (w.type === 'query') return w.name;
  return nickFor(m.sender, m.nick);
}
function renderMsg(w, m, hist = false) {
  const nick = senderNick(w, m);
  indexNick(nick, m.sender);
  const adm = w.type === 'channel' ? w.nickOf(m.sender)?.admin : null;
  const date = new Date(m.ts * 1000);
  let text = waToCodes(m.text || '');
  const hl = !m.fromMe && (m.mentions?.some((x) => x.me) || (S.me?.name && new RegExp(`\\b${S.me.name.split(' ')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(m.text || '')));
  if (m.mentions) for (const mt of m.mentions) text = text.replace('@' + mt.num, `${B}@${cleanNick(mt.nick)}${B}`);
  // menções que vieram só com o número: troca pelo nick de quem está no canal
  if (w.type === 'channel') text = text.replace(/@(\d{8,})/g, (all, n) => { const x = w.nicks.find((y) => num(y.id) === n); return x ? `${B}@${x.nick}${B}` : all; });
  let html = '';
  if (m.kind === 'media') {
    const cap = m.caption ? ' ' + waToCodes(m.caption) : m.fileName ? ' ' + m.fileName : '';
    const extra = m.seconds ? ` (${Math.floor(m.seconds / 60)}:${pad(m.seconds % 60)})` : m.size ? ` (${(m.size / 1024).toFixed(0)} KB)` : '';
    text = `${C}10[${m.ptt ? 'Mensagem de voz' : m.media}${extra}]${O}${cap}`;
    if (m.hasMedia) html = ` <a class="media" data-chat="${esc(m.chat)}" data-id="${esc(m.id)}">(abrir)</a>`;
    if (S.cfg.inlineMedia !== false && m.hasMedia) html += inlineMediaHtml(m);
  }
  if (m.edited) html += ' <span style="color:#808080">(editada)</span>';
  const lines = text.split('\n');
  // tamanho visível do "<nick> " para alinhar as linhas seguintes com o começo do texto
  const prefix = m.kind === 'action' ? T.action(nick, '') : w.type === 'channel' ? (m.fromMe ? T.textChanSelf(nick, adm, '') : T.textChan(nick, adm, '', hl)) : (m.fromMe ? T.textQuerySelf(nick, '') : T.textQuery(nick, ''));
  const indent = Math.min(strip(prefix).length, 30);
  let first;
  lines.forEach((t, i) => {
    let s;
    if (i > 0) s = `${hl ? C + '5' : m.kind === 'action' ? C + '6' : ''}${t}`;
    else if (m.kind === 'action') s = T.action(nick, actionBody(m, nick, t));
    else if (w.type === 'channel') s = m.fromMe ? T.textChanSelf(nick, adm, t) : T.textChan(nick, adm, t, hl);
    else s = m.fromMe ? T.textQuerySelf(nick, t) : T.textQuery(nick, t);
    const ln = w.add(s, { date, hist, id: m.id, nick, jid: m.fromMe ? null : m.sender, html: i === lines.length - 1 ? html : '', activity: hist ? null : hl ? 'hl' : 'msg', forceScroll: m.fromMe && !hist, indent, cont: i > 0 });
    // resposta (citação): linha cinza logo abaixo da mensagem, dizendo a quem respondeu
    if (i === lines.length - 1 && ln && m.quote) w.add(`${C}14└ respondendo ${cleanNick(m.quote.nick)}: ${shortText(m.quote.text, 80, Array.from(m.quote.text || '').length === 60)}`, { date, hist, indent, cont: true, cls: 'quote' });
    if (ln && i === lines.length - 1 && ln.querySelector('.inmedia')) queueMedia(w, m, ln, hist);
    if (i === 0 && ln && !m.fromMe) markNick(ln, nick);
    if (i === 0 && ln) markNew(w, m, ln, hist);
    // reações guardadas (chegaram antes da janela abrir, ou em outra sessão)
    if (i === lines.length - 1 && ln && m.reactions) for (const r of Object.values(m.reactions)) setReaction(ln, r.fromMe ? myNick() : cleanNick(r.nick), r.emoji);
    first = first || ln;
  });
  return first;
}

// ======================================================================
//  Eventos do WhatsApp
// ======================================================================
function onWa(ev) {
  const status = st();
  switch (ev.type) {
    case 'state': {
      const prev = S.conn;
      S.conn = ev.state;
      if (ev.me) { S.me = ev.me; indexNick(cleanNick(ev.me.name), ev.me.id); }
      status.setIcon(S.conn === 'online' ? 'online' : 'offline');
      if (ev.state === 'connecting') status.add(`${C}2* Conectando em web.whatsapp.com (443)`);
      if (ev.state === 'online') S.chats = S.chats || [];
      if (ev.state === 'online') {
        play('connect');
        status.add(T.info(`Conectado! Seu nick agora é: ${C}12${myNick()} ${C}2(+${num(S.me.id)})`));
        status.add(T.info('Sincronizando conversas... use /list para ver os canais (grupos).'));
        status.setTitle(`Status: ${myNick()} [+i] no WhatsApp`);
        setTimeout(autoJoin, 2500);
        setTimeout(subscribeNotify, 4000);
        if (S.cfg.showRecent !== false && !S.recentShown) { S.recentShown = true; setTimeout(() => cmdRecent(30, true), 6500); }
        if (S.cfg.showMotd !== false && !S.motdShown) { S.motdShown = true; setTimeout(async () => { await showLusers(); await showMotd(); }, 3500); }
        setTimeout(() => { for (const x of S.wins.values()) if (x.type === 'query') { x._photoLoaded = false; loadPhoto(x); } }, 3500);
        setTimeout(() => api('wa:contacts').then((l) => { S.contacts = l; for (const c of l) indexNick(c.nick, c.id); }).catch(() => {}), 3000);
        hideQr();
        if (prev !== 'online') setTimeout(() => fireScript('CONNECT', {}), 5000);
      }
      if (ev.state === 'offline' && prev !== 'offline') {
        fireScript('DISCONNECT', {});
        play('disconnect');
        status.add(T.err(`Desconectado${ev.reason ? ': ' + friendlyError(ev.reason) : ''}`));
        if (!S.me) status.add(T.info(`Detalhes técnicos em ${C}12/log${C}2 (arquivo conexao.log).`));
        status.setTitle('Status: (não conectado)');
        for (const w of S.wins.values()) if (w.type !== 'status') w.add(T.err('Desconectado'));
      }
      updateAppTitle(); sysinfo();
      break;
    }
    case 'qr':
      showQr(ev.dataUrl);
      break;
    case 'pairing':
      status.add(T.info(`Código de pareamento: ${C}4${B}${ev.code}`));
      status.add(T.info('No celular: WhatsApp > Dispositivos conectados > Conectar dispositivo > Conectar com número de telefone.'));
      activate('status');
      break;
    case 'loggedOut':
      status.add(T.err('A sessão foi encerrada no celular. Use /server para conectar novamente.'));
      break;
    case 'info':
      status.add(T.info(ev.text));
      break;
    case 'retry':
      status.add(T.info(`Tentando reconectar em ${ev.seconds}s... (/disconnect para cancelar)`));
      break;
    case 'error': {
      // "Falha ao conectar: <detalhe em inglês>" -> mantém o começo e traduz o detalhe
      const mm = /^([^:]{3,60}): (.+)$/.exec(ev.text || '');
      status.add(T.err(mm && /^[A-ZÀ-Ú][a-zà-ú]/.test(mm[1]) ? `${mm[1]}. ${friendlyError(mm[2])}` : friendlyError(ev.text)));
      break;
    }
    case 'sync':
    case 'chats':
      if (ev.chats) { S.chats = ev.chats; for (const c of S.chats) if (!c.group) indexNick(c.name, c.id); }
      if (ev.type === 'sync' && ev.progress === 100) status.add(T.info(`Sincronização concluída: ${C}12${S.chats.length}${C}2 conversas.`));
      if (ev.touched) for (const jid of ev.touched) { const w = getWin(jid); if (w) { /* histórico chega depois da janela aberta */ } }
      break;
    case 'message': onMessage(ev.msg); break;
    case 'edit': {
      const w = getWin(ev.chat); if (!w) break;
      const ln = w.buf.querySelector(`.ln[data-id="${CSS.escape(ev.id)}"]`);
      w.add(`${C}14* ${cleanNick(ev.nick)} editou: ${O}${waToCodes(ev.text)}`, { activity: 'event' });
      if (ln) ln.style.color = '#808080';
      break;
    }
    case 'revoke': {
      const w = getWin(ev.chat); if (!w) break;
      const ln = w.buf.querySelector(`.ln[data-id="${CSS.escape(ev.id)}"]`);
      if (ln) { ln.innerHTML = `<s>${ln.innerHTML}</s>`; ln.classList.add('deleted'); }
      w.add(`${C}14* ${cleanNick(ev.nick || '?')} apagou uma mensagem`, { activity: 'event' });
      break;
    }
    case 'reaction': {
      const w = getWin(ev.chat); if (!w || !w.buf) break;
      const who = ev.fromMe ? myNick() : cleanNick(ev.nick);
      // reação aparece na própria mensagem (como no WhatsApp); só vira linha se a mensagem não estiver na tela
      const lns = ev.targetId ? w.buf.querySelectorAll(`.ln[data-id="${CSS.escape(ev.targetId)}"]`) : [];
      if (lns.length) { setReaction(lns[lns.length - 1], who, ev.emoji); break; }
      if (!ev.emoji) break;
      w.add(T.action(who, `reagiu com ${ev.emoji}${ev.target ? ` a "${shortText(ev.target, 50, ev.target.length === 40)}"` : ''}`), { activity: 'event' });
      break;
    }
    case 'presence': {
      const w = getWin(ev.chat);
      const nick = w?.type === 'channel' ? w.nickOf(ev.who)?.nick || cleanNick(ev.nick) : w?.name || cleanNick(ev.nick);
      if (w && (ev.presence === 'composing' || ev.presence === 'recording')) w.setTyping(nick + (ev.presence === 'recording' ? ' (gravando áudio)' : ''), true);
      else if (w) { w.setTyping(nick, false); w.setTyping(nick + ' (gravando áudio)', false); }
      if ((S.cfg.notify || []).includes(ev.who)) {
        const was = S.notifyState?.get(ev.who);
        const on = ev.presence !== 'unavailable';
        S.notifyState = S.notifyState || new Map();
        if (was !== on) { S.notifyState.set(ev.who, on); (on ? play('online') : 0); cur().add(on ? T.notify(cleanNick(ev.nick), '+' + num(ev.who)) : T.unotify(cleanNick(ev.nick), '+' + num(ev.who))); if (cur() !== status) status.add(on ? T.notify(cleanNick(ev.nick), '+' + num(ev.who)) : T.unotify(cleanNick(ev.nick), '+' + num(ev.who))); }
      }
      break;
    }
    case 'msg-id': {
      const w = getWin(ev.chat);
      const ln = w?.buf?.querySelector(`.ln[data-id="${CSS.escape(ev.oldId)}"]`);
      if (ln) ln.dataset.id = ev.newId;
      break;
    }
    case 'group': if (ev.group) { S.groups.set(ev.group.id, ev.group); getWin(ev.group.id)?.setNicks(ev.group); } break;
    case 'group-event': onGroupEvent(ev); break;
    case 'call':
      play('notice');
      status.add(T.info(`${C}4Chamada de ${ev.video ? 'vídeo' : 'voz'} recebida de ${cleanNick(ev.nick)} (+${num(ev.from)}) — atenda pelo celular.`));
      (getWin(ev.from) || status).add(`${C}4*** ${cleanNick(ev.nick)} está te ligando (${ev.video ? 'vídeo' : 'voz'})`, { activity: 'hl' });
      break;
  }
}
async function onMessage(m) {
  if (!m.fromMe && (S.cfg.ignore || []).includes(m.sender)) return;
  const idx = S.chats.findIndex((c) => c.id === m.chat);
  if (idx >= 0) S.chats[idx].ts = m.ts; else S.chats.unshift({ id: m.chat, name: m.chatName, group: m.group, ts: m.ts });
  let w = getWin(m.chat) || (m.alt && getWin(m.alt)) || null;
  const isNew = !w;
  if (!w) {
    // no IRC das antigas, um pvt novo abre a janela sem roubar o foco; grupo idem
    if (m.group) w = await openChannel(m.chat, false);
    else w = await openQuery(m.chat, m.nick, false);
    if (w.buf.querySelector(`.ln[data-id="${CSS.escape(m.id)}"]`)) { afterMsg(w, m, isNew); return; }
  }
  if (!w.buf.querySelector(`.ln[data-id="${CSS.escape(m.id)}"]`)) renderMsg(w, m);
  w.setTyping(senderNick(w, m), false);
  afterMsg(w, m, isNew);
}
function afterMsg(w, m, isNew) {
  if (m.fromMe) return;
  if ((m.kind === 'text' || m.kind === 'action') && m.text && Date.now() / 1000 - m.ts < 120 && SC.events.length) {
    let text = F.strip(waToCodes(m.text)).replace(/\s*\n\s*/g, ' ');
    if (m.kind === 'action') text = actionBody(m, senderNick(w, m), text);
    fireScript(m.kind === 'action' ? 'ACTION' : 'TEXT', { nick: senderNick(w, m), chan: w.type === 'channel' ? w.name : '', target: w.type === 'channel' ? w.name : senderNick(w, m), win: w.id, text });
  }
  if (S.active === w.id && document.hasFocus()) api('wa:read', w.jid).catch(() => {});
  else api('win:flash').catch(() => {});
  if (!m.group) {
    S.lastPvt = m.chat;
    if (isNew) play('pvt'); else if (S.active !== w.id) play('msg');
    if (S.away) {
      awayWin().add(`${C}12[${cleanNick(m.nick)}]${O} ${m.text || '[' + m.media + ']'}`, { activity: 'msg' });
      if (S.cfg.awayAutoReply && !S.awayReplied.has(m.chat)) {
        S.awayReplied.add(m.chat);
        api('wa:send', m.chat, `[Away] ${S.away.msg} (desde ${S.away.since})`).then((e) => e && renderMsg(w, e)).catch(() => {});
      }
    }
  } else if (m.mentions?.some((x) => x.me)) { play('notice'); if (S.away) awayWin().add(`${C}12[${w.name}/${cleanNick(m.nick)}]${O} ${m.text}`, { activity: 'hl' }); }
}
function awayWin() {
  let w = getWin('@away');
  if (!w) { w = makeWin('@away', 'custom', '@Away'); w.setTitle('@Away - mensagens recebidas enquanto away'); }
  return w;
}
function onGroupEvent(ev) {
  if (ev.group) S.groups.set(ev.chat, ev.group);
  const w = getWin(ev.chat);
  if (!w) return;
  if (ev.group) w.setNicks(ev.group);
  const by = ev.nick ? cleanNick(ev.nick) : null;
  const tn = (t) => (w.nickOf(t.id)?.nick || cleanNick(t.nick));
  for (const t of ev.targets || []) {
    const addr = num(t.id) + '@s.whatsapp.net';
    const self = S.me && t.id === S.me.id;
    if (ev.kind === 'add') { w.add(T.join(tn(t), addr), { activity: 'event' }); play('join'); fireScript('JOIN', { nick: tn(t), chan: w.name, target: w.name, win: w.id }); }
    if (ev.kind === 'remove') fireScript(by && by !== cleanNick(t.nick) && ev.authorId !== t.id ? 'KICK' : 'PART', { nick: cleanNick(t.nick), chan: w.name, target: w.name, win: w.id, knick: by });
    else if (ev.kind === 'remove') {
      if (by && by !== cleanNick(t.nick) && ev.authorId !== t.id) { w.add(T.kick(by, cleanNick(t.nick)), { activity: 'event' }); if (self) play('kick'); }
      else w.add(T.part(cleanNick(t.nick), addr, 'saiu do grupo'), { activity: 'event' });
    }
    else if (ev.kind === 'promote') { w.add(T.mode(by || 'Servidor', `+o ${tn(t)}`), { activity: 'event' }); if (self) play('op'); }
    else if (ev.kind === 'demote') w.add(T.mode(by || 'Servidor', `-o ${tn(t)}`), { activity: 'event' });
  }
  if (ev.kind === 'subject') w.add(T.subject(by || '?', chanName(ev.from), chanName(ev.text)), { activity: 'event' });
  if (ev.kind === 'topic') w.add(T.topic(by || '?', ev.text.replace(/\s+/g, ' ')), { activity: 'event' });
}

// ---------------- QR code ----------------
let qrDlg = null;
function showQr(dataUrl) {
  const status = st();
  const old = status.buf.querySelector('img.qr');
  if (old) { old.src = dataUrl; return; }
  status.add(T.info(`Escaneie o QR code abaixo com o celular ${C}12(WhatsApp > Dispositivos conectados > Conectar dispositivo)`), { html: `<img class="qr" src="${dataUrl}" width="246">` });
  status.add(T.info(`Prefere código numérico? Digite: ${C}12/server 55DDDNUMERO` + (S.engine === 'web' ? `${C}2 · Para ver a tela original do WhatsApp Web: ${C}12/web` : '')));
  activate('status');
  qrDlg = true;
}
function hideQr() {
  const status = st();
  status.buf.querySelectorAll('img.qr').forEach((i) => i.remove());
  qrDlg = null;
}

async function autoJoin(force) {
  const all = S.cfg.autojoinAll || force === true;
  const ids = all ? S.chats.filter((c) => c.group).sort((a, b) => (b.ts || 0) - (a.ts || 0)).map((c) => c.id) : (S.cfg.autojoin || []).filter((id) => S.chats.some((c) => c.id === id));
  if (!ids.length) return;
  st().add(T.info(`Auto-join: entrando em ${C}12${ids.length}${C}2 canais...`));
  for (const id of ids) {
    if (S.conn !== 'online') break;
    if (!getWin(id)) { try { await openChannel(id, false); } catch {} await new Promise((r) => setTimeout(r, 150)); }
  }
}
async function subscribeNotify() {
  for (const jid of S.cfg.notify || []) api('wa:subscribe', jid).catch(() => {});
}

// ======================================================================
//  Comandos /
// ======================================================================
async function resolveTarget(q) {
  if (!q) return null;
  if (/^\+?\d[\d\s()-]{7,}$/.test(q)) {
    const j = await api('wa:resolve', q.replace(/\D/g, '')).catch(() => null);
    return j;
  }
  if (q.startsWith('#')) return findChan(q);
  return findNick(q) || findChan(q);
}
const HELP = [
  ['/msg <nick|número> <texto>', 'envia mensagem privada'], ['/query <nick|número>', 'abre um pvt'], ['/join #grupo', 'abre a janela de um grupo (canal)'],
  ['/part', 'fecha a janela atual'], ['/sairgrupo', 'sai de verdade do grupo atual'], ['/me <ação>', 'envia uma ação (* nick ação)'],
  ['/list [filtro]', 'lista seus grupos'], ['/contatos [filtro]', 'lista seus contatos (pvt com duplo-clique)'], ['/recentes [N] | on | off', 'contatos com quem você falou por último (on/off: abrir ao conectar)'], ['/autojoin on|off|agora', 'entra em todos os grupos ao conectar'], ['/names', 'lista os participantes do canal'], ['/whois [nick]', 'informações do contato'],
  ['/topic [texto]', 'mostra ou muda a descrição do grupo'], ['/assunto <nome>', 'renomeia o grupo'], ['/op /deop <nick>', 'promove/rebaixa admin'],
  ['/kick <nick>', 'remove do grupo'], ['/invite <número>', 'adiciona ao grupo atual'], ['/convite', 'mostra o link de convite do grupo'],
  ['/nick <novo>', 'muda seu nome no WhatsApp'], ['/apelido <alvo> <apelido>', 'apelido local p/ contato, #canal ou "eu" (só no CyberWhats)'], ['/meunick <apelido>', 'seu apelido local'], ['/recado <texto>', 'muda seu recado (status)'], ['/away [msg] /back', 'marca/desmarca away'],
  ['/notify <nick>', 'avisa quando o contato ficar online (/unnotify desfaz)'], ['/ignore <nick>', 'ignora mensagens (/unignore desfaz)'], ['/enviar', 'envia arquivo (DCC Send) — ou arraste para a janela'],
  ['/r <texto>', 'responde ao último pvt'], ['/server [número]', 'conecta (QR ou código)'], ['/disconnect /logout', 'desconecta / encerra a sessão'],
  ['/web', 'mostra o WhatsApp Web original (só no motor antigo)'], ['/interface <px> /fonte <px>', 'tamanho da interface / do bate-papo'], ['/icones [moderno|classico]', 'alterna entre ícones modernos e clássicos'], ['/clear', 'limpa a janela'], ['/log /recebidos', 'abre pastas'], ['/tile /cascade', 'organiza as janelas'], ['/dicas', 'dica do CyberScript'],
  ['/motd', 'mostra a mensagem do dia (MOTD)'], ['/lusers', 'estatísticas: canais, contatos, usuários'], ['/echo <texto>', 'escreve só na sua tela'], ['/say <texto>', 'envia texto (mesmo começando com /)'],
  ['/opcoes', 'abre as opções (Alt+O)'], ['/about', 'sobre o CyberWhats'], ['/atalhos', 'lista os atalhos de teclado'], ['/ajuda scripts', 'referência da linguagem CyberWhats Script'],
  ['/scripts [nome]', 'abre o editor de scripts (Alt+R)'], ['/recarregar', 'recarrega todos os scripts (.cws)'], ['//comando', 'executa avaliando $identificadores e %variáveis'],
  ['/frase [categoria]', 'frase aleatória (cumulos, sogra, peido, taglines...) — script frases.cws'], ['/kickfrase <nick>', 'kicka com uma frase aleatória — script frases.cws'], ['/quitfrase', 'manda uma frase de quit — script frases.cws'],
  ['/gama [on|off|placar|pular]', 'Gama Game no canal atual — script gamagame.cws'], ['/gama pontos|tempo|intervalo N', 'configura o Gama Game']
];
const TIPS = [
  'Para alternar entre PVTs e Canais utilize os atalhos de ALT+1 a ALT+9, onde ALT+1 = Primeira janela, ALT+2 = Segunda janela, e assim por diante.',
  'Use TAB para completar nicks no canal. Teclando TAB de novo você alterna entre os nicks parecidos.',
  'Duplo-clique num pvt dá whois no contato. Para responder (citar) uma mensagem, clique com o botão direito na linha (nos canais, duplo-clique na linha também cita). ESC cancela.',
  'Use CTRL+B para *negrito* e CTRL+I para _itálico_ — o CyberWhats converte para a formatação do WhatsApp.',
  'Arraste arquivos para dentro de uma janela para enviá-los, igual DCC Send.',
  'Clique com o botão direito em um nick da nicklist para Whois, Query, Op, Kick...',
  'Coloque seus grupos favoritos no Auto-Join (Favoritos > Auto-Join) para eles abrirem sozinhos ao conectar.',
  'Use /away para marcar ausência: os pvts recebidos ficam guardados na janela @Away.',
  'Para mencionar alguém num grupo use @número ou clique com o botão direito no nick > Mencionar.',
  'No titulo da janela de canal aparecem o número de participantes e os modos: +m = só admins falam, +t = só admins mudam o tópico.'
];

async function run(line, w, opts = {}) {
  w = w || cur();
  if (!line.startsWith('/')) return say(w, line);
  // //comando = avalia identificadores/variáveis dos scripts antes de executar
  if (line.startsWith('//')) { const r = await SC.runLine(line.slice(2), scriptCtx(w)); return r; }
  const [cmdRaw, ...rest] = line.slice(1).split(' ');
  const cmd = cmdRaw.toLowerCase();
  const args = rest.join(' ').trim();
  const a1 = rest[0] || '';
  const tail = rest.slice(1).join(' ');
  const needOnline = () => { if (S.conn !== 'online') { w.add(T.err('Você não está conectado. Use /server')); return false; } return true; };
  try {
    switch (cmd) {
      case 'say': return say(w, args);
      case 'me': case 'action': if (!w.jid) return w.add(T.err('/me só funciona em canais e pvts')); return say(w, actionText(args), true);
      case 'msg': case 'm': {
        if (!needOnline()) return;
        const j = await resolveTarget(a1); if (!j) return w.add(`${T.pre} ${C}05 ${a1} ${C}1não está no WhatsApp.`);
        const e = await api('wa:send', j, codesToWa(tail));
        const tw = getWin(j); if (tw && e) renderMsg(tw, e); else w.add(`${C}12-> *${a1}*${O} ${tail}`);
        return;
      }
      case 'r': if (!S.lastPvt) return w.add(T.err('Nenhum pvt recebido ainda')); return run(`/msg +${num(S.lastPvt)} ${args}`, w);
      case 'query': case 'q': case 'pvt': {
        const j = await resolveTarget(a1); if (!j) return w.add(`${T.pre} ${C}05 ${a1} ${C}1não está no WhatsApp.`);
        const qw = await openQuery(j, /^\+?\d/.test(a1) ? labelFor(j).replace(/ \(.*/, '') : a1, true);
        if (tail) say(qw, tail);
        return;
      }
      case 'join': case 'j': {
        if (!args) return w.add(T.err('Uso: /join #grupo'));
        const j = findChan(args); if (!j) return w.add(`${T.pre} ${C}2Canal inexistente:${C}12 ${args}`);
        return openChannel(j, true);
      }
      case 'part': case 'close': case 'fechar': return (args ? getWin(findChan(args)) : w)?.close();
      case 'sairgrupo': case 'leave': {
        if (w.type !== 'channel' || !needOnline()) return w.add(T.err('Use dentro de um canal'));
        if (!confirm(`Sair DE VERDADE do grupo ${w.name}?`)) return;
        await api('wa:leave', w.jid); w.add(T.part(cleanNick(S.me.name), num(S.me.id) + '@s.whatsapp.net', 'saiu do grupo')); return;
      }
      case 'clear': case 'cls': case 'limpar': return w.clear();
      case 'list': case 'canais': return cmdList(args);
      case 'contatos': case 'users': case 'usuarios': case 'who': return cmdUsers(args);
      case 'autojoin': {
        if (/^(on|off)$/i.test(args)) { await setCfg({ autojoinAll: /on/i.test(args) }); return w.add(T.info(`Auto-join de todos os grupos: ${C}12${S.cfg.autojoinAll ? 'LIGADO' : 'desligado'}`)); }
        if (args === 'agora' || args === 'now') return autoJoin(true);
        return dlgAutojoin();
      }
      case 'names': {
        if (w.type !== 'channel') return;
        w.add(`${T.pre} ${C}2Usuários no${C}12 ${w.name}${C}2 (${w.nicks.length}):`);
        w.add(w.nicks.map((n) => (n.admin === 'superadmin' ? '.' : n.admin ? '@' : '') + n.nick).join(' '));
        return;
      }
      case 'whois': case 'w': {
        if (!needOnline()) return;
        const j = a1 ? await resolveTarget(a1) : w.type === 'query' ? w.jid : null;
        if (!j) return w.add(`${T.pre} ${C}05 ${a1 || '?'} ${C}1não está no WhatsApp.`);
        const r = await api('wa:whois', j);
        const t = w;
        t.add(`${T.pre} ${C}2Whois${C}12 ${cleanNick(r.nick)}`, r.pic ? { html: ` <img class="thumb" src="${esc(r.pic)}">` } : {});
        t.add(T.wrow('Endereço', `${num(r.id)}@s.whatsapp.net`));
        t.add(T.wrow('Nome', [r.name && `${r.name} (agenda)`, r.notify && `${r.notify} (perfil)`].filter(Boolean).join(' / ') || '-'));
        if (r.verified) t.add(T.wrow('Empresa', r.verified));
        t.add(T.wrow('Recado', r.status ? waToCodes(r.status) + (r.statusTs ? ` ${C}14(${new Date(r.statusTs).toLocaleDateString('pt-BR')})` : '') : '-'));
        t.add(T.wrow('Canais', r.groups.length ? r.groups.map(chanName).map((g) => g.replace(/^#@/, '@#')).join(' ') : '-'));
        t.add(T.wrow('Online', S.notifyState?.has(r.id) ? (S.notifyState.get(r.id) ? 'sim' : 'não') : '? (use /notify)'));
        t.add(`${T.pre} ${C}2Fim do Whois`);
        return;
      }
      case 'topic': case 't': {
        if (w.type !== 'channel') return w.add(T.err('Use dentro de um canal'));
        if (!args) return w.add(T.topicIs(w.name, (w.group?.desc || '(sem tópico)').replace(/\s+/g, ' ')));
        if (!needOnline()) return; await api('wa:desc', w.jid, args); return;
      }
      case 'assunto': case 'subject': case 'rename': if (w.type !== 'channel' || !needOnline()) return; await api('wa:subject', w.jid, args); return;
      case 'op': case 'deop': case 'kick': case 'k': case 'invite': case 'add': {
        if (w.type !== 'channel' || !needOnline()) return w.add(T.err('Use dentro de um canal'));
        const action = { op: 'promote', deop: 'demote', kick: 'remove', k: 'remove', invite: 'add', add: 'add' }[cmd];
        const ids = [];
        for (const n of rest) {
          const hit = action === 'add' ? null : w.nicks.find((x) => x.nick.toLowerCase() === n.toLowerCase()) || w.nicks.find((x) => x.nick.toLowerCase().startsWith(n.toLowerCase()));
          const j = hit?.id || (await resolveTarget(n));
          if (j) ids.push(j); else w.add(`${T.pre} ${C}12 ${n} ${C}2não está no${C}12 ${w.name}`);
        }
        if (!ids.length) return;
        if (action === 'remove' && !confirm(`Remover ${rest.join(', ')} do grupo?`)) return;
        const r = await api('wa:groupAction', w.jid, action, ids);
        const why = { 401: 'você não é admin do grupo', 403: 'a pessoa só entra por convite; mande o link com /convite', 404: 'o número não está no WhatsApp', 408: 'a pessoa saiu há pouco tempo e não pode ser adicionada agora', 409: action === 'add' ? 'já está no grupo' : 'já está assim', 500: 'o WhatsApp está com problema, tente de novo' };
        const verbo = { add: 'adicionar', remove: 'remover', promote: 'dar admin para', demote: 'tirar admin de' }[action] || 'alterar';
        for (const x of r || []) if (x.status && x.status !== '200') { w.add(T.err(`Não deu para ${verbo} +${num(x.jid)}: ${why[x.status] || 'o WhatsApp recusou'}.`)); if (!why[x.status]) api('app:logError', `groupAction ${action} ${x.jid} status ${x.status}`).catch(() => {}); }
        return;
      }
      case 'convite': case 'link': { if (w.type !== 'channel' || !needOnline()) return; const l = await api('wa:invite', w.jid); w.add(T.info(`Link de convite do ${w.name}: ${C}12${l}`)); navigator.clipboard.writeText(l); return; }
      case 'nick': if (!args || !needOnline()) return; await api('wa:setName', args); { const old = cleanNick(S.me.name); S.me.name = args; w.add(`${T.pre} Seu nick agora é: ${cleanNick(args)}`); indexNick(old, null); } return;
      case 'recado': case 'status': if (!args || !needOnline()) return; await api('wa:setStatus', args); w.add(T.info(`Recado alterado para: ${C}12${args}`)); return;
      case 'away': {
        const msg = args || S.cfg.awayMessage || 'away';
        S.away = { msg, since: hms().slice(0, 5) }; S.awayReplied.clear();
        for (const x of S.wins.values()) if (x.buf && x.type !== 'custom') x.add(T.away());
        awayWin().add(T.info(`Away ligado: ${msg}`));
        if (S.conn === 'online') api('wa:presence', null, 'unavailable').catch(() => {});
        updateAppTitle(); return;
      }
      case 'back': {
        if (!S.away) return w.add(T.err('Você não está away'));
        S.away = null;
        for (const x of S.wins.values()) if (x.buf && x.type !== 'custom') x.add(T.back());
        updateAppTitle(); return;
      }
      case 'notify': case 'ignore': case 'unnotify': case 'unignore': {
        const key = cmd.replace('un', '');
        const j = args ? await resolveTarget(args) : w.type === 'query' ? w.jid : null;
        if (!j) return key === 'notify' ? dlgNotify() : dlgIgnore();
        const list = new Set(S.cfg[key] || []);
        if (cmd.startsWith('un')) list.delete(j); else list.add(j);
        await setCfg({ [key]: [...list] });
        w.add(T.info(`${labelFor(j)} ${cmd.startsWith('un') ? 'removido da' : 'adicionado à'} ${key} list`));
        if (key === 'notify') api('wa:subscribe', j).catch(() => {});
        return;
      }
      case 'enviar': case 'dcc': case 'send': {
        if (!w.jid) return w.add(T.err('Abra um canal ou pvt para enviar arquivos'));
        if (!needOnline()) return;
        w.add(T.info('DCC Send: escolha o(s) arquivo(s)...'));
        const sent = await api('wa:sendFile', w.jid, null, args);
        for (const e of sent || []) if (e) renderMsg(w, e);
        return;
      }
      case 'server': case 's': case 'conectar': case 'connect':
        if (S.conn !== 'offline') return w.add(T.err('Já conectado/conectando.'));
        if (a1 && /\d{8,}/.test(a1)) st().add(T.info(`Pedindo código de pareamento para +${a1.replace(/\D/g, '')}...`));
        await api('wa:connect', a1 && /\d{8,}/.test(a1) ? { pairingNumber: a1 } : {}); return;
      case 'disconnect': case 'quit': case 'desconectar': await api('wa:disconnect'); return;
      case 'logout': if (!confirm('Encerrar a sessão? Você vai precisar escanear o QR code de novo.')) return; await api('wa:logout'); st().add(T.info('Sessão encerrada.')); return;
      case 'log': case 'logs': return api('app:openLogs');
      case 'web': case 'whatsappweb': return api('wa:showWeb');
      case 'recebidos': case 'downloads': return api('app:openDownloads');
      case 'tile': return tile();
      case 'cascade': case 'cascata': return cascade();
      case 'echo': return w.add(args);
      case 'opcoes': case 'options': return dlgOptions();
      case 'about': case 'sobre': return dlgAbout();
      case 'dicas': case 'tips': {
        const t = TIPS[Math.floor(Math.random() * TIPS.length)];
        return w.add(`${T.pre} ${C}12${U}Dica${U}:${C}2 ${t}`);
      }
      case 'atalhos': {
        for (const [k, d] of [['Alt+1..9', 'vai para a janela N'], ['Ctrl+Tab', 'próxima janela'], ['Tab', 'completa nick (@ + começo do nick + Tab = menção)'], ['↑ / ↓', 'histórico do que você digitou'], ['Duplo-clique no pvt', 'whois'], ['Botão direito na linha', 'responder (citar)'], ['Selecionar texto', 'copia automaticamente'], ['Esc', 'cancela resposta'], ['Ctrl+B / Ctrl+I', 'negrito / itálico'], ['Ctrl+L', 'limpar janela'], ['Ctrl+W', 'fechar janela'], ['PgUp / PgDn', 'rolar o texto']]) w.add(`${C}12${k.padEnd(22)}${C}1${d}`);
        return;
      }
      case 'ajuda': case 'help': {
        if (lcs(a1) === 'scripts' || lcs(a1) === 'script') {
          w.add(`${T.pre} ${C}2CyberWhats Script (${C}12.cws${C}2) — referência rápida:`);
          for (const l of SCRIPT_HELP) w.add(`  ${C}1${l}`);
          return;
        }
        w.add(`${T.pre} ${C}2Comandos do ${C}12CyberWhats${C}2 (em ordem alfabética):`);
        const key = (c) => c.replace(/^\//, '').toLowerCase();
        for (const [c, d] of [...HELP].sort((x, y) => key(x[0]).localeCompare(key(y[0]), 'pt-BR'))) w.add(`  ${C}12${c.padEnd(30)}${C}1${d}`);
        const known = new Set(HELP.flatMap(([c]) => c.match(/\/[a-z0-9.]+/gi) || []).map((x) => x.slice(1).toLowerCase()));
        const extra = Object.keys(SC.aliases).filter((a) => !known.has(a) && !a.includes('.') && !SC.aliases[a].local).sort();
        if (extra.length) w.add(`  ${C}14Comandos dos scripts: ${extra.map((a) => '/' + a).join(' ')}`);
        w.add(`  ${C}14Linguagem dos scripts: /ajuda scripts`);
        w.add(`${C}14  Atalhos de comando: /j = /join · /q = /query · /m = /msg · /w = /whois · /k = /kick · /t = /topic · /s = /server · /users ou /who = /contatos`);
        return;
      }
      case 'demo': return demo();
      case 'motd': if (args === 'editar' || args === 'edit') return api('app:editMotd'); if (args === 'padrao' || args === 'reset') { await api('app:resetMotd'); w.add(T.info('MOTD restaurado para o padrão.')); } return showMotd(w);
      case 'lusers': return showLusers(w);
      case 'apelido': case 'alias': case 'meunick': {
        // /apelido <nick|número|#canal|eu> <novo apelido>   (sem apelido = remove)
        let target = cmd === 'meunick' ? 'eu' : a1;
        let newName = cmd === 'meunick' ? args : tail;
        if (!target) { if (w.jid) { target = w.type === 'channel' ? '#' : '.'; newName = ''; } else return w.add(T.info(`Uso: ${C}12/apelido <nick|número|#canal|eu> <apelido>${C}2 · ${C}12/meunick <apelido>${C}2 · sem apelido remove`)); }
        let jid = null;
        if (target === 'eu' || target === 'me') jid = S.me?.id;
        else if (target === '.' || target === '#') jid = w.jid;
        else if (target.startsWith('#')) jid = findChan(target);
        else jid = (w.type === 'channel' && w.nicks.find((x) => x.nick.toLowerCase() === target.toLowerCase())?.id) || (await resolveTarget(target));
        if (!jid) return w.add(T.err('Não encontrei: ' + target));
        return setAlias(jid, newName, w);
      }
      case 'interface': case 'ui': { const n = parseInt(args, 10); if (n >= 9 && n <= 28) { await setCfg({ uiSize: n }); return w.add(T.info(`Tamanho da interface: ${n}px`)); } return dlgTheme(); }
      case 'fonte': case 'font': { const n = parseInt(args, 10); if (n >= 8 && n <= 40) { await setCfg({ fontSize: n }); return w.add(T.info(`Fonte do bate-papo: ${n}px`)); } return dlgTheme(); }
      case 'raw': case 'quote': return w.add(T.err('Não existe RAW no WhatsApp :)'));
      case 'icones': case 'icons': {
        const v = /^cl/i.test(a1) ? 'classic' : /^mo/i.test(a1) ? 'modern' : (S.cfg.iconSet === 'classic' ? 'modern' : 'classic');
        await setCfg({ iconSet: v });
        return w.add(T.info(`Ícones: ${C}12${v === 'classic' ? 'clássicos (CyberScript)' : 'modernos'}`));
      }
      case 'recentes': case 'recent': case 'recents': {
        if (/^(on|off)$/i.test(a1)) { await setCfg({ showRecent: /on/i.test(a1) }); return w.add(T.info(`Contatos recentes ao conectar: ${C}12${S.cfg.showRecent !== false ? 'LIGADO' : 'desligado'}`)); }
        return cmdRecent(a1 || 30);
      }
      case 'scripts': case 'editor': case 'remote': case 'script': return scriptEditor(a1 ? (a1.endsWith('.cws') ? a1 : a1 + '.cws') : undefined);
      case 'recarregar': case 'reload': { await loadScripts(true, w); return; }
      default:
        if (SC.aliases[cmd] && !SC.aliases[cmd].local) { await SC.runAlias(cmd, args, scriptCtx(w)).catch((e) => { if (!(e && e.constructor && e.constructor.name === 'Halt')) w.add(`${C}4* Script: ${e.message || e}`); }); return; }
        if (opts.script) return UNKNOWN;
        w.add(`${T.pre} ${C}2Comando desconhecido: ${C}12/${cmd}`);
    }
  } catch (e) {
    play('error');
    w.add(T.err(friendlyError(e, ACTION_OF[cmd])));
  }
}
async function say(w, text, action = false) {
  if (!text) return;
  if (!w.jid) return w.add(T.err('Não é possível enviar texto nesta janela. Use /msg, /query ou /join.'));
  if (S.conn !== 'online') return w.add(T.err('Você não está conectado. Use /server'));
  const q = w.quote; w.setQuote(null);
  // @Nick de alguém do canal vira menção de verdade no WhatsApp (@número)
  if (w.type === 'channel' && text.includes('@')) {
    text = text.replace(/(^|\s)@([^\s@:,;!?]+)/g, (all, sp, nk) => {
      const n = w.nicks.find((x) => x.nick.toLowerCase() === nk.toLowerCase());
      return n && n.id ? `${sp}@${num(n.id)}` : all;
    });
  }
  try {
    const t0 = performance.now();
    const e = await api('wa:send', w.jid, codesToWa(text), q);
    S.lag = Math.round(performance.now() - t0);
    if (e && !w.buf.querySelector(`.ln[data-id="${CSS.escape(e.id)}"]`)) renderMsg(w, e);
    if (w._typingSent) { w._typingSent = 0; clearTimeout(w._typingStop); }
  } catch (err) { play('error'); w.add(T.err(friendlyError(err, 'enviar a mensagem'))); }
}
async function sendFile(w, path) {
  if (S.conn !== 'online') return w.add(T.err('Você não está conectado.'));
  w.add(T.info(`DCC Send: enviando ${C}12${path.split(/[\\/]/).pop()}${C}2...`));
  try { const r = await api('wa:sendFile', w.jid, path, ''); for (const e of r || []) if (e) renderMsg(w, e); }
  catch (err) { w.add(T.err(friendlyError(err, 'enviar o arquivo'))); }
}
// Janela de lista (estilo "Lista de Canais") com filtro
function listWindow(id, title, cols, rows, filter, onOpen, menu, refresh) {
  let w = getWin(id);
  if (!w) w = makeWin(id, 'list', title, {});
  w.body.innerHTML = '';
  const bar = h('div', { class: 'listbar' }, `Filtrar: <input type="text" spellcheck="false" value="${esc(filter || '')}"> <span class="cnt"></span> <span class="hint">duplo-clique ou Enter para abrir</span>`);
  const lv = h('div', { class: 'listview' });
  lv.innerHTML = `<table><thead><tr>${cols.map((c) => `<th${c.right ? ' style="text-align:right"' : ''}>${esc(c.t)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr data-id="${esc(r.id)}" data-q="${esc(r.q.toLowerCase())}">${r.cells.map((c, i) => `<td${cols[i].right ? ' style="text-align:right"' : ''}>${esc(String(c ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const input = $('input', bar), cnt = $('.cnt', bar);
  if (refresh) {
    const rb = h('img', { class: 'lbtn', src: 'assets/btn/atualiza.png', title: 'Atualizar a lista', draggable: 'false' });
    rb.addEventListener('mouseenter', () => (rb.src = 'assets/btn/atualiza_b.png'));
    rb.addEventListener('mouseleave', () => (rb.src = 'assets/btn/atualiza.png'));
    rb.addEventListener('click', () => { rb.style.opacity = '.5'; Promise.resolve(refresh(input.value.trim())).finally(() => { rb.style.opacity = ''; }); });
    bar.appendChild(rb);
  }
  const apply = () => {
    const q = input.value.trim().toLowerCase().replace(/^#/, '').replace(/_/g, ' ');
    let n = 0;
    lv.querySelectorAll('tbody tr').forEach((tr) => { const ok = !q || tr.dataset.q.includes(q); tr.hidden = !ok; if (ok) n++; });
    cnt.textContent = `[${n} de ${rows.length}]`;
    w.setTitle(`${title} [${n}]${q ? ' - filtro: ' + input.value.trim() : ''}`);
  };
  const sel = (tr) => { lv.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel')); if (tr) { tr.classList.add('sel'); tr.scrollIntoView({ block: 'nearest' }); } };
  input.addEventListener('input', apply);
  input.addEventListener('keydown', (e) => {
    const vis = [...lv.querySelectorAll('tbody tr:not([hidden])')];
    const cur = lv.querySelector('tr.sel:not([hidden])');
    const i = vis.indexOf(cur);
    if (e.key === 'ArrowDown') { sel(vis[Math.min(vis.length - 1, i + 1)]); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel(vis[Math.max(0, i - 1)]); e.preventDefault(); }
    else if (e.key === 'Enter') { const t = cur || vis[0]; if (t) onOpen(t.dataset.id); }
  });
  lv.addEventListener('click', (e) => sel(e.target.closest('tr[data-id]')));
  lv.addEventListener('dblclick', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) onOpen(tr.dataset.id); });
  if (menu) lv.addEventListener('contextmenu', (e) => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; e.preventDefault(); sel(tr); popup(e, menu(tr.dataset.id)); });
  w.body.append(bar, lv);
  w.edit = input;
  apply();
  activate(id);
  setTimeout(() => input.focus(), 0);
  return w;
}
async function cmdList(filter) {
  if (S.conn === 'online') { try { S.chats = await api('wa:chats'); } catch {} }
  const groups = S.chats.filter((c) => c.group).sort((a, b) => (b.size || 0) - (a.size || 0) || a.name.localeCompare(b.name));
  listWindow('list', 'Lista de Canais', [{ t: 'Canal' }, { t: 'Usuários', right: true }, { t: 'Tópico' }],
    groups.map((g) => ({ id: g.id, q: g.name + ' ' + (g.topic || ''), cells: [chanOf(g.id, g.name), g.size || '?', (g.topic || '').replace(/\s+/g, ' ')] })),
    filter, (id) => openChannel(id, true),
    (id) => [['Entrar', () => openChannel(id, true)], ['Informações', () => openChannel(id, true).then((w) => cmdInfo(w))], '-',
      [(S.cfg.autojoin || []).includes(id) ? 'Remover do Auto-Join' : 'Adicionar ao Auto-Join', () => { const l = new Set(S.cfg.autojoin || []); l.has(id) ? l.delete(id) : l.add(id); setCfg({ autojoin: [...l] }); }]],
    (f) => cmdList(f));
}
// contatos com quem você conversou por último (abre sozinho ao conectar, se habilitado)
async function cmdRecent(n = 30, auto = false) {
  // o nome do chat às vezes é só o número: usa o nome da agenda / perfil da lista de contatos
  if (!(S.contacts && S.contacts.length) && S.conn === 'online') { try { S.contacts = await api('wa:contacts'); for (const c of S.contacts) indexNick(c.nick, c.id); } catch {} }
  const byId = new Map((S.contacts || []).map((c) => [c.id, c]));
  const isNum = (x) => !x || /^\+?[\d\s()-]+$/.test(String(x));
  const nameOf = (c) => { const k = byId.get(c.id); for (const x of [k?.nick, k?.push, c.name]) if (!isNum(x)) return x; return '+' + num(c.id); };
  const list = (S.chats || []).filter((c) => !c.group && c.ts && /@s\.whatsapp\.net$/.test(c.id)).sort((a, b) => b.ts - a.ts).slice(0, Math.max(1, Math.min(200, Number(n) || 30))).map((c) => ({ ...c, name: nameOf(c) }));
  if (!list.length) { if (!auto) cur().add(T.info('Nenhuma conversa recente ainda.')); return; }
  const fmt = (t) => { const d = new Date(t * 1000), hoje = new Date(); return d.toDateString() === hoje.toDateString() ? 'hoje ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const lw = listWindow('recent', 'Contatos Recentes', [{ t: 'Nick' }, { t: 'Número' }, { t: 'Última conversa' }],
    list.map((c) => ({ id: c.id, q: `${alias(c.id)} ${c.name || ''} ${num(c.id)}`, cells: [nickFor(c.id, c.name), '+' + num(c.id), fmt(c.ts)] })),
    '', (id) => { const c = list.find((x) => x.id === id); openQuery(id, c?.name, true); },
    (id) => { const c = list.find((x) => x.id === id); return [['Query (pvt)', () => openQuery(id, c?.name, true)], ['Whois', () => run('/whois +' + num(id), cur())], ['Definir apelido local...', () => aliasDialog(id, nickFor(id, c?.name))], ['Copiar número', () => copyText('+' + num(id))], '-', ['Não abrir esta lista ao conectar', () => setCfg({ showRecent: false }), false, { checked: S.cfg.showRecent === false }]]; },
    async () => { if (S.conn === 'online') { try { S.chats = await api('wa:chats'); S.contacts = await api('wa:contacts'); } catch {} } return cmdRecent(n); });
  lw.setIcon('msn');
}
async function cmdUsers(filter) {
  if (S.conn !== 'online') return cur().add(T.err('Você não está conectado. Use /server'));
  let list = [];
  try { list = await api('wa:contacts'); } catch (e) { return cur().add(T.err(friendlyError(e, 'listar os contatos'))); }
  for (const c of list) indexNick(c.nick, c.id);
  S.contacts = list;
  list.sort((a, b) => (b.my - a.my) || a.nick.localeCompare(b.nick, 'pt-BR', { sensitivity: 'base' }));
  const fmtTs = (t) => (t ? new Date(t * 1000).toLocaleDateString('pt-BR') : '');
  const lw = listWindow('users', 'Lista de Contatos', [{ t: 'Nick' }, { t: 'Número' }, { t: 'Nome no perfil' }, { t: 'Agenda' }, { t: 'Última conversa' }],
    list.map((c) => ({ id: c.id, q: `${alias(c.id)} ${c.nick} ${c.push} ${num(c.id)}`, cells: [nickFor(c.id, c.nick), '+' + num(c.id), c.push || '', c.my ? 'sim' : '', fmtTs(c.ts)] })),
    filter, (id) => { const c = list.find((x) => x.id === id); openQuery(id, c?.nick, true); },
    (id) => { const c = list.find((x) => x.id === id); return [['Query (pvt)', () => openQuery(id, c?.nick, true)], ['Definir apelido local...', () => aliasDialog(id, nickFor(id, c?.nick))], ['Whois', () => run('/whois +' + num(id), cur())], ['Copiar número', () => copyText('+' + num(id))], '-', ['Notify', () => run('/notify +' + num(id), cur())], ['Ignorar', () => run('/ignore +' + num(id), cur())]]; },
    (f) => cmdUsers(f));
  lw.setIcon('msn');
}
async function cmdInfo(w) {
  if (!w || w.type !== 'channel') return dlgFavorites();
  const g = w.group || (await api('wa:group', w.jid));
  if (!g) return;
  w.add(`${T.pre} ${C}2Informações do${C}12 ${w.name}`);
  w.add(T.wrow('Nome', g.subject));
  w.add(T.wrow('Criado', g.creation ? new Date(g.creation * 1000).toLocaleString('pt-BR') : '?'));
  w.add(T.wrow('Dono', g.owner ? labelFor(g.owner) : '?'));
  w.add(T.wrow('Usuários', `${g.participants.length} (${g.participants.filter((p) => p.admin).length} admins)`));
  w.add(T.wrow('Modos', `${g.announce ? '+m (só admins enviam) ' : ''}${g.restrict ? '+t (só admins editam) ' : ''}`.trim() || '-'));
  w.add(T.wrow('Tópico', (g.desc || '-').replace(/\s+/g, ' ')));
}

// ======================================================================
//  Inicialização
// ======================================================================
function banner(w) {
  const d = new Date();
  const dia = d.toLocaleDateString('pt-BR', { weekday: 'long' });
  w.add(`[${U}CyberWhats${U}] v${S.version || "3.2"} :: ${dia[0].toUpperCase() + dia.slice(1).replace('-feira', '')}, ${d.toLocaleDateString('pt-BR')}`, { nots: true });
  w.add(`${C}15` + '-'.repeat(60), { nots: true });
  w.add('', { nots: true });
  w.add(`${PRE} ${B}Iniciado:${B} ${C}14${S.cfg.runs || 1}${O} vez(es)`, { nots: true });
  w.add(`${PRE} ${B}Última conexão:${B} ${C}14web.whatsapp.com${O} ${B}(Ctrl+F12 para conectar)${B}`, { nots: true });
  w.add('', { nots: true });
  if (S.frases.length) {
    const f = S.frases[Math.floor(Math.random() * S.frases.length)];
    w.add(`${C}14 ${f}`, { nots: true });
    w.add('', { nots: true });
  }
}

// Demonstração visual (/demo) — dados fictícios, nada é enviado
function demo() {
  S.me = S.me || { id: '5519900000000@s.whatsapp.net', name: 'Paulo' };
  const gid = 'demo-grupo@g.us';
  const P = (n, i, admin = null, me = false) => ({ id: `55119${String(i).padStart(8, '0')}@s.whatsapp.net`, nick: n, admin, me });
  const parts = [P('Zinho', 1, 'superadmin'), P('Guereiro_AF', 2, 'admin'), P('Hell_Army', 3, 'admin'), P('Brunyk', 4, 'admin'), P('Teco|Hugo', 5), P('Zz_Fire_Zz', 6), P('giovaN', 7), P('Santista', 8), P('Kilarruna', 9), P('Baiano', 10), P('Dangy', 11), P('Pedro', 12), P('Mage|AFK', 13), { ...P('Paulo', 0, null, true), id: S.me.id }];
  const g = { id: gid, subject: 'Turma do Colegio', desc: 'Bem vindos! Churrasco sabado na casa do Zinho - tragam a cerveja', participants: parts, announce: false, restrict: true };
  const w = makeWin(gid, 'channel', '#Turma_do_Colegio', { jid: null });
  w.add(T.joinSelf('#Turma_do_Colegio'));
  w.setNicks(g);
  w.add(`${PRE} Status [${U}Admins(4)${U} ${U}Normais(10)${U} ${U}Total(14)${U}]`, { nots: true });
  w.add(T.topicIs(w.name, g.desc));
  w.add(T.topicBy('Zinho', '27/06/2011 às 03:40'));
  const t0 = Date.now() / 1000 - 600;
  const msgs = [[5, 'cheguei a pensar q tava gravido'], [6, 'e nem vo amanha'], [5, ':O'], [6, 'to com atestado'], [1, 'galera, *sábado* confirmado?'], [2, 'eu vou! levo o carvão'], [7, 'kkkkkkkkkkkkk'], [6, 'se pa amanha vo no medico de novo'], [0, 'tô dentro, levo o violão'], [8, 'pq Guereiro_AF ?']];
  msgs.forEach(([i, t], k) => {
    const p = i === 0 ? parts[13] : parts[i - 1];
    renderMsg(w, { id: 'd' + k, chat: gid, ts: t0 + k * 20, fromMe: i === 0, sender: p.id, nick: p.nick, kind: 'text', text: t });
  });
  w.add(T.join('Kilarruna', '5511900000009@s.whatsapp.net'), { date: new Date((t0 + 220) * 1000) });
  w.add(T.mode('Zinho', '+o Kilarruna'), { date: new Date((t0 + 225) * 1000) });
  renderMsg(w, { id: 'dm', chat: gid, ts: t0 + 230, fromMe: false, sender: parts[1].id, nick: 'Guereiro_AF', kind: 'media', media: 'Imagem', caption: 'olha o local do churras', hasMedia: false });
  renderMsg(w, { id: 'dn', chat: gid, ts: t0 + 240, fromMe: false, sender: parts[4].id, nick: 'Teco|Hugo', kind: 'action', text: 'tá com fome' });
  renderMsg(w, { id: 'do', chat: gid, ts: t0 + 250, fromMe: false, sender: parts[5].id, nick: 'Zz_Fire_Zz', kind: 'text', text: '@5519900000000 vc leva o que?', mentions: [{ num: '5519900000000', nick: 'Paulo', me: true }] });
  w.add(T.part('Mage|AFK', '5511900000013@s.whatsapp.net', 'saiu do grupo'), { date: new Date((t0 + 260) * 1000) });
  const q = makeWin('demo-pvt', 'query', 'Guereiro_AF', { jid: null });
  q.setTitle('Guereiro_AF (+5511900000002)');
  q.add(`${C}14>>> Guereiro_AF`, { nots: true }); q.add(`${C}14>>> Pvt nº 1 - [+5511900000002]`, { nots: true }); q.add(`${C}14>>> Canais em comum: @#Turma_do_Colegio`, { nots: true }); q.add('', { nots: true });
  renderMsg(q, { id: 'q1', chat: 'x', ts: t0 + 100, fromMe: false, sender: parts[1].id, nick: 'Guereiro_AF', kind: 'text', text: 'guer' });
  renderMsg(q, { id: 'q2', chat: 'x', ts: t0 + 104, fromMe: true, sender: S.me.id, nick: 'Paulo', kind: 'text', text: 'da auto agora pra mim' });
  q.setActivity('msg');
  activate(gid);
}

async function setAlias(jid, name, w) {
  const al = { ...(S.cfg.aliases || {}) };
  const old = jid.endsWith('@g.us') ? chanOf(jid, S.chats.find((c) => c.id === jid)?.name) : jid === S.me?.id ? myNick() : nickFor(jid, labelFor(jid).replace(/ \(.*$/, ''));
  name = (name || '').trim();
  if (name) al[jid] = name; else delete al[jid];
  await setCfg({ aliases: al });
  if (name) indexNick(name, jid);
  const now = jid.endsWith('@g.us') ? chanOf(jid, S.chats.find((c) => c.id === jid)?.name) : jid === S.me?.id ? myNick() : nickFor(jid, labelFor(jid).replace(/ \(.*$/, ''));
  const msg = name ? `${PRE} ${old} agora é: ${C}12${now}${O} ${C}14(apelido local)` : `${PRE} Apelido removido: ${C}12${now}`;
  // atualiza as janelas abertas
  const told = new Set();
  for (const x of S.wins.values()) {
    if (x.type === 'channel' && x.group) { x.setNicks(x.group); if (x.jid === jid || x.nickOf(jid)) { x.add(msg, { activity: 'event' }); told.add(x); } }
    if (x.type === 'query' && x.jid === jid) { x.name = now; x.setTitle(`${now} (+${num(jid)})`); x.add(msg); told.add(x); }
  }
  if (jid === S.me?.id) st().setTitle(`Status: ${myNick()} [+i] no WhatsApp`);
  const tw = w || cur();
  if (!told.has(tw)) tw.add(msg);
  if (getWin('users')) cmdUsers();
}
function aliasDialog(jid, current) {
  const who = jid.endsWith('@g.us') ? 'do canal' : jid === S.me?.id ? 'para você' : 'para ' + (current || '+' + num(jid));
  askRun('Apelido local', `Apelido ${who} (só no CyberWhats; deixe vazio para remover):`, alias(jid) || '', (v) => setAlias(jid, v)).then(() => {});
  // askRun ignora valor vazio: oferece remoção pelo botão direito também
}

// ---------- LUSERS + MOTD (estilo BRASnet / CyberScript) ----------
async function showLusers(w = st()) {
  let contacts = S.contacts;
  if (!contacts && S.conn === 'online') { try { contacts = S.contacts = await api('wa:contacts'); } catch { contacts = []; } }
  contacts = contacts || [];
  const groups = S.chats.filter((c) => c.group), pvts = S.chats.filter((c) => !c.group);
  const myOps = [...S.groups.values()].filter((g) => g.participants?.some((p) => p.me && p.admin)).length;
  const unread = S.chats.reduce((n, c) => n + (c.unread || 0), 0);
  const inAgenda = contacts.filter((c) => c.my).length;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0) + '%';
  const row = (label, v, extra) => `${PRE} ${U}${C}2${label}${B}${C}12(${O}${C}12${v}${B}${C}12)` + (extra != null ? ` ${C}12(${O}${C}12${extra}${B}${C}12)` : '');
  w.add('-'.repeat(50), { nots: true });
  w.add(row('Conversas privadas', pvts.length, pct(pvts.length, contacts.length || pvts.length)), { nots: true });
  w.add(row('Contatos visíveis na Rede', contacts.length), { nots: true });
  w.add(row('Contatos na sua agenda', inAgenda), { nots: true });
  w.add(row('Contatos só com nome de perfil', contacts.length - inAgenda), { nots: true });
  w.add(row('Canais onde você é @', myOps), { nots: true });
  w.add(row('Mensagens não lidas', unread), { nots: true });
  w.add(row('Número de Servidores', 1), { nots: true });
  w.add(row('Canais Criados', groups.length), { nots: true });
  w.add('-'.repeat(51), { nots: true });
}
async function showMotd(w = st()) {
  let txt = '';
  try { txt = await api('app:motd'); } catch (e) { return w.add(T.err('MOTD indisponível. ' + friendlyError(e))); }
  const ver = await api('app:version').catch(() => '');
  const now = new Date();
  const top = S.chats.filter((c) => c.group).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 5);
  const vars = { me: myNick(), num: num(S.me?.id) || '-', server: 'web.whatsapp.com', data: now.toLocaleDateString('pt-BR'), hora: hms(now), versao: ver };
  const W = 76;
  w.add(`${PRE} ${C}2- ${C}12web.whatsapp.com${C}2 Message of the Day -`, { nots: true, cls: 'pre' });
  for (let line of txt.replace(/\r/g, '').split('\n')) {
    if (line.startsWith('#')) continue;
    if (line.trim() === '{canais}') {
      if (!top.length) w.add('        - (nenhum grupo ainda)', { nots: true, cls: 'pre' });
      for (const g of top) w.add(`        - /join ${chanOf(g.id, g.name)}: ${g.size ? g.size + ' usuários' : 'grupo'}${g.topic ? ' — ' + g.topic.replace(/\s+/g, ' ').slice(0, 50) : ''}`, { nots: true, cls: 'pre' });
      continue;
    }
    let center = false;
    if (line.startsWith('{center}')) { center = true; line = line.slice(8); }
    line = line.replace(/\{(me|num|server|data|hora|versao)\}/g, (_, k) => vars[k])
      .replace(/\{b\}/g, B).replace(/\{u\}/g, U).replace(/\{i\}/g, I).replace(/\{o\}/g, O)
      .replace(/\{c(\d{1,2})(?:,(\d{1,2}))?\}/g, (_, f, b) => C + f + (b ? ',' + b : ''));
    if (center) { const len = strip(line).length; line = ' '.repeat(Math.max(0, Math.floor((W - len) / 2))) + line; }
    w.add(line, { nots: true, cls: 'pre' });
  }
  w.add(`${PRE} ${C}2End of /MOTD command.`, { nots: true, cls: 'pre' });
}

async function sysinfo() {
  try {
    const i = await api('app:sysinfo');
    $('#sb-ram span').textContent = `Ram: ${i.used}/${i.total}MB (${i.pct}%)`;
    $('#sb-up span').textContent = `${i.os} uptime: ${i.uptime}`;
    $('#sb-ip span').textContent = `IP: ${i.ip}`;
    $('#sb-server span').textContent = S.conn === 'online' ? `web.whatsapp.com (+${num(S.me?.id)})` : S.conn === 'connecting' ? 'conectando...' : '(não conectado)';
  } catch {}
}


// ======================================================================
//  CyberWhats Script (.cws) — scripts editáveis: aliases, eventos, popups
// ======================================================================
const lcs = (x) => String(x ?? '').toLowerCase();
function winByName(name) {
  if (!name) return null;
  const n = lcs(name);
  for (const w of S.wins.values()) if (lcs(w.name) === n || lcs(w.id) === n) return w;
  return null;
}
function scriptCtx(w, extra = {}) {
  w = w || cur();
  return { chan: w.type === 'channel' ? w.name : '', target: w.name, nick: w.type === 'query' ? w.name : '', win: w.id, ...extra };
}
function ctxWin(ctx) { return (ctx && (S.wins.get(ctx.win) || winByName(ctx.target) || winByName(ctx.chan))) || cur(); }
let varsTimer = null;
function iniParse(lines) {
  const out = {}; let sec = null;
  for (const l of lines || []) { const m = /^\s*\[(.+)\]\s*$/.exec(l); if (m) { sec = lcs(m[1]); out[sec] = out[sec] || {}; continue; } const k = l.indexOf('='); if (sec && k > 0) out[sec][lcs(l.slice(0, k).trim())] = [l.slice(0, k).trim(), l.slice(k + 1)]; }
  return out;
}
function dataKey(file) { const n = SC.normPath(file); return Object.keys(SC.data).find((k) => k === n) || Object.keys(SC.data).find((k) => k.split('/').pop() === n.split('/').pop()) || n; }
function persistData(key) { api('scripts:writeData', key, (SC.data[key] || []).join('\r\n')).catch((e) => st().add(T.err('Script: ' + friendlyError(e)))); }
const SC = new CwScript({
  me: () => myNick(),
  active: () => cur()?.name || 'Status',
  version: () => S.version || '',
  echo: (where, text) => { const w = where === 'status' ? st() : where && where !== 'active' ? winByName(where) || cur() : cur(); w.add(text); },
  error: (m) => { st().add(`${C}4* Script: ${m}`); if (S.active !== 'status') cur().add(`${C}4* Script: ${m}`); },
  async msg(to, text, ctx) {
    if (!text) return;
    const w = winByName(to) || (to === ctx?.target || to === ctx?.chan ? ctxWin(ctx) : null);
    if (w && w.jid) return say(w, text);
    await run(`/msg ${to} ${text}`, ctxWin(ctx));
  },
  async action(to, text, ctx) {
    const w = winByName(to) || ctxWin(ctx);
    if (w && w.jid) return say(w, actionText(text), true);
    ctxWin(ctx).add(T.err('Não dá para mandar ação aqui.'));
  },
  async command(name, args, ctx) {
    const w = ctxWin(ctx);
    let a = args;
    // sintaxe "comando #canal alvo ..." dos scripts antigos -> janela do canal
    let target = w;
    if (['kick', 'topic', 'mode', 'part', 'op', 'deop', 'invite', 'names'].includes(name) && /^#/.test(a)) { const c = a.split(' ')[0]; target = winByName(c) || w; a = a.slice(c.length).trim(); }
    if (name === 'mode') { const [m, ...who] = a.split(' '); if (/^[+-]o$/.test(m)) { for (const n of who) await run(`/${m[0] === '+' ? 'op' : 'deop'} ${n}`, target); return true; } return true; }
    if (name === 'kick') a = a.split(' ')[0];
    const r = await run(`/${name}${a ? ' ' + a : ''}`, target, { script: true });
    return r !== UNKNOWN;
  },
  nicks: (chan) => (winByName(chan)?.nicks || []).map((n) => n.nick),
  isOn: (nick, chan) => !!(winByName(chan)?.nicks || []).find((n) => lcs(n.nick) === lcs(nick)),
  isOp: (nick, chan) => !!(winByName(chan)?.nicks || []).find((n) => lcs(n.nick) === lcs(nick) && n.admin),
  ask: (p, def) => ask('CyberWhats Script', String(p).replace(/\r?\n/g, ' '), def || ''),
  confirm: async (p) => confirm(p),
  channels: () => [...S.wins.values()].filter((w) => w.type === 'channel').map((w) => w.name),
  sound: (k) => play(SND[k] ? k : 'notice'),
  readIni: (file, sec, key) => { const ini = iniParse(SC.findData(file)); const se = ini[lcs(sec)]; if (!se) return ''; return key ? se[lcs(key)]?.[1] ?? '' : sec; },
  writeIni(file, sec, key, val) {
    const k = dataKey(file); const lines = SC.data[k] || (SC.data[k] = []);
    let si = lines.findIndex((l) => lcs(l.trim()) === '[' + lcs(sec) + ']');
    if (key === null) { if (si >= 0) { let e = si + 1; while (e < lines.length && !/^\s*\[/.test(lines[e])) e++; lines.splice(si, e - si); } persistData(k); return; }
    if (si < 0) { lines.push('[' + sec + ']'); si = lines.length - 1; }
    let e = si + 1; while (e < lines.length && !/^\s*\[/.test(lines[e])) e++;
    const ki = lines.slice(si + 1, e).findIndex((l) => lcs(l.split('=')[0].trim()) === lcs(key));
    if (val === null) { if (ki >= 0) lines.splice(si + 1 + ki, 1); } else if (ki >= 0) lines[si + 1 + ki] = `${key}=${val}`; else lines.splice(e, 0, `${key}=${val}`);
    persistData(k);
  },
  appendData: (file) => setTimeout(() => persistData(dataKey(file)), 0),
  saveVars: (vars) => { clearTimeout(varsTimer); varsTimer = setTimeout(() => api('scripts:saveVars', vars).catch(() => {}), 400); },
  away: () => !!S.away, awayMsg: () => S.away?.msg || '',
  topic: (chan) => winByName(chan)?.group?.desc || '',
  windowExists: (n) => !!winByName(n),
  clear: (n) => (winByName(n) || cur()).clear(),
  openUrl: (u) => api('app:openUrl', u)
});
const UNKNOWN = Symbol('unknown');
S.scripts = [];
async function loadScripts(announce, w) {
  w = w || st();
  try {
    const r = await api('scripts:load');
    S.scripts = r.scripts; S.scriptDefaults = r.defaults;
    const errs = SC.load(r.scripts, r.data, r.vars);
    const tot = SC.files.reduce((a, f) => ({ al: a.al + f.aliases, ev: a.ev + f.events, mn: a.mn + f.menus }), { al: 0, ev: 0, mn: 0 });
    if (announce) w.add(T.info(`Scripts carregados: ${C}12${r.scripts.map((s) => s.name).join(', ') || 'nenhum'}${C}2 (${tot.al} aliases, ${tot.ev} eventos, ${tot.mn} menus)`));
    for (const e of errs) w.add(`${C}4* Script: ${e}`);
    return errs;
  } catch (e) { w.add(T.err('Não consegui carregar os scripts. ' + friendlyError(e))); return [e.message]; }
}
async function scriptMenu(type, w, extra) {
  try { return await SC.buildMenu(type, scriptCtx(w, extra)); } catch (e) { st().add(`${C}4* Script (menu): ${e.message}`); return []; }
}
// dispara um evento dos scripts sem travar a interface
function fireScript(ev, info) { return SC.fire(ev, info).catch((e) => st().add(`${C}4* Script: ${e.message}`)); }
async function inputLine(line, w) {
  if (SC.events.some((e) => e.event === 'INPUT')) {
    const halted = await fireScript('INPUT', { ...scriptCtx(w), nick: myNick(), text: line });
    if (halted) return;
  }
  return run(line, w);
}
async function scriptEditor(open) {
  await loadScripts(false);
  let curName = open || S.scripts[0]?.name || null;
  let dirty = false;
  const body = h('div', { class: 'sedit' });
  body.innerHTML = `<div class="se-top"><select class="se-files" size="14"></select><textarea class="se-text" spellcheck="false" wrap="off"></textarea></div>
    <div class="se-info"></div>
    <div class="se-btns"><button class="btn" data-a="novo">Novo...</button><button class="btn" data-a="salvar">Salvar (Ctrl+S)</button><button class="btn" data-a="excluir">Excluir</button><button class="btn" data-a="padrao">Restaurar padrão</button><button class="btn" data-a="pasta">Abrir pasta</button><button class="btn" data-a="ajuda">Referência</button><span style="flex:1"></span><button class="btn" data-a="fechar">Fechar</button></div>`;
  const sel = $('.se-files', body), ta = $('.se-text', body), info = $('.se-info', body);
  const fillList = () => { sel.innerHTML = S.scripts.map((x) => `<option ${x.name === curName ? 'selected' : ''}>${esc(x.name)}</option>`).join(''); };
  const show = (name) => {
    curName = name; const x = S.scripts.find((y) => y.name === name);
    ta.value = x ? x.text : ''; ta.disabled = !x; dirty = false; fillList(); ta.setSelectionRange(0, 0); ta.scrollTop = 0;
    info.textContent = x ? `${name} — ${x.text.split('\n').length} linhas${(S.scriptDefaults || []).includes(name) ? ' (script padrão)' : ''}` : 'Nenhum script. Clique em "Novo..." para criar um.';
  };
  const confirmDiscard = () => !dirty || confirm('Descartar as alterações em ' + curName + '?');
  const save = async () => {
    if (!curName) return;
    await api('scripts:save', curName, ta.value);
    const errs = await loadScripts(false);
    dirty = false;
    const mine = errs.filter((e) => e.startsWith(curName + ':'));
    info.innerHTML = mine.length ? `<span style="color:#c00">Salvo, mas com avisos: ${esc(mine.join(' · '))}</span>` : `<span style="color:#060">${esc(curName)} salvo e recarregado.</span>`;
    const x = S.scripts.find((y) => y.name === curName); if (!x) S.scripts.push({ name: curName, text: ta.value });
  };
  sel.addEventListener('change', () => { if (!confirmDiscard()) { fillList(); return; } show(sel.value); });
  ta.addEventListener('input', () => { dirty = true; });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); dirty = true; }
    if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    e.stopPropagation();
  });
  const dlgP = dialog({ title: 'Editor de Scripts — CyberWhats Script (.cws)', body, buttons: [], width: Math.min(980, innerWidth - 40) });
  const closeDlg = () => body.closest('.dlg')?.querySelector('.cap.close')?.click();
  body.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    try {
      if (a === 'novo') {
        if (!confirmDiscard()) return;
        const n = await ask('Novo script', 'Nome do arquivo (ex: meuscript):', ''); if (!n) return;
        const name = await api('scripts:save', n, `; ${n}\n; Exemplo:\n; alias oi say Olá $1 $+ !\n; on *:TEXT:*oi*:#:{ msg # Oi $nick $+ ! }\n; menu nicklist {\n;   Dizer oi:oi $1\n; }\n`);
        await loadScripts(false); show(name);
      } else if (a === 'salvar') await save();
      else if (a === 'excluir') { if (!curName || !confirm('Excluir o script ' + curName + '?')) return; await api('scripts:delete', curName); await loadScripts(false); show(S.scripts[0]?.name || null); }
      else if (a === 'padrao') { if (!(S.scriptDefaults || []).includes(curName)) { info.textContent = 'Este não é um script padrão do CyberWhats.'; return; } if (!confirm('Voltar ' + curName + ' ao original? Suas alterações serão perdidas.')) return; await api('scripts:restore', curName); await loadScripts(false); show(curName); }
      else if (a === 'pasta') api('scripts:openFolder');
      else if (a === 'ajuda') { closeDlg(); run('/ajuda scripts', cur()); }
      else if (a === 'fechar') { if (confirmDiscard()) closeDlg(); }
    } catch (err) { info.innerHTML = `<span style="color:#c00">${esc(err.message)}</span>`; }
  });
  show(curName);
  setTimeout(() => ta.focus(), 50);
  await dlgP;
}
const SCRIPT_HELP = [
  'Os scripts ficam na pasta de scripts (Ferramentas > Editor de scripts > Abrir pasta), um arquivo .cws por script.',
  'Arquivos de texto (.txt/.ini) nas subpastas viram dados: $read(frases/cumulos.txt) sorteia uma linha.',
  `${B}alias${B} nome { comandos }        → cria o comando /nome  ($1 $2 $1- = parâmetros, return valor = $nome(...))`,
  `${B}on${B} *:TEXT:padrão:#:{ ... }     → mensagem recebida em canal (#), pvt (?) ou ambos (*); também ACTION, JOIN, PART, INPUT, CONNECT, START`,
  `${B}menu${B} nicklist,channel,query,status,menubar { Rótulo:comando  /  .Submenu  /  ..Item:comando  /  - }`,
  `Controle: if (cond) { } elseif () { } else { }  ·  while (cond) { }  ·  goto/:label  ·  return  ·  halt  ·  var %x = 1  ·  set/unset/inc/dec %var`,
  `Condições: == != < > <= >= isin iswm isnum isop ison istok  (! nega)  &&  ||`,
  `Comandos: say msg me describe echo timer(.timerNOME N segs cmd / off) kick mode topic join query part hadd/hinc/hdel/hmake/hfree writeini write beep`,
  `Identificadores: $me $nick $chan $target $active $rand $read $readini $calc $len $upper $lower $left $right $mid $replace $remove $strip $gettok $numtok $addtok $deltok $istok $iif $time $date $ctime $duration $hget $semacento $+ ...`,
  'Digite //comando para avaliar na hora, ex: //echo $calc(2+2) $me'
];

async function init() {
  S.cfg = await api('cfg:get');
  S.cfg = await api('cfg:set', { runs: (S.cfg.runs || 0) + 1 });
  S.version = await api('app:version').catch(() => '');
  try { S.frases = (await (await fetch('assets/frases.txt')).text()).split('\n').map((x) => x.trim()).filter(Boolean); } catch {}
  applyTheme();
  setInterval(sysinfo, 5000); sysinfo();
  buildMenubar();
  buildToolbar();
  document.body.classList.add('child-max');
  const status = makeWin('status', 'status', 'Status');
  status.setTitle('Status: (não conectado)');
  activate('status');
  banner(status);
  play('start');
  window.cw.on('wa:event', onWa);
  window.cw.on('ui:open', (jid) => { const w = getWin(jid); if (w) activate(jid); });
  window.cw.on('win:state', (s) => document.body.classList.toggle('maxed', s === 'max'));
  addEventListener('blur', () => document.body.classList.add('inactive'));
  addEventListener('focus', () => { document.body.classList.remove('inactive'); const w = S.wins.get(S.active); if (w?.jid && S.conn === 'online') api('wa:read', w.jid).catch(() => {}); });
  $('#titlebar').addEventListener('dblclick', () => api('win:max'));
  document.querySelectorAll('.tbtns [data-cmd]').forEach((b) => b.addEventListener('click', () => api(b.dataset.cmd)));
  addEventListener('keydown', (e) => {
    if (e.altKey && /^[1-9]$/.test(e.key)) { const id = S.order[+e.key - 1]; if (id) activate(id); e.preventDefault(); }
    else if (e.ctrlKey && e.key === 'Tab') { const i = S.order.indexOf(S.active); const id = S.order[(i + (e.shiftKey ? -1 : 1) + S.order.length) % S.order.length]; activate(id); e.preventDefault(); }
    else if (e.ctrlKey && e.key.toLowerCase() === 'l') { cur().clear(); e.preventDefault(); }
    else if (e.ctrlKey && e.key.toLowerCase() === 'w') { const w = cur(); if (w.type !== 'status') w.close(); e.preventDefault(); }
    else if (e.altKey && e.key.toLowerCase() === 'o') { dlgOptions(); e.preventDefault(); }
    else if (e.altKey && e.key.toLowerCase() === 'r') { if (!document.querySelector('.sedit')) scriptEditor(); e.preventDefault(); }
    else if (e.ctrlKey && e.key === 'F12') { run(S.conn === 'offline' ? '/server' : '/disconnect', st()); e.preventDefault(); }
  });
  setInterval(updateAppTitle, 1000);
  const s = await api('wa:status');
  S.engine = s.engine;
  for (const [j, a] of Object.entries(S.cfg.aliases || {})) indexNick(a, j);
  S.chats = await api('wa:chats').catch(() => []);
  for (const c of S.chats) if (!c.group) indexNick(c.name, c.id);
  await loadScripts(true, status);
  fireScript('START', {});
  if (location.hash === '#demo') demo();
  else if (s.hasSession) { status.add(T.info('Sessão salva encontrada, reconectando...')); run('/server', status); }
  else { status.add(T.info(`Para começar digite ${C}12/server${C}2 (ou clique no ícone de conectar na toolbar).`)); }
}
init();
// links dentro de diálogos (ex.: Sobre)
document.addEventListener('click', (e) => { const a = e.target.closest('.dlg a.url'); if (a) { e.preventDefault(); api('app:openUrl', a.dataset.url); } });
