/**
 * ALLINYAY · components/toast.js
 * -----------------------------------------------------------------------------
 * Sistema de notificaciones flotantes (toasts). Se auto-inicializa creando
 * un contenedor fijo en el <body> la primera vez que se usa.
 * Uso: import { toast } from '../components/toast.js'; toast.exito('Guardado');
 * -----------------------------------------------------------------------------
 */

let contenedor = null;

function asegurarContenedor() {
  if (contenedor) return contenedor;
  contenedor = document.createElement('div');
  contenedor.id = 'ay-toast-contenedor';
  contenedor.setAttribute('aria-live', 'polite');
  contenedor.setAttribute('role', 'status');
  Object.assign(contenedor.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    zIndex: 9999,
    maxWidth: '360px',
  });
  document.body.appendChild(contenedor);
  return contenedor;
}

function mostrar(mensaje, tipo = 'info', duracionMs = 4000) {
  const cont = asegurarContenedor();
  const colores = {
    info: { fondo: '#251d3a', borde: 'rgba(211,163,78,0.35)', texto: '#f1ead9' },
    exito: { fondo: '#1d3324', borde: 'rgba(107,201,140,0.4)', texto: '#e7fbee' },
    error: { fondo: '#3a1d24', borde: 'rgba(224,139,139,0.4)', texto: '#fbe7e7' },
  };
  const paleta = colores[tipo] || colores.info;

  const el = document.createElement('div');
  el.textContent = mensaje;
  Object.assign(el.style, {
    background: paleta.fondo,
    color: paleta.texto,
    border: `1px solid ${paleta.borde}`,
    borderRadius: '12px',
    padding: '13px 18px',
    fontFamily: "'Inter', sans-serif",
    fontSize: '14px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
    opacity: '0',
    transform: 'translateY(8px)',
    transition: 'opacity .25s ease, transform .25s ease',
  });

  cont.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 250);
  }, duracionMs);
}

export const toast = {
  info: (msg, ms) => mostrar(msg, 'info', ms),
  exito: (msg, ms) => mostrar(msg, 'exito', ms),
  error: (msg, ms) => mostrar(msg, 'error', ms),
};
