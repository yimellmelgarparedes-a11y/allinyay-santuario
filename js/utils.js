/**
 * ALLINYAY · utils.js
 * -----------------------------------------------------------------------------
 * Funciones auxiliares puras, sin dependencias de Supabase ni del DOM salvo
 * cuando es estrictamente necesario. Se importan desde el resto de módulos.
 * -----------------------------------------------------------------------------
 */

/** Escapa HTML para prevenir XSS al insertar texto de usuarios en el DOM. */
export function escapeHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

/** Genera un identificador corto y razonablemente único para nombres de archivo. */
export function generarIdCorto() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Extrae la extensión de un nombre de archivo (sin el punto), en minúscula. */
export function extensionDeArchivo(nombre) {
  const partes = nombre.split('.');
  return partes.length > 1 ? partes.pop().toLowerCase() : 'bin';
}

/** Formatea una fecha (string ISO, Date o timestamp de Postgres) en español. */
export function formatearFecha(valor, opciones = {}) {
  if (!valor) return '';
  try {
    const fecha = new Date(valor);
    return fecha.toLocaleString('es-PE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      ...opciones,
    });
  } catch {
    return '';
  }
}

/** Convierte un texto en un slug simple (usado para nombres, no para el slug del santuario). */
export function slugificar(texto) {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Debounce clásico: retrasa la ejecución de fn hasta que pasen `espera` ms sin nuevas llamadas. */
export function debounce(fn, espera = 300) {
  let temporizador;
  return (...args) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => fn(...args), espera);
  };
}

/** Lee los parámetros de la URL actual como un objeto plano. */
export function parametrosUrl() {
  return Object.fromEntries(new URLSearchParams(window.location.search));
}

/** Copia texto al portapapeles, con fallback para navegadores/contextos sin permisos. */
export async function copiarAlPortapapeles(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  }
}

/** Valida que un string sea un correo con formato razonable. */
export function esCorreoValido(valor) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

/** Detecta el tipo de dispositivo a partir del user agent, para estadísticas de visitas. */
export function tipoDispositivo() {
  const ua = navigator.userAgent;
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  if (/mobile|android|iphone/i.test(ua)) return 'movil';
  return 'escritorio';
}

/** Hash simple (no criptográfico) usado solo para anonimizar user-agent en visitas. */
export async function hashSimple(texto) {
  const datos = new TextEncoder().encode(texto);
  const buffer = await crypto.subtle.digest('SHA-256', datos);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}
