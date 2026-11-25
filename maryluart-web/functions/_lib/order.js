// Carga un pedido pagado desde Stripe y prepara sus enlaces de descarga.
import { stripe } from './stripe.js';
import { parseSku, DOWNLOAD_DAYS } from './catalog.js';
import { signDownload, downloadUrl } from './tokens.js';
import { httpError } from './util.js';

export const siteOrigin = (env, request) => String(env.SITE_URL || new URL(request.url).origin).replace(/\/+$/, '');

export async function loadOrder(env, sessionId, origin, now = Math.floor(Date.now() / 1000)) {
  if (!env.DOWNLOAD_SECRET) throw httpError('config', 'Falta DOWNLOAD_SECRET');
  const s = await stripe(env, 'GET', `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    expand: ['line_items.data.price.product'],
  });
  const lang = s.metadata && s.metadata.lang === 'en' ? 'en' : 'es';
  const paid = s.payment_status === 'paid';
  const exp = s.created + DOWNLOAD_DAYS * 86400;
  const expired = now > exp;

  const items = [], downloads = [];
  for (const li of (s.line_items && s.line_items.data) || []) {
    const sku = li.price && li.price.product && li.price.product.metadata && li.price.product.metadata.sku;
    const p = parseSku(sku);
    const kind = p ? p.option.kind : 'print';
    items.push({ sku, kind, qty: li.quantity, total: li.amount_total, name: li.description, nameEs: p ? `${p.product.es} · ${p.option.es}` : li.description });
    if (paid && kind === 'digital' && !expired) {
      const sig = await signDownload(env.DOWNLOAD_SECRET, s.id, p.sku, exp);
      downloads.push({ sku: p.sku, name: li.description, filename: p.product.file, url: downloadUrl(origin, s.id, p.sku, exp, sig) });
    }
  }
  const sd = s.shipping_details || (s.collected_information && s.collected_information.shipping_details) || null;
  return {
    session: s, lang, paid, expired, exp, items, downloads,
    physical: items.some((i) => i.kind === 'print'),
    digital: items.some((i) => i.kind === 'digital'),
    total: s.amount_total,
    email: s.customer_details && s.customer_details.email,
    customer: s.customer_details || {},
    shipping: sd,
  };
}
