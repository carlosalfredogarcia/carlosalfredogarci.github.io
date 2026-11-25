// POST /api/encargo  -> formulario de encargos personalizados: llega al correo de Mary Lu.
import { sendMail } from '../_lib/mail.js';
import { json, esc } from '../_lib/util.js';

const TYPES = { retrato: 'Retrato digital en blanco y negro', ilustracion: 'Ilustración personalizada', cuadro: 'Cuadro por encargo', libro: 'Ilustración para un libro o proyecto', mural: 'Mural o decoración', otro: 'Otra idea' };
const clip = (v, n) => String(v ?? '').trim().slice(0, n);

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  if (b.website) return json({ ok: true });                       // campo trampa para robots
  const d = { name: clip(b.name, 100), email: clip(b.email, 200), type: TYPES[b.type] ? b.type : 'otro', size: clip(b.size, 200), date: clip(b.date, 20), msg: clip(b.msg, 4000) };
  if (!d.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email) || d.msg.length < 5 || b.priv !== true) return json({ error: 'invalid' }, 400);
  const text = `Nueva solicitud de encargo desde la web\n\nNombre: ${d.name}\nEmail: ${d.email}\nTipo: ${TYPES[d.type]}\nMedidas o formato: ${d.size || '—'}\nFecha deseada: ${d.date || '—'}\nIdioma del cliente: ${b.lang === 'en' ? 'inglés' : 'español'}\n\nIdea:\n${d.msg}\n\n(Responde a este correo para escribirle: va a su email.)`;
  try {
    await sendMail(env, {
      to: env.ORDER_EMAIL || 'marylujr.art@gmail.com',
      subject: `Encargo: ${TYPES[d.type]} · ${d.name}`, text,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;white-space:pre-wrap">${esc(text)}</div>`,
      replyTo: d.email,
    });
    return json({ ok: true });
  } catch (e) {
    console.error('encargo error:', e.code, e.message);
    return json({ error: 'server' }, 500);
  }
}
