// Teste de fumaça da tela: abre o app de verdade com o motor de mentira (tests/fake-engine.cjs)
// numa pasta de dados temporária e confere o caminho principal. Rode com: npm run test:ui
const { _electron } = require('playwright-core');
const fs = require('fs'), os = require('os'), path = require('path');

const root = path.join(__dirname, '..');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-teste-'));
const cmdLog = path.join(data, 'comandos.json');
const GRUPO = '120363000000000001@g.us';
let fails = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FALHOU'} ${name}${ok || !extra ? '' : ' :: ' + extra}`); if (!ok) fails++; };
const sent = () => { try { return JSON.parse(fs.readFileSync(cmdLog, 'utf8')); } catch { return {}; } };

(async () => {
  const args = [root, `--user-data-dir=${data}`];
  if (process.platform === 'linux') args.push('--no-sandbox');
  const app = await _electron.launch({ args, cwd: root, executablePath: require('electron'), env: { ...process.env, CW_ENGINE_BIN: path.join(__dirname, 'fake-engine.cjs'), FAKE_LOG: cmdLog } });
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', (e) => errors.push(e.message));
  win.on('dialog', (d) => d.accept());
  const wait = (ms) => win.waitForTimeout(ms);
  const type = (t) => win.evaluate((t) => { run(t, cur()); }, t);
  const lines = () => win.evaluate(() => [...cur().buf.querySelectorAll('.ln')].map((l) => l.className + '|' + l.textContent));
  const has = async (re) => (await lines()).some((l) => re.test(l));

  await wait(2500);
  await type('/server'); await wait(3000);
  check('conecta e mostra o estado', await win.evaluate(() => document.body.textContent.includes('Teste')));

  await win.evaluate((g) => { openChannel(g, true); }, GRUPO); await wait(2000);
  check('abre o grupo com as mensagens', await has(/oi pessoal, tudo bem\?/));
  check('lista de nicks com 4 pessoas', (await win.$$('.mdiwin.active .nicklist .nick, .mdiwin.active .nl-it')).length === 4 || await win.evaluate(() => (cur().nicks || []).length === 4));
  check('miniatura da imagem aparece', (await win.$$('.mdiwin.active .ln img')).length > 0);

  await type('mensagem de teste'); await wait(600);
  check('envia texto', sent().send?.text === 'mensagem de teste' && await has(/mensagem de teste/));
  await type('/me acena'); await wait(600);
  check('envia ação (/me)', /acena/.test(sent().send?.text || ''));

  await type('isto vai dar FALHA'); await wait(1200);
  check('falha no envio devolve o texto para a caixa', (await win.evaluate(() => cur().edit.value)) === 'isto vai dar FALHA' && await has(/failed/), await win.evaluate(() => cur().edit.value + ' / ' + document.querySelectorAll('.mdiwin.active').length));
  await win.evaluate(() => { cur().edit.value = ''; });

  await type('/editar texto corrigido'); await wait(600);
  check('/editar', sent().edit?.text === '* texto corrigido' || sent().edit?.text === 'texto corrigido', JSON.stringify(sent().edit));
  await type('/apagar'); await wait(600);
  check('/apagar', !!sent().revoke?.id && await has(/deleted/), JSON.stringify(sent().revoke));

  await type('/ajuda'); await wait(500);
  const help = await win.evaluate(() => document.body.textContent);
  check('/ajuda lista os comandos novos', ['/apagar', '/editar', '/encaminhar'].every((c) => help.includes(c)));

  for (const c of ['/list', '/notify', '/whois Ana', '/query Ana', '/buscar teste', '/clear']) { await type(c); await wait(350); }
  await win.keyboard.press('Escape'); await wait(200);
  check('nenhum erro de script na tela', errors.length === 0, errors.join(' | '));

  console.log(fails ? `\n${fails} falha(s)` : '\nTudo certo.');
  // fecha sem esperar o Electron (em algumas versões o fechamento pelo teste demora)
  try { app.process().kill(); } catch {}
  try { fs.rmSync(data, { recursive: true, force: true }); } catch {}
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
