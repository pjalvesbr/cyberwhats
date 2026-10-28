(() => {
// Formatação estilo IRC: códigos de controle -> HTML
// \x02 negrito, \x03 cor, \x0f reset, \x16 reverso, \x1d itálico, \x1e riscado, \x1f sublinhado
const B = '\x02', C = '\x03', O = '\x0f', U = '\x1f', I = '\x1d', S = '\x1e', R = '\x16';

// Paleta do theme "Padrão" do CyberScript 3.2 (RGBCOLORS)
const PALETTE = [
  '#ffffff', '#000000', '#000080', '#009000', '#ff0000', '#800000', '#a000a0', '#ff8000',
  '#ffff00', '#00ff00', '#009090', '#00ffff', '#0078e8', '#ff00ff', '#808080', '#d0d0d0'
];

function esc(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]])/gi;

function linkify(html) {
  return html.replace(URL_RE, (u) => `<a class="url" data-url="${u.startsWith('www.') ? 'http://' + u : u}">${u}</a>`);
}

function codesToHtml(str, defFg) {
  let out = '';
  let st = { b: false, u: false, i: false, s: false, r: false, fg: null, bg: null };
  let buf = '';
  const flush = () => {
    if (!buf) return;
    const css = [];
    let fg = st.fg, bg = st.bg;
    if (st.r) { const t = fg; fg = bg ?? 0; bg = t ?? (defFg ?? 1); }
    if (fg != null) css.push(`color:var(--c${fg % 16})`);
    if (bg != null) css.push(`background:var(--c${bg % 16})`);
    if (st.b) css.push('font-weight:bold');
    if (st.i) css.push('font-style:italic');
    const dec = [st.u && 'underline', st.s && 'line-through'].filter(Boolean).join(' ');
    if (dec) css.push('text-decoration:' + dec);
    const h = linkify(esc(buf));
    out += css.length ? `<span style="${css.join(';')}">${h}</span>` : h;
    buf = '';
  };
  for (let k = 0; k < str.length; k++) {
    const ch = str[k];
    if (ch === B) { flush(); st.b = !st.b; }
    else if (ch === U) { flush(); st.u = !st.u; }
    else if (ch === I) { flush(); st.i = !st.i; }
    else if (ch === S) { flush(); st.s = !st.s; }
    else if (ch === R) { flush(); st.r = !st.r; }
    else if (ch === O) { flush(); st = { b: false, u: false, i: false, s: false, r: false, fg: null, bg: null }; }
    else if (ch === C) {
      flush();
      const m = /^(\d{1,2})?(?:,(\d{1,2}))?/.exec(str.slice(k + 1));
      if (m && m[1] !== undefined) {
        st.fg = parseInt(m[1], 10);
        if (m[2] !== undefined) st.bg = parseInt(m[2], 10);
        k += m[0].length;
      } else { st.fg = null; st.bg = null; }
    } else buf += ch;
  }
  flush();
  return out;
}

// Remove códigos de formatação
function strip(s) { return s.replace(/\x03(\d{1,2}(,\d{1,2})?)?|[\x02\x0f\x16\x1d\x1e\x1f]/g, ''); }

// WhatsApp (*negrito* _itálico_ ~riscado~ ```mono```) -> códigos de formatação
function waToCodes(t) {
  if (!t) return '';
  return t
    .replace(/```([\s\S]+?)```/g, (_, x) => R + x + R)
    .replace(/(^|[\s(])\*(\S(?:[^*\n]*\S)?)\*(?=$|[\s).,!?:;])/g, (_, p, x) => p + B + x + B)
    .replace(/(^|[\s(])_(\S(?:[^_\n]*\S)?)_(?=$|[\s).,!?:;])/g, (_, p, x) => p + I + x + I)
    .replace(/(^|[\s(])~(\S(?:[^~\n]*\S)?)~(?=$|[\s).,!?:;])/g, (_, p, x) => p + S + x + S);
}

// códigos de formatação digitados (Ctrl+B / Ctrl+I) -> formatação WhatsApp
function codesToWa(t) {
  return t
    .replace(/\x02([^\x02]+)\x02?/g, '*$1*')
    .replace(/\x1d([^\x1d]+)\x1d?/g, '_$1_')
    .replace(/\x1e([^\x1e]+)\x1e?/g, '~$1~')
    .replace(/\x03(\d{1,2}(,\d{1,2})?)?|[\x0f\x16\x1f]/g, '');
}

window.F = { B, C, O, U, I, S, R, PALETTE, esc, codesToHtml, strip, waToCodes, codesToWa };

})();
