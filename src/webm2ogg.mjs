// Converte a gravação do microfone (WebM/Opus do Chromium) em Ogg/Opus,
// o formato que o WhatsApp usa nas mensagens de voz. Só reempacota: o áudio não é recodificado.

const CONTAINERS = new Set([0x18538067, 0x1f43b675, 0x1654ae6b, 0xae, 0xa0, 0xe1]);
const ID_CODEC_PRIVATE = 0x63a2, ID_CHANNELS = 0x9f, ID_SIMPLEBLOCK = 0xa3, ID_BLOCK = 0xa1;

function readVint(buf, pos, keepMarker) {
  const b = buf[pos];
  if (b === undefined) return null;
  let len = 1, mask = 0x80;
  while (len <= 8 && !(b & mask)) { len++; mask >>= 1; }
  if (len > 8 || pos + len > buf.length) return null;
  let v = keepMarker ? b : b & (mask - 1);
  let allOnes = (b & (mask - 1)) === mask - 1;
  for (let i = 1; i < len; i++) { v = v * 256 + buf[pos + i]; if (buf[pos + i] !== 0xff) allOnes = false; }
  return { v, len, unknown: !keepMarker && allOnes };
}

// lê os quadros Opus de dentro do WebM
export function webmOpusFrames(buf) {
  const frames = [];
  let codecPrivate = null, channels = 1, pos = 0;
  while (pos < buf.length) {
    const id = readVint(buf, pos, true); if (!id) break;
    const size = readVint(buf, pos + id.len, false); if (!size) break;
    const start = pos + id.len + size.len;
    if (CONTAINERS.has(id.v)) { pos = start; continue; } // entra no elemento (tamanho pode ser "desconhecido")
    const end = size.unknown ? buf.length : Math.min(buf.length, start + size.v);
    if (id.v === ID_CODEC_PRIVATE) codecPrivate = buf.subarray(start, end);
    else if (id.v === ID_CHANNELS) channels = buf[start] || 1;
    else if (id.v === ID_SIMPLEBLOCK || id.v === ID_BLOCK) {
      const tn = readVint(buf, start, false);
      if (tn) {
        const flags = buf[start + tn.len + 2];
        if (!(flags & 0x06)) frames.push(buf.subarray(start + tn.len + 3, end)); // sem "lacing" (o Chromium não usa)
      }
    }
    pos = end;
  }
  return { frames, codecPrivate, channels };
}

// quantas amostras (48 kHz) tem um pacote Opus, pelo byte TOC
function opusSamples(p) {
  if (!p.length) return 0;
  const toc = p[0], cfg = toc >> 3;
  let ms;
  if (cfg < 12) ms = [10, 20, 40, 60][cfg & 3];
  else if (cfg < 16) ms = [10, 20][cfg & 1];
  else ms = [2.5, 5, 10, 20][cfg & 3];
  const c = toc & 3;
  const n = c === 0 ? 1 : c === 3 ? (p[1] || 0) & 0x3f : 2;
  return Math.round(n * ms * 48);
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let r = i << 24; for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1; t[i] = r >>> 0; }
  return t;
})();
function crc32(b) { let c = 0; for (let i = 0; i < b.length; i++) c = ((c << 8) ^ CRC[((c >>> 24) ^ b[i]) & 0xff]) >>> 0; return c >>> 0; }

function oggPage(packets, granule, serial, seq, flags) {
  const segs = [];
  for (const p of packets) { let n = p.length; while (n >= 255) { segs.push(255); n -= 255; } segs.push(n); }
  const body = Buffer.concat(packets.map((p) => Buffer.from(p)));
  const h = Buffer.alloc(27 + segs.length);
  h.write('OggS', 0, 'ascii'); h[4] = 0; h[5] = flags;
  h.writeBigInt64LE(BigInt(granule), 6);
  h.writeUInt32LE(serial, 14); h.writeUInt32LE(seq, 18); h.writeUInt32LE(0, 22);
  h[26] = segs.length; segs.forEach((s, i) => (h[27 + i] = s));
  const page = Buffer.concat([h, body]);
  page.writeUInt32LE(crc32(page), 22);
  return page;
}

export function webmToOgg(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const { frames, codecPrivate, channels } = webmOpusFrames(buf);
  if (!frames.length) throw new Error('gravação vazia');
  let head;
  if (codecPrivate && codecPrivate.length >= 19 && Buffer.from(codecPrivate.subarray(0, 8)).toString('ascii') === 'OpusHead') head = Buffer.from(codecPrivate);
  else {
    head = Buffer.alloc(19); head.write('OpusHead', 0, 'ascii'); head[8] = 1; head[9] = channels;
    head.writeUInt16LE(312, 10); head.writeUInt32LE(48000, 12); head.writeInt16LE(0, 16); head[18] = 0;
  }
  const preSkip = head.readUInt16LE(10);
  const vendor = Buffer.from('CyberWhats');
  const tags = Buffer.alloc(8 + 4 + vendor.length + 4);
  tags.write('OpusTags', 0, 'ascii'); tags.writeUInt32LE(vendor.length, 8); vendor.copy(tags, 12); tags.writeUInt32LE(0, 12 + vendor.length);
  const serial = (Math.random() * 0xffffffff) >>> 0;
  const pages = [oggPage([head], 0, serial, 0, 0x02), oggPage([tags], 0, serial, 1, 0)];
  let seq = 2, granule = 0, cur = [], segs = 0;
  const flush = (last) => { pages.push(oggPage(cur, granule, serial, seq++, last ? 0x04 : 0)); cur = []; segs = 0; };
  frames.forEach((f, i) => {
    const need = Math.floor(f.length / 255) + 1;
    if (cur.length && (segs + need > 255 || cur.length >= 50)) flush(false);
    cur.push(f); segs += need; granule += opusSamples(f);
    if (i === frames.length - 1) flush(true);
  });
  const samples = Math.max(0, granule - preSkip);
  return { ogg: Buffer.concat(pages), seconds: samples / 48000 };
}
