// Prévia de links (título, descrição e miniatura) — como o WhatsApp mostra para YouTube, Instagram etc.
import { net, nativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const UA = 'WhatsApp/2.24.6.77 A'; // muitos sites só entregam as tags og: para robôs de prévia conhecidos
const MAX = 600 * 1024;
let cacheFile = null;
const cache = new Map(); // url -> { t: quando, v: {url,title,desc,site,thumb} | null }
const inflight = new Map();

export function initLinkCache(dir) {
  cacheFile = path.join(dir, 'link-cache.json');
  try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(cacheFile, 'utf8')))) cache.set(k, v); } catch {}
}
let saveTimer = null;
function saveCache() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!cacheFile) return;
    const ent = [...cache.entries()].slice(-400);
    try { fs.writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(ent))); } catch {}
  }, 2000);
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const unent = (s) => String(s || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m)).replace(/\s+/g, ' ').trim();

function meta(html, names) {
  for (const n of names) {
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']*)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${n}["']`, 'i');
    const m = re1.exec(html) || re2.exec(html);
    if (m && m[1].trim()) return unent(m[1]);
  }
  return '';
}

async function fetchText(url, ms) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await net.fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8', Accept: 'text/html,*/*;q=0.8' }, signal: ac.signal, redirect: 'follow' });
    if (!r.ok || !/html|xml/i.test(r.headers.get('content-type') || 'text/html')) return null;
    const reader = r.body.getReader(); const parts = []; let n = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); n += value.length; if (n > MAX) { try { await reader.cancel(); } catch {} break; } }
    return { html: Buffer.concat(parts.map((p) => Buffer.from(p))).toString('utf8'), finalUrl: r.url || url };
  } finally { clearTimeout(t); }
}
async function fetchThumb(url, ms) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await net.fetch(url, { headers: { 'User-Agent': UA }, signal: ac.signal });
    if (!r.ok) return '';
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length > 5 * 1024 * 1024) return '';
    let img = nativeImage.createFromBuffer(b);
    if (img.isEmpty()) return '';
    const { width, height } = img.getSize();
    const s = Math.min(1, 160 / Math.max(width, height));
    img = img.resize({ width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)), quality: 'good' });
    return img.toJPEG(70).toString('base64');
  } catch { return ''; } finally { clearTimeout(t); }
}

export async function linkPreview(url, { timeout = 6000, thumb = true } = {}) {
  url = String(url || '').trim().replace(/[).,;!?]+$/, '');
  if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(url)) return null;
  const c = cache.get(url);
  if (c && (c.v || Date.now() - c.t < 3600e3)) return c.v;
  if (inflight.has(url)) return inflight.get(url);
  const p = (async () => {
    let v = null;
    try {
      const r = await fetchText(url, timeout);
      if (r) {
        const h = r.html;
        const title = meta(h, ['og:title', 'twitter:title']) || unent((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(h) || [])[1] || '');
        const desc = meta(h, ['og:description', 'twitter:description', 'description']);
        const site = meta(h, ['og:site_name']) || new URL(r.finalUrl).hostname.replace(/^www\./, '');
        let image = meta(h, ['og:image', 'og:image:url', 'twitter:image']);
        if (image) { try { image = new URL(image, r.finalUrl).toString(); } catch { image = ''; } }
        if (title) v = { url, title: title.slice(0, 200), desc: desc.slice(0, 300), site, thumb: thumb && image ? await fetchThumb(image, 5000) : '' };
      }
    } catch {}
    cache.set(url, { t: Date.now(), v }); saveCache();
    return v;
  })();
  inflight.set(url, p);
  try { return await p; } finally { inflight.delete(url); }
}
