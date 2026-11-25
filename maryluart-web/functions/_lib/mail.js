// Envío de correos con Resend + plantillas de los dos avisos de cada pedido.
import { httpError, esc, eur } from './util.js';

export async function sendMail(env, { to, subject, html, text, replyTo, key }) {
  if (!env.RESEND_API_KEY) throw httpError('config', 'Falta RESEND_API_KEY');
  const base = env.RESEND_API || 'https://api.resend.com';
  const res = await fetch(base + '/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: JSON.stringify({
      from: env.MAIL_FROM || 'Mary Lu Art <onboarding@resend.dev>',
      to: [to], subject, html, text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw httpError('mail', `Resend ${res.status}: ${d.message || ''}`);
  }
  return res.json().catch(() => ({}));
}

const page = (inner) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#141414;max-width:560px">${inner}</div>`;

// Códigos postales fuera de Canarias/Península: Baleares (07), Ceuta (51), Melilla (52).
export function regionWarning(postal) {
  const p = String(postal || '').slice(0, 2);
  if (p === '07') return 'Baleares: revisa si puedes enviar ahí.';
  if (p === '51') return 'Ceuta: revisa si puedes enviar ahí.';
  if (p === '52') return 'Melilla: revisa si puedes enviar ahí.';
  return '';
}

const addr = (sd) => {
  if (!sd || !sd.address) return null;
  const a = sd.address;
  return [sd.name, a.line1, a.line2, `${a.postal_code || ''} ${a.city || ''}`.trim(), [a.state, a.country].filter(Boolean).join(', ')].filter(Boolean);
};

/** Correo para Mary Lu: pedido completo + dirección de envío. */
export function adminEmail(o) {
  const s = o.session, c = o.customer;
  const lines = o.items.map((i) => `${i.nameEs} × ${i.qty} — ${eur(i.total)}  ${i.kind === 'digital' ? '→ descarga enviada automáticamente' : '→ PREPARAR Y ENVIAR'}`);
  const a = addr(o.shipping);
  const warn = o.shipping && o.shipping.address ? regionWarning(o.shipping.address.postal_code) : '';
  const pay = s.payment_intent ? `https://dashboard.stripe.com/${s.livemode ? '' : 'test/'}payments/${s.payment_intent}` : '';
  const text = [
    `NUEVO PEDIDO${s.livemode ? '' : ' (PRUEBA)'} · pagado`,
    `Total: ${eur(o.total)}`,
    `Cliente: ${[c.name, c.email, c.phone].filter(Boolean).join(' · ')}`,
    `Idioma del cliente: ${o.lang === 'en' ? 'inglés' : 'español'}`,
    '', 'PRODUCTOS', ...lines.map((l) => '- ' + l),
    ...(a ? ['', 'ENVIAR A:', ...a, ...(c.phone ? ['Tel: ' + c.phone] : []), ...(warn ? ['', '⚠ ' + warn] : [])] : []),
    ...(pay ? ['', 'Ver el pago en Stripe: ' + pay] : []),
  ].join('\n');
  const html = page(
    `<h2 style="margin:0 0 8px">Nuevo pedido${s.livemode ? '' : ' (prueba)'}</h2><p style="margin:0 0 12px"><b>Total: ${esc(eur(o.total))}</b> · pagado</p>` +
    `<p style="margin:0 0 12px">${esc([c.name, c.email, c.phone].filter(Boolean).join(' · '))}</p>` +
    `<ul style="padding-left:18px">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` +
    (a ? `<p><b>Enviar a:</b><br>${a.map(esc).join('<br>')}${c.phone ? '<br>Tel: ' + esc(c.phone) : ''}</p>` : '') +
    (warn ? `<p style="color:#b3261e"><b>⚠ ${esc(warn)}</b></p>` : '') +
    (pay ? `<p><a href="${esc(pay)}">Ver el pago en Stripe</a></p>` : ''));
  return { subject: `Nuevo pedido${s.livemode ? '' : ' (prueba)'} · ${eur(o.total)} · ${c.name || c.email || ''}`.trim(), html, text };
}

/** Correo para el cliente: confirmación + enlaces de descarga si los hay. */
export function customerEmail(o) {
  const en = o.lang === 'en';
  const date = new Date(o.exp * 1000).toLocaleDateString(en ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const lines = o.items.map((i) => `${i.name} × ${i.qty} — ${eur(i.total)}`);
  const hi = en ? `Hi${o.customer.name ? ' ' + o.customer.name.split(' ')[0] : ''}! Thank you for your order.` : `¡Hola${o.customer.name ? ' ' + o.customer.name.split(' ')[0] : ''}! Gracias por tu pedido.`;
  const dlHead = en ? `Your downloads (links valid until ${date}):` : `Tus descargas (los enlaces valen hasta el ${date}):`;
  const phys = en ? 'I will prepare your order with care and write to you when it ships. Shipping is free to the Canary Islands and mainland Spain.' : 'Prepararé tu pedido con cariño y te escribiré cuando salga. El envío es gratis a Canarias y Península.';
  const bye = en ? 'With love from Fuerteventura,' : 'Con cariño desde Fuerteventura,';
  const text = [hi, '', ...lines.map((l) => '- ' + l), `Total: ${eur(o.total)}`,
    ...(o.downloads.length ? ['', dlHead, ...o.downloads.map((d) => `${d.name}: ${d.url}`)] : []),
    ...(o.physical ? ['', phys] : []), '', bye, 'Mary Lu'].join('\n');
  const html = page(
    `<p>${esc(hi)}</p><ul style="padding-left:18px">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><p><b>Total: ${esc(eur(o.total))}</b></p>` +
    (o.downloads.length ? `<p><b>${esc(dlHead)}</b></p>${o.downloads.map((d) => `<p><a href="${esc(d.url)}" style="display:inline-block;background:#141414;color:#fff;padding:10px 18px;border-radius:99px;text-decoration:none">${esc(d.name)} ⬇</a></p>`).join('')}` : '') +
    (o.physical ? `<p>${esc(phys)}</p>` : '') + `<p>${esc(bye)}<br>Mary Lu</p>`);
  return { subject: en ? 'Your Mary Lu Art order' : 'Tu pedido de Mary Lu Art', html, text };
}

export async function sendOrderEmails(env, o) {
  const to = env.ORDER_EMAIL || 'marylujr.art@gmail.com';
  const id = o.session.id;
  const a = adminEmail(o);
  await sendMail(env, { to, ...a, replyTo: o.email, key: `order-${id}-admin` });
  if (o.email) {
    const c = customerEmail(o);
    await sendMail(env, { to: o.email, ...c, replyTo: to, key: `order-${id}-customer` });
  }
}
