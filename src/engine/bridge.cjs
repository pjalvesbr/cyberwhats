// Ponte do CyberWhats que roda DENTRO do WhatsApp Web (janela escondida).
// Usa os módulos internos do WhatsApp Web (window.require) e os utilitários do
// whatsapp-web.js (window.WWebJS). Comunica com o app por window.cwHost.emit().
// Esta função é convertida em texto e executada na página: não pode usar nada de fora.
exports.CWBridge = () => {
  if (window.CW) return 'already';
  const R = (m) => window.require(m);
  const emit = (type, data) => { try { window.cwHost.emit(type, data); } catch (e) { console.warn('[cw] emit', e); } };
  const ser = (x) => (x && typeof x === 'object' ? x._serialized : x) || null;
  const toOut = (j) => (j ? String(j).replace(/@c\.us$/, '@s.whatsapp.net') : j);
  const toIn = (j) => (j ? String(j).replace(/@s\.whatsapp\.net$/, '@c.us') : j);
  const wid = (j) => R('WAWebWidFactory').createWid(toIn(j));
  const C = () => R('WAWebCollections');
  const MEDIA = { image: 'Imagem', video: 'Vídeo', ptt: 'Áudio', audio: 'Áudio', document: 'Arquivo', sticker: 'Figurinha', location: 'Localização', vcard: 'Contato', multi_vcard: 'Contatos', poll_creation: 'Enquete', event_creation: 'Evento' };
  const HAS_MEDIA = ['image', 'video', 'ptt', 'audio', 'document', 'sticker'];

  // lid -> número de telefone, quando o WhatsApp souber
  function pn(w) {
    if (!w) return null;
    try {
      const W = typeof w === 'string' ? wid(w) : w;
      if ((W.isLid && W.isLid()) || W.server === 'lid') {
        let p = null;
        try { p = R('WAWebLidMigrationUtils').toPn(W); } catch {}
        if (!p) try { p = R('WAWebApiContact').getPhoneNumber(W); } catch {}
        if (!p) try { p = C().Contact.get(W)?.phoneNumber; } catch {}
        if (p) return toOut(ser(p));
      }
      return toOut(ser(W));
    } catch { return toOut(ser(w)); }
  }
  function meWid() {
    const M = R('WAWebUserPrefsMeUser');
    return M.getMaybeMePnUser() || M.getMaybeMeLidUser();
  }
  function me() {
    const w = meWid();
    let name = '';
    try { name = R('WAWebConnModel').Conn.pushname || ''; } catch {}
    return { id: toOut(ser(w)), name: name || (w ? w.user : 'eu') };
  }
  function nameOf(w, push) {
    if (!w) return '?';
    try {
      const W = typeof w === 'string' ? wid(w) : w;
      const mw = meWid();
      if (mw && (ser(W) === ser(mw) || pn(W) === toOut(ser(mw)))) return me().name;
      const G = R('WAWebContactGetters');
      let c = C().Contact.get(W);
      if (!c && W.isLid && W.isLid()) { const p = R('WAWebLidMigrationUtils').toPn(W); if (p) c = C().Contact.get(p); }
      if (c) {
        const n = (G.getName && G.getName(c)) || c.name;
        if (n) return n;
        if (push) return push;
        const p = (G.getPushname && G.getPushname(c)) || c.pushname;
        if (p) return p;
        const v = (G.getVerifiedName && G.getVerifiedName(c)) || c.verifiedName;
        if (v) return v;
      }
      if (push) return push;
      const out = pn(W);
      return out && out.endsWith('@lid') ? 'lid' + out.split('@')[0].slice(-6) : '+' + String(out || '').split('@')[0];
    } catch { return push || String(ser(w) || '?').split('@')[0]; }
  }
  function chatName(chat) {
    try { return chat.formattedTitle || chat.name || (chat.contact && nameOf(chat.id)) || chat.id.user; } catch { return '?'; }
  }

  // ---------- mensagens ----------
  function msgOut(m) {
    if (!m) return null;
    const s = m.serialize ? m.serialize() : m;
    const type = s.type;
    if (!type || ['ciphertext', 'e2e_notification', 'notification_template', 'call_log', 'protocol', 'reaction', 'revoked', 'unknown', 'debug', 'pinned_message', 'keep_in_chat'].includes(type)) return null;
    if (s.isNotification && type !== 'gp2') return null;
    const key = s.id || {};
    const remote = ser(key.remote) || ser(s.from);
    const isGroup = /@g\.us$/.test(remote || '');
    const fromMe = !!key.fromMe;
    const senderW = fromMe ? meWid() : isGroup ? s.author || key.participant : s.from;
    const sender = pn(senderW);
    const e = {
      id: key._serialized, chat: pn(remote), alt: toOut(remote), ts: s.t || Math.floor(Date.now() / 1000), fromMe, sender,
      nick: nameOf(senderW, fromMe ? null : s.notifyName), group: isGroup, kind: 'text', text: ''
    };
    try { const ch = C().Chat.get(wid(remote)); e.chatName = ch ? chatName(ch) : e.nick; } catch { e.chatName = e.nick; }
    if (type === 'gp2') {
      e.kind = 'gp2'; e.subtype = s.subtype; e.text = s.body || '';
      e.targets = (s.recipients || []).map((r) => ({ id: pn(r), nick: nameOf(r) }));
      return e;
    }
    if (type === 'chat') e.text = s.body || '';
    else if (MEDIA[type]) {
      e.kind = 'media'; e.media = MEDIA[type];
      e.caption = HAS_MEDIA.includes(type) ? s.caption || '' : '';
      e.fileName = s.filename || '';
      e.size = Number(s.size || 0);
      e.seconds = Number(s.duration || 0);
      e.ptt = type === 'ptt';
      e.hasMedia = HAS_MEDIA.includes(type);
      if (type === 'location') e.caption = `${s.loc || ''} https://maps.google.com/?q=${s.lat},${s.lng}`.trim();
      if (type === 'vcard' || type === 'multi_vcard') e.caption = (s.vcardFormattedName || s.body || '').split('\n')[0].slice(0, 80);
      if (type === 'poll_creation') e.caption = (s.pollName || '') + ' — ' + (s.pollOptions || []).map((o) => o.name).join(' | ');
      if (type === 'event_creation') e.caption = s.eventName || '';
    } else if (s.body && typeof s.body === 'string' && s.body.length < 4000) e.text = s.body;
    else return null;
    if (s.quotedMsg) {
      const q = s.quotedMsg;
      const qt = q.type === 'chat' ? q.body : q.caption || '[' + (MEDIA[q.type] || 'mensagem') + ']';
      e.quote = { nick: nameOf(s.quotedParticipant), text: String(qt || '').slice(0, 60) };
    }
    if (s.mentionedJidList && s.mentionedJidList.length) {
      const mw = meWid();
      e.mentions = s.mentionedJidList.map((j) => { const p = pn(j); return { num: String(ser(j)).split('@')[0], pn: String(p).split('@')[0], nick: nameOf(j), me: !!mw && (ser(j) === ser(mw) || p === toOut(ser(mw))) }; });
    }
    if (e.kind === 'text' && /^\* \S/.test(e.text)) { e.kind = 'action'; e.text = e.text.slice(2); }
    if (s.isForwarded) e.forwarded = true;
    return e;
  }

  // Acha a conversa CERTA de um contato: o WhatsApp guarda muitos pvts pelo ID interno
  // (@lid) e não pelo número. Sem isso abriríamos uma conversa nova e vazia.
  async function resolveIds(jid) {
    try { const r = await window.WWebJS.enforceLidAndPnRetrieval(toIn(jid)); return r || {}; } catch { return {}; }
  }
  async function findMine(chat, text) {
    for (let i = 0; i < 10; i++) {
      try {
        const arr = chat.msgs.getModelsArray();
        for (let k = arr.length - 1; k >= Math.max(0, arr.length - 8); k--) {
          const m = arr[k];
          if (m && m.id && m.id.fromMe && (m.body === text || m.caption === text) && (m.t || 0) >= Math.floor(Date.now() / 1000) - 30) return m;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 150));
    }
    return null;
  }
  async function getChat(jid) {
    jid = toIn(jid);
    if (/@g\.us$/.test(jid)) return window.WWebJS.getChat(jid, { getAsModel: false });
    const Chat = C().Chat;
    let chat = Chat.get(wid(jid));
    if (chat && chat.msgs && chat.msgs.length) return chat;
    const { lid, phone } = await resolveIds(jid);
    const byLid = lid && Chat.get(lid);
    const byPn = phone && Chat.get(phone);
    chat = (byLid && byLid.msgs && byLid.msgs.length ? byLid : null) || (byPn && byPn.msgs && byPn.msgs.length ? byPn : null) || byLid || byPn || chat;
    if (chat) return chat;
    return window.WWebJS.getChat(jid, { getAsModel: false });
  }
  // converte @lid para o número (consultando o servidor se precisar)
  async function canon(jid) {
    if (!jid || !/@lid$/.test(jid)) return jid;
    const quick = pn(jid);
    if (quick && !/@lid$/.test(quick)) return quick;
    const { phone } = await resolveIds(jid);
    return phone ? toOut(ser(phone)) : jid;
  }

  function groupOut(chat) {
    const g = chat.groupMetadata;
    if (!g) return null;
    const mw = meWid();
    const parts = (g.participants && g.participants.getModelsArray ? g.participants.getModelsArray() : []).map((p) => {
      const id = pn(p.id);
      return { id, nick: nameOf(p.id), admin: p.isSuperAdmin ? 'superadmin' : p.isAdmin ? 'admin' : null, me: !!mw && (ser(p.id) === ser(mw) || id === toOut(ser(mw))) };
    });
    return {
      id: toOut(ser(chat.id)), subject: g.subject || chatName(chat), desc: g.desc || '', owner: g.owner ? pn(g.owner) : null,
      creation: g.creation || 0, announce: !!g.announce, restrict: !!g.restrict, participants: parts
    };
  }

  // ---------- API chamada pelo app (executeJavaScript) ----------
  const CW = (window.CW = {
    me,
    state: () => R('WAWebSocketModel').Socket.state,
    chats() {
      return C().Chat.getModelsArray()
        .filter((c) => { const s = ser(c.id) || ''; return !/@(broadcast|newsletter)$/.test(s) && !s.startsWith('status@'); })
        .map((c) => ({
          id: pn(c.id), alt: toOut(ser(c.id)), name: chatName(c), group: !!c.groupMetadata || /@g\.us$/.test(ser(c.id)), unread: c.unreadCount || 0, ts: c.t || 0,
          size: c.groupMetadata && c.groupMetadata.participants ? c.groupMetadata.participants.length : 0,
          topic: (c.groupMetadata && c.groupMetadata.desc) || ''
        }));
    },
    contacts() {
      const G = R('WAWebContactGetters');
      let F = null; try { F = R('WAWebFrontendContactGetters'); } catch {}
      const seen = new Set();
      const out = [];
      for (const c of C().Contact.getModelsArray()) {
        try {
          const raw = ser(c.id) || '';
          if (!/@(c\.us|lid)$/.test(raw)) continue;
          if (G.getIsMe && G.getIsMe(c)) continue;
          const id = pn(c.id);
          if (!id || seen.has(id)) continue;
          const name = (G.getName && G.getName(c)) || c.name || '';
          const push = (G.getPushname && G.getPushname(c)) || c.pushname || '';
          const my = F && F.getIsMyContact ? !!F.getIsMyContact(c) : !!name;
          if (!my && !push) continue;
          seen.add(id);
          let ts = 0; try { const ch = C().Chat.get(c.id); ts = ch ? ch.t || 0 : 0; } catch {}
          out.push({ id, nick: name || push || '+' + id.split('@')[0], name, push, my, ts });
        } catch {}
      }
      return out;
    },
    async group(jid) {
      const chat = await getChat(jid);
      if (!chat || !chat.groupMetadata) return null;
      try { await (C().GroupMetadata || C().WAWebGroupMetadataCollection).update(chat.id); } catch {}
      return groupOut(chat);
    },
    async history(jid, limit = 80) {
      const chat = await getChat(jid);
      if (!chat) return [];
      let msgs = chat.msgs.getModelsArray();
      if (msgs.length < limit) {
        try { const more = await R('WAWebChatLoadMessages').loadEarlierMsgs({ chat }); if (more && more.length) msgs = chat.msgs.getModelsArray(); } catch {}
      }
      return msgs.slice(-limit).map(msgOut).filter(Boolean);
    },
    async send(jid, text, quotedId, mentions) {
      const chat = await getChat(jid);
      if (!chat) throw new Error('conversa não encontrada');
      const msg = await window.WWebJS.sendMessage(chat, text, {
        linkPreview: undefined, quotedMessageId: quotedId || undefined, ignoreQuoteErrors: true,
        mentionedJidList: (mentions || []).map(toIn), parseVCards: true
      });
      const found = msg || (await findMine(chat, text));
      const e = found ? msgOut(found) : null;
      if (e) { sent.add(e.id); return e; }
      // não achou o modelo: devolve uma entrada local para aparecer na tela
      const m = me();
      return { id: 'local_' + Date.now(), chat: pn(chat.id), fromMe: true, sender: m.id, nick: m.name, kind: 'text', text, ts: Math.floor(Date.now() / 1000), group: !!chat.groupMetadata, local: true };
    },
    async sendFile(jid, file, caption) {
      const chat = await getChat(jid);
      if (!chat) throw new Error('conversa não encontrada');
      const asDoc = !/^(image|video|audio)\//.test(file.mimetype) || /gif$/.test(file.mimetype);
      const msg = await window.WWebJS.sendMessage(chat, '', {
        media: { mimetype: file.mimetype, data: file.data, filename: file.filename, filesize: file.filesize },
        caption: caption || undefined, sendMediaAsDocument: asDoc
      });
      return msgOut(msg);
    },
    async download(msgId) {
      const Msg = C().Msg;
      const msg = Msg.get(msgId) || (await Msg.getMessagesById([msgId]))?.messages?.[0];
      if (!msg || !msg.mediaData) throw new Error('mídia não encontrada (role o histórico no celular?)');
      if (msg.mediaData.mediaStage === 'REUPLOADING') throw new Error('mídia expirada, tente de novo em instantes');
      if (msg.mediaData.mediaStage != 'RESOLVED') await msg.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1 });
      if (String(msg.mediaData.mediaStage).includes('ERROR') || msg.mediaData.mediaStage === 'FETCHING') throw new Error('não foi possível baixar a mídia');
      const q = { addAnnotations() { return this; }, addPoint() { return this; } };
      const buf = await R('WAWebDownloadManager').downloadManager.downloadAndMaybeDecrypt({
        directPath: msg.directPath, encFilehash: msg.encFilehash, filehash: msg.filehash, mediaKey: msg.mediaKey,
        mediaKeyTimestamp: msg.mediaKeyTimestamp, type: msg.type, signal: new AbortController().signal, downloadQpl: q
      });
      return { data: await window.WWebJS.arrayBufferToBase64Async(buf), mimetype: msg.mimetype, filename: msg.filename || '', type: msg.type, t: msg.t };
    },
    async seen(jid) {
      try {
        const chat = await getChat(jid);
        if (!chat) return false;
        try { R('WAWebStreamModel').Stream.markAvailable(); } catch {}
        await R('WAWebUpdateUnreadChatAction').sendSeen({ chat, threadId: undefined });
        return true;
      } catch { return false; }
    },
    health() {
      let stream = null, avail = null;
      try { const S = R('WAWebStreamModel').Stream; stream = S.mode || S.displayInfo || null; avail = S.available; } catch {}
      return { state: R('WAWebSocketModel').Socket.state, stream: String(stream), available: avail, chats: C().Chat.getModelsArray().length, sent: sent.size, now: Date.now() };
    },
    async chatstate(jid, state) { try { await window.WWebJS.sendChatstate(state, toIn(jid)); } catch {} return true; },
    async presence(type) { const P = R('WAWebPresenceChatAction'); return type === 'available' ? P.sendPresenceAvailable() : P.sendPresenceUnavailable(); },
    async watch(jid) {
      // presença / digitando — melhor esforço (depende de módulos internos)
      try {
        const W = wid(jid);
        const Presence = C().Presence;
        if (!Presence) return false;
        const p = await Presence.find(W);
        if (!p || p.__cw) return true;
        p.__cw = true;
        try { p.subscribe && (await p.subscribe()); } catch {}
        const chatJid = toOut(ser(W));
        const report = (who, type) => emit('presence', { chat: chatJid, who: pn(who) || chatJid, nick: nameOf(who || W), presence: type });
        const single = () => { const t = p.chatstate && p.chatstate.type; report(W, t === 'typing' ? 'composing' : t === 'recording_audio' ? 'recording' : p.isOnline ? 'available' : 'unavailable'); };
        p.on && p.on('change:isOnline', single);
        if (p.chatstate && p.chatstate.on) p.chatstate.on('change:type', single);
        if (p.chatstates && p.chatstates.on) {
          p.chatstates.on('add change:type', (cs) => { const t = cs.type; report(cs.id, t === 'typing' ? 'composing' : t === 'recording_audio' ? 'recording' : 'paused'); });
        }
        return true;
      } catch (e) { return false; }
    },
    isOnline(jid) { try { const p = C().Presence.get(wid(jid)); return p ? !!p.isOnline : null; } catch { return null; } },
    async whois(jid) {
      const W = wid(jid);
      const out = { id: pn(W), nick: nameOf(W), name: '', notify: '', verified: '', groups: [] };
      try {
        const c = await C().Contact.find(W);
        const G = R('WAWebContactGetters');
        out.name = (G.getName && G.getName(c)) || c.name || '';
        out.notify = (G.getPushname && G.getPushname(c)) || c.pushname || '';
        out.verified = (G.getVerifiedName && G.getVerifiedName(c)) || '';
      } catch {}
      try { const a = await R('WAWebContactStatusBridge').getStatus({ token: '', wid: W }); out.status = typeof a?.status === 'string' ? a.status : ''; } catch {}
      try { const ch = await window.WWebJS.getChat(toIn(jid), { getAsModel: false }); const pic = await R('WAWebContactProfilePicThumbBridge').requestProfilePicFromServer(ch); out.pic = pic?.eurl; } catch {}
      for (const ch of C().Chat.getModelsArray()) {
        const g = ch.groupMetadata; if (!g || !g.participants) continue;
        const p = g.participants.getModelsArray().find((x) => pn(x.id) === out.id);
        if (p) out.groups.push((p.isAdmin || p.isSuperAdmin ? '@' : '') + (g.subject || chatName(ch)));
      }
      out.online = CW.isOnline(jid);
      return out;
    },
    async pic(jid) {
      try { const ch = await window.WWebJS.getChat(toIn(jid), { getAsModel: false }); const p = await R('WAWebContactProfilePicThumbBridge').requestProfilePicFromServer(ch); return p?.eurl || null; } catch { return null; }
    },
    async exists(number) {
      const r = await R('WAWebQueryExistsJob').queryWidExists(wid(String(number).replace(/\D/g, '') + '@c.us'));
      return r && r.wid ? pn(r.wid) : null;
    },
    async groupAction(jid, action, ids) {
      const chat = await getChat(jid);
      if (action === 'add') {
        const r = [];
        const gw = wid(jid);
        for (const id of ids) {
          try {
            const res = await window.WWebJS.getAddParticipantsRpcResult(gw, wid(id));
            r.push({ jid: id, status: String(res?.code ?? '200') });
          } catch (e) { r.push({ jid: id, status: String(e?.code || e?.status || 'erro') }); }
        }
        return r;
      }
      const parts = (await Promise.all(ids.map(async (p) => {
        const { lid, phone } = await window.WWebJS.enforceLidAndPnRetrieval(toIn(p));
        return chat.groupMetadata.participants.get(lid?._serialized) || chat.groupMetadata.participants.get(phone?._serialized);
      }))).filter(Boolean);
      const A = R('WAWebModifyParticipantsGroupAction');
      if (action === 'remove') await A.removeParticipants(chat, parts);
      if (action === 'promote') await A.promoteParticipants(chat, parts);
      if (action === 'demote') await A.demoteParticipants(chat, parts);
      return parts.map((p) => ({ jid: pn(p.id), status: '200' }));
    },
    async subject(jid, s) { await R('WAWebGroupModifyInfoJob').setGroupSubject(wid(jid), s); return true; },
    async desc(jid, s) {
      const chat = await getChat(jid);
      await R('WAWebGroupModifyInfoJob').setGroupDescription(wid(jid), s, await R('WAWebMsgKey').newId(), chat.groupMetadata.descId);
      return true;
    },
    async leave(jid) { const chat = await getChat(jid); return R('WAWebExitGroupAction').sendExitGroup(chat); },
    async invite(jid) {
      const tries = [
        () => R('WAWebMexFetchGroupInviteCodeJob').fetchMexGroupInviteCode(toIn(jid)),
        () => R('WAWebGroupInviteJob').queryGroupInviteCode(wid(jid)),
        () => R('WAWebGroupQueryJob').queryGroupInviteCode(wid(jid))
      ];
      let last;
      for (const t of tries) { try { const r = await t(); const code = r?.code || r; if (typeof code === 'string' && code) return code; } catch (e) { last = e; } }
      throw new Error('não consegui obter o link de convite' + (last ? ' (' + (last.message || last) + ')' : ''));
    },
    async setName(n) { if (!R('WAWebConnModel').Conn.canSetMyPushname()) throw new Error('o WhatsApp não permite mudar o nome agora'); await R('WAWebSetPushnameConnAction').setPushname(n); return true; },
    async setStatus(s) { await R('WAWebContactStatusBridge').setMyStatus(s); return true; },
    async logout() { return R('WAWebSocketModel').Socket.logout(); }
  });

  // ---------- eventos ----------
  const { Msg, Chat } = C();
  const sent = new Set();
  const START = Math.floor(Date.now() / 1000) - 10;
  const go = async (m, via) => {
    if (!m || m.type === 'ciphertext') return;
    let e = null;
    try { e = msgOut(m); } catch (err) { emit('dbg', 'msgOut falhou: ' + err); }
    if (!e || sent.has(e.id)) return;
    sent.add(e.id); if (sent.size > 5000) sent.clear();
    if (e.ts < START) return; // mensagem antiga (histórico), não é "nova"
    try { emit('dbg', `${via} type=${m.type} chat=${e.chat} fromMe=${e.fromMe}`); } catch {}
    if (!e.group) { e.chat = await canon(e.chat); if (!e.fromMe) e.sender = await canon(e.sender); }
    emit(e.kind === 'gp2' ? 'gp2' : 'message', e);
  };
  // 1) evento direto do WhatsApp Web
  Msg.on('add', (msg) => {
    if (!msg.isNewMsg) return;
    if (msg.type === 'ciphertext') { msg.once('change:type', (m) => go(m, 'add*')); return; }
    go(msg, 'add');
  });
  // mantém o WhatsApp Web "disponível" (como uma aba visível); sem isso ele pode parar de receber
  setInterval(() => { try { const S = R('WAWebStreamModel').Stream; if (S && S.available === false && window.__cwKeepOnline !== false) S.markAvailable(); } catch {} }, 20000);
  // 2) rede de segurança: quando uma conversa muda, confere as últimas mensagens dela
  const lastT = new Map();
  const sweep = async (chat, via) => {
    try {
      const cand = chat.msgs && chat.msgs.getModelsArray ? chat.msgs.getModelsArray().slice(-15) : [];
      const key = chat.lastReceivedKey && ser(chat.lastReceivedKey);
      if (key && !sent.has(key)) {
        let lm = Msg.get(key);
        if (!lm) { try { lm = (await Msg.getMessagesById([key]))?.messages?.[0]; } catch {} }
        if (lm && !cand.includes(lm)) cand.push(lm);
      }
      cand.sort((a, b) => (a.t || 0) - (b.t || 0));
      for (const m of cand) if ((m.t || 0) >= START) await go(m, via);
    } catch (err) { emit('dbg', 'sweep falhou: ' + err); }
  };
  Chat.on('change:t change:unreadCount change:lastReceivedKey', (chat) => sweep(chat, 'chat'));
  setInterval(() => {
    try {
      for (const c of Chat.getModelsArray()) {
        const t = c.t || 0, id = ser(c.id);
        if (t >= START && lastT.get(id) !== t) { lastT.set(id, t); sweep(c, 'varredura'); }
      }
    } catch {}
  }, 3000);
  Msg.on('change:type', (msg) => {
    if (msg.type === 'revoked') { const k = msg.id; emit('revoke', { chat: pn(k.remote), id: k._serialized, nick: nameOf(msg.author || msg.from) }); }
  });
  Msg.on('change:body change:caption', (msg, newBody) => {
    if (msg.type === 'revoked' || !msg.latestEditMsgKey) return;
    const k = msg.id;
    emit('edit', { chat: pn(k.remote), id: k._serialized, text: newBody || '', fromMe: !!k.fromMe, nick: nameOf(k.fromMe ? meWid() : msg.author || msg.from) });
  });
  try {
    window.WWebJS.injectToFunction({ module: 'WAWebAddonReactionTableMode', function: 'reactionTableMode.bulkUpsert' }, (module, orig, ...args) => {
      try {
        const now = Date.now();
        for (const r of args[0] || []) {
          const ts = Number(r.reactionTimestamp || 0);
          if (ts && now - ts > 120000) continue;
          const parent = r.reactionParentKey;
          const pm = parent && Msg.get(ser(parent));
          const sender = r.author || r.from;
          emit('reaction', { chat: pn(parent?.remote), emoji: r.reactionText || '', nick: nameOf(sender), fromMe: !!r.id?.fromMe, target: pm ? String(pm.body && pm.type === 'chat' ? pm.body : pm.caption || '').slice(0, 40) : '' });
        }
      } catch {}
      return orig.apply(module, args);
    });
  } catch {}
  try {
    const CallCol = R('WAWebCallCollection');
    const mapKey = Object.keys(CallCol).find((k) => CallCol[k] instanceof Map);
    const map = CallCol[mapKey];
    const set = map.set.bind(map);
    map.set = function (key, v) {
      try { if (v && !v.outgoing) emit('call', { from: pn(v.peerJid), nick: nameOf(v.peerJid), video: !!v.isVideo, group: !!v.isGroup }); } catch {}
      return set(key, v);
    };
  } catch {}
  Chat.on('add', () => emit('chats-changed', null));
  R('WAWebSocketModel').Socket.on('change:state', (_s, st) => emit('state', st));
  return 'ok';
};

// Executado antes do login: expõe o QR code (e o código de pareamento) para o app.
exports.CWAuth = () => {
  if (window.__cwAuth) return 'already';
  window.__cwAuth = true;
  const emit = (t, d) => { try { window.cwHost.emit(t, d); } catch {} };
  const Socket = window.require('WAWebSocketModel').Socket;
  const sendQR = async () => {
    try {
      const A = window.AuthStore;
      const reg = await A.RegistrationUtils.waSignalStore.getRegistrationInfo();
      const noise = await A.RegistrationUtils.waNoiseInfo.get();
      const s = A.Base64Tools.encodeB64(noise.staticKeyPair.pubKey);
      const i = A.Base64Tools.encodeB64(reg.identityKeyPair.pubKey);
      const ref = A.Conn.ref;
      if (!ref) return;
      emit('qr', ref + ',' + s + ',' + i + ',' + window.require('WAWebUserPrefsMultiDevice').getADVSecretKey() + ',' + A.RegistrationUtils.DEVICE_PLATFORM);
    } catch (e) { emit('qr-fallback', String(e)); }
  };
  window.AuthStore.Conn.on('change:ref', sendQR);
  Socket.on('change:state', (_s, st) => {
    emit('state', st);
    if (st === 'UNPAIRED_IDLE') { try { window.require('WAWebCmd').Cmd.refreshQR(); } catch {} }
  });
  Socket.on('change:hasSynced', () => emit('synced', true));
  window.__cwSendQR = sendQR;
  window.__cwPair = async (phone) => {
    const P = window.AuthStore.PairingCodeLinkUtils;
    P.setPairingType('ALT_DEVICE_LINKING');
    await P.initializeAltDeviceLinking();
    return P.startAltLinkingFlow(phone, true);
  };
  return 'ok';
};
