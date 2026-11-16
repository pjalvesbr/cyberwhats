// Motor de mentira para os testes: fala o mesmo protocolo do cw-engine (JSON por linha em stdin/stdout),
// mas não conecta em lugar nenhum. Todos os nomes e números aqui são inventados.
//
// Uso: CW_ENGINE_BIN=tests/fake-engine.cjs (só vale fora do instalador). Variáveis:
//   FAKE_BACKLOG=1  simula mensagens e chamadas recebidas com o app desligado
//   FAKE_SLOW=1     demora 1,5 s para confirmar cada envio
//   FAKE_LOG=arquivo  grava em JSON o último comando recebido de cada tipo
const fs = require('fs');
const rl = require('readline').createInterface({ input: process.stdin });
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const now = () => Math.floor(Date.now() / 1000);
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC'; // quadradinho 8x8
const ME = '5511900000000@s.whatsapp.net', ANA = '5511900000001@s.whatsapp.net', BETO = '5511900000002@s.whatsapp.net', CARLA = '5511900000003@s.whatsapp.net';
const GRUPO = '120363000000000001@g.us';
const seen = {};
const note = (r) => { seen[r.cmd] = r.args; if (process.env.FAKE_LOG) { try { fs.writeFileSync(process.env.FAKE_LOG, JSON.stringify(seen)); } catch {} } };
const mine = (jid, extra) => ({ id: 'S' + Date.now() + Math.floor(Math.random() * 1000), chat: jid, group: jid.endsWith('@g.us'), ts: now(), fromMe: true, sender: ME, nick: 'Teste', raw: 'x', ...extra });
const from = (who, nick, chat, extra) => ({ id: 'R' + Date.now() + Math.floor(Math.random() * 1000), chat, group: chat.endsWith('@g.us'), chatName: chat === GRUPO ? 'Grupo de Teste' : undefined, ts: now(), fromMe: false, sender: who, nick, raw: 'x', ...extra });

rl.on('line', (line) => {
  let r; try { r = JSON.parse(line); } catch { return; }
  const ok = (data) => out({ id: r.id, ok: true, data });
  const fail = (error) => out({ id: r.id, ok: false, error });
  note(r);
  switch (r.cmd) {
    case 'connect':
      ok(null);
      out({ event: 'state', data: { state: 'connecting' } });
      setTimeout(() => {
        out({ event: 'state', data: { state: 'online', me: { id: ME, name: 'Teste' } } });
        out({ event: 'chats', data: [{ id: GRUPO, name: 'Grupo de Teste', group: true, size: 4, topic: 'canal dos testes', ts: now() }, { id: ANA, name: 'Ana', group: false, ts: now() - 100 }] });
      }, 300);
      setTimeout(() => {
        out({ event: 'message', data: from(ANA, 'Ana', GRUPO, { id: 'T1', kind: 'text', text: 'oi pessoal, tudo bem?' }) });
        out({ event: 'message', data: from(BETO, 'Beto', GRUPO, { id: 'P1', kind: 'media', media: 'Imagem', caption: 'olha a foto', hasMedia: true, raw: 'IMG', mimetype: 'image/png', thumb: 'data:image/png;base64,' + PNG }) });
        out({ event: 'message', data: from(ANA, 'Ana', ANA, { id: 'T2', kind: 'text', text: 'mensagem no pvt' }) });
        out({ event: 'reaction', data: { chat: GRUPO, emoji: '👍', nick: 'Beto', sender: BETO, fromMe: false, targetId: 'T1', live: true } });
      }, 900);
      if (process.env.FAKE_BACKLOG) setTimeout(() => {
        out({ event: 'offline', data: { state: 'start', messages: 4, total: 4 } });
        for (let i = 0; i < 3; i++) out({ event: 'message', data: from(BETO, 'Beto', GRUPO, { id: 'B' + Date.now() + i, ts: now() - 86400 + i, kind: 'text', text: 'mensagem antiga ' + i, backlog: true }) });
        out({ event: 'message', data: from(CARLA, 'Carla', CARLA, { id: 'B' + Date.now() + 'c', ts: now() - 80000, kind: 'text', text: 'me liga', backlog: true }) });
        out({ event: 'call', data: { from: CARLA, nick: 'Carla', video: false, ts: now() - 7200, missed: true, id: 'C1' } });
        out({ event: 'call', data: { from: CARLA, nick: 'Carla', video: false, ts: now() - 7100, missed: true, id: 'C2' } });
        setTimeout(() => out({ event: 'offline', data: { state: 'done', count: 4 } }), 400);
        setTimeout(() => out({ event: 'call', data: { from: ANA, nick: 'Ana', video: true, ts: now(), missed: false, id: 'C3' } }), 900);
      }, 1500);
      break;
    case 'group': ok({ id: GRUPO, subject: 'Grupo de Teste', desc: 'canal dos testes', owner: ANA, creation: 1600000000, announce: false, restrict: false,
      participants: [{ id: ANA, nick: 'Ana', admin: 'superadmin' }, { id: ME, nick: 'Teste', admin: 'admin', me: true }, { id: BETO, nick: 'Beto', admin: null }, { id: CARLA, nick: 'Carla', admin: null }] }); break;
    case 'contacts': ok([{ id: ANA, nick: 'Ana', name: 'Ana', push: 'Aninha' }, { id: BETO, nick: 'Beto' }, { id: CARLA, nick: 'Carla' }]); break;
    case 'send':
      if (/FALHA/.test(r.args.text)) { setTimeout(() => fail('server returned error 500'), 300); break; }
      setTimeout(() => ok(mine(r.args.jid, { kind: r.args.text.startsWith('* ') ? 'action' : 'text', text: r.args.text.replace(/^\* /, '') })), process.env.FAKE_SLOW ? 1500 : 30);
      break;
    case 'sendFile': ok(mine(r.args.jid, { kind: 'media', media: r.args.ptt ? 'Áudio' : 'Imagem', ptt: !!r.args.ptt, caption: r.args.caption || '', hasMedia: false })); break;
    case 'sendSticker': ok(mine(r.args.jid, { kind: 'media', media: 'Figurinha', hasMedia: true, raw: 'IMG' })); break;
    case 'sendPoll': ok(mine(r.args.jid, { kind: 'poll', text: r.args.name, poll: { name: r.args.name, options: r.args.options, max: r.args.multi ? 0 : 1 } })); break;
    case 'forward': ok(mine(r.args.jid, { kind: 'text', text: r.args.text || '[mídia]' })); break;
    case 'download': ok({ data: PNG, mimetype: 'image/png', filename: '' }); break;
    case 'favStickers': for (let i = 0; i < 2; i++) out({ event: 'sticker-fav', data: { key: 'K' + i, fav: true, raw: 'IMG', w: 512, h: 512, ts: i, hasKey: true } }); ok(null); break;
    case 'stickerShas': ok({}); break;
    case 'whois': ok({ id: r.args.jid, nick: 'Ana', name: 'Ana', push: 'Aninha', about: 'recado de teste', groups: [] }); break;
    case 'exists': ok(/^\d{8,}$/.test(String(r.args.number)) ? String(r.args.number) + '@s.whatsapp.net' : null); break;
    case 'pic': case 'invite': ok(null); break;
    default: ok(null); // react, revoke, edit, read, presence, chatstate, subscribe, pollVote, disconnect...
  }
});
