// Testes de unidade (node --test): formatação, analisador de scripts e conversor de áudio.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { webmToOgg, webmOpusFrames } from '../src/webm2ogg.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// os arquivos da tela são scripts comuns de navegador: carrega num contexto com um "window" de mentira
function loadRenderer(...files) {
  const window = {};
  const ctx = vm.createContext({ window, console, setTimeout, clearTimeout, Date, Math });
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, 'src/renderer', f), 'utf8'), ctx, { filename: f });
  return window;
}
const { F, CwScriptParse } = loadRenderer('format.js', 'cw-script.js');

test('formatação: WhatsApp -> códigos -> WhatsApp', () => {
  const codes = F.waToCodes('*negrito* _itálico_ ~riscado~');
  assert.ok(codes.includes(F.B) && codes.includes(F.I) && codes.includes(F.S));
  assert.equal(F.strip(codes), 'negrito itálico riscado');
  assert.equal(F.codesToWa(codes), '*negrito* _itálico_ ~riscado~');
});

test('formatação: strip tira cores e estilos', () => {
  assert.equal(F.strip(`${F.C}4,1vermelho${F.O} ${F.B}forte${F.B}`), 'vermelho forte');
});

test('formatação: HTML sempre escapado', () => {
  const html = F.codesToHtml('<img src=x onerror=alert(1)> & "aspas"');
  assert.ok(!/<img/i.test(html));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('&amp;'));
});

test('formatação: só http(s) vira link', () => {
  assert.match(F.codesToHtml('veja https://www.cyberwhats.org agora'), /<a [^>]*https:\/\/www\.cyberwhats\.org/);
  assert.ok(!/<a /.test(F.codesToHtml('javascript:alert(1) file:///c:/x')));
});

test('scripts: alias, evento e menu', () => {
  const p = CwScriptParse(['alias oi { say olá $1 }', 'alias tchau say até mais', 'on *:TEXT:!hora*:#: { msg $chan agora são $time }', '; comentário'].join('\n'), 't.cws');
  assert.equal(p.errors.length, 0);
  assert.equal(Object.keys(p.aliases).sort().join(','), 'oi,tchau');
  assert.equal(p.events.length, 1);
  assert.equal(p.events[0].event, 'TEXT');
});

test('scripts: bloco sem fechamento vira erro, não exceção', () => {
  const p = CwScriptParse('alias quebrado {\n  say oi\n', 'ruim.cws');
  assert.equal(p.errors.length, 1);
  assert.match(p.errors[0], /ruim\.cws:1/);
});

test('scripts: os que vêm com o app carregam sem erro', () => {
  const dir = path.join(root, 'src/scripts');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.cws'));
  assert.ok(files.length > 0);
  for (const f of files) assert.equal(CwScriptParse(fs.readFileSync(path.join(dir, f), 'utf8'), f).errors.join('; '), '', f);
});

// ---- WebM mínimo: Segment(tamanho desconhecido) > Tracks > TrackEntry > CodecPrivate, depois Cluster > SimpleBlock
const el = (id, body) => Buffer.concat([Buffer.from(id), Buffer.from([0x80 | body.length]), body]);
const open = (id) => Buffer.concat([Buffer.from(id), Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])]);
function fakeWebm(n) {
  const head = Buffer.alloc(19); head.write('OpusHead', 0, 'ascii'); head[8] = 1; head[9] = 1; head.writeUInt16LE(312, 10); head.writeUInt32LE(48000, 12);
  const parts = [open([0x18, 0x53, 0x80, 0x67]), open([0x16, 0x54, 0xae, 0x6b]), open([0xae]), el([0x63, 0xa2], head), open([0x1f, 0x43, 0xb6, 0x75])];
  for (let i = 0; i < n; i++) parts.push(el([0xa3], Buffer.from([0x81, 0, i, 0x80, 0x78, 1, 2, 3]))); // TOC 0x78 = quadro de 20 ms
  return Buffer.concat(parts);
}

test('áudio: lê os quadros Opus do WebM', () => {
  const r = webmOpusFrames(fakeWebm(10));
  assert.equal(r.frames.length, 10);
  assert.equal(r.frames[0][0], 0x78);
  assert.equal(Buffer.from(r.codecPrivate.subarray(0, 8)).toString(), 'OpusHead');
});

test('áudio: gera Ogg/Opus válido com a duração certa', () => {
  const { ogg, seconds } = webmToOgg(fakeWebm(100));
  assert.equal(ogg.subarray(0, 4).toString(), 'OggS');
  assert.ok(ogg.includes(Buffer.from('OpusHead')) && ogg.includes(Buffer.from('OpusTags')));
  assert.ok(Math.abs(seconds - (100 * 960 - 312) / 48000) < 1e-9);
  let pos = 0, pages = 0, last = 0;
  while (pos < ogg.length) { assert.equal(ogg.subarray(pos, pos + 4).toString(), 'OggS'); last = ogg[pos + 5]; const ns = ogg[pos + 26]; let len = 0; for (let i = 0; i < ns; i++) len += ogg[pos + 27 + i]; pos += 27 + ns + len; pages++; }
  assert.equal(pos, ogg.length);
  assert.ok(pages >= 4);
  assert.equal(last & 0x04, 0x04); // última página marcada como fim
});

test('áudio: gravação vazia dá erro claro', () => {
  assert.throws(() => webmToOgg(Buffer.alloc(0)), /vazia/);
});
