// POST /api/checkout  -> crea la sesión de pago en Stripe y devuelve la dirección (url) a la que ir.
import { resolveCart } from '../_lib/catalog.js';
import { stripe, buildSessionParams } from '../_lib/stripe.js';
import { siteOrigin } from '../_lib/order.js';
import { json, httpError } from '../_lib/util.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  try {
    const lines = resolveCart(body.items);
    if (body.terms !== true) return json({ error: 'terms' }, 400);
    const digital = lines.filter((l) => l.option.kind === 'digital');
    if (digital.length && body.waiver !== true) return json({ error: 'waiver' }, 400);

    // Solo se vende una descarga si el archivo existe de verdad en el almacén privado.
    if (digital.length) {
      if (!env.DOWNLOADS) throw httpError('config', 'Falta el almacén R2 (binding DOWNLOADS)');
      for (const l of digital) {
        if (!(await env.DOWNLOADS.head(l.product.file))) return json({ error: 'unavailable', product: l.id }, 409);
      }
    }
    const params = buildSessionParams(lines, {
      lang: body.lang === 'en' ? 'en' : 'es',
      siteUrl: siteOrigin(env, request),
      acceptedAt: new Date().toISOString(),
    });
    const session = await stripe(env, 'POST', '/v1/checkout/sessions', params);
    return json({ url: session.url });
  } catch (e) {
    if (e.code === 'empty' || e.code === 'bad_item') return json({ error: e.code }, 400);
    console.error('checkout error:', e.code, e.message);
    return json({ error: 'server' }, 500);
  }
}
