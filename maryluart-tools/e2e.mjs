// Prueba de extremo a extremo EN LOCAL: arranca el servidor de Cloudflare (wrangler) con
// Stripe y Resend SIMULADOS y un almacén de archivos de prueba, y recorre toda la compra.
// No usa claves reales ni toca tu Stripe. Uso:  WRANGLER=/ruta/a/wrangler node e2e.mjs
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import { createHmac, createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', 'maryluart-web');
const WRANGLER = process.env.WRANGLER || 'wrangler';
const PORT = 8799, MOCK = 9199, BASE = `http://127.0.0.1:${PORT}`;
const SID = 'cs_test_a1b2c3d4e5f6g7h8';
const tmp = mkdtempSync(join(tmpdir(), 'mla-e2e-'));
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}${!ok && extra ? ' → ' + extra : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Stripe y Resend simulados ----------
const rec = { stripeCreate: [], emails: [], fixture: null };
const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    const send = (o, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.method === 'POST' && req.url === '/v1/checkout/sessions') { rec.stripeCreate.push({ body: b, auth: req.headers.authorization, ver: req.headers['stripe-version'] }); return send({ id: SID, url: 'https://checkout.stripe.test/c/pay/' + SID }); }
    if (req.method === 'GET' && req.url.startsWith('/v1/checkout/sessions/')) return rec.fixture && req.url.includes(rec.fixture.id) ? send(rec.fixture) : send({ error: { message: 'No such session' } }, 404);
    if (req.method === 'POST' && req.url === '/emails') { rec.emails.push({ json: JSON.parse(b), key: req.headers['idempotency-key'], auth: req.headers.authorization }); return send({ id: 'em_' + rec.emails.length }); }
    send({ error: { message: 'mock: ruta desconocida ' + req.url } }, 404);
  });
});
await new Promise((r) => mock.listen(MOCK, '127.0.0.1', r));

// ---------- archivos de prueba en el almacén local (R2) ----------
const files = { 'Poster_Calima.zip': randomBytes(8 * 1024 * 1024), 'Poster_Invierno_CMYK.zip': randomBytes(1024 * 1024), 'Poster_CORRALEJO.zip': randomBytes(1024 * 1024), 'Poster_Fuerteventura.zip': randomBytes(1024 * 1024) };
const env0 = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' };
{
  // Se rellena el almacén local con Miniflare (el simulador de Cloudflare que usa wrangler por dentro).
  const { createRequire } = await import('node:module');
  const { realpathSync } = await import('node:fs');
  const { Miniflare } = createRequire(realpathSync(WRANGLER))('miniflare');
  const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("ok"); } }', r2Buckets: ['DOWNLOADS'], r2Persist: join(tmp, 'state', 'v3', 'r2') });
  const bucket = await mf.getR2Bucket('DOWNLOADS');
  for (const [k, v] of Object.entries(files)) await bucket.put(k, new Uint8Array(v).buffer);
  await mf.dispose();
}

// ---------- servidor de Cloudflare en local ----------
const vars = { STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake', DOWNLOAD_SECRET: 'dl_secret_fake', RESEND_API_KEY: 're_fake', STRIPE_API: `http://127.0.0.1:${MOCK}`, RESEND_API: `http://127.0.0.1:${MOCK}`, SITE_URL: BASE, ORDER_EMAIL: 'marylujr.art@gmail.com', MAIL_FROM: 'Mary Lu Art <pedidos@maryluart.com>' };
const args = ['pages', 'dev', 'public', '--port', String(PORT), '--ip', '127.0.0.1', '--r2', 'DOWNLOADS', '--persist-to', join(tmp, 'state'), ...Object.entries(vars).flatMap(([k, v]) => ['--binding', `${k}=${v}`])];
try { await fetch(BASE + '/'); console.log(`El puerto ${PORT} ya está en uso (¿una prueba anterior sin cerrar?). Ciérrala y repite.`); process.exit(2); } catch {}
const wr = spawn(WRANGLER, args, { cwd: WEB, env: env0, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let log = ''; wr.stdout.on('data', (d) => (log += d)); wr.stderr.on('data', (d) => (log += d));
const stop = () => { try { process.kill(-wr.pid, 'SIGKILL'); } catch {} try { wr.kill('SIGKILL'); } catch {} mock.close(); try { rmSync(tmp, { recursive: true, force: true }); rmSync(join(WEB, '.wrangler'), { recursive: true, force: true }); } catch {} };
process.on('exit', stop);
let up = false;
for (let i = 0; i < 120 && !up; i++) { try { up = (await fetch(BASE + '/')).ok; } catch { await sleep(500); } }
if (!up) { console.log('No arrancó el servidor local:\n' + log.slice(-1500)); process.exit(2); }
console.log('Servidor local listo. Funciones detectadas:', /Compiled Worker successfully|Functions/i.test(log) ? 'sí' : '(sin mensaje)');

const post = (path, body, headers = {}) => fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const sign = (raw, secret = 'whsec_fake', t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;

// ---------- 1. web estática ----------
const home = await (await fetch(BASE + '/')).text();
check('la portada carga', home.includes('Mary Lu'));
for (const leak of ['/functions/_lib/catalog.js', '/functions/api/webhook.js', '/_lib/stripe.js']) {
  const t = await (await fetch(BASE + leak)).text();
  check('el código del servidor no se publica: ' + leak, !/export |STRIPE_SECRET_KEY|onRequest/.test(t));
}
check('sin aviso de PROTOTIPO ni noindex', !/PROTOTIPO|noindex|Notas para Mary Lu/.test(home));
check('sin pago simulado', !/4242 4242|IBAN ES00|Tarjeta de prueba/.test(home));
check('página gracias', (await fetch(BASE + '/gracias/')).status === 200);
for (const p of ['aviso-legal', 'privacidad', 'condiciones']) check('legal/' + p, (await fetch(`${BASE}/legal/${p}`)).status === 200);
const rd = await fetch(BASE + '/arte', { redirect: 'manual' });
check('redirección /arte → /#arte', rd.status === 301 && (rd.headers.get('location') || '').endsWith('/#arte'), rd.status + ' ' + rd.headers.get('location'));

// ---------- 2. crear el pago ----------
const cart = [{ id: 'calima', opt: 'dl', qty: 1 }, { id: 'cabra', opt: 'a3', qty: 2 }];
let r = await post('/api/checkout', { items: cart, lang: 'es', terms: true, waiver: true });
let d = await r.json();
check('checkout devuelve la dirección de pago de Stripe', r.status === 200 && d.url === 'https://checkout.stripe.test/c/pay/' + SID, JSON.stringify(d));
const sent = rec.stripeCreate[0];
const form = new URLSearchParams(sent.body);
check('Stripe recibe la clave y la versión de API fijada', sent.auth === 'Bearer sk_test_fake' && sent.ver === '2024-06-20');
check('precio de la descarga = 12 € (lo decide el servidor)', form.get('line_items[0][price_data][unit_amount]') === '1200');
check('lámina A3 ×2 a 40 €', form.get('line_items[1][price_data][unit_amount]') === '4000' && form.get('line_items[1][quantity]') === '2');
check('pide dirección solo para España', form.get('shipping_address_collection[allowed_countries][0]') === 'ES');
check('envío gratis', form.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]') === '0');
check('vuelve a /gracias con el id de sesión', form.get('success_url') === `${BASE}/gracias/?session_id={CHECKOUT_SESSION_ID}`, form.get('success_url'));
check('guarda aceptación de condiciones y renuncia', form.get('metadata[terms_accepted]') === '1' && form.get('metadata[waiver_accepted]') === '1' && !!form.get('metadata[accepted_at]'));

// precio manipulado desde el navegador: se ignora
await post('/api/checkout', { items: [{ id: 'cabra', opt: 'l60', qty: 1, price: 1, cents: 1 }], lang: 'en', terms: true, waiver: false });
check('un precio manipulado en el navegador se ignora', new URLSearchParams(rec.stripeCreate.at(-1).body).get('line_items[0][price_data][unit_amount]') === '8000');
check('solo descarga: no pide dirección', !new URLSearchParams((await (async () => { await post('/api/checkout', { items: [{ id: 'invierno', opt: 'dl' }], lang: 'es', terms: true, waiver: true }); return rec.stripeCreate.at(-1).body; })())).get('shipping_address_collection[allowed_countries][0]'));

// validaciones
check('sin aceptar condiciones → 400', (await post('/api/checkout', { items: cart, terms: false, waiver: true })).status === 400);
check('descarga sin renuncia al desistimiento → 400', (await post('/api/checkout', { items: cart, terms: true, waiver: false })).status === 400);
check('un original no se vende online → 400', (await post('/api/checkout', { items: [{ id: 'cabra', opt: 'orig:1000' }], terms: true })).status === 400);
r = await post('/api/checkout', { items: [{ id: 'surf', opt: 'dl' }], terms: true, waiver: true });
check('descarga sin archivo en el almacén → 409 (no se vende)', r.status === 409 && (await r.json()).error === 'unavailable');
check('JSON roto → 400', (await post('/api/checkout', '{no')).status === 400);
const before = rec.stripeCreate.length;
check('las peticiones rechazadas no crearon ninguna sesión de pago (solo las 3 válidas)', before === 3, String(before));

// ---------- 3. pedido pagado (lo que Stripe devolvería) ----------
const li = (name, sku, q, cents) => ({ description: name, quantity: q, amount_total: q * cents, price: { product: { metadata: { sku } } } });
const session = (over = {}) => ({
  id: SID, livemode: false, created: Math.floor(Date.now() / 1000), payment_status: 'paid', amount_total: 9200, payment_intent: 'pi_test_1',
  metadata: { lang: 'es' }, customer_details: { name: 'Ana Pérez', email: 'ana@example.com', phone: '+34600000000' },
  shipping_details: { name: 'Ana Pérez', address: { line1: 'Calle Mayor 1', line2: null, postal_code: '35660', city: 'Corralejo', state: 'GT', country: 'ES' } },
  line_items: { data: [li('Calima · Descarga digital 30 × 40 cm', 'calima:dl', 1, 1200), li('Cabra majorera · Lámina A3', 'cabra:a3', 2, 4000)] }, ...over,
});
rec.fixture = session();
r = await fetch(`${BASE}/api/order?session_id=${SID}`); d = await r.json();
check('/api/order: pedido pagado con 2 líneas y 1 descarga', r.status === 200 && d.status === 'paid' && d.items.length === 2 && d.downloads.length === 1, JSON.stringify(d).slice(0, 300));
check('/api/order no revela la dirección de envío', !/Calle Mayor|35660|600000000/.test(JSON.stringify(d)));
check('/api/order: sesión inventada → 400', (await fetch(`${BASE}/api/order?session_id=hola`)).status === 400);
check('/api/order: sesión inexistente → 404', (await fetch(`${BASE}/api/order?session_id=cs_test_zzzzzzzzzzzzzzzz`)).status === 404);

// ---------- 4. descarga ----------
const url = new URL(d.downloads[0].url);
r = await fetch(BASE + url.pathname + url.search);
const buf = Buffer.from(await r.arrayBuffer());
check('descarga: 200 y es un zip adjunto', r.status === 200 && r.headers.get('content-type') === 'application/zip' && /attachment; filename="Poster_Calima.zip"/.test(r.headers.get('content-disposition') || ''));
check('descarga: archivo de 8 MB íntegro (idéntico al subido)', createHash('sha256').update(buf).digest('hex') === createHash('sha256').update(files['Poster_Calima.zip']).digest('hex'), `bytes=${buf.length}`);
for (const [name, mut] of [['fecha alterada', (u) => u.searchParams.set('e', String(Number(u.searchParams.get('e')) + 99999))], ['otro pedido', (u) => u.searchParams.set('s', 'cs_test_otropedido12345')], ['otro archivo', (u) => u.searchParams.set('k', 'invierno:dl')], ['firma falsa', (u) => u.searchParams.set('t', 'abc')], ['sin firma', (u) => u.searchParams.delete('t')]]) {
  const u = new URL(url); mut(u);
  check(`descarga con ${name} → 403`, (await fetch(BASE + u.pathname + u.search)).status === 403);
}

// ---------- 5. aviso de Stripe (webhook) -> correos ----------
const evt = (type, id = SID) => JSON.stringify({ id: 'evt_1', type, data: { object: { id } } });
let raw = evt('checkout.session.completed');
check('webhook con firma falsa → 400', (await post('/api/webhook', raw, { 'stripe-signature': sign(raw, 'otro_secreto') })).status === 400);
check('webhook sin firma → 400', (await post('/api/webhook', raw)).status === 400);
check('webhook con firma antigua → 400', (await post('/api/webhook', raw, { 'stripe-signature': sign(raw, 'whsec_fake', 1000) })).status === 400);
check('webhook rechazado = ningún correo', rec.emails.length === 0);
raw = evt('charge.succeeded');
check('webhook de otro tipo → 200 y se ignora', (await post('/api/webhook', raw, { 'stripe-signature': sign(raw) })).status === 200 && rec.emails.length === 0);
rec.fixture = session({ payment_status: 'unpaid' });
raw = evt('checkout.session.completed');
check('pago aún sin cobrar → 200 y NO se envía nada', (await post('/api/webhook', raw, { 'stripe-signature': sign(raw) })).status === 200 && rec.emails.length === 0);
rec.fixture = session();
r = await post('/api/webhook', raw, { 'stripe-signature': sign(raw) });
check('webhook válido → 200', r.status === 200, await r.text());
const [adm, cus] = rec.emails;
check('se enviaron 2 correos', rec.emails.length === 2);
check('1º: a marylujr.art@gmail.com, con respuesta al cliente', adm && adm.json.to[0] === 'marylujr.art@gmail.com' && adm.json.reply_to === 'ana@example.com' && adm.json.from === 'Mary Lu Art <pedidos@maryluart.com>');
check('1º: asunto, dirección y qué enviar', adm && /^Nuevo pedido \(prueba\) · 92 € · Ana Pérez/.test(adm.json.subject) && /ENVIAR A:\nAna Pérez\nCalle Mayor 1\n35660 Corralejo\nGT, ES/.test(adm.json.text) && /Cabra majorera · Lámina A3 × 2 — 80 €  → PREPARAR Y ENVIAR/.test(adm.json.text) && /Calima · Descarga digital 30 × 40 cm × 1 — 12 €  → descarga enviada automáticamente/.test(adm.json.text), adm && adm.json.text);
check('1º: enlace al pago en Stripe', adm && adm.json.text.includes('https://dashboard.stripe.com/test/payments/pi_test_1'));
check('2º: al cliente, con su enlace de descarga', cus && cus.json.to[0] === 'ana@example.com' && /Tu pedido de Mary Lu Art/.test(cus.json.subject) && cus.json.text.includes(`${BASE}/api/download?s=${SID}&k=calima%3Adl`) && cus.json.reply_to === 'marylujr.art@gmail.com', cus && cus.json.text);
check('correos con clave anti-duplicado', adm.key === `order-${SID}-admin` && cus.key === `order-${SID}-customer`);
const dl2 = cus.json.text.match(/https?:\/\/[^\s]+\/api\/download[^\s]+/)[0];
check('el enlace del correo también descarga el archivo', (await fetch(BASE + new URL(dl2).pathname + new URL(dl2).search)).status === 200);

// cliente en inglés y envío fuera de Canarias/Península
rec.emails.length = 0;
rec.fixture = session({ metadata: { lang: 'en' }, shipping_details: { name: 'Bob', address: { line1: 'Carrer 1', postal_code: '07001', city: 'Palma', state: 'PM', country: 'ES' } } });
await post('/api/webhook', raw, { 'stripe-signature': sign(raw) });
check('cliente en inglés: correo en inglés', rec.emails[1] && /Your Mary Lu Art order/.test(rec.emails[1].json.subject) && /Your downloads \(links valid until/.test(rec.emails[1].json.text));
check('aviso de Baleares en el correo de Mary Lu', rec.emails[0] && /⚠ Baleares/.test(rec.emails[0].json.text));
rec.emails.length = 0;
rec.fixture = session({ line_items: { data: [li('Invierno · Descarga digital 30 × 40 cm', 'invierno:dl', 1, 1200)] }, amount_total: 1200, shipping_details: null });
await post('/api/webhook', raw, { 'stripe-signature': sign(raw) });
check('pedido solo digital: sin "ENVIAR A" y sin avisos de envío', rec.emails[0] && !/ENVIAR A/.test(rec.emails[0].json.text) && !/PREPARAR Y ENVIAR/.test(rec.emails[0].json.text));

// ---------- 6. formulario de encargos ----------
rec.emails.length = 0;
const enc = { name: 'Lola', email: 'lola@example.com', type: 'retrato', size: 'A3', date: '', msg: 'Quiero un retrato de mi perro.', priv: true, lang: 'es', website: '' };
r = await post('/api/encargo', enc);
check('encargo válido → 200 y llega a Mary Lu con respuesta a la clienta', r.status === 200 && rec.emails.length === 1 && rec.emails[0].json.to[0] === 'marylujr.art@gmail.com' && rec.emails[0].json.reply_to === 'lola@example.com' && /Retrato digital en blanco y negro/.test(rec.emails[0].json.text));
check('encargo con campo trampa (robot) → no envía correo', ((await post('/api/encargo', { ...enc, website: 'http://spam' })).status === 200) && rec.emails.length === 1);
check('encargo sin aceptar privacidad → 400', (await post('/api/encargo', { ...enc, priv: false })).status === 400);
check('encargo con email inválido → 400', (await post('/api/encargo', { ...enc, email: 'nope' })).status === 400);
check('encargo sin mensaje → 400', (await post('/api/encargo', { ...enc, msg: '' })).status === 400);


// ---------- 7. lo que ve el cliente, en un navegador real ----------
let pw = null;
try { pw = (await import('node:module')).createRequire(import.meta.url)('playwright'); } catch { console.log('(Se omiten las pruebas del navegador: Playwright no está instalado)'); }
if (pw) {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ locale: 'es-ES', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route('https://checkout.stripe.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>stripe</h1>' }));
  const open = async (hash = '') => { await page.goto(BASE + '/' + hash, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#grid .card'); };
  const resetCart = async () => { await page.evaluate(() => localStorage.removeItem('mla-cart3')); await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#grid .card'); };
  const add = async (id, opt) => { await page.click(`[data-open="${id}"].btn`); await page.check(`#pOpts input[value="${opt}"]`); await page.click('#pForm button[type=submit]'); await page.waitForSelector('#drawer.open'); };
  const sessionsBefore = () => rec.stripeCreate.length;
  const shot = async (pg, name) => { if (process.env.SHOTS) await pg.screenshot({ path: join(process.env.SHOTS, name + '.png') }); };

  await open('#arte');
  // cuadro original: se consulta, no se compra online
  await page.click('[data-open="cabra"].btn');
  check('cuadro original: el botón dice "Consultar este cuadro"', (await page.textContent('#pBtn')) === 'Consultar este cuadro');
  await page.check('#pOpts input[value="a3"]');
  check('lámina: el botón dice "Añadir al carrito"', (await page.textContent('#pBtn')) === 'Añadir al carrito');
  await page.check('#pOpts input[value^="orig"]');
  await page.click('#pForm button[type=submit]');
  await page.waitForFunction(() => location.hash === '#encargo');
  check('consultar un original: abre el formulario con "Cuadro por encargo" y el nombre del cuadro', (await page.inputValue('#f-type')) === 'cuadro' && /Cabra majorera/.test(await page.inputValue('#f-msg')));
  check('consultar un original no mete nada en el carrito', (await page.textContent('#cartCount')) === '0');

  // lámina física -> Stripe
  await open('#arte'); await resetCart();
  await add('cabra', 'l50');
  check('carrito: aviso de envío gratis', /Envío gratis/.test(await page.textContent('#shipHint')));
  check('carrito: la casilla de descarga digital está oculta si no hay descargas', !(await page.isVisible('#waiverWrap')));
  await page.click('#toCheckout');
  check('pagar sin aceptar condiciones: avisa y no sale', /condiciones/.test(await page.textContent('#cartErr')) && sessionsBefore() === 3);
  await page.check('#chkTerms');
  await Promise.all([page.waitForURL(/checkout\.stripe\.test/, { timeout: 15000 }), page.click('#toCheckout')]);
  const f1 = new URLSearchParams(rec.stripeCreate.at(-1).body);
  check('pagar: va a la página de Stripe con la lámina 50×70 a 60 € y pide dirección', f1.get('line_items[0][price_data][unit_amount]') === '6000' && f1.get('shipping_address_collection[allowed_countries][0]') === 'ES' && f1.get('locale') === 'es');

  // descarga digital
  await open('#arte'); await resetCart();
  await add('calima', 'dl');
  check('descarga: aparece la casilla de renuncia al desistimiento', await page.isVisible('#waiverWrap'));
  await page.check('#chkTerms'); await shot(page, 'carrito-descarga'); await page.uncheck('#chkTerms');
  await page.check('#chkTerms'); await page.click('#toCheckout');
  check('descarga sin marcar la renuncia: avisa y no sale', /descarga digital/.test(await page.textContent('#cartErr')));
  await page.check('#chkWaiver');
  await Promise.all([page.waitForURL(/checkout\.stripe\.test/, { timeout: 15000 }), page.click('#toCheckout')]);
  const f2 = new URLSearchParams(rec.stripeCreate.at(-1).body);
  check('descarga: 12 €, sin dirección de envío, guarda la renuncia', f2.get('line_items[0][price_data][unit_amount]') === '1200' && !f2.get('shipping_address_collection[allowed_countries][0]') && f2.get('metadata[waiver_accepted]') === '1');

  // descarga sin archivo en el almacén (Surf is Life)
  await open('#arte'); await resetCart();
  await add('surf', 'dl'); await page.check('#chkTerms'); await page.check('#chkWaiver'); await page.click('#toCheckout');
  await page.waitForFunction(() => document.querySelector('#cartErr').textContent.length > 0);
  check('descarga sin archivo: mensaje claro y el botón vuelve a estar activo', /no está disponible/.test(await page.textContent('#cartErr')) && !(await page.isDisabled('#toCheckout')));

  // formulario de encargos
  await open('#encargo');
  await page.fill('#f-en-name', 'Marta'); await page.fill('#f-en-email', 'marta@example.com'); await page.fill('#f-msg', 'Quiero un retrato de mi familia.');
  await page.click('#encargoForm button[type=submit]');
  check('encargo sin aceptar privacidad: avisa', /casilla/.test(await page.textContent('#encErr')));
  const mails = rec.emails.length;
  await page.check('#f-priv'); await page.click('#encargoForm button[type=submit]');
  await page.waitForSelector('#encOk:not([hidden])');
  check('encargo: confirmación en pantalla y correo a Mary Lu', /enviada/.test(await page.textContent('#encOk')) && rec.emails.length === mails + 1 && rec.emails.at(-1).json.reply_to === 'marta@example.com');

  // página de gracias con descarga
  rec.fixture = session();
  await page.goto(`${BASE}/gracias/?session_id=${SID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.box a.btn');
  check('gracias: confirmación, resumen y botón de descarga', /confirmado/.test(await page.textContent('h1')) && /Cabra majorera/.test(await page.textContent('ul')) && /Calima/.test(await page.textContent('.box')));
  await shot(page, 'gracias');
  const href = await page.getAttribute('.box a.btn', 'href');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.box a.btn')]);
  check('gracias: el botón descarga el archivo', dl.suggestedFilename() === 'Poster_Calima.zip', href);
  await page.goto(`${BASE}/gracias/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.err');
  check('gracias sin pedido: mensaje de error, sin romperse', /No hemos podido cargar/.test(await page.textContent('#app')));

  // inglés y móvil
  await ctx.addInitScript(() => localStorage.setItem('mla-lang', 'en'));
  await open('#arte'); await resetCart();
  await add('invierno', 'dl');
  check('inglés: el carrito y las casillas salen en inglés', /Pay securely/.test(await page.textContent('#toCheckout')) && /terms of sale/.test(await page.textContent('#drawer')));
  const m = await ctx.newPage(); await m.setViewportSize({ width: 390, height: 700 });
  await m.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await m.goto(BASE + '/#arte', { waitUntil: 'domcontentloaded' }); await m.waitForSelector('#grid .card');
  await m.click('#cartBtn'); await m.waitForTimeout(600);
  const box = await m.locator('#toCheckout').boundingBox();
  check('móvil: el botón de pagar cabe en pantalla y no hay scroll lateral', box && box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 700 && (await m.evaluate(() => document.documentElement.scrollWidth)) <= 390, JSON.stringify(box));
  await shot(m, 'movil-carrito');
  await page.goto(BASE + '/legal/condiciones', { waitUntil: 'domcontentloaded' }); await shot(page, 'legal');
  await open('#retratos'); await page.evaluate(() => window.scrollBy(0, 2400)); await shot(page, 'encargo');
  check('sin errores de JavaScript en toda la navegación', errs.length === 0, errs.join(' | '));
  await browser.close();
}

console.log(fails ? `\n${fails} COMPROBACIONES FALLAN` : '\nTODO CORRECTO');
stop();
process.exit(fails ? 1 : 0);
