/**
 * ALLINYAY · components/navbar.js
 * -----------------------------------------------------------------------------
 * Barra de navegación superior, con dos variantes:
 *   - 'publica'  → landing page (enlaces a secciones + botón "Acceder")
 *   - 'admin'    → dashboard (nombre del usuario + botón "Cerrar sesión")
 * -----------------------------------------------------------------------------
 */
import { cerrarSesion } from '../js/auth.js';

export function iconoVela() {
  return `
    <svg class="candle" viewBox="0 0 20 30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path class="flame" d="M10 0c2 4-1 5-1 8a3 3 0 0 0 6 0c0-2-1-3-1-3s2 3 2 6a5 5 0 0 1-10 0c0-6 4-7 4-11z" fill="#e8c77e"/>
      <rect x="8" y="16" width="4" height="12" rx="1" fill="#d3a34e"/>
      <rect x="6" y="27" width="8" height="3" rx="1" fill="#a1793a"/>
    </svg>`;
}

/**
 * Renderiza la navbar dentro de un contenedor existente.
 * @param {HTMLElement} contenedor
 * @param {'publica'|'admin'} variante
 * @param {object} [datos] p.ej. { nombreUsuario } para la variante admin
 */
export function renderNavbar(contenedor, variante = 'publica', datos = {}) {
  if (variante === 'admin') {
    contenedor.innerHTML = `
      <nav class="ay-navbar ay-navbar-admin">
        <a class="brand" href="/dashboard.html">
          <div class="brand-mark">A</div>
          <div class="brand-name">Allinyay <b>Panel</b></div>
        </a>
        <div class="ay-navbar-derecha">
          <span class="ay-navbar-usuario">${datos.nombreUsuario || ''}</span>
          <button class="btn-ghost" id="btnCerrarSesion" type="button">Cerrar sesión</button>
        </div>
      </nav>
    `;
    contenedor.querySelector('#btnCerrarSesion').addEventListener('click', cerrarSesion);
    return;
  }

  contenedor.innerHTML = `
    <nav class="ay-navbar ay-navbar-publica">
      <a class="brand" href="/index.html">
        <div class="brand-mark">A</div>
        <div class="brand-name">Allinyay <b>Detalles</b></div>
      </a>
      <button class="ay-navbar-toggle" id="ayNavToggle" aria-label="Abrir menú" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <div class="ay-navbar-links" id="ayNavLinks">
        <a href="/index.html#como-funciona">Cómo funciona</a>
        <a href="/index.html#galeria">Galería</a>
        <a href="/index.html#testimonios">Testimonios</a>
        <a href="/index.html#faq">Preguntas</a>
        <a href="/index.html#contacto">Contacto</a>
        <a class="btn" href="/login.html">Acceder</a>
      </div>
    </nav>
  `;

  const toggle = contenedor.querySelector('#ayNavToggle');
  const links = contenedor.querySelector('#ayNavLinks');
  toggle.addEventListener('click', () => {
    const abierto = links.classList.toggle('ay-navbar-links-abierto');
    toggle.setAttribute('aria-expanded', String(abierto));
  });
}
