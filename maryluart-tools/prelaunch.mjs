// Comprobador previo al lanzamiento. Uso:  node maryluart-tools/prelaunch.mjs
// Avisa de todo lo que sigue pendiente en la web antes de abrirla al público.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', 'maryluart-web', 'public');
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== 'img' && f !== '.wrangler') walk(p); } else if (/\.(html|js|css|txt|xml)$/.test(f)) files.push(p); } })(WEB);

const problems = [];
const rules = [
  [/\[COMPLETAR/g, 'Falta completar datos en los textos legales'],
  [/BORRADOR/g, 'Queda el aviso de BORRADOR en un texto legal'],
  [/noindex/g, 'Hay una etiqueta "noindex": Google no encontraría la web', (f) => !f.endsWith(join('gracias', 'index.html'))],
  [/PROTOTIPO|Notas para Mary Lu/g, 'Quedan restos del prototipo'],
  [/4242 4242|IBAN ES00/g, 'Quedan datos de ejemplo de pago'],
];
for (const f of files) {
  const t = readFileSync(f, 'utf8');
  for (const [re, msg, applies] of rules) {
    if (applies && !applies(f)) continue;
    const n = (t.match(re) || []).length;
    if (n) problems.push(`${relative(WEB, f)}: ${msg} (${n})`);
  }
}
if (problems.length) {
  console.log('PENDIENTE ANTES DE ABRIR LA WEB:\n' + problems.map((p) => ' - ' + p).join('\n'));
  process.exit(1);
}
console.log('Todo listo en los archivos de la web. Revisa también la lista de la guía (cuentas, claves y prueba de compra).');
