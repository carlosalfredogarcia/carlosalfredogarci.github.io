// Utilidades compartidas por las funciones del servidor (Cloudflare Pages Functions).
const enc = new TextEncoder();

export function httpError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

export function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hmac(secret, data, { hex = false } = {}) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return hex ? [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('') : b64url(sig);
}

// Comparación en tiempo constante (evita adivinar firmas por tiempos de respuesta).
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const eur = (cents) => {
  const v = cents / 100;
  return (Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',')) + ' €';
};
