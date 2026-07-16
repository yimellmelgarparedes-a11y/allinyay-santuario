/**
 * ALLINYAY · components/modal.js
 * -----------------------------------------------------------------------------
 * Modal genérico y accesible (foco atrapado, cierre con Escape, overlay).
 * Uso:
 *   import { abrirModal } from '../components/modal.js';
 *   const cerrar = abrirModal({ titulo: 'Eliminar santuario', contenidoHtml: '...' });
 * -----------------------------------------------------------------------------
 */

let modalActivo = null;

/**
 * @param {object} opciones
 * @param {string} opciones.titulo
 * @param {string} opciones.contenidoHtml
 * @param {Array<{texto: string, clase?: string, onClick: () => void}>} [opciones.acciones]
 * @returns {() => void} función para cerrar el modal programáticamente
 */
export function abrirModal({ titulo, contenidoHtml, acciones = [] }) {
  cerrarModalActivo();

  const overlay = document.createElement('div');
  overlay.className = 'ay-modal-overlay';
  overlay.innerHTML = `
    <div class="ay-modal" role="dialog" aria-modal="true" aria-labelledby="ay-modal-titulo">
      <div class="ay-modal-header">
        <h3 id="ay-modal-titulo">${titulo}</h3>
        <button type="button" class="ay-modal-cerrar" aria-label="Cerrar">&times;</button>
      </div>
      <div class="ay-modal-body">${contenidoHtml}</div>
      <div class="ay-modal-footer"></div>
    </div>
  `;

  const footer = overlay.querySelector('.ay-modal-footer');
  acciones.forEach((accion) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = accion.texto;
    btn.className = accion.clase || 'btn-ghost';
    btn.addEventListener('click', accion.onClick);
    footer.appendChild(btn);
  });
  if (acciones.length === 0) footer.remove();

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const cerrar = () => {
    overlay.classList.add('ay-modal-cerrando');
    setTimeout(() => {
      overlay.remove();
      document.body.style.overflow = '';
    }, 180);
    document.removeEventListener('keydown', alPresionarTecla);
    modalActivo = null;
  };

  function alPresionarTecla(e) {
    if (e.key === 'Escape') cerrar();
  }

  overlay.querySelector('.ay-modal-cerrar').addEventListener('click', cerrar);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cerrar();
  });
  document.addEventListener('keydown', alPresionarTecla);

  requestAnimationFrame(() => overlay.classList.add('ay-modal-visible'));

  modalActivo = cerrar;
  return cerrar;
}

export function cerrarModalActivo() {
  if (modalActivo) modalActivo();
}

/** Atajo para un modal de confirmación (sí/no), devuelve una Promise<boolean>. */
export function confirmarAccion({ titulo, mensaje, textoConfirmar = 'Confirmar', peligroso = false }) {
  return new Promise((resolve) => {
    const cerrar = abrirModal({
      titulo,
      contenidoHtml: `<p>${mensaje}</p>`,
      acciones: [
        {
          texto: 'Cancelar',
          clase: 'btn-ghost',
          onClick: () => {
            cerrar();
            resolve(false);
          },
        },
        {
          texto: textoConfirmar,
          clase: peligroso ? 'btn btn-peligro' : 'btn',
          onClick: () => {
            cerrar();
            resolve(true);
          },
        },
      ],
    });
  });
}
