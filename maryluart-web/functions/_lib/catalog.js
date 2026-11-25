// CATÁLOGO DEL SERVIDOR.
// Los precios SIEMPRE salen de aquí, nunca del navegador: lo que llega del carrito
// solo dice "qué producto y qué versión"; el importe lo decide este archivo.
// Si cambias un precio, cámbialo también en index.html (const PRICE); el test
// `npm test`/`node --test` avisa si no coinciden.
import { httpError } from './util.js';

export const DOWNLOAD_DAYS = 7;

export const OPTIONS = {
  dl:  { kind: 'digital', cents: 1200, es: 'Descarga digital 30 × 40 cm', en: 'Digital download 30 × 40 cm' },
  a3:  { kind: 'print',   cents: 4000, es: 'Lámina A3',                   en: 'A3 art print' },
  l50: { kind: 'print',   cents: 6000, es: 'Lámina 50 × 70 cm',           en: 'Art print 50 × 70 cm' },
  l60: { kind: 'print',   cents: 8000, es: 'Lámina 60 × 90 cm',           en: 'Art print 60 × 90 cm' },
  a3p: { kind: 'print',   cents: 2000, es: 'Lámina A3',                   en: 'A3 art print' },
};

const PAINT = ['a3', 'l50', 'l60'];
const DIGI = ['dl', 'a3p'];

// `file` = nombre EXACTO del archivo en el almacén privado (R2) para la descarga.
export const PRODUCTS = {
  pulpo:           { es: 'Pulpo’s Happy Hour', en: 'Pulpo’s Happy Hour', options: PAINT },
  cabra:           { es: 'Cabra majorera',     en: 'Majorero Goat',      options: PAINT },
  lagarto:         { es: 'Lagarto canario',    en: 'Canary Lizard',      options: PAINT },
  jirafas:         { es: 'Jirafas del oasis',  en: 'Oasis Giraffes',     options: PAINT },
  corralejo:       { es: 'Corralejo azul',     en: 'Blue Corralejo',     options: PAINT },
  diaynoche:       { es: 'Día y noche',        en: 'Day and Night',      options: PAINT },
  cactus:          { es: 'Cactus vibrante',    en: 'Vibrant Cactus',     options: PAINT },
  chichiriviche:   { es: 'Chichiriviche',      en: 'Chichiriviche',      options: PAINT },
  guacamayas:      { es: 'Guacamayas',         en: 'Macaws',             options: PAINT },
  calima:          { es: 'Calima',             en: 'Calima',             options: DIGI, file: 'Poster_Calima.zip' },
  surf:            { es: 'Surf is Life',       en: 'Surf is Life',       options: DIGI, file: 'Poster_Surf_is_Life.zip' },
  invierno:        { es: 'Invierno',           en: 'Winter',             options: DIGI, file: 'Poster_Invierno_CMYK.zip' },
  'corralejo-print': { es: 'Corralejo',        en: 'Corralejo',          options: DIGI, file: 'Poster_CORRALEJO.zip' },
  fuerteventura:   { es: 'Fuerteventura',      en: 'Fuerteventura',      options: DIGI, file: 'Poster_Fuerteventura.zip' },
};

export const MAX_LINES = 10;   // líneas distintas por pedido
export const MAX_QTY = 10;     // unidades por línea (las descargas siempre 1)

export function parseSku(sku) {
  const i = String(sku || '').lastIndexOf(':');
  const id = String(sku).slice(0, i), opt = String(sku).slice(i + 1);
  const product = PRODUCTS[id], option = OPTIONS[opt];
  return product && option ? { id, opt, product, option, sku: `${id}:${opt}` } : null;
}

/** Valida el carrito que manda el navegador y devuelve líneas con el precio del servidor. */
export function resolveCart(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_LINES * 2) throw httpError('empty', 'Carrito vacío o demasiado grande');
  const lines = new Map();
  for (const r of raw) {
    const id = r && r.id, opt = r && r.opt;
    const product = Object.hasOwn(PRODUCTS, id) ? PRODUCTS[id] : null;
    const option = Object.hasOwn(OPTIONS, opt) ? OPTIONS[opt] : null;
    if (!product || !option || !product.options.includes(opt)) throw httpError('bad_item', `Producto no válido: ${id}:${opt}`);
    if (option.kind === 'digital' && !product.file) throw httpError('bad_item', `Sin archivo: ${id}`);
    const sku = `${id}:${opt}`;
    const add = option.kind === 'digital' ? 1 : Math.min(Math.max(Math.floor(Number(r.qty)) || 1, 1), MAX_QTY);
    const prev = lines.get(sku);
    const qty = option.kind === 'digital' ? 1 : Math.min((prev ? prev.qty : 0) + add, MAX_QTY);
    lines.set(sku, { sku, id, opt, product, option, qty });
  }
  if (lines.size > MAX_LINES) throw httpError('empty', 'Demasiadas líneas');
  return [...lines.values()];
}
