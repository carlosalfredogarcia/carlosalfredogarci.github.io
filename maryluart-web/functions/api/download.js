// GET /api/download?s=...&k=...&e=...&t=...  -> entrega el archivo si el enlace firmado es válido.
import { parseSku } from '../_lib/catalog.js';
import { verifyDownload } from '../_lib/tokens.js';

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  const sku = q.get('k');
  const ok = await verifyDownload(env.DOWNLOAD_SECRET, q.get('s'), sku, q.get('e'), q.get('t'));
  const p = parseSku(sku);
  if (!ok || !p || p.option.kind !== 'digital') return new Response('Enlace no válido o caducado. / Invalid or expired link.', { status: 403 });
  if (!env.DOWNLOADS) return new Response('Almacén no configurado', { status: 500 });
  const obj = await env.DOWNLOADS.get(p.product.file);
  if (!obj) return new Response('Archivo no encontrado', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'content-type': 'application/zip',
      'content-length': String(obj.size),
      'content-disposition': `attachment; filename="${p.product.file}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
