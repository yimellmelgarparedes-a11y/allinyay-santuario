/**
 * ALLINYAY · qr.js
 * -----------------------------------------------------------------------------
 * Genera el código QR de un santuario (PNG y SVG), lo pinta en pantalla y
 * ofrece descarga/compartir. Usa la librería "qrcode" vía CDN (misma familia
 * que el prototipo original, ampliada para exportar también SVG).
 * -----------------------------------------------------------------------------
 */
import QRCode from 'https://esm.sh/qrcode@1.5.4';

/**
 * Construye la URL pública absoluta de un santuario a partir de su slug.
 * @param {string} slug
 */
export function urlPublicaSantuario(slug) {
  return `${window.location.origin}/s/${slug}`;
}

/**
 * Dibuja un QR dentro de un elemento contenedor y devuelve los data URLs
 * (PNG y SVG) listos para descargar o subir a Storage.
 *
 * @param {object} opciones
 * @param {HTMLElement} opciones.contenedor
 * @param {string} opciones.texto URL de destino codificada en el QR
 * @param {string} [opciones.colorOscuro]
 * @param {string} [opciones.colorClaro]
 * @returns {Promise<{png: string, svg: string}>}
 */
export async function dibujarQr({ contenedor, texto, colorOscuro = '#130f1e', colorClaro = '#ffffff' }) {
  contenedor.innerHTML = '';
  const canvas = document.createElement('canvas');
  contenedor.appendChild(canvas);

  await QRCode.toCanvas(canvas, texto, {
    width: 220,
    margin: 1,
    color: { dark: colorOscuro, light: colorClaro },
  });

  const png = canvas.toDataURL('image/png');
  const svg = await QRCode.toString(texto, {
    type: 'svg',
    margin: 1,
    color: { dark: colorOscuro, light: colorClaro },
  });

  return { png, svg: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` };
}

/** Descarga un data URL con el nombre de archivo indicado. */
export function descargarDataUrl(dataUrl, nombreArchivo) {
  const enlace = document.createElement('a');
  enlace.href = dataUrl;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
}

/** Comparte la URL del santuario usando la Web Share API si está disponible. */
export async function compartirSantuario({ slug, nombre }) {
  const url = urlPublicaSantuario(slug);
  const texto = `Visita el santuario digital de ${nombre} en ALLINYAY`;
  if (navigator.share) {
    try {
      await navigator.share({ title: nombre, text: texto, url });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Incrementa el contador de escaneos de un santuario (llamado desde gallery.js,
 * el entrypoint del santuario público). Usa un RPC con SECURITY DEFINER en vez
 * de un UPDATE directo porque un visitante anónimo no tiene permiso de
 * escritura sobre la tabla "qr" (ver policies/rls.sql y la función
 * registrar_escaneo_qr en sql/database.sql).
 */
export async function registrarEscaneo(santuarioId) {
  const { getSupabase } = await import('./supabase.js');
  await getSupabase().rpc('registrar_escaneo_qr', { p_santuario_id: santuarioId });
}
