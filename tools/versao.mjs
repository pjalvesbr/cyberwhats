// Uso: node tools/versao.mjs 3.2.0.1
// O CyberWhats sempre usa 3.2.x.y (homenagem ao CyberScript 3.2).
// npm/electron-builder exigem semver de 3 partes, então package.json "version" = 3.2.x
// e a versão completa fica em "cwVersion" (mostrada no app, no .exe e no nome dos arquivos).
import fs from 'node:fs';
const v = process.argv[2];
if (!/^3\.2\.\d+\.\d+$/.test(v || '')) { console.error('Uso: node tools/versao.mjs 3.2.X.Y'); process.exit(1); }
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const old = pkg.cwVersion;
pkg.version = v.split('.').slice(0, 3).join('.');
pkg.cwVersion = v;
pkg.build.buildVersion = v;
pkg.build.portable.artifactName = `CyberWhats-${v}-portable.exe`;
pkg.build.nsis.artifactName = `CyberWhats-${v}-setup.exe`;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
if (old) for (const f of ['README.md']) fs.writeFileSync(f, fs.readFileSync(f, 'utf8').split(old).join(v));
console.log(`versão: ${old || '-'} -> ${v}`);
