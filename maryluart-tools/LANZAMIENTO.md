# Lanzar www.maryluart.com — guía paso a paso

La web que se publica está en **`maryluart-web/public`**: todo lo que hay ahí dentro acaba en internet.
El código del servidor (`maryluart-web/functions`), las pruebas y esta guía **no se publican**.

Cuentas: GitHub (código), Cloudflare (web, dominio, almacén de descargas y servidor de pagos),
Stripe (cobro) y Resend (correos).

---

## 1. GitHub: tu copia del código
1. Entra en tu cuenta de GitHub.
2. Abre el repositorio `carlosalfredogarcia/carlosalfredogarci.github.io` y pulsa **Fork** → *Create fork*.
   (Es tu copia. Cuando se cambie algo aquí, se actualiza con el botón **Sync fork**.)

## 2. Cloudflare Pages: publicar la web
1. Cloudflare → **Workers & Pages** → **Create** → pestaña **Pages** → **Connect to Git** → elige tu fork.
2. Configuración:
   - **Project name:** `maryluart`
   - **Framework preset:** None
   - **Build command:** (vacío)
   - **Build output directory:** `public`
   - **Root directory (advanced):** `maryluart-web`
3. **Save and Deploy**. En el registro del despliegue debe poner algo como *"Found Functions directory"*.
   Si no aparece, avísame: es la parte que cobra.
4. Tu web de pruebas queda en `https://maryluart.pages.dev`.

## 3. Cloudflare R2: el almacén privado de las descargas
1. Cloudflare → **R2 Object Storage** → **Create bucket** → nombre `maryluart-descargas` (privado, déjalo así).
2. Dentro, **Upload** y arrastra los ZIP con **estos nombres exactos**:
   - `Poster_Calima.zip`
   - `Poster_Invierno_CMYK.zip`
   - `Poster_CORRALEJO.zip`
   - `Poster_Fuerteventura.zip`
   - `Poster_Surf_is_Life.zip`  *(falta este: hasta que lo subas, "Surf is Life" no se puede comprar como descarga)*
3. Pages → tu proyecto → **Settings → Functions → R2 bucket bindings → Add**:
   - **Variable name:** `DOWNLOADS`  (en mayúsculas, exacto)
   - **R2 bucket:** `maryluart-descargas`

## 4. Variables del servidor (Pages → Settings → Variables and Secrets → Production)
| Nombre | Tipo | Valor |
|---|---|---|
| `STRIPE_SECRET_KEY` | Secret | clave secreta de Stripe: `sk_test_...` para probar, luego `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Secret | `whsec_...` (se obtiene en el paso 5) |
| `DOWNLOAD_SECRET` | Secret | una contraseña larga inventada (30+ caracteres al azar). Firma los enlaces de descarga |
| `RESEND_API_KEY` | Secret | `re_...` (paso 6) |
| `SITE_URL` | Texto | `https://www.maryluart.com` (para probar antes del dominio: `https://maryluart.pages.dev`) |
| `ORDER_EMAIL` | Texto | `marylujr.art@gmail.com` |
| `MAIL_FROM` | Texto | `Mary Lu Art <pedidos@maryluart.com>` |

**Las claves nunca se pegan en el chat ni en el código.** Solo aquí.
Después de añadir variables o el R2: **Deployments → ⋯ → Retry deployment** para que se apliquen.

## 5. Stripe: el aviso de cada pago
1. Stripe → **Developers → Webhooks → Add endpoint**.
2. **URL:** `https://www.maryluart.com/api/webhook` (para probar: `https://maryluart.pages.dev/api/webhook`).
3. **Eventos:** `checkout.session.completed` y `checkout.session.async_payment_succeeded`.
4. Copia la **Signing secret** (`whsec_...`) y ponla en `STRIPE_WEBHOOK_SECRET`.
5. En Stripe, **Settings → Business → Branding**: logo y colores. **Settings → Emails**: activa los recibos al cliente.
6. El modo prueba y el modo real tienen **claves y webhooks distintos**.

## 6. Resend: los correos
1. Resend → **Domains → Add domain** → `maryluart.com`.
2. Añade los registros DNS que te indica (si el DNS está en Cloudflare, hay un botón que lo hace solo). **Verify**.
3. **API Keys → Create** (permiso *Sending access*) → cópiala en `RESEND_API_KEY`.

## 7. Dominio: www.maryluart.com
Cuando Cloudflare muestre tu dominio como **Active**:
1. Pages → tu proyecto → **Custom domains → Set up a custom domain** → `www.maryluart.com`.
2. Para que `maryluart.com` (sin www) lleve a `www`: Cloudflare → tu dominio → **Rules → Redirect Rules**:
   si el host es `maryluart.com`, redirigir a `https://www.maryluart.com${http.request.uri.path}` (301).
3. Tu web antigua de WordPress dejará de verse cuando el dominio apunte aquí. **No canceles WordPress hasta que todo funcione.**

## 8. Prueba en modo TEST (sin dinero real)
Con claves `sk_test_` y su webhook:
1. Compra una **descarga**: tarjeta `4242 4242 4242 4242`, fecha futura, cualquier CVC.
   Debe: volver a *Gracias* con el botón de descarga → el archivo se baja → llegan **2 correos**
   (a ti con el pedido y al comprador con sus enlaces).
2. Compra una **lámina**: Stripe pide dirección en España. A ti te llega el correo con "ENVIAR A".
3. Envía una solicitud por el **formulario de encargos**: te llega al correo.
4. Mira en Stripe → Developers → Webhooks que los avisos salen en verde (200).

## 9. Pasar a dinero REAL
1. Cambia `STRIPE_SECRET_KEY` por la `sk_live_...`.
2. Crea el webhook en **modo real** (mismo URL y eventos) y pon su `whsec_...` en `STRIPE_WEBHOOK_SECRET`.
3. Reintenta el despliegue.
4. Haz **una compra real** de 12 € con tu propia tarjeta y **reembólsala** desde Stripe.

## 10. Antes de abrir al público
- [ ] Textos legales completados y revisados por tu gestor (`maryluart-web/public/legal/`). Comprobador: `node maryluart-tools/prelaunch.mjs`
- [ ] Impuestos confirmados con tu gestor (IGIC/IVA).
- [ ] Los 5 ZIP de descarga subidos al R2.
- [ ] Prueba en modo test hecha y compra real de 12 € reembolsada.
- [ ] Enlace del libro en Amazon, si ya lo tienes.

## Cómo se cambian cosas
- **Textos, fotos, obras nuevas:** se editan los archivos en GitHub; Cloudflare republica solo en ~1 minuto.
- **Cambiar un precio:** hay que cambiarlo en **dos sitios**: `maryluart-web/public/index.html` (`const PRICE`) y
  `maryluart-web/functions/_lib/catalog.js` (`OPTIONS`, en céntimos). Luego `node --test maryluart-tools/lib.test.mjs`
  comprueba que coinciden. (El que cobra de verdad es el segundo.)
- **Cambiar el archivo de una descarga:** sube el nuevo al R2 con el mismo nombre.

## Si algo falla
- *"No hemos podido iniciar el pago"*: falta alguna variable del paso 4, o el R2 (`DOWNLOADS`) no está enlazado.
- *Pago hecho pero no llegan correos*: Stripe → Webhooks → mira el último aviso y su respuesta; revisa `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY` y que el dominio esté verificado en Resend.
- *El enlace de descarga da error*: caduca a los 7 días; escribe al comprador un enlace nuevo o su archivo.
