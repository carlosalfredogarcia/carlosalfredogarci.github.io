// GET /api/order?session_id=cs_...  -> estado del pedido y enlaces de descarga (página "gracias").
import { loadOrder, siteOrigin } from '../_lib/order.js';
import { json } from '../_lib/util.js';

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get('session_id') || '';
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,}$/.test(id)) return json({ error: 'bad_session' }, 400);
  try {
    const o = await loadOrder(env, id, siteOrigin(env, request));
    return json({
      status: o.paid ? 'paid' : 'pending',
      lang: o.lang, email: o.email || null, total: o.total,
      physical: o.physical, expired: o.expired,
      items: o.items.map(({ name, qty, total, kind }) => ({ name, qty, total, kind })),
      downloads: o.downloads.map(({ name, filename, url }) => ({ name, filename, url })),
    });
  } catch (e) {
    console.error('order error:', e.code, e.message);
    return json({ error: e.code === 'stripe' ? 'not_found' : 'server' }, e.code === 'stripe' ? 404 : 500);
  }
}
