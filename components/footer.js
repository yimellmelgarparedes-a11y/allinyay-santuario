/**
 * ALLINYAY · components/footer.js
 * -----------------------------------------------------------------------------
 * Pie de página compartido por la landing y (en versión corta) por el santuario
 * público. Incluye el divisor "stitch" (puntada) que es la firma visual de la
 * marca, presente ya en el prototipo original.
 * -----------------------------------------------------------------------------
 */

export function divisorPuntada() {
  return `<div class="stitch" role="presentation"></div>`;
}

/**
 * @param {HTMLElement} contenedor
 * @param {'completo'|'minimo'} variante
 */
export function renderFooter(contenedor, variante = 'completo') {
  const anio = new Date().getFullYear();

  if (variante === 'minimo') {
    contenedor.innerHTML = `
      <footer class="foot foot-minimo">
        ${divisorPuntada()}
        <p>Cada amigurumi ALLINYAY guarda un santuario digital único, activado con su código QR.</p>
      </footer>
    `;
    return;
  }

  contenedor.innerHTML = `
    <footer class="foot foot-completo">
      ${divisorPuntada()}
      <div class="foot-grid">
        <div class="foot-marca">
          <div class="brand-mark">A</div>
          <p>Allinyay Detalles<br>Amigurumis conmemorativos, hechos a mano.</p>
        </div>
        <div class="foot-col">
          <h5>Producto</h5>
          <a href="/index.html#como-funciona">Cómo funciona</a>
          <a href="/index.html#galeria">Galería</a>
          <a href="/index.html#faq">Preguntas frecuentes</a>
        </div>
        <div class="foot-col">
          <h5>Empresa</h5>
          <a href="/index.html#historia">Nuestra historia</a>
          <a href="/index.html#contacto">Contacto</a>
        </div>
        <div class="foot-col">
          <h5>Acceso</h5>
          <a href="/login.html">Iniciar sesión</a>
        </div>
      </div>
      <p class="foot-copy">&copy; ${anio} Allinyay Detalles. Hecho con cariño para guardar recuerdos.</p>
    </footer>
  `;
}
