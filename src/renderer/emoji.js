/* CyberWhats — seletor de emojis (Ctrl+Espaço) */
'use strict';
(() => {
const seq = (s) => Array.from(new Intl.Segmenter('pt', { granularity: 'grapheme' }).segment(s.replace(/\s+/g, '')), (x) => x.segment);
const CATS = [
  ['😀', 'Carinhas', '😀😃😄😁😆😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😗😚😙😋😛😜🤪😝🤑🤗🤭🤫🤔🤐🤨😐😑😶😏😒🙄😬🤥😌😔😪🤤😴😷🤒🤕🤢🤮🤧🥵🥶🥴😵🤯🤠🥳😎🤓🧐😕😟🙁😮😯😲😳🥺😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀☠️💩🤡👹👺👻👽👾🤖😺😸😹😻😼😽🙀😿😾🙈🙉🙊'],
  ['👍', 'Gestos e pessoas', '👋🤚🖐️✋🖖👌🤌🤏✌️🤞🤟🤘🤙👈👉👆🖕👇☝️👍👎✊👊🤛🤜👏🙌👐🤲🤝🙏✍️💅🤳💪🦾🦵🦶👂👃🧠👀👁️👅👄💋👶🧒👦👧🧑👱👨🧔👩🧓👴👵🙍🙎🙅🙆💁🙋🧏🙇🤦🤷👮🕵️💂👷🤴👸👳👲🧕🤵👰🤰🤱👼🎅🤶🦸🦹🧙🧚🧛🧜🧝🧞🧟💆💇🚶🧍🧎🏃💃🕺👯🧖🧗🤺🏇⛷️🏂🏌️🏄🚣🏊⛹️🏋️🚴🚵🤸🤼🤽🤾🤹🧘🛀🛌👭👫👬💏💑👪'],
  ['❤️', 'Corações', '❤️🧡💛💚💙💜🤎🖤🤍💔❣️💕💞💓💗💖💘💝💟💌💯💢💥💫💦💨🕳️💬💭💤'],
  ['🐶', 'Animais e natureza', '🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🐔🐧🐦🐤🦆🦅🦉🦇🐺🐗🐴🦄🐝🐛🦋🐌🐞🐜🦟🦗🕷️🦂🐢🐍🦎🦖🦕🐙🦑🦐🦞🦀🐡🐠🐟🐬🐳🐋🦈🐊🐅🐆🦓🦍🦧🐘🦛🦏🐪🐫🦒🦘🐃🐂🐄🐎🐖🐏🐑🦙🐐🦌🐕🐩🦮🐈🐓🦃🦚🦜🦢🦩🕊️🐇🦝🦨🦡🦦🦥🐁🐀🐿️🦔🌵🎄🌲🌳🌴🌱🌿☘️🍀🎍🎋🍃🍂🍁🍄🌾💐🌷🌹🥀🌺🌸🌼🌻🌞🌝🌛🌜🌚🌕🌙🌎⭐🌟✨⚡🔥🌈☀️⛅☁️🌧️⛈️❄️☃️⛄🌊💧☔'],
  ['🍔', 'Comida', '🍏🍎🍐🍊🍋🍌🍉🍇🍓🍈🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥬🥒🌶️🌽🥕🧄🧅🥔🍠🥐🥯🍞🥖🥨🧀🥚🍳🧈🥞🧇🥓🥩🍗🍖🌭🍔🍟🍕🥪🥙🧆🌮🌯🥗🥘🥫🍝🍜🍲🍛🍣🍱🥟🍤🍙🍚🍘🍥🥠🍢🍡🍧🍨🍦🥧🧁🍰🎂🍮🍭🍬🍫🍿🍩🍪🌰🥜🍯🥛🍼☕🍵🧃🥤🍶🍺🍻🥂🍷🥃🍸🍹🧉🍾🧊🥄🍴🍽️'],
  ['⚽', 'Atividades', '⚽🏀🏈⚾🥎🎾🏐🏉🥏🎱🏓🏸🏒🏑🥍🏏🥅⛳🏹🎣🥊🥋🎽🛹🛷⛸️🥌🎿🏆🥇🥈🥉🏅🎖️🎗️🎫🎟️🎪🤹🎭🎨🎬🎤🎧🎼🎹🥁🎷🎺🎸🪕🎻🎲♟️🎯🎳🎮🕹️🎰🧩'],
  ['🚗', 'Viagens e lugares', '🚗🚕🚙🚌🚎🏎️🚓🚑🚒🚐🚚🚛🚜🛴🚲🛵🏍️🚨🚔🚍🚘🚖🚡🚠🚟🚃🚋🚞🚝🚄🚅🚈🚂🚆🚇🚊🚉✈️🛫🛬🛩️💺🚀🛸🚁🛶⛵🚤🛥️🛳️⛴️🚢⚓⛽🚧🚦🚥🗺️🗿🗽🗼🏰🏯🏟️🎡🎢🎠⛲⛱️🏖️🏝️🏜️🌋⛰️🏔️🗻🏕️⛺🏠🏡🏘️🏚️🏗️🏭🏢🏬🏣🏤🏥🏦🏨🏪🏫🏩💒🏛️⛪🕌🕍🛕🕋⛩️🛤️🛣️🗾🎑🏞️🌅🌄🌠🎇🎆🌇🌆🏙️🌃🌌🌉🌁'],
  ['💡', 'Objetos', '⌚📱📲💻⌨️🖥️🖨️🖱️🕹️💽💾💿📀📼📷📸📹🎥📞☎️📟📠📺📻🎙️⏰⌛⏳📡🔋🔌💡🔦🕯️🧯💸💵💴💶💷💰💳💎⚖️🧰🔧🔨⚒️🛠️⛏️🔩⚙️🧱⛓️🧲🔫💣🧨🪓🔪🗡️⚔️🛡️🚬⚰️🏺🔮📿🧿💈⚗️🔭🔬🕳️💊💉🩸🧬🦠🧫🧪🌡️🧹🧺🧻🚽🚰🚿🛁🧼🧽🧴🛎️🔑🗝️🚪🪑🛋️🛏️🧸🖼️🛍️🛒🎁🎈🎏🎀🎊🎉🎎🏮🎐🧧✉️📩📨📧💌📥📤📦🏷️📪📫📬📭📮📯📜📃📄📑🧾📊📈📉🗒️🗓️📆📅🗑️📇🗃️🗳️🗄️📋📁📂🗂️🗞️📰📓📔📒📕📗📘📙📚📖🔖🧷🔗📎🖇️📐📏🧮📌📍✂️🖊️🖋️✒️🖌️🖍️📝✏️🔍🔎🔏🔐🔒🔓'],
  ['✅', 'Símbolos', '✅☑️✔️❌❎➕➖➗✖️♾️‼️⁉️❓❔❕❗〰️💲⚠️🚸⛔🚫🚳🚭🚯🚱🚷📵🔞☢️☣️⬆️↗️➡️↘️⬇️↙️⬅️↖️↕️↔️↩️↪️⤴️⤵️🔃🔄🔙🔚🔛🔜🔝🛐⚛️🕉️✡️☸️☯️✝️☦️☪️☮️🕎🔯♈♉♊♋♌♍♎♏♐♑♒♓⛎🔀🔁🔂▶️⏩⏭️⏯️◀️⏪⏮️🔼⏫🔽⏬⏸️⏹️⏺️⏏️🎦🔅🔆📶📳📴♀️♂️⚧️✳️✴️❇️©️®️™️#️⃣*️⃣0️⃣1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣9️⃣🔟🆗🆙🆒🆕🆓🆘🔴🟠🟡🟢🔵🟣🟤⚫⚪🟥🟧🟨🟩🟦🟪🟫⬛⬜🔶🔷🔸🔹🔺🔻💠🔘🔳🔲🏁🚩🎌🏴🏳️🏳️‍🌈🇧🇷🇵🇹🇺🇸🇦🇷🇪🇸🇮🇹🇫🇷🇩🇪🇯🇵🇬🇧']
].map(([icon, name, s]) => ({ icon, name, list: seq(s) }));
// palavras para buscar (português)
const KW = {
  'riso rindo kkk haha risada': '😂🤣😆😹😄😁', 'feliz sorriso alegre': '😀😃😄😁😊🙂☺️', 'amor apaixonado coração': '❤️😍🥰😘💕💖💘💝😻', 'beijo': '😘😗😙😚💋',
  'triste choro chorar': '😢😭😞😔🥺😿', 'raiva bravo puto irritado': '😠😡🤬😤', 'medo susto': '😱😨😰🙀', 'pensando duvida hmm': '🤔🧐🤨',
  'legal ok joia positivo': '👍👌✌️🆗✅', 'negativo nao': '👎❌🚫🙅', 'palmas aplauso parabens': '👏🙌🎉🥳🎊', 'reza obrigado por favor': '🙏',
  'forte musculo': '💪', 'fogo quente': '🔥🥵', 'frio': '🥶❄️☃️', 'festa aniversario': '🎉🥳🎂🎈🎁🎊', 'cerveja bebida bar': '🍺🍻🥂🍷🥃🍸🍹',
  'cafe': '☕', 'pizza': '🍕', 'hamburguer lanche': '🍔🍟', 'futebol bola gol': '⚽🥅🏆', 'carro': '🚗🏎️🚙', 'moto': '🏍️🛵', 'gato': '🐱😺🐈😻',
  'cachorro cao': '🐶🐕🦮🐩', 'sol calor praia': '☀️🌞🏖️🌴', 'chuva': '🌧️☔⛈️', 'dinheiro grana': '💰💸💵🤑💲', 'dormir sono': '😴💤🛌🥱',
  'doente': '🤒🤕🤢🤮😷🤧', 'olhos olhando': '👀', 'piscada': '😉', 'lingua': '😛😜😝🤪', 'oculos': '😎🤓', 'caveira morri morto': '💀☠️', 'coco merda': '💩',
  'macaco': '🙈🙉🙊🐵', 'flor': '🌹🌷🌸🌺🌻💐', 'estrela': '⭐🌟✨🌠', 'musica': '🎵🎶🎸🎤🎧🎹🥁', 'jogo game': '🎮🕹️🎲♟️', 'brasil': '🇧🇷', 'certo check': '✅✔️☑️',
  'errado x': '❌❎✖️', 'aviso atencao': '⚠️❗‼️', 'pergunta': '❓❔', 'cem 100': '💯', 'tchau oi ola': '👋', 'abraco': '🤗', 'segredo silencio': '🤫🤐', 'vergonha': '😳🙈',
  'diabo': '😈👿', 'anjo': '😇👼', 'palhaco': '🤡', 'robo': '🤖', 'fantasma': '👻', 'alien': '👽👾', 'bolo doce': '🎂🍰🧁🍫🍬🍭🍩🍪', 'presente': '🎁', 'ponto vermelho': '🔴'
};
const RKEY = 'cw.emojiRecent';
const recent = () => { try { return JSON.parse(localStorage.getItem(RKEY) || '[]'); } catch { return []; } };
const pushRecent = (e) => { try { const r = recent().filter((x) => x !== e); r.unshift(e); localStorage.setItem(RKEY, JSON.stringify(r.slice(0, 32))); } catch {} };
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

let pop = null;
function close() { if (pop) { pop.remove(); pop = null; } }
function open(input, anchor) {
  if (pop) { close(); return; }
  const el = pop = document.createElement('div');
  el.className = 'emojipop';
  const rec = recent();
  const tabs = [...(rec.length ? [{ icon: '🕘', name: 'Recentes', list: rec }] : []), ...CATS];
  el.innerHTML = `<div class="ehead"><input type="text" class="esearch" placeholder="Buscar emoji (ex: riso, amor, joia)" spellcheck="false"><button class="eclose" title="Fechar (Esc)">✕</button></div><div class="etabs">${tabs.map((t, i) => `<button class="etab" data-i="${i}" title="${t.name}">${t.icon}</button>`).join('')}</div><div class="egrid"></div><div class="efoot">Clique para inserir · Shift+clique insere sem fechar · Ctrl+Espaço abre/fecha</div>`;
  document.body.appendChild(el);
  const grid = el.querySelector('.egrid'), search = el.querySelector('.esearch');
  const show = (list, title) => {
    grid.innerHTML = (title ? `<div class="etitle">${title}</div>` : '') + list.map((e) => `<span class="em" title="${e}">${e}</span>`).join('') || '<div class="etitle">Nada encontrado</div>';
  };
  const showTab = (i) => { el.querySelectorAll('.etab').forEach((b) => b.classList.toggle('on', +b.dataset.i === i)); show(tabs[i].list, tabs[i].name); grid.scrollTop = 0; };
  showTab(0);
  el.querySelectorAll('.etab').forEach((b) => b.addEventListener('click', () => { search.value = ''; showTab(+b.dataset.i); }));
  search.addEventListener('input', () => {
    const q = fold(search.value.trim());
    if (!q) return showTab(0);
    const out = new Set();
    for (const [k, v] of Object.entries(KW)) if (fold(k).split(' ').some((w) => w.startsWith(q))) for (const e of seq(v)) out.add(e);
    for (const c of CATS) if (fold(c.name).includes(q)) c.list.forEach((e) => out.add(e));
    el.querySelectorAll('.etab').forEach((b) => b.classList.remove('on'));
    show([...out], `Busca: ${search.value.trim()}`);
  });
  const insert = (e, keep) => {
    const s = input.selectionStart ?? input.value.length, en = input.selectionEnd ?? s;
    input.setRangeText(e, s, en, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    pushRecent(e);
    if (!keep) { close(); input.focus(); }
  };
  grid.addEventListener('mousedown', (ev) => ev.preventDefault());
  grid.addEventListener('click', (ev) => { const sp = ev.target.closest('.em'); if (sp) insert(sp.textContent, ev.shiftKey); });
  search.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { close(); input.focus(); ev.preventDefault(); }
    else if (ev.key === 'Enter') { const f = grid.querySelector('.em'); if (f) insert(f.textContent, ev.shiftKey); ev.preventDefault(); }
    else if (ev.key === ' ' && ev.ctrlKey) { close(); input.focus(); ev.preventDefault(); }
    ev.stopPropagation();
  });
  el.querySelector('.eclose').addEventListener('click', () => { close(); input.focus(); });
  // posição: em cima da caixa de texto, alinhado à esquerda do botão/caixa
  // (o popup usa zoom: as coordenadas são divididas pelo zoom)
  const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--z')) || 1;
  const r = (anchor || input).getBoundingClientRect();
  const w = el.offsetWidth * z, hgt = el.offsetHeight * z;
  el.style.left = Math.max(4, Math.min(innerWidth - w - 4, r.left)) / z + 'px';
  el.style.top = Math.max(4, r.top - hgt - 4) / z + 'px';
  setTimeout(() => search.focus(), 0);
}
addEventListener('mousedown', (e) => { if (pop && !pop.contains(e.target) && !e.target.closest('.emobtn')) close(); }, true);
addEventListener('keydown', (e) => { if (pop && e.key === 'Escape') close(); });
window.EmojiPicker = { open, close, isOpen: () => !!pop };
})();
