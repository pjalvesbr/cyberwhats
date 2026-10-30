/* Interpretador do CyberWhats Script (.cws).
   Suporta: alias, on <evento>, menu (popups), { } blocos, if/elseif/else, while, goto/labels,
   var/set/unset/inc/dec, return/halt/haltdef, timers, hash tables, %variáveis e $identificadores.
   O "host" (app.js) fornece as ações reais (enviar mensagens, eco, kick, etc). */
(() => {
'use strict';
const CTRL = /\x03(\d{1,2}(,\d{1,2})?)?|[\x02\x0f\x16\x1d\x1e\x1f]/g;
class Halt { constructor(def) { this.haltdef = def; } }
class Return { constructor(v) { this.value = v; } }
class ScriptError extends Error {}
// tabela hash: nomes sem diferenciar maiúsculas, mas preservando a grafia original
class HTable {
  constructor() { this.m = new Map(); }
  get(k) { const e = this.m.get(String(k).toLowerCase()); return e ? e.v : undefined; }
  set(k, v) { this.m.set(String(k).toLowerCase(), { k: String(k), v }); return this; }
  has(k) { return this.m.has(String(k).toLowerCase()); }
  delete(k) { return this.m.delete(String(k).toLowerCase()); }
  keys() { return [...this.m.values()].map((e) => e.k); }
  get size() { return this.m.size; }
}

const lc = (s) => String(s ?? '').toLowerCase();
const isNum = (v) => v !== '' && v != null && !isNaN(Number(v)) && /^\s*-?\d*\.?\d+\s*$/.test(String(v));
const wildRe = (pat, cs) => new RegExp('^' + String(pat).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/&/g, '\\S+') + '$', cs ? 's' : 'is');

// ---------------------------------------------------------------- parser
function findStandaloneBrace(line) {
  const m = /(^|\s|:)\{(\s|$)/.exec(line);
  return m ? m.index + m[1].length : -1;
}
function braceDelta(text) {
  let d = 0;
  for (const tok of text.split(/\s+/)) { if (tok === '{') d++; else if (tok === '}') d--; }
  return d;
}
// lê um bloco "{ ... }" a partir de lines[i] (posição do '{' na linha); devolve corpo e próxima linha
function readBlock(lines, i, pos) {
  let rest = lines[i].slice(pos + 1);
  let depth = 1 + braceDelta(rest);
  const body = [rest];
  let j = i;
  while (depth > 0 && j + 1 < lines.length) { j++; body.push(lines[j]); depth += braceDelta(lines[j]); }
  let txt = body.join('\n');
  // remove o último '}' isolado
  const k = txt.search(/(^|\s)\}(\s*)$/);
  if (k >= 0) txt = txt.slice(0, k + (txt[k] === '}' ? 0 : 1));
  return { body: txt, next: j + 1, ok: depth <= 0 };
}

// corpo -> árvore de comandos
function parseBody(text) {
  const root = []; const stack = [root]; let cur = [];
  const flush = () => { if (cur.length) { stack[stack.length - 1].push({ text: cur.join(' ') }); cur = []; } };
  for (const rawLine of String(text).split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) continue;
    for (const w of line.split(/[ \t]+/)) {
      if (w === '{') {
        flush();
        const list = stack[stack.length - 1];
        let owner = list[list.length - 1];
        if (!owner || owner.block) { owner = { text: 'noop' }; list.push(owner); }
        owner.block = [];
        stack.push(owner.block);
      } else if (w === '}') { flush(); if (stack.length > 1) stack.pop(); }
      else if (w === '|') flush();
      else cur.push(w);
    }
    flush();
  }
  return root;
}

function parsePopups(body) {
  // linhas: ".label:comando", "label" (submenu), "-"
  const lines = String(body).split('\n');
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/\s+$/, '');
    const t = line.trim();
    if (!t || t.startsWith(';')) continue;
    let depth = 0; let s = t;
    while (s[depth] === '.') depth++;
    s = s.slice(depth);
    if (s === '-' || s === '') { items.push({ depth, sep: true }); continue; }
    // separa label:comando (primeiro ':' fora de parênteses)
    let p = 0, cut = -1;
    for (let k = 0; k < s.length; k++) { const c = s[k]; if (c === '(') p++; else if (c === ')') p = Math.max(0, p - 1); else if (c === ':' && p === 0) { cut = k; break; } }
    let label = cut >= 0 ? s.slice(0, cut) : s;
    let cmd = cut >= 0 ? s.slice(cut + 1).trim() : null;
    if (cmd !== null && cmd.startsWith('{')) {
      const b = readBlock(lines, i, lines[i].indexOf('{', lines[i].indexOf(':')));
      cmd = b.body; i = b.next - 1;
    }
    items.push({ depth, label: label.replace(/\t.*$/, '').trim(), cmd });
  }
  // monta árvore
  const root = { children: [] }; const stack = [root];
  for (const it of items) {
    while (stack.length - 1 > it.depth) stack.pop();
    const parent = stack[stack.length - 1];
    const node = { ...it, children: [] };
    parent.children.push(node);
    if (!it.sep && it.cmd === null) stack.push(node);
  }
  return root.children;
}

function parseScript(text, file) {
  const out = { aliases: {}, events: [], menus: [], errors: [], file };
  const lines = String(text).replace(/\r/g, '').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const lineNo = i + 1;
    if (!line || line.startsWith(';') || line.startsWith('#')) { i++; continue; }
    const kw = lc(line.split(/\s+/)[0]);
    const bpos = findStandaloneBrace(lines[i]);
    let header = line, body = null;
    if (bpos >= 0) {
      header = lines[i].slice(0, bpos).trim();
      const b = readBlock(lines, i, bpos);
      if (!b.ok) out.errors.push(`${file}:${lineNo}: bloco { } sem fechamento`);
      body = b.body; i = b.next;
    } else i++;
    if (kw === 'alias') {
      const m = /^alias\s+(-l\s+)?(\S+)\s*(.*)$/i.exec(header);
      if (!m) { out.errors.push(`${file}:${lineNo}: alias inválido`); continue; }
      out.aliases[lc(m[2])] = { body: parseBody(body ?? m[3]), file, line: lineNo, local: !!m[1] };
    } else if (kw === 'on') {
      const h = header.replace(/^on\s+/i, '');
      const parts = h.split(':');
      if (parts.length < 2) { out.errors.push(`${file}:${lineNo}: evento inválido`); continue; }
      const ev = { level: parts[0], event: parts[1].toUpperCase(), file, line: lineNo };
      const needsMatch = ['TEXT', 'ACTION', 'NOTICE', 'INPUT'].includes(ev.event);
      const needsTarget = ['TEXT', 'ACTION', 'NOTICE', 'INPUT', 'JOIN', 'PART', 'KICK', 'OP', 'DEOP', 'TOPIC'].includes(ev.event);
      let idx = 2;
      if (needsMatch) ev.match = parts[idx++] ?? '*';
      if (needsTarget) ev.target = parts[idx++] ?? '*';
      const rest = parts.slice(idx).join(':').trim();
      ev.body = parseBody(body ?? rest);
      if (ev.event === 'INPUT') { ev.target = ev.match; ev.match = '*'; }
      out.events.push(ev);
    } else if (kw === 'menu') {
      const m = /^menu\s+(\S+)/i.exec(header);
      if (!m || body == null) { out.errors.push(`${file}:${lineNo}: menu inválido`); continue; }
      out.menus.push({ types: lc(m[1]).split(','), items: parsePopups(body), file });
    } else if (['dialog', 'ctcp', 'raw', 'on', 'remote'].includes(kw)) {
      // não suportados: ignorados (dialog/raw/ctcp)
    } else {
      out.errors.push(`${file}:${lineNo}: linha fora de alias/on/menu ignorada: ${line.slice(0, 40)}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------- interpretador
class CwScript {
  constructor(host) {
    this.host = host;
    this.aliases = {};
    this.events = [];
    this.menus = [];
    this.vars = {};
    this.hash = new Map();
    this.timers = new Map();
    this.data = {}; // arquivos de dados (frases etc): caminho minúsculo -> linhas
    this.files = [];
  }

  // ---------- carga
  load(scripts, data, vars) {
    for (const t of this.timers.values()) clearTimeout(t.handle);
    this.timers.clear();
    this.aliases = {}; this.events = []; this.menus = [];
    this.data = {};
    for (const [k, v] of Object.entries(data || {})) this.data[this.normPath(k)] = String(v).replace(/\r/g, '').split('\n');
    if (vars) this.vars = { ...vars };
    const errors = [];
    this.files = [];
    for (const s of scripts) {
      const p = parseScript(s.text, s.name);
      Object.assign(this.aliases, p.aliases);
      this.events.push(...p.events);
      this.menus.push(...p.menus);
      errors.push(...p.errors);
      this.files.push({ name: s.name, aliases: Object.keys(p.aliases).length, events: p.events.length, menus: p.menus.length });
    }
    return errors;
  }
  normPath(p) { return lc(String(p).replace(/\\/g, '/').replace(/^\.?\//, '').replace(/^scripts\//, '')); }
  findData(p) {
    const n = this.normPath(p);
    if (this.data[n]) return this.data[n];
    const base = n.split('/').pop(), stem = base.replace(/\.[^.]+$/, '');
    const k = Object.keys(this.data).find((x) => x.split('/').pop() === base) || Object.keys(this.data).find((x) => x.split('/').pop().replace(/\.[^.]+$/, '') === stem);
    return k ? this.data[k] : null;
  }

  // ---------- execução
  ctx(base = {}) { return { args: [], depth: 0, ...base, locals: base.locals || {} }; }
  async runAlias(name, argText, base = {}) {
    const a = this.aliases[lc(name)];
    if (!a) return null;
    const ctx = this.ctx({ ...base, args: splitArgs(argText), isid: false, depth: (base.depth || 0) + 1 });
    try { await this.exec(a.body, ctx); } catch (e) { if (e instanceof Return) return e.value; if (e instanceof Halt) throw e; throw e; }
    return '';
  }
  async callAliasAsId(name, args, base) {
    const a = this.aliases[lc(name)];
    if (!a) return null;
    const ctx = this.ctx({ ...base, args, isid: true, depth: (base.depth || 0) + 1, locals: {} });
    if (ctx.depth > 60) throw new ScriptError('recursão demais em $' + name);
    try { await this.exec(a.body, ctx); } catch (e) { if (e instanceof Return) return e.value; throw e; }
    return '';
  }
  async runLine(line, base = {}) {
    const ctx = this.ctx(base);
    try { await this.exec(parseBody(line), ctx); } catch (e) { if (!(e instanceof Halt) && !(e instanceof Return)) this.host.error(e.message || String(e)); return e instanceof Halt ? e : null; }
    return ctx;
  }

  async exec(list, ctx) {
    let lastIf = null; // resultado do último if/elseif da cadeia (null = sem cadeia)
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      let text = st.text.trim().replace(/^\/+/, '');
      if (!text) continue;
      if (ctx.steps === undefined) ctx.steps = 0;
      if (++ctx.steps > 200000) throw new ScriptError('script parado: execução longa demais (loop infinito?)');
      if (text.startsWith(':')) { lastIf = null; continue; } // label
      const kw = lc(text.split(/\s+/)[0]);
      if (kw === 'if' || kw === 'elseif' || kw === 'else' || kw === 'while') {
        if (kw === 'elseif' || kw === 'else') { if (lastIf === null) { lastIf = null; continue; } if (lastIf === true) { if (kw === 'else') lastIf = null; continue; } }
        else lastIf = null;
        let cond = 'true', rest = '';
        if (kw !== 'else') {
          const after = text.slice(kw.length).trim();
          if (st.block) cond = after;
          else if (after.startsWith('(')) {
            // (a) || (b) && (c) comando
            let k = 0;
            for (;;) {
              k = matchParen(after, k) + 1;
              const m2 = /^\s*(&&|\|\|)\s*(?=[(!])/.exec(after.slice(k));
              if (!m2) break;
              k += m2[0].length;
              if (after[k] === '!') k++;
              if (after[k] !== '(') break;
            }
            cond = after.slice(0, k); rest = after.slice(k).trim();
          }
          else { const tk = after.split(/\s+/); cond = tk.slice(0, 3).join(' '); rest = tk.slice(3).join(' '); }
        } else rest = text.slice(4).trim();
        if (kw === 'while') {
          let n = 0;
          while (await this.cond(cond, ctx)) {
            if (++n > 100000) throw new ScriptError('while: loop infinito interrompido');
            try { if (st.block) await this.exec(st.block, ctx); else if (rest) await this.exec(parseBody(rest), ctx); }
            catch (e) { if (e && e.loop === 'break') break; if (e && e.loop === 'continue') continue; throw e; }
          }
          lastIf = null; continue;
        }
        const ok = kw === 'else' ? true : await this.cond(cond, ctx);
        if (ok) { if (st.block) await this.exec(st.block, ctx); else if (rest) await this.exec(parseBody(rest), ctx); }
        lastIf = kw === 'else' ? null : ok;
        continue;
      }
      lastIf = null;
      if (kw === 'goto') {
        const label = ':' + lc((await this.evaluate(text.slice(4).trim(), ctx)).trim());
        const j = list.findIndex((x) => lc(x.text.trim()) === label);
        if (j < 0) throw new ScriptError('goto: label não encontrado ' + label);
        i = j; continue;
      }
      if (kw === 'break') throw { loop: 'break' };
      if (kw === 'continue') throw { loop: 'continue' };
      await this.command(text, ctx, st.block);
    }
  }

  async command(text, ctx, block) {
    let silent = false;
    let m = /^(\.?)(!?)(\S+)\s*([\s\S]*)$/.exec(text);
    if (!m) return;
    silent = !!m[1];
    const forceBuiltin = !!m[2];
    let name = lc(m[3]);
    let raw = m[4];
    if (block && name === 'noop') { await this.exec(block, ctx); return; }
    // comandos que tratam os argumentos de forma especial
    if (name === 'var' || name === 'set') return this.cmdVar(name, raw, ctx);
    if (name === 'return') { throw new Return(raw ? await this.evaluate(raw, ctx) : ''); }
    if (name === 'halt') throw new Halt(false);
    if (name === 'haltdef') { ctx.haltdef = true; return; }
    if (name === 'noop') { if (raw) await this.evaluate(raw, ctx); return; }
    if (['inc', 'dec'].includes(name) && !this.aliases[name]) {
      const { name: vn, rest } = await this.varName(raw.replace(/^(-\S+\s+)+/, ''), ctx);
      if (!vn) return;
      const n = rest.trim() ? Number(await this.evaluate(rest, ctx)) || 0 : 1;
      this.setVar(vn, String((Number(this.getVar(vn, ctx)) || 0) + (name === 'inc' ? n : -n)), ctx);
      return;
    }
    if (name === 'unset' && !this.aliases[name]) {
      for (const v of splitTokens(raw)) { if (v[0] !== '%') continue; const re = wildRe(v.slice(1)); if (ctx.locals) for (const k of Object.keys(ctx.locals)) if (re.test(k)) delete ctx.locals[k]; for (const k of Object.keys(this.vars)) if (re.test(k)) delete this.vars[k]; }
      this.host.saveVars(this.vars); return;
    }
    if (/^timer/.test(name) && !this.aliases[name]) return this.cmdTimer(name.slice(5), await this.evaluate(raw, ctx), ctx, silent);
    const args = await this.evaluate(raw, ctx);
    if (!forceBuiltin && this.aliases[name]) {
      const r = await this.runAlias(name, args, { ...ctx, locals: undefined, steps: ctx.steps });
      ctx.result = r ?? '';
      return;
    }
    const b = BUILTINS[name];
    if (b) return b.call(this, args, ctx, silent, raw);
    // comando desconhecido: tenta o host (comandos do CyberWhats como /join, /query, /kick...)
    const handled = await this.host.command(name, args, ctx, silent);
    if (!handled) throw new ScriptError('comando desconhecido: /' + name);
  }

  async cmdVar(name, raw, ctx) {
    raw = raw.replace(/^(-\S+\s+)+/, '');
    if (name === 'var') {
      // var %a = 1, %b = 2   |   var %a 1
      const parts = splitTop(raw, ',').map((x) => x.trim()).filter(Boolean);
      for (const p of parts) {
        const mm = /^(%\S+)\s*(=\s*)?([\s\S]*)$/.exec(p);
        if (!mm) continue;
        ctx.locals[lc(mm[1].slice(1))] = mm[3] ? await this.evaluate(mm[3], ctx) : '';
      }
      return;
    }
    const { name: vn, rest } = await this.varName(raw, ctx);
    if (!vn) return;
    this.setVar(vn, await this.evaluate(rest, ctx), ctx, true);
  }
  // "%nome", "%a. $+ $1" -> nome da variável (sem avaliar o % inicial) e o resto
  async varName(raw, ctx) {
    const toks = splitTokens(raw.trim());
    if (!toks.length || toks[0][0] !== '%') return { name: '', rest: '' };
    let name = toks[0].slice(1); let i = 1;
    while (toks[i] === '$+' && toks[i + 1] !== undefined) { name += await this.evalToken(toks[i + 1], ctx); i += 2; }
    return { name, rest: toks.slice(i).join(' ') };
  }
  setVar(n, v, ctx, global) {
    n = lc(n);
    if (!global && ctx && n in ctx.locals) ctx.locals[n] = v;
    else { this.vars[n] = v; this.host.saveVars(this.vars); }
  }
  getVar(n, ctx) {
    n = lc(n);
    if (ctx && ctx.locals && n in ctx.locals) return ctx.locals[n];
    return this.vars[n] ?? '';
  }

  cmdTimer(tname, raw, ctx, silent) {
    const tk = raw.trim().split(/\s+/);
    if (lc(tk[0]) === 'off') {
      const re = wildRe(tname || '*');
      for (const [k, t] of this.timers) if (re.test(k)) { clearTimeout(t.handle); this.timers.delete(k); }
      return;
    }
    let ms = false;
    while (tk[0] && tk[0].startsWith('-')) { if (tk[0].includes('m')) ms = true; tk.shift(); }
    const reps = Number(tk[0]) || 0, delay = Number(tk[1]) || 0;
    const cmd = tk.slice(2).join(' ');
    if (!tname) { let n = 1; while (this.timers.has(String(n))) n++; tname = String(n); }
    const old = this.timers.get(tname); if (old) clearTimeout(old.handle);
    const base = { nick: ctx.nick, chan: ctx.chan, target: ctx.target, win: ctx.win };
    let count = 0;
    const t = { reps, delay, cmd };
    const fire = async () => {
      count++;
      if (reps && count >= reps) this.timers.delete(tname);
      else t.handle = setTimeout(fire, Math.max(ms ? delay : delay * 1000, 10));
      await this.runLine(cmd, base);
    };
    t.handle = setTimeout(fire, Math.max(ms ? delay : delay * 1000, 0));
    this.timers.set(tname, t);
    if (!silent) this.host.echo(null, `* Timer ${tname} ativado`);
  }

  // ---------- avaliação de texto
  async evaluate(str, ctx) {
    if (!str) return '';
    const toks = splitTokens(String(str));
    const vals = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t === '$+') { vals.push({ join: true }); continue; }
      // sintaxe antiga: $read arquivo  /  $read -l1 arquivo
      if (/^\$read$/i.test(t) && toks[i + 1] !== undefined) {
        const opts = []; let j = i + 1;
        while (toks[j] && /^-[a-z0-9]+$/i.test(toks[j])) opts.push(toks[j++]);
        const file = toks[j]; i = j;
        vals.push({ v: this.readFile(file, opts.join(' ')) });
        continue;
      }
      vals.push({ v: await this.evalToken(t, ctx) });
    }
    let out = ''; let glue = false;
    for (let i = 0; i < vals.length; i++) {
      const x = vals[i];
      if (x.join) { glue = true; continue; }
      if (out !== '' && !glue) out += ' ';
      out += x.v; glue = false;
    }
    return out.replace(/ +$/, '');
  }

  async evalToken(t, ctx) {
    if (t === '#') return ctx.chan || '';
    if (t[0] === '%' && t.length > 1) {
      const m = /^%([A-Za-z0-9_.\-[\]]+)([\s\S]*)$/.exec(t);
      if (!m) return t;
      return this.getVar(m[1], ctx) + m[2];
    }
    if (t[0] !== '$' || t.length < 2) return t;
    // $1 $2- $2-3 $$1
    let m = /^(\$\$?)(\d+)(-(\d+)?)?([\s\S]*)$/.exec(t);
    if (m) {
      const a = ctx.args || [];
      const from = Number(m[2]);
      let v;
      if (from === 0) v = String(a.length);
      else if (m[3]) v = a.slice(from - 1, m[4] ? Number(m[4]) : undefined).join(' ');
      else v = a[from - 1] ?? '';
      if (m[1] === '$$' && v === '') throw new Halt(false);
      return v + m[5];
    }
    m = /^(\$\$?)([A-Za-z_][A-Za-z0-9_.]*|\?|!|~)/.exec(t);
    if (!m) return t;
    const must = m[1] === '$$';
    let name = m[2];
    let rest = t.slice(m[0].length);
    let argStrs = null, prop = '';
    if (name === '?' || name === '!') {
      // $?="pergunta"   $?!="pergunta sim/não"
      const q = /^="([^"]*)"/.exec(rest) || /^=(\S*)/.exec(rest);
      const prompt = q ? await this.evaluate(q[1], ctx) : 'Digite:';
      if (q) rest = rest.slice(q[0].length);
      const v = name === '!' ? (await this.host.confirm(prompt) ? '$true' : '$false') : (await this.host.ask(prompt)) ?? '';
      if (must && !v) throw new Halt(false);
      return v + rest;
    }
    if (rest[0] === '(') {
      const end = matchParen(rest, 0);
      argStrs = splitTop(rest.slice(1, end), ',');
      rest = rest.slice(end + 1);
    }
    const pm = /^\.([A-Za-z]+)/.exec(rest);
    if (pm && name.indexOf('.') < 0) { prop = lc(pm[1]); rest = rest.slice(pm[0].length); }
    let v = await this.identifier(name, argStrs, prop, ctx);
    if (v === null || v === undefined) v = '';
    if (must && v === '') throw new Halt(false);
    return String(v) + rest;
  }

  async identifier(name, argStrs, prop, ctx) {
    const n = lc(name);
    const A = async (i) => (argStrs && argStrs[i] !== undefined ? this.evaluate(argStrs[i].trim(), ctx) : '');
    const all = async () => { const r = []; for (let i = 0; i < (argStrs || []).length; i++) r.push(await A(i)); return r; };
    if (n === 'iif') { const c = await this.cond(argStrs ? argStrs[0] : '', ctx); return c ? A(1) : A(2); }
    if (n === 'eval' || n === '') { let v = await A(0); const times = Number(await A(1)) || 1; for (let k = 1; k < times; k++) v = await this.evaluate(v, ctx); return v; }
    // alias do usuário como identificador
    if (this.aliases[n] && !ID[n]) return this.callAliasAsId(n, await all(), { ...ctx, prop });
    const fn = ID[n];
    if (!fn) return null;
    return fn.call(this, await all(), ctx, prop);
  }

  readFile(file, opts = '', n) {
    const lines = this.findData(file);
    if (!lines) return '';
    const content = lines.filter((x) => x.trim() !== '');
    const lm = /-p?l(\d+)/i.exec(opts || '');
    const idx = n !== undefined && n !== '' ? Number(n) : lm ? Number(lm[1]) : null;
    if (idx !== null && !isNaN(idx)) return idx === 0 ? String(lines.length) : (lines[idx - 1] ?? '');
    if (!content.length) return '';
    return content[Math.floor(Math.random() * content.length)];
  }

  // ---------- condições
  async cond(s, ctx) {
    s = String(s).trim();
    if (!s) return false;
    while (s.startsWith('(') && matchParen(s, 0) === s.length - 1) s = s.slice(1, -1).trim();
    const ors = splitOps(s, '||');
    if (ors.length > 1) { for (const p of ors) if (await this.cond(p, ctx)) return true; return false; }
    const ands = splitOps(s, '&&');
    if (ands.length > 1) { for (const p of ands) if (!(await this.cond(p, ctx))) return false; return true; }
    if (s.startsWith('!') && !s.startsWith('!=')) {
      const inner = s.slice(1).trim();
      if ((inner.startsWith('(') && matchParen(inner, 0) === inner.length - 1) || splitTokens(inner).length === 1) return !(await this.cond(inner, ctx));
    }
    const toks = splitTokens(s);
    const OPS = ['==', '===', '!=', '!==', '<', '>', '<=', '>=', '=', '//', '\\\\', 'isin', 'isincs', 'iswm', 'iswmcs', 'isnum', 'isletter', 'isalnum', 'isalpha', 'islower', 'isupper', 'ison', 'isop', 'isvoice', 'isreg', 'ischan', 'istok', 'istokcs'];
    let oi = -1, op = '', neg = false;
    for (let k = 0; k < toks.length; k++) {
      let t = lc(toks[k]);
      let ng = false;
      if (t.length > 1 && t[0] === '!' && OPS.includes(t.slice(1)) && !['!=', '!=='].includes(t)) { ng = true; t = t.slice(1); }
      if (OPS.includes(t) && k > 0) { oi = k; op = t; neg = ng; break; }
      if (OPS.includes(t) && k === 0 && ['ischan'].includes(t)) { oi = k; op = t; neg = ng; break; }
    }
    if (oi < 0) {
      const v = await this.evaluate(s, ctx);
      ctx.v1 = v;
      return v !== '' && v !== '0' && lc(v) !== '$false';
    }
    const v1 = await this.evaluate(toks.slice(0, oi).join(' '), ctx);
    const v2 = await this.evaluate(toks.slice(oi + 1).join(' '), ctx);
    ctx.v1 = v1; ctx.v2 = v2;
    let r = false;
    const num = isNum(v1) && isNum(v2);
    switch (op) {
      case '==': case '=': r = num ? Number(v1) === Number(v2) : lc(v1) === lc(v2); break;
      case '===': r = v1 === v2; break;
      case '!=': r = num ? Number(v1) !== Number(v2) : lc(v1) !== lc(v2); break;
      case '!==': r = v1 !== v2; break;
      case '<': r = num ? Number(v1) < Number(v2) : lc(v1) < lc(v2); break;
      case '>': r = num ? Number(v1) > Number(v2) : lc(v1) > lc(v2); break;
      case '<=': r = num ? Number(v1) <= Number(v2) : lc(v1) <= lc(v2); break;
      case '>=': r = num ? Number(v1) >= Number(v2) : lc(v1) >= lc(v2); break;
      case '//': r = Number(v2) !== 0 && Number(v1) % Number(v2) === 0; break;
      case '\\\\': r = Number(v2) === 0 || Number(v1) % Number(v2) !== 0; break;
      case 'isin': r = lc(v2).includes(lc(v1)); break;
      case 'isincs': r = String(v2).includes(v1); break;
      case 'iswm': r = wildRe(v1).test(v2); break;
      case 'iswmcs': r = wildRe(v1, true).test(v2); break;
      case 'isnum': {
        if (!isNum(v1)) { r = false; break; }
        if (!v2) { r = true; break; }
        const mm = /^(-?\d*\.?\d*)(-)?(-?\d*\.?\d*)$/.exec(v2.trim());
        if (!mm) { r = false; break; }
        const x = Number(v1), lo = mm[1] === '' ? -Infinity : Number(mm[1]);
        const hi = mm[2] ? (mm[3] === '' ? Infinity : Number(mm[3])) : lo;
        r = x >= lo && x <= hi; break;
      }
      case 'isletter': r = v1 !== '' && /^[\p{L}]+$/u.test(v1) && (!v2 || v2.includes(v1)); break;
      case 'isalnum': r = /^[\p{L}\p{N}]+$/u.test(v1); break;
      case 'isalpha': r = /^[\p{L}]+$/u.test(v1); break;
      case 'islower': r = v1 === v1.toLowerCase(); break;
      case 'isupper': r = v1 === v1.toUpperCase(); break;
      case 'ison': r = await this.host.isOn(v1, v2); break;
      case 'isop': r = await this.host.isOp(v1, v2); break;
      case 'isvoice': case 'isreg': r = (await this.host.isOn(v1, v2)) && !(await this.host.isOp(v1, v2)); break;
      case 'ischan': r = String(v2 || v1).startsWith('#'); break;
      case 'istok': r = tokens(v2, ' ').map(lc).includes(lc(v1)); break;
      case 'istokcs': r = tokens(v2, ' ').includes(v1); break;
    }
    return neg ? !r : r;
  }

  // ---------- eventos
  async fire(event, info) {
    // info: { nick, chan, target, text, win }   devolve true se algum script deu halt/haltdef
    let halted = false;
    for (const ev of this.events) {
      if (ev.event !== event) continue;
      if (ev.target !== undefined && !matchTarget(ev.target, info)) continue;
      if (ev.match !== undefined && ev.match !== '*' && !(info.text != null && matchText(ev.match, info.text, this))) continue;
      const ctx = this.ctx({ nick: info.nick, chan: info.chan, target: info.target, win: info.win, args: splitArgs(info.text || ''), event });
      try { await this.exec(ev.body, ctx); if (ctx.haltdef) halted = true; }
      catch (e) {
        if (e instanceof Halt) { halted = true; continue; }
        if (e instanceof Return) continue;
        this.host.error(`${ev.file}:${ev.line} (on ${event}): ${e.message || e}`);
      }
    }
    return halted;
  }

  // ---------- menus (popups)
  async buildMenu(type, base) {
    const out = [];
    for (const mnu of this.menus) {
      if (!mnu.types.includes(type)) continue;
      out.push(...(await this.buildItems(mnu.items, base)));
    }
    return out;
  }
  // item de menu que usa $1 sem alvo (ex.: menu do canal): pergunta uma vez para quem é
  async runItem(cmd, base) {
    if (!(base.args && base.args.length) && base.askArgs && /\$\$?1(?![0-9])/.test(cmd)) {
      const v = await this.host.ask(base.askArgs, base.askDefault || '');
      if (!v || !String(v).trim()) return null;
      base = { ...base, args: splitArgs(String(v).trim()) };
    }
    return this.runLine(cmd, base);
  }
  async buildItems(items, base) {
    const out = [];
    for (const it of items) {
      if (it.sep) { if (out.length && out[out.length - 1] !== '-') out.push('-'); continue; }
      const ctx = this.ctx(base);
      let label;
      try { label = await this.evaluate(it.label, ctx); } catch { label = ''; }
      let checked = false;
      if (label.includes('\u0001checked')) { checked = true; label = label.replace('\u0001checked', ''); }
      label = label.replace(/&(?!&)/g, '').replace(CTRL, '').trim();
      if (!label) continue;
      if (it.cmd === null) {
        const kids = await this.buildItems(it.children, base);
        if (kids.length) out.push([label, null, false, { children: kids, checked }]);
      } else {
        const cmd = it.cmd;
        out.push([label, () => this.runItem(cmd, base), false, { checked }]);
      }
    }
    while (out[out.length - 1] === '-') out.pop();
    return out;
  }
}

// ---------------------------------------------------------------- utilidades
function matchParen(s, i) {
  let d = 0;
  for (let k = i; k < s.length; k++) { if (s[k] === '(') d++; else if (s[k] === ')') { d--; if (d === 0) return k; } }
  return s.length - 1;
}
function splitTop(s, sep) {
  const out = []; let d = 0, cur = '';
  for (const c of String(s)) {
    if (c === '(') d++; else if (c === ')') d = Math.max(0, d - 1);
    if (c === sep && d === 0) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}
function splitOps(s, op) {
  const out = []; let d = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') d++; else if (c === ')') d = Math.max(0, d - 1);
    if (d === 0 && s.startsWith(op, i)) { out.push(cur.trim()); cur = ''; i += op.length - 1; continue; }
    cur += c;
  }
  out.push(cur.trim());
  return out.filter((x, i, a) => a.length === 1 || x !== '');
}
function splitTokens(s) {
  // parênteses só agrupam dentro de $identificador(...) — texto comum como "(risos" não
  const out = []; let d = 0, cur = '';
  for (const c of String(s)) {
    if (c === '(' && (d > 0 || cur[0] === '$')) d++; else if (c === ')' && d > 0) d--;
    if (c === ' ' && d === 0) { if (cur !== '') out.push(cur); cur = ''; } else cur += c;
  }
  if (cur !== '') out.push(cur);
  return out;
}
const splitArgs = (t) => String(t || '').split(' ').filter((x) => x !== '');
const tokens = (s, c) => String(s ?? '').split(c).filter((x) => x !== '');
function matchTarget(spec, info) {
  for (const p of String(spec).split(',')) {
    const t = p.trim();
    if (t === '*') return true;
    if (t === '#' && info.chan) return true;
    if (t === '?' && !info.chan) return true;
    if (t.startsWith('#') && t.length > 1 && info.chan && lc(t) === lc(info.chan)) return true;
    if (t === '=' && info.dcc) return true;
  }
  return false;
}
function matchText(pat, text) {
  if (pat.startsWith('$')) return true; // regex/identificador: aceita (simplificação)
  return wildRe(pat).test(text);
}
const tokSep = (c) => String.fromCharCode(Number(c) || 32);
function gettok(text, n, c) {
  const t = tokens(text, tokSep(c));
  const s = String(n);
  if (s === '0') return String(t.length);
  const m = /^(-?\d+)(-(-?\d+)?)?$/.exec(s);
  if (!m) return '';
  const norm = (x) => (x < 0 ? t.length + x + 1 : x);
  const a = norm(Number(m[1]));
  if (m[2]) { const aa = Math.max(1, a); const b = m[3] !== undefined ? norm(Number(m[3])) : t.length; return t.slice(aa - 1, b).join(tokSep(c)); }
  return t[a - 1] ?? '';
}
function pad2(n) { return String(n).padStart(2, '0'); }
function fmtTime(d, f) {
  const map = { yyyy: d.getFullYear(), yy: String(d.getFullYear()).slice(2), mmmm: d.toLocaleString('pt-BR', { month: 'long' }), mmm: d.toLocaleString('pt-BR', { month: 'short' }), mm: pad2(d.getMonth() + 1), dddd: d.toLocaleString('pt-BR', { weekday: 'long' }), ddd: d.toLocaleString('pt-BR', { weekday: 'short' }), dd: pad2(d.getDate()), HH: pad2(d.getHours()), hh: pad2(d.getHours() % 12 || 12), nn: pad2(d.getMinutes()), ss: pad2(d.getSeconds()), tt: d.getHours() < 12 ? 'am' : 'pm' };
  return f.replace(/yyyy|yy|mmmm|mmm|mm|dddd|ddd|dd|HH|hh|nn|ss|tt/g, (k) => map[k]);
}
function calc(expr) {
  const e = String(expr).replace(/\^/g, '**').replace(/\s+/g, '');
  if (!/^[\d+\-*/%().e]*$/i.test(e.replace(/\*\*/g, '*'))) return '0';
  try { const v = Function('"use strict";return (' + (e || 0) + ')')(); return Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : '0'; } catch { return '0'; }
}

// ---------------------------------------------------------------- identificadores
const ID = {
  me() { return this.host.me(); },
  nick(a, ctx, prop) {
    if (a.length) { const list = this.host.nicks(a[0]) || []; const n = Number(a[1]); return n === 0 ? String(list.length) : list[n - 1] ?? ''; }
    return ctx.nick || '';
  },
  chan(a, ctx) { return ctx.chan || ''; },
  target(a, ctx) { return ctx.target || ctx.chan || ctx.nick || ''; },
  active() { return this.host.active(); },
  network() { return 'WhatsApp'; },
  server() { return 'web.whatsapp.com'; },
  version() { return this.host.version(); },
  os() { return 'XP'; },
  script() { return ''; },
  null() { return ''; }, true() { return '$true'; }, false() { return '$false'; },
  cr() { return '\r'; }, lf() { return '\n'; }, crlf() { return '\r\n'; }, tab() { return '\t'; },
  v1(a, ctx) { return ctx.v1 ?? ''; }, v2(a, ctx) { return ctx.v2 ?? ''; },
  ifmatch(a, ctx) { return ctx.v1 ?? ''; }, ifmatch2(a, ctx) { return ctx.v2 ?? ''; },
  result(a, ctx) { return ctx.result ?? ''; },
  isid(a, ctx) { return ctx.isid ? '$true' : '$false'; },
  event(a, ctx) { return lc(ctx.event || ''); },
  style(a) { return Number(a[0]) === 1 ? '\u0001checked' : ''; },
  semacento(a) { return lc(a[0]).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); },
  len(a) { return String((a[0] ?? '').length); },
  upper(a) { return (a[0] ?? '').toUpperCase(); },
  lower(a) { return (a[0] ?? '').toLowerCase(); },
  left(a) { const s = a[0] ?? '', n = Number(a[1]); return n >= 0 ? s.slice(0, n) : s.slice(0, Math.max(0, s.length + n)); },
  right(a) { const s = a[0] ?? '', n = Number(a[1]); return n >= 0 ? (n ? s.slice(-n) : '') : s.slice(-n); },
  mid(a) { const s = a[0] ?? ''; const st = Number(a[1]) || 1; const l = a[2] !== undefined ? Number(a[2]) : undefined; const from = st < 0 ? s.length + st : st - 1; return l === undefined ? s.slice(from) : l < 0 ? s.slice(from, s.length + l) : s.slice(from, from + l); },
  pos(a) { const i = lc(a[0]).indexOf(lc(a[1])); return a[2] === '0' ? String(lc(a[0]).split(lc(a[1])).length - 1) : String(i + 1 > 0 ? i + 1 : ''); },
  replace(a) { let s = a[0] ?? ''; for (let i = 1; i + 1 < a.length; i += 2) if (a[i]) s = s.split(new RegExp(a[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')).join(a[i + 1]); return s; },
  replacecs(a) { let s = a[0] ?? ''; for (let i = 1; i + 1 < a.length; i += 2) if (a[i]) s = s.split(a[i]).join(a[i + 1]); return s; },
  remove(a) { let s = a[0] ?? ''; for (const r of a.slice(1)) if (r) s = s.split(new RegExp(r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')).join(''); return s; },
  strip(a) { return (a[0] ?? '').replace(CTRL, ''); },
  str(a) { return (a[0] ?? '').repeat(Math.max(0, Math.min(5000, Number(a[1]) || 0))); },
  chr(a) { return String.fromCharCode(Number(a[0]) || 0); },
  asc(a) { return String((a[0] ?? '').charCodeAt(0) || 0); },
  calc(a) { return calc(a.join(',')); },
  int(a) { return String(Math.trunc(Number(a[0]) || 0)); },
  round(a) { const d = Number(a[1]) || 0; return String(Number((Number(a[0]) || 0).toFixed(d))); },
  abs(a) { return String(Math.abs(Number(a[0]) || 0)); },
  sqrt(a) { return String(Math.sqrt(Number(a[0]) || 0)); },
  ceil(a) { return String(Math.ceil(Number(a[0]) || 0)); },
  floor(a) { return String(Math.floor(Number(a[0]) || 0)); },
  min(a) { return String(Math.min(...a.map(Number))); },
  max(a) { return String(Math.max(...a.map(Number))); },
  rand(a) {
    const x = a[0] ?? '1', y = a[1] ?? '';
    if (isNum(x) && isNum(y)) { const lo = Math.min(+x, +y), hi = Math.max(+x, +y); return String(lo + Math.floor(Math.random() * (hi - lo + 1))); }
    if (x.length === 1 && y.length === 1) { const lo = Math.min(x.charCodeAt(0), y.charCodeAt(0)), hi = Math.max(x.charCodeAt(0), y.charCodeAt(0)); return String.fromCharCode(lo + Math.floor(Math.random() * (hi - lo + 1))); }
    return x;
  },
  gettok(a) { return gettok(a[0], a[1], a[2]); },
  numtok(a) { return String(tokens(a[0], tokSep(a[1])).length); },
  addtok(a) { const c = tokSep(a[2]); const t = tokens(a[0], c); if (!t.map(lc).includes(lc(a[1]))) t.push(a[1]); return t.join(c); },
  deltok(a) { const c = tokSep(a[2]); const t = tokens(a[0], c); const n = Number(a[1]); const i = n < 0 ? t.length + n : n - 1; if (i >= 0 && i < t.length) t.splice(i, 1); return t.join(c); },
  remtok(a) { const c = tokSep(a[a.length - 1]); const t = tokens(a[0], c); const i = t.map(lc).indexOf(lc(a[1])); if (i >= 0) t.splice(i, 1); return t.join(c); },
  findtok(a) { const c = tokSep(a[a.length - 1]); const t = tokens(a[0], c).map(lc); const idx = t.indexOf(lc(a[1])); return idx >= 0 ? String(idx + 1) : ''; },
  istok(a) { return tokens(a[0], tokSep(a[2])).map(lc).includes(lc(a[1])) ? '$true' : '$false'; },
  instok(a) { const c = tokSep(a[3]); const t = tokens(a[0], c); t.splice(Math.max(0, (Number(a[2]) || 1) - 1), 0, a[1]); return t.join(c); },
  puttok(a) { const c = tokSep(a[3]); const t = tokens(a[0], c); const n = Number(a[2]) - 1; if (n >= 0 && n < t.length) t[n] = a[1]; return t.join(c); },
  sorttok(a) { const c = tokSep(a[1]); const t = tokens(a[0], c); return t.sort((x, y) => (a[2]?.includes('n') ? Number(x) - Number(y) : x.localeCompare(y))).join(c); },
  wildtok(a) { const c = tokSep(a[3]); const t = tokens(a[0], c).filter((x) => wildRe(a[1]).test(x)); const n = Number(a[2]); return n === 0 ? String(t.length) : t[n - 1] ?? ''; },
  time(a) { return fmtTime(new Date(), a[0] || 'HH:nn:ss'); },
  date(a) { return fmtTime(new Date(), a[0] || 'dd/mm/yyyy'); },
  fulldate() { return new Date().toString(); },
  day() { return new Date().toLocaleString('pt-BR', { weekday: 'long' }); },
  ctime() { return String(Math.floor(Date.now() / 1000)); },
  ticks() { return String(Math.floor(performance.now())); },
  asctime(a) { return fmtTime(a[0] ? new Date(Number(a[0]) * 1000) : new Date(), a[1] || 'ddd mmm dd HH:nn:ss yyyy'); },
  duration(a) { let s = Number(a[0]) || 0; const w = Math.floor(s / 604800); s %= 604800; const d = Math.floor(s / 86400); s %= 86400; const h = Math.floor(s / 3600); s %= 3600; const m = Math.floor(s / 60); s %= 60; return [w && w + 'wks', d && d + 'days', h && h + 'hrs', m && m + 'mins', (s || !(w || d || h || m)) && s + 'secs'].filter(Boolean).join(' '); },
  read(a) { return this.readFile(a[0], a.slice(1).filter((x) => /^[a-z]+$/i.test(x)).join(' '), a.find((x, i) => i > 0 && isNum(x))); },
  lines(a) { const l = this.findData(a[0]); return l ? String(l.filter((x) => x.trim()).length) : '0'; },
  exists(a) { return this.findData(a[0]) ? '$true' : '$false'; },
  readini(a) { return this.host.readIni(a[0], a[1], a[2]) ?? ''; },
  var(a) { const re = wildRe(String(a[0] || '').replace(/^%/, '')); const k = Object.keys(this.vars).filter((x) => re.test(x)); const n = Number(a[1]); return n === 0 ? String(k.length) : k[n - 1] ? '%' + k[n - 1] : ''; },
  hget(a, ctx, prop) {
    const t = this.hash.get(lc(a[0]));
    if (a.length === 1) return t ? lc(a[0]) : '';
    if (!t) return '';
    if (isNum(a[1]) && (prop === 'item' || prop === 'data')) {
      const n = Number(a[1]); const keys = [...t.keys()];
      if (n === 0) return String(keys.length);
      const k = keys[n - 1]; if (k === undefined) return '';
      return prop === 'item' ? k : t.get(k);
    }
    return t.get(a[1]) ?? '';
  },
  timer(a, ctx, prop) { const n = a[0]; if (n === '0') return String(this.timers.size); return this.timers.has(n) ? n : ''; },
  input(a) { return this.host.ask(a[0] || 'Digite:'); },
  url() { return ''; },
  ip(a) { return (a[0] === 'publico' || a[0] === 'public' ? this.host.publicIp?.() : this.host.ip?.()) || '127.0.0.1'; },
  host() { return 'cyberwhats'; },
  address(a) { return (a[0] || '') + '!' + 'whatsapp'; },
  network2() { return 'WhatsApp'; },
  idle() { return '0'; },
  away() { return this.host.away() ? '$true' : '$false'; },
  awaymsg() { return this.host.awayMsg() || ''; },
  comchan(a) { return ''; },
  query(a) { return ''; },
  chanmodes() { return ''; },
  topic(a, ctx) { return this.host.topic(a[0] || ctx.chan) || ''; },
  numeric() { return ''; },
  bytes(a) { return a[0]; },
  appdir() { return ""; }, scriptdir() { return ''; }, getdir() { return ''; },
  window(a) { return this.host.windowExists(a[0]) ? a[0] : ''; },
  encode(a) { return btoa(unescape(encodeURIComponent(a[0] ?? ''))); },
  decode(a) { try { return decodeURIComponent(escape(atob(a[0] ?? ''))); } catch { return ''; } },
  md5() { return ''; },
  base(a) { return parseInt(a[0], Number(a[1]) || 10).toString(Number(a[2]) || 10); },
  istok2() { return ''; }
};
ID['$'] = ID.eval;

// ---------------------------------------------------------------- comandos internos
const BUILTINS = {
  async echo(args, ctx) {
    let t = args; let where = null;
    const m = /^(-[a-z0-9]+)\s*/i.exec(t);
    if (m) { t = t.slice(m[0].length); if (m[1].includes('s')) where = 'status'; if (m[1].includes('a')) where = 'active'; }
    if (!where && /^[#@]\S*\s/.test(t)) { where = t.split(' ')[0]; t = t.slice(where.length + 1); }
    if (/^(1[0-5]|0?\d)\s/.test(t) && !m) t = t.replace(/^(\d{1,2})\s/, (_, n) => '\x03' + n.padStart(2, '0'));
    this.host.echo(where || ctx.target || null, t);
  },
  async say(args, ctx) { await this.host.msg(ctx.target || this.host.active(), args, ctx); },
  async msg(args, ctx) { const [to, ...r] = args.split(' '); await this.host.msg(to, r.join(' '), ctx); },
  async privmsg(args, ctx) { return BUILTINS.msg.call(this, args, ctx); },
  async notice(args, ctx) { return BUILTINS.msg.call(this, args, ctx); },
  async qme(args, ctx) { return BUILTINS.me.call(this, args, ctx); },
  async me(args, ctx) { await this.host.action(ctx.target || this.host.active(), args, ctx); },
  async action(args, ctx) { await this.host.action(ctx.target || this.host.active(), args, ctx); },
  async describe(args, ctx) { const [to, ...r] = args.split(' '); await this.host.action(to, r.join(' '), ctx); },
  async amsg(args) { for (const c of this.host.channels()) await this.host.msg(c, args); },
  async ame(args) { for (const c of this.host.channels()) await this.host.action(c, args); },
  async unset(args) { for (const v of args.split(/\s+/)) { if (!v) continue; const re = wildRe(v.replace(/^%/, '')); for (const k of Object.keys(this.vars)) if (re.test(k)) delete this.vars[k]; } this.host.saveVars(this.vars); },
  async unsetall() { this.vars = {}; this.host.saveVars(this.vars); },
  async inc(args, ctx) { const [v, n] = args.replace(/^(-\S+\s+)+/, '').split(/\s+/); if (!v || v[0] !== '%') return; const k = v.slice(1); const cur = Number(this.getVar(k, ctx)) || 0; this.setVar(k, String(cur + (n !== undefined ? Number(n) : 1)), ctx); },
  async dec(args, ctx) { const [v, n] = args.replace(/^(-\S+\s+)+/, '').split(/\s+/); if (!v || v[0] !== '%') return; const k = v.slice(1); const cur = Number(this.getVar(k, ctx)) || 0; this.setVar(k, String(cur - (n !== undefined ? Number(n) : 1)), ctx); },
  async hmake(args) { const [t] = args.replace(/^-\S+\s+/, '').split(/\s+/); if (t && !this.hash.has(lc(t))) this.hash.set(lc(t), new HTable()); },
  async hfree(args) { const w = /^-w\s+/.test(args); const t = args.replace(/^-\S+\s+/, '').trim(); if (w) { const re = wildRe(t); for (const k of [...this.hash.keys()]) if (re.test(k)) this.hash.delete(k); } else this.hash.delete(lc(t)); },
  async hadd(args) { const m = /^(-\S+\s+)?(\S+)\s+(\S+)\s*([\s\S]*)$/.exec(args); if (!m) return; const t = lc(m[2]); if (!this.hash.has(t)) this.hash.set(t, new HTable()); this.hash.get(t).set(m[3], m[4]); },
  async hinc(args) { const m = /^(-\S+\s+)?(\S+)\s+(\S+)\s*(\S*)$/.exec(args); if (!m) return; const t = lc(m[2]); if (!this.hash.has(t)) this.hash.set(t, new HTable()); const h = this.hash.get(t); h.set(m[3], String((Number(h.get(m[3])) || 0) + (m[4] ? Number(m[4]) : 1))); },
  async hdec(args) { const m = /^(-\S+\s+)?(\S+)\s+(\S+)\s*(\S*)$/.exec(args); if (!m) return; const t = lc(m[2]); if (!this.hash.has(t)) this.hash.set(t, new HTable()); const h = this.hash.get(t); h.set(m[3], String((Number(h.get(m[3])) || 0) - (m[4] ? Number(m[4]) : 1))); },
  async hdel(args) { const m = /^(-w\s+)?(\S+)\s+(\S+)/.exec(args); if (!m) return; const h = this.hash.get(lc(m[2])); if (!h) return; if (m[1]) { const re = wildRe(m[3]); for (const k of [...h.keys()]) if (re.test(k)) h.delete(k); } else h.delete(m[3]); },
  async writeini(args) { const m = /^(-\S+\s+)?(\S+)\s+(\S+)\s+(\S+)\s*([\s\S]*)$/.exec(args); if (m) this.host.writeIni(m[2], m[3], m[4], m[5]); },
  async remini(args) { const m = /^(\S+)\s+(\S+)\s*(\S*)$/.exec(args); if (m) this.host.writeIni(m[1], m[2], m[3] || null, null); },
  async write(args) { const m = /^(-\S+\s+)?(\S+)\s+([\s\S]*)$/.exec(args); if (!m) return; this.host.appendData(m[2], m[3]); const l = this.findData(m[2]); if (l) l.push(m[3]); else this.data[this.normPath(m[2])] = [m[3]]; },
  async beep() { this.host.sound('notice'); },
  async splay(args) { this.host.sound(args.split(/\s+/).pop()); },
  async linesep(args, ctx) { this.host.echo(ctx.target || null, '-'); },
  async clear(args, ctx) { this.host.clear(args || ctx.target); },
  async run(args) { if (/^https?:\/\//i.test(args)) this.host.openUrl(args); },
  async url(args) { if (/^https?:\/\//i.test(args)) this.host.openUrl(args); },
  async scid() {}, async scon() {}, async load() {}, async unload() {}, async reload() {}, async mdx() {}, async dll() {}, async titlebar() {}, async window() {}, async dialog() {}, async did() {}, async ignore() {}, async raw() {}, async ctcp() {}, async dcc() {}, async quote() {}, async sockclose() {}, async sockopen() {}, async sockwrite() {}, async sockread() {}, async drawrect() {}, async drawtext() {}, async drawline() {}, async drawpic() {}, async drawdot() {}, async drawfill() {}, async avisar(args, ctx) { this.host.echo(ctx.target || null, args); },
  async tokenize(args, ctx) { const m = /^(\d+)\s*([\s\S]*)$/.exec(args); if (!m) return; ctx.args = tokens(m[2], tokSep(m[1])); }
};

window.CwScript = CwScript;
window.CwScriptParse = parseScript;
})();
