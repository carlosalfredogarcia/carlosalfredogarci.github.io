// Enlaces de descarga firmados: sirven solo para ESE pedido, ESE archivo y hasta ESA fecha.
import { hmac, safeEqual } from './util.js';

export const signDownload = (secret, session, sku, exp) => hmac(secret, `${session}|${sku}|${exp}`);

export async function verifyDownload(secret, session, sku, exp, sig, now = Math.floor(Date.now() / 1000)) {
  if (!secret || !session || !sku) return false;
  const e = Number(exp);
  if (!Number.isFinite(e) || e < now) return false;
  return safeEqual(await hmac(secret, `${session}|${sku}|${e}`), String(sig || ''));
}

export const downloadUrl = (origin, session, sku, exp, sig) =>
  `${origin}/api/download?s=${encodeURIComponent(session)}&k=${encodeURIComponent(sku)}&e=${exp}&t=${encodeURIComponent(sig)}`;
