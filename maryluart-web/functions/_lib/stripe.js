// Conexión con Stripe (API REST, sin librerías). Versión de API fijada para que
// las respuestas no cambien si Stripe actualiza la de tu cuenta.
import { httpError, hmac, safeEqual } from './util.js';

export const STRIPE_VERSION = '2024-06-20';

/** {a:{b:1},c:[2]} -> "a[b]=1&c[0]=2" (formato que espera Stripe). */
export function toForm(obj) {
  const out = [];
  const walk = (v, k) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${k}[${i}]`));
    else if (typeof v === 'object') Object.entries(v).forEach(([kk, vv]) => walk(vv, `${k}[${kk}]`));
    else out.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
  };
  Object.entries(obj || {}).forEach(([k, v]) => walk(v, k));
  return out.join('&');
}

export async function stripe(env, method, path, params, headers = {}) {
  if (!env.STRIPE_SECRET_KEY) throw httpError('config', 'Falta STRIPE_SECRET_KEY');
  const base = env.STRIPE_API || 'https://api.stripe.com';
  const body = params ? toForm(params) : '';
  const isGet = method === 'GET';
  const res = await fetch(base + path + (isGet && body ? '?' + body : ''), {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Stripe-Version': STRIPE_VERSION,
      ...(isGet ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }),
      ...headers,
    },
    body: isGet ? undefined : body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw httpError('stripe', (data.error && data.error.message) || `Stripe ${res.status}`);
  return data;
}

/** Comprueba la firma del aviso (webhook) de Stripe. */
export async function verifyWebhook(raw, header, secret, now = Math.floor(Date.now() / 1000), tolerance = 300) {
  if (!secret || !header) return false;
  let t = null;
  const v1 = [];
  for (const part of String(header).split(',')) {
    const i = part.indexOf('=');
    const k = part.slice(0, i), v = part.slice(i + 1);
    if (k === 't') t = v; else if (k === 'v1') v1.push(v);
  }
  if (!t || !v1.length || Math.abs(now - Number(t)) > tolerance) return false;
  const expected = await hmac(secret, `${t}.${raw}`, { hex: true });
  return v1.some((s) => safeEqual(s, expected));
}

/** Parámetros de la sesión de pago de Stripe Checkout para un carrito ya validado. */
export function buildSessionParams(lines, { lang, siteUrl, acceptedAt }) {
  const es = lang !== 'en';
  const pick = (o) => (es ? o.es : o.en);
  const physical = lines.some((l) => l.option.kind === 'print');
  const digital = lines.some((l) => l.option.kind === 'digital');

  const params = {
    mode: 'payment',
    submit_type: 'pay',
    locale: es ? 'es' : 'en',
    success_url: `${siteUrl}/gracias/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/#arte`,
    metadata: { lang: es ? 'es' : 'en', terms_accepted: '1', waiver_accepted: digital ? '1' : '', accepted_at: acceptedAt },
    line_items: lines.map((l) => ({
      quantity: l.qty,
      price_data: {
        currency: 'eur',
        unit_amount: l.option.cents,
        product_data: {
          name: `${pick(l.product)} · ${pick(l.option)}`,
          description: l.option.kind === 'digital'
            ? (es ? 'Archivo JPG de 30 × 40 cm a 300 ppp (CMYK). Descarga inmediata.' : 'JPG file, 30 × 40 cm at 300 dpi (CMYK). Instant download.')
            : (es ? 'Envío gratis a Canarias y Península.' : 'Free shipping to the Canary Islands and mainland Spain.'),
          metadata: { sku: l.sku },
        },
      },
    })),
    custom_text: {
      submit: { message: es
        ? `Al pagar aceptas las condiciones de venta (${siteUrl.replace(/^https?:\/\//, '')}/legal/condiciones).`
        : `By paying you accept the terms of sale (${siteUrl.replace(/^https?:\/\//, '')}/legal/condiciones).` },
    },
  };

  if (physical) {
    params.shipping_address_collection = { allowed_countries: ['ES'] };
    params.phone_number_collection = { enabled: true };
    params.shipping_options = [{
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: { amount: 0, currency: 'eur' },
        display_name: es ? 'Envío gratis a Canarias y Península' : 'Free shipping to the Canary Islands and mainland Spain',
      },
    }];
    params.custom_text.shipping_address = { message: es ? 'Solo enviamos a Canarias y a la Península.' : 'We only ship to the Canary Islands and mainland Spain.' };
  }
  return params;
}
