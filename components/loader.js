/**
 * ALLINYAY · components/loader.js
 * -----------------------------------------------------------------------------
 * Indicadores de carga reutilizables: spinner inline y skeletons de galería,
 * usados mientras se resuelven las consultas a Supabase.
 * -----------------------------------------------------------------------------
 */

/** HTML de una fila de carga con spinner + texto (para reemplazar contenido mientras carga). */
export function filaCargando(texto = 'Cargando…') {
  return `<div class="loading-row"><span class="spin"></span> ${texto}</div>`;
}

/** HTML de N tarjetas "skeleton" para la galería, mientras se resuelve la consulta. */
export function skeletonGaleria(cantidad = 6) {
  return Array.from({ length: cantidad })
    .map(
      () => `
      <div class="memory-card skeleton-card" aria-hidden="true">
        <div class="skeleton-block skeleton-media"></div>
        <div class="memory-body">
          <div class="skeleton-block skeleton-linea" style="width:55%"></div>
          <div class="skeleton-block skeleton-linea" style="width:85%"></div>
          <div class="skeleton-block skeleton-linea" style="width:35%"></div>
        </div>
      </div>`
    )
    .join('');
}

/** Bloquea un botón mostrando un texto de progreso, y devuelve una función para restaurarlo. */
export function botonCargando(btn, textoCarga) {
  const textoOriginal = btn.textContent;
  const disabledOriginal = btn.disabled;
  btn.disabled = true;
  btn.textContent = textoCarga;
  return () => {
    btn.disabled = disabledOriginal;
    btn.textContent = textoOriginal;
  };
}

/** Muestra una barra de progreso simple (0-100) dentro de un contenedor. */
export function actualizarBarraProgreso(contenedor, porcentaje) {
  let barra = contenedor.querySelector('.ay-progreso-barra');
  if (!barra) {
    contenedor.innerHTML = `<div class="ay-progreso"><div class="ay-progreso-barra"></div></div>`;
    barra = contenedor.querySelector('.ay-progreso-barra');
  }
  barra.style.width = `${Math.min(100, Math.max(0, porcentaje))}%`;
}
