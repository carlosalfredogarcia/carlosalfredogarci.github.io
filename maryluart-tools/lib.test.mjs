import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toForm, verifyWebhook, buildSessionParams } from '../maryluart-web/functions/_lib/stripe.js';
import { resolveCart, parseSku, PRODUCTS, OPTIONS } from '../maryluart-web/functions/_lib/catalog.js';
import { signDownload, verifyDownload } from '../maryluart-web/functions/_lib/tokens.js';
import { hmac } from '../maryluart-web/functions/_lib/util.js';
import { regionWarning } from '../maryluart-web/functions/_lib/mail.js';

test('toForm: anidados y listas al estilo Stripe', () => {
  assert.equal(decodeURIComponent(toForm({ a: { b: 1 }, c: [2, 3], d: 'x y' })), 'a[b]=1&c[0]=2&c[1]=3&d=x y');
});

test('webhook: firma válida, manipulada, vieja y sin firma', async () => {
  const secret = 'whsec_test', raw = '{"id":"evt_1"}', t = 1700000000;
  const sig = await hmac(secret, `${t}.${raw}`, { hex: true });
  const h = `t=${t},v1=${sig}`;
  assert.equal(await verifyWebhook(raw, h, secret, t + 10), true);
  assert.equal(await verifyWebhook(raw + ' ', h, secret, t + 10), false, 'cuerpo manipulado');
  assert.equal(await verifyWebhook(raw, h, 'otro', t + 10), false, 'secreto distinto');
  assert.equal(await verifyWebhook(raw, h, secret, t + 1000), false, 'firma antigua');
  assert.equal(await verifyWebhook(raw, '', secret, t), false);
  assert.equal(await verifyWebhook(raw, h, '', t), false);
});

test('descargas: el enlace sirve para su pedido, su archivo y su fecha', async () => {
  const s = 'secreto', now = 1000, exp = 2000;
  const sig = await signDownload(s, 'cs_test_1', 'calima:dl', exp);
  assert.equal(await verifyDownload(s, 'cs_test_1', 'calima:dl', exp, sig, now), true);
  assert.equal(await verifyDownload(s, 'cs_test_2', 'calima:dl', exp, sig, now), false, 'otro pedido');
  assert.equal(await verifyDownload(s, 'cs_test_1', 'invierno:dl', exp, sig, now), false, 'otro archivo');
  assert.equal(await verifyDownload(s, 'cs_test_1', 'calima:dl', exp + 5, sig, now), false, 'fecha alterada');
  assert.equal(await verifyDownload(s, 'cs_test_1', 'calima:dl', exp, sig, exp + 1), false, 'caducado');
  assert.equal(await verifyDownload('', 'cs_test_1', 'calima:dl', exp, sig, now), false, 'sin secreto');
});

test('carrito: el precio lo pone el servidor', () => {
  const l = resolveCart([{ id: 'cabra', opt: 'l60', qty: 2, price: 1 }, { id: 'calima', opt: 'dl', qty: 5 }]);
  assert.equal(l.length, 2);
  assert.equal(l[0].option.cents, 8000);
  assert.equal(l[0].qty, 2);
  assert.equal(l[1].qty, 1, 'una descarga siempre es 1');
});

test('carrito: rechaza lo que no se vende', () => {
  for (const bad of [
    [{ id: 'cabra', opt: 'orig:1000', qty: 1 }],   // originales: solo por consulta
    [{ id: 'cabra', opt: 'dl', qty: 1 }],          // un cuadro no tiene descarga
    [{ id: 'calima', opt: 'l50', qty: 1 }],        // un print digital no tiene lámina 50x70
    [{ id: 'nope', opt: 'a3', qty: 1 }],
    [{ id: '__proto__', opt: 'a3', qty: 1 }],
    [{ id: 'constructor', opt: 'constructor', qty: 1 }],
    [], null, 'x', [null],
  ]) assert.throws(() => resolveCart(bad), (e) => ['empty', 'bad_item'].includes(e.code), JSON.stringify(bad));
});

test('carrito: junta líneas repetidas y limita cantidades', () => {
  const l = resolveCart([{ id: 'cabra', opt: 'a3', qty: 8 }, { id: 'cabra', opt: 'a3', qty: 8 }, { id: 'cabra', opt: 'l50', qty: -3 }]);
  assert.equal(l.find((x) => x.sku === 'cabra:a3').qty, 10);
  assert.equal(l.find((x) => x.sku === 'cabra:l50').qty, 1);
});

test('Stripe: pedido solo digital no pide dirección; con lámina sí', () => {
  const siteUrl = 'https://www.maryluart.com', acceptedAt = 'now';
  const d = buildSessionParams(resolveCart([{ id: 'calima', opt: 'dl' }]), { lang: 'es', siteUrl, acceptedAt });
  assert.equal(d.shipping_address_collection, undefined);
  assert.equal(d.metadata.waiver_accepted, '1');
  assert.equal(d.line_items[0].price_data.unit_amount, 1200);
  assert.equal(d.line_items[0].price_data.product_data.metadata.sku, 'calima:dl');
  assert.equal(d.success_url, 'https://www.maryluart.com/gracias/?session_id={CHECKOUT_SESSION_ID}');
  const p = buildSessionParams(resolveCart([{ id: 'cabra', opt: 'a3' }, { id: 'calima', opt: 'a3p' }]), { lang: 'en', siteUrl, acceptedAt });
  assert.deepEqual(p.shipping_address_collection.allowed_countries, ['ES']);
  assert.equal(p.shipping_options[0].shipping_rate_data.fixed_amount.amount, 0);
  assert.equal(p.locale, 'en');
  assert.equal(p.metadata.waiver_accepted, '');
  assert.equal(decodeURIComponent(toForm(p)).includes('line_items[1][price_data][unit_amount]=2000'), true);
});

test('avisa de códigos postales fuera de Canarias/Península', () => {
  assert.match(regionWarning('07001'), /Baleares/);
  assert.match(regionWarning('51001'), /Ceuta/);
  assert.match(regionWarning('52001'), /Melilla/);
  assert.equal(regionWarning('35660'), '');
});

test('el catálogo del servidor coincide con el de la web (index.html)', () => {
  const html = readFileSync(new URL('../maryluart-web/public/index.html', import.meta.url), 'utf8');
  const grab = (start, end) => { const i = html.indexOf(start); const j = html.indexOf(end, i); assert.ok(i > 0 && j > i, start); return html.slice(i + start.length - 1, j + end.length - 1); };
  const web = new Function('return ' + grab('const PRODUCTS = [', '\n];'))();
  const price = new Function('return ' + grab('const PRICE = {', '};'))();
  const names = (t) => (typeof t === 'string' ? { es: t, en: t } : t);
  let checked = 0;
  for (const w of web.filter((p) => !p.hidden)) {
    const s = PRODUCTS[w.id];
    assert.ok(s, `falta en el servidor: ${w.id}`);
    const opts = w.opts.filter((o) => !o.startsWith('orig') && o !== 'sold');
    assert.deepEqual([...s.options].sort(), [...opts].sort(), `opciones de ${w.id}`);
    for (const o of opts) assert.equal(OPTIONS[o].cents, price[o] * 100, `precio ${w.id}:${o}`);
    assert.equal(s.es, names(w.title).es, `nombre es ${w.id}`);
    assert.equal(s.en, names(w.title).en, `nombre en ${w.id}`);
    checked++;
  }
  assert.equal(checked, Object.keys(PRODUCTS).length, 'sobran productos en el servidor');
});

test('parseSku', () => {
  assert.equal(parseSku('corralejo-print:dl').product.file, 'Poster_CORRALEJO.zip');
  assert.equal(parseSku('x:y'), null);
  assert.equal(parseSku(undefined), null);
});
