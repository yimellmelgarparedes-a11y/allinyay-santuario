/**
 * ALLINYAY · js/app.js
 * -----------------------------------------------------------------------------
 * Punto de entrada de la landing page (index.html). Se encarga de:
 *   - Renderizar navbar y footer compartidos
 *   - Animar la entrada de secciones al hacer scroll (IntersectionObserver)
 *   - Cargar la galería de ejemplo (skeleton -> tarjetas)
 *   - Acordeón de preguntas frecuentes
 *   - Formulario de contacto (mailto, sin backend propio)
 * -----------------------------------------------------------------------------
 */
import { renderNavbar } from '../components/navbar.js';
import { renderFooter } from '../components/footer.js';
import { skeletonGaleria } from '../components/loader.js';
import { toast } from '../components/toast.js';
import { CONFIG } from './config.js';

document.addEventListener('DOMContentLoaded', () => {
  renderNavbar(document.getElementById('navbar'), 'publica');
  renderFooter(document.getElementById('footer'), 'completo');

  const correoEl = document.getElementById('contactoEmail');
  if (correoEl) correoEl.textContent = CONFIG.MARCA.email;

  activarRevelado();
  cargarGaleriaEjemplo();
  activarFaq();
  activarFormularioContacto();
});

/** Anima con fade+slide cualquier elemento .revelar cuando entra en pantalla. */
function activarRevelado() {
  const elementos = document.querySelectorAll('.revelar, .hilvan');
  if (!('IntersectionObserver' in window)) {
    elementos.forEach((el) => el.classList.add('visible'));
    return;
  }
  const observador = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((entrada) => {
        if (entrada.isIntersecting) {
          entrada.target.classList.add('visible');
          observador.unobserve(entrada.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
  );
  elementos.forEach((el) => observador.observe(el));
}

/** Datos de ejemplo para la galería pública (no dependen de Supabase). */
const SANTUARIOS_EJEMPLO = [
  { nombre: 'Toby', detalle: 'Compañero desde 2014', alto: 210, icono: 'pata' },
  { nombre: 'Abuela Rosa', detalle: 'Santuario familiar', alto: 260, icono: 'flor' },
  { nombre: 'Mishi', detalle: 'El gato de la ventana', alto: 190, icono: 'estrella' },
  { nombre: 'Tío Beto', detalle: 'Pescador de fin de semana', alto: 240, icono: 'ancla' },
  { nombre: 'Luna', detalle: 'Doce años de compañía', alto: 200, icono: 'luna' },
  { nombre: 'Don Máximo', detalle: 'El abuelo del jardín', alto: 230, icono: 'hoja' },
];

const ICONOS_GALERIA = {
  pata: '<path d="M7 12a2.4 2.4 0 1 1 0-4.8 2.4 2.4 0 0 1 0 4.8zM17 12a2.4 2.4 0 1 1 0-4.8 2.4 2.4 0 0 1 0 4.8zM10 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM14 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM12 20c-3.3 0-6-1.8-6-4.4 0-2.4 2.6-3.6 6-3.6s6 1.2 6 3.6c0 2.6-2.7 4.4-6 4.4z"/>',
  flor: '<circle cx="12" cy="12" r="2.4"/><ellipse cx="12" cy="6" rx="2.6" ry="3.6"/><ellipse cx="12" cy="18" rx="2.6" ry="3.6"/><ellipse cx="6" cy="12" rx="3.6" ry="2.6"/><ellipse cx="18" cy="12" rx="3.6" ry="2.6"/>',
  estrella: '<path d="M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z"/>',
  ancla: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M7 13a5 5 0 0 0 10 0M4 13h3M17 13h3"/>',
  luna: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  hoja: '<path d="M4 20c8-1 13-6 15-16-10 2-15 7-16 15z"/><path d="M6 18c3-3 6-6 12-13"/>',
};

function cargarGaleriaEjemplo() {
  const cont = document.getElementById('galeriaContenedor');
  if (!cont) return;

  cont.innerHTML = skeletonGaleria(6);

  // Simula el tiempo de una consulta real a Supabase antes de pintar el contenido.
  setTimeout(() => {
    cont.innerHTML = SANTUARIOS_EJEMPLO.map(
      (s) => `
      <div class="memory-card" tabindex="0" role="img" aria-label="Santuario de ejemplo: ${s.nombre}">
        <div class="memory-media" style="height:${s.alto}px">
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
            ${ICONOS_GALERIA[s.icono]}
          </svg>
        </div>
        <div class="memory-body">
          <h4>${s.nombre}</h4>
          <span>${s.detalle}</span>
        </div>
      </div>`
    ).join('');
  }, 650);
}

function activarFaq() {
  document.querySelectorAll('.faq-item').forEach((item) => {
    const boton = item.querySelector('.faq-pregunta');
    boton.addEventListener('click', () => {
      const abierto = item.getAttribute('data-abierto') === 'true';
      // Cierra los demás para mantener la lista ordenada y fácil de escanear.
      document.querySelectorAll('.faq-item').forEach((otro) => {
        otro.setAttribute('data-abierto', 'false');
        otro.querySelector('.faq-pregunta').setAttribute('aria-expanded', 'false');
      });
      if (!abierto) {
        item.setAttribute('data-abierto', 'true');
        boton.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

/** No hay backend de contacto propio: arma un mailto: y confirma con un toast. */
function activarFormularioContacto() {
  const form = document.getElementById('formContacto');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const nombre = form.nombre.value.trim();
    const correo = form.correo.value.trim();
    const mensaje = form.mensaje.value.trim();

    const asunto = encodeURIComponent(`Consulta de ${nombre} — ALLINYAY`);
    const cuerpo = encodeURIComponent(`${mensaje}\n\n— ${nombre} (${correo})`);
    window.location.href = `mailto:${CONFIG.MARCA.email}?subject=${asunto}&body=${cuerpo}`;

    toast.exito('Abriendo tu cliente de correo para enviar el mensaje…');
  });
}
