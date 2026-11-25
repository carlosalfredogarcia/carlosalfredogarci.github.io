// POST /api/webhook  <- avisos de Stripe. Al confirmarse un pago envía los dos correos.
import { verifyWebhook } from '../_lib/stripe.js';
import { loadOrder, siteOrigin } from '../_lib/order.js';
import { sendOrderEmails } from '../_lib/mail.js';

const EVENTS = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  if (!(await verifyWebhook(raw, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET))) {
    return new Response('firma no válida', { status: 400 });
  }
  let ev;
  try { ev = JSON.parse(raw); } catch { return new Response('json no válido', { status: 400 }); }
  if (!EVENTS.includes(ev.type)) return new Response('ignorado', { status: 200 });
  try {
    const o = await loadOrder(env, ev.data.object.id, siteOrigin(env, request));
    if (!o.paid) return new Response('aún sin pagar', { status: 200 });   // pagos diferidos: llegará otro aviso
    await sendOrderEmails(env, o);
    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('webhook error:', e.code, e.message);
    return new Response('error', { status: 500 });  // Stripe reintenta; los correos llevan clave anti-duplicado
  }
}
