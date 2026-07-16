/**
 * ALLINYAY · js/gallery.js
 * -----------------------------------------------------------------------------
 * Punto de entrada de santuario.html — la página pública que se abre al
 * escanear el QR de un amigurumi. Es multi-tenant: NO hay un HTML por
 * cliente, todo se resuelve en tiempo real a partir del "slug" en la URL
 * (/s/{slug}, redirigido por 404.html a /santuario.html?slug={slug} en
 * GitHub Pages, ver /404.html para el detalle de esa redirección).
 *
 * Responsabilidades:
 *   - Resolver el slug y cargar el santuario desde la vista pública
 *     "santuarios_publicos" (RLS ya filtra por activo+publicado)
 *   - Pintar identidad, historia, recuerdo destacado, galería, timeline y mapa
 *   - Lightbox de imágenes/videos/audios con navegación por teclado
 *   - Reproductor de audio propio (onda + velocidad)
 *   - Formulario de mensajes de visitantes (con foto opcional), sujeto a
 *     moderación (los comentarios solo se muestran si comentarios.aprobado)
 *   - Registrar la visita y el escaneo para las estadísticas del dashboard
 *   - Compartir y modo pantalla completa
 * -----------------------------------------------------------------------------
 */
import { tabla, storageBucket } from './supabase.js';
import { CONFIG } from './config.js';
import { escapeHtml, formatearFecha, tipoDispositivo, hashSimple } from './utils.js';
import { validarArchivo, subirArchivo } from './storage.js';
import { registrarEscaneo, urlPublicaSantuario, compartirSantuario } from './qr.js';
import { renderFooter } from '../components/footer.js';
import { toast } from '../components/toast.js';
import { abrirModal } from '../components/modal.js';

let santuario = null;
let recuerdos = [];
let itemsLightbox = []; // subconjunto navegable del lightbox (imagen/video/audio)
let indiceLightbox = -1;
let archivoAdjunto = null; // File elegido para el mensaje del visitante

document.addEventListener('DOMContentLoaded', async () => {
  renderFooter(document.getElementById('footer'), 'minimo');
  activarPantallaCompleta();
  activarCompartir();
  activarLightbox();

  const slug = obtenerSlug();
  if (!slug) {
    mostrarNoEncontrado();
    return;
  }

  await cargarSantuario(slug);
});

/* =============================================================================
   RESOLUCIÓN DEL SLUG
   ============================================================================= */

/** Soporta /santuario.html?slug=XXXX (uso directo) y /s/XXXX (redirigido por 404.html). */
function obtenerSlug() {
  const porQuery = new URLSearchParams(window.location.search).get('slug');
  if (porQuery) return porQuery.trim();

  const coincide = window.location.pathname.match(/\/s\/([a-zA-Z0-9-]+)\/?$/);
  return coincide ? coincide[1] : null;
}

/* =============================================================================
   CARGA PRINCIPAL
   ============================================================================= */

async function cargarSantuario(slug) {
  try {
    const { data, error } = await tabla('santuarios_publicos').select('*').eq('slug', slug).single();
    if (error || !data) {
      mostrarNoEncontrado();
      return;
    }
    santuario = data;

    pintarIdentidad();
    pintarMetaSeo();
    document.getElementById('estadoCargando').hidden = true;
    document.getElementById('contenidoSantuario').hidden = false;
    activarRevelado();

    // Estas tres no bloquean el render: si fallan, el santuario igual se ve bien.
    registrarVisita();
    registrarEscaneoSilencioso();

    await cargarRecuerdos();
    await cargarMensajes();
    activarFormularioMensaje();
  } catch {
    mostrarNoEncontrado();
  }
}

function mostrarNoEncontrado() {
  document.getElementById('estadoCargando').hidden = true;
  document.getElementById('estadoNoEncontrado').hidden = false;
}

/* =============================================================================
   IDENTIDAD (portada, retrato, nombre, historia, mapa)
   ============================================================================= */

function pintarIdentidad() {
  document.documentElement.style.setProperty('--oro', santuario.color_primario || '#d3a34e');
  document.documentElement.style.setProperty('--oro-claro', aclararColor(santuario.color_primario) || '#e8c77e');
  document.documentElement.style.setProperty('--bg', santuario.color_fondo || '#0f0c19');
  document.body.style.setProperty('--f-display', `'${santuario.tipografia || 'Fraunces'}', ui-serif, Georgia, serif`);

  const portada = document.getElementById('sanPortada');
  if (santuario.portada_url) portada.style.backgroundImage = `linear-gradient(180deg, rgba(15,12,25,0) 40%, var(--bg) 100%), url('${santuario.portada_url}')`;

  const retrato = document.getElementById('sanRetrato');
  const retratoVacio = document.getElementById('sanRetratoVacio');
  if (santuario.foto_principal_url) {
    retrato.src = santuario.foto_principal_url;
    retrato.alt = santuario.nombre || 'Retrato';
    retrato.hidden = false;
    retratoVacio.hidden = true;
  }

  document.getElementById('sanNombre').textContent = santuario.nombre || 'En memoria de';

  if (santuario.fecha_conmemoracion) {
    const el = document.getElementById('sanFechas');
    el.textContent = santuario.fecha_conmemoracion;
    el.hidden = false;
  }
  if (santuario.cuidado_por) {
    const el = document.getElementById('sanCuidado');
    el.textContent = `Cuidado por ${santuario.cuidado_por}`;
    el.hidden = false;
  }

  if (santuario.historia && santuario.historia.trim()) {
    document.getElementById('sanHistoria').textContent = santuario.historia;
    document.getElementById('sanSeccionHistoria').hidden = false;
  }

  if (santuario.mapa_lat && santuario.mapa_lng) {
    const iframe = document.getElementById('sanMapaIframe');
    iframe.src = `https://www.google.com/maps?q=${santuario.mapa_lat},${santuario.mapa_lng}&z=14&output=embed`;
    document.getElementById('sanSeccionMapa').hidden = false;
  }

  if (!santuario.comentarios_activos) {
    document.getElementById('sanFormMensaje').hidden = true;
    document.getElementById('sanComentariosCerrados').hidden = false;
  } else {
    document.getElementById('sanFormMensaje').hidden = false;
  }

  document.getElementById('btnIrMensajes').addEventListener('click', () => {
    document.getElementById('sanSeccionMensajes').scrollIntoView({ behavior: 'smooth' });
  });
}

/** Aclara un color hex ~20% para usarlo como acento "oro-claro" derivado del color elegido por el admin. */
function aclararColor(hex) {
  if (!hex) return null;
  const limpio = hex.replace('#', '');
  if (limpio.length !== 6) return null;
  const num = parseInt(limpio, 16);
  const r = Math.min(255, (num >> 16) + 45);
  const g = Math.min(255, ((num >> 8) & 0xff) + 40);
  const b = Math.min(255, (num & 0xff) + 30);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function pintarMetaSeo() {
  const titulo = `${santuario.nombre} · Santuario digital ALLINYAY`;
  const descripcion = (santuario.historia || 'Un santuario digital ALLINYAY con fotos, historia y mensajes.').slice(0, 155);
  const imagen = santuario.portada_url || santuario.foto_principal_url || `${window.location.origin}/assets/backgrounds/og-cover.jpg`;

  document.getElementById('tituloPagina').textContent = titulo;
  document.getElementById('metaDescripcion').setAttribute('content', descripcion);
  document.getElementById('ogTitle').setAttribute('content', titulo);
  document.getElementById('ogDescription').setAttribute('content', descripcion);
  document.getElementById('ogImage').setAttribute('content', imagen);
  document.getElementById('twitterTitle').setAttribute('content', titulo);
  document.getElementById('twitterDescription').setAttribute('content', descripcion);
  document.getElementById('twitterImage').setAttribute('content', imagen);

  const schema = document.getElementById('schemaJson');
  schema.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    name: titulo,
    description: descripcion,
    url: window.location.href,
  });
}

/* =============================================================================
   VISITAS Y ESCANEOS (no bloquean el render si fallan)
   ============================================================================= */

async function registrarVisita() {
  try {
    const uaHash = await hashSimple(navigator.userAgent + '|' + new Date().toDateString());
    await tabla('visitas').insert({
      santuario_id: santuario.id,
      origen: document.referrer ? 'compartido' : 'qr',
      dispositivo: tipoDispositivo(),
      user_agent_hash: uaHash,
    });
  } catch {
    /* las estadísticas son un extra: si falla, no interrumpimos la visita */
  }
}

async function registrarEscaneoSilencioso() {
  try {
    await registrarEscaneo(santuario.id);
  } catch {
    /* idem */
  }
}

/* =============================================================================
   RECUERDOS: galería + timeline + destacado
   ============================================================================= */

async function cargarRecuerdos() {
  const grid = document.getElementById('sanGaleria');
  try {
    const { data, error } = await tabla('recuerdos')
      .select('*, archivo:archivo_id(*)')
      .eq('santuario_id', santuario.id)
      .order('orden', { ascending: true });
    if (error) throw error;
    recuerdos = data || [];
  } catch {
    grid.innerHTML = estadoVacioHtml('No se pudo cargar la galería', 'Intenta recargar la página.');
    return;
  }

  pintarDestacado();
  pintarGaleria();
  pintarTimeline();
}

function pintarDestacado() {
  const destacado = recuerdos.find((r) => r.destacado && (r.tipo === 'frase' || r.tipo === 'evento') && (r.descripcion || r.titulo));
  if (!destacado) return;
  document.getElementById('sanDestacadoTexto').textContent = destacado.descripcion || destacado.titulo;
  document.getElementById('sanSeccionDestacado').hidden = false;
}

function pintarGaleria() {
  const grid = document.getElementById('sanGaleria');
  const multimedia = recuerdos.filter((r) => ['imagen', 'video', 'audio'].includes(r.tipo));

  if (!multimedia.length) {
    grid.innerHTML = estadoVacioHtml('Aún no hay fotos ni videos', 'Este santuario todavía no tiene recuerdos multimedia.');
    itemsLightbox = [];
    return;
  }

  itemsLightbox = multimedia;
  grid.innerHTML = multimedia.map((r, i) => tarjetaGaleriaHtml(r, i)).join('');

  grid.querySelectorAll('.memory-card').forEach((card) => {
    card.addEventListener('click', () => abrirLightbox(Number(card.dataset.indice)));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        abrirLightbox(Number(card.dataset.indice));
      }
    });
  });
}

function urlDe(archivo) {
  if (!archivo?.ruta) return null;
  return storageBucket().getPublicUrl(archivo.ruta).data.publicUrl;
}

function tarjetaGaleriaHtml(r, indice) {
  const url = urlDe(r.archivo);
  let media;
  let marca = '';

  if (r.tipo === 'imagen' && url) {
    media = `<img class="san-galeria-media" src="${url}" alt="${escapeHtml(r.titulo || 'Recuerdo')}" loading="lazy" style="aspect-ratio:${r.archivo?.ancho && r.archivo?.alto ? `${r.archivo.ancho}/${r.archivo.alto}` : '1/1'}" />`;
  } else if (r.tipo === 'video' && url) {
    media = `<video class="san-galeria-media" src="${url}#t=0.1" muted preload="metadata" style="aspect-ratio:16/9"></video>`;
    marca = iconoMarca('video');
  } else if (r.tipo === 'audio') {
    media = `<div class="san-audio-tile"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg><span>${escapeHtml(r.titulo || 'Audio')}</span></div>`;
  } else {
    return '';
  }

  return `
  <div class="memory-card" tabindex="0" role="button" aria-label="Abrir ${escapeHtml(r.titulo || r.tipo)}" data-indice="${indice}">
    ${media}
    ${marca}
    ${r.titulo ? `<div class="memory-body"><h4>${escapeHtml(r.titulo)}</h4></div>` : ''}
  </div>`;
}

function iconoMarca(tipo) {
  const icono =
    tipo === 'video'
      ? '<path d="m10 8 6 4-6 4V8z"/><circle cx="12" cy="12" r="9"/>'
      : '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>';
  return `<span class="san-galeria-video-marca"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${icono}</svg></span>`;
}

function pintarTimeline() {
  const momentos = recuerdos
    .filter((r) => (r.tipo === 'frase' || r.tipo === 'evento') && (r.titulo || r.descripcion))
    .sort((a, b) => (a.fecha_evento || '').localeCompare(b.fecha_evento || '') || a.orden - b.orden);

  if (!momentos.length) return;

  document.getElementById('sanTimeline').innerHTML = momentos.map(timelineItemHtml).join('');
  document.getElementById('sanSeccionTimeline').hidden = false;
}

function timelineItemHtml(r) {
  const fecha = r.fecha_evento ? formatearFecha(r.fecha_evento, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  return `
  <div class="san-timeline-item">
    <div class="san-timeline-fecha">${escapeHtml(fecha)}</div>
    <div class="san-timeline-cuerpo tarjeta tarjeta-hilo" style="padding:16px 20px">
      ${r.titulo ? `<h4>${escapeHtml(r.titulo)}</h4>` : ''}
      ${r.descripcion ? `<p>${escapeHtml(r.descripcion)}</p>` : ''}
    </div>
  </div>`;
}

function estadoVacioHtml(titulo, texto) {
  return `
  <div class="estado-vacio">
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>
    <h4>${escapeHtml(titulo)}</h4>
    <p>${escapeHtml(texto)}</p>
  </div>`;
}

/* =============================================================================
   LIGHTBOX
   ============================================================================= */

function activarLightbox() {
  document.getElementById('btnCerrarLightbox').addEventListener('click', cerrarLightbox);
  document.getElementById('btnLightboxPrev').addEventListener('click', () => navegarLightbox(-1));
  document.getElementById('btnLightboxNext').addEventListener('click', () => navegarLightbox(1));
  document.getElementById('sanLightbox').addEventListener('click', (e) => {
    if (e.target.id === 'sanLightbox') cerrarLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('sanLightbox').classList.contains('san-lightbox-abierto')) return;
    if (e.key === 'Escape') cerrarLightbox();
    if (e.key === 'ArrowLeft') navegarLightbox(-1);
    if (e.key === 'ArrowRight') navegarLightbox(1);
  });
}

function abrirLightbox(indice) {
  indiceLightbox = indice;
  pintarLightbox();
  document.getElementById('sanLightbox').classList.add('san-lightbox-abierto');
}

function cerrarLightbox() {
  document.getElementById('sanLightbox').classList.remove('san-lightbox-abierto');
  document.getElementById('sanLightboxContenido').innerHTML = '';
}

function navegarLightbox(delta) {
  indiceLightbox = (indiceLightbox + delta + itemsLightbox.length) % itemsLightbox.length;
  pintarLightbox();
}

function pintarLightbox() {
  const r = itemsLightbox[indiceLightbox];
  const url = urlDe(r.archivo);
  const cont = document.getElementById('sanLightboxContenido');
  const multiple = itemsLightbox.length > 1;

  document.getElementById('btnLightboxPrev').style.display = multiple ? 'grid' : 'none';
  document.getElementById('btnLightboxNext').style.display = multiple ? 'grid' : 'none';

  if (r.tipo === 'imagen') {
    cont.innerHTML = `<img src="${url}" alt="${escapeHtml(r.titulo || '')}" />${r.titulo ? `<p class="san-lightbox-pie">${escapeHtml(r.titulo)}</p>` : ''}`;
  } else if (r.tipo === 'video') {
    cont.innerHTML = `<video src="${url}" controls autoplay></video>${r.titulo ? `<p class="san-lightbox-pie">${escapeHtml(r.titulo)}</p>` : ''}`;
  } else if (r.tipo === 'audio') {
    cont.innerHTML = `<div class="san-lightbox-audio">${reproductorAudioHtml(r, url)}</div>`;
    inicializarReproductorAudio(cont.querySelector('.san-audio-player'));
  }
}

/* =============================================================================
   REPRODUCTOR DE AUDIO (con "onda" simulada y control de velocidad)
   ============================================================================= */

const BARRAS_ONDA = 40;

function reproductorAudioHtml(r, url) {
  // Alturas pseudo-aleatorias pero deterministas (según el índice), para simular una waveform sin analizar el audio real.
  const barras = Array.from({ length: BARRAS_ONDA })
    .map((_, i) => `<span style="height:${18 + ((i * 37) % 60)}%"></span>`)
    .join('');
  return `
  <div class="san-audio-player tarjeta tarjeta-hilo" data-url="${url}">
    <button class="san-audio-boton" type="button" data-accion="play" aria-label="Reproducir">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
    </button>
    <div class="san-audio-onda">${barras}</div>
    <span class="san-audio-tiempo">0:00</span>
    <button class="san-audio-velocidad" type="button" data-velocidad="1">1x</button>
    <audio preload="metadata" src="${url}"></audio>
    ${r.titulo ? `<p class="san-lightbox-pie" style="display:none">${escapeHtml(r.titulo)}</p>` : ''}
  </div>`;
}

function inicializarReproductorAudio(wrap) {
  if (!wrap) return;
  const audio = wrap.querySelector('audio');
  const botonPlay = wrap.querySelector('[data-accion="play"]');
  const tiempoEl = wrap.querySelector('.san-audio-tiempo');
  const barras = wrap.querySelectorAll('.san-audio-onda span');
  const botonVel = wrap.querySelector('.san-audio-velocidad');
  const velocidades = [1, 1.5, 2, 0.75];
  let velIdx = 0;

  botonPlay.addEventListener('click', () => {
    if (audio.paused) {
      audio.play();
      botonPlay.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>';
    } else {
      audio.pause();
      botonPlay.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    }
  });

  botonVel.addEventListener('click', () => {
    velIdx = (velIdx + 1) % velocidades.length;
    audio.playbackRate = velocidades[velIdx];
    botonVel.textContent = `${velocidades[velIdx]}x`;
  });

  audio.addEventListener('timeupdate', () => {
    const progreso = audio.duration ? audio.currentTime / audio.duration : 0;
    const activas = Math.floor(progreso * barras.length);
    barras.forEach((b, i) => b.classList.toggle('san-onda-activa', i < activas));
    tiempoEl.textContent = formatearTiempo(audio.currentTime);
  });

  audio.addEventListener('ended', () => {
    botonPlay.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  });
}

function formatearTiempo(seg) {
  const s = Math.floor(seg % 60).toString().padStart(2, '0');
  const m = Math.floor(seg / 60);
  return `${m}:${s}`;
}

/* =============================================================================
   MENSAJES DE VISITANTES
   ============================================================================= */

async function cargarMensajes() {
  const cont = document.getElementById('sanMensajesLista');
  try {
    const { data, error } = await tabla('comentarios')
      .select('*, archivo:archivo_id(*)')
      .eq('santuario_id', santuario.id)
      .eq('aprobado', true)
      .order('created_at', { ascending: false });
    if (error) throw error;

    if (!data || !data.length) {
      cont.innerHTML = estadoVacioHtml('Aún no hay mensajes', 'Sé la primera persona en dejar un recuerdo aquí.');
      return;
    }
    cont.innerHTML = data.map(mensajeHtml).join('');
  } catch {
    cont.innerHTML = estadoVacioHtml('No se pudieron cargar los mensajes', 'Intenta recargar la página.');
  }
}

function mensajeHtml(c) {
  const inicial = (c.nombre || '?').trim().charAt(0).toUpperCase();
  const foto = urlDe(c.archivo);
  return `
  <div class="san-mensaje tarjeta tarjeta-hilo">
    <div class="san-mensaje-cabecera">
      <span class="san-mensaje-avatar">${escapeHtml(inicial)}</span>
      <strong>${escapeHtml(c.nombre)}</strong>
      <span>${escapeHtml(formatearFecha(c.created_at))}</span>
    </div>
    ${c.mensaje ? `<p>${escapeHtml(c.mensaje)}</p>` : ''}
    ${foto ? `<img src="${foto}" alt="Foto de ${escapeHtml(c.nombre)}" loading="lazy" />` : ''}
  </div>`;
}

function activarFormularioMensaje() {
  const form = document.getElementById('sanFormMensaje');
  if (form.hidden) return;

  const btnAdjuntar = document.getElementById('btnAdjuntarFoto');
  const inputAdjunto = document.getElementById('inputAdjunto');
  const preview = document.getElementById('adjuntoPreview');

  btnAdjuntar.addEventListener('click', () => inputAdjunto.click());
  inputAdjunto.addEventListener('change', () => {
    const file = inputAdjunto.files[0];
    if (!file) return;
    try {
      validarArchivo(file);
    } catch (e) {
      toast.error(e.message);
      inputAdjunto.value = '';
      return;
    }
    archivoAdjunto = file;
    preview.src = URL.createObjectURL(file);
    preview.style.display = 'block';
    btnAdjuntar.textContent = 'Cambiar foto';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = form.nombre.value.trim();
    const mensaje = form.mensaje.value.trim();

    if (!nombre) {
      toast.error('Cuéntanos quién eres antes de enviar el mensaje.');
      return;
    }
    if (!mensaje && !archivoAdjunto) {
      toast.error('Escribe un mensaje o adjunta una foto.');
      return;
    }

    const btn = document.getElementById('btnEnviarMensaje');
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Enviando…';

    try {
      let archivoId = null;
      if (archivoAdjunto) {
        const { archivo } = await subirArchivo({ santuarioId: santuario.id, file: archivoAdjunto, destino: 'comentario' });
        archivoId = archivo.id;
      }

      const { error } = await tabla('comentarios').insert({
        santuario_id: santuario.id,
        archivo_id: archivoId,
        nombre,
        mensaje: mensaje || null,
      });
      if (error) throw error;

      toast.exito('¡Gracias! Tu mensaje quedará visible en cuanto sea revisado.');
      form.reset();
      archivoAdjunto = null;
      preview.style.display = 'none';
      btnAdjuntar.textContent = '+ Adjuntar una foto';
    } catch {
      toast.error('No se pudo enviar tu mensaje. Inténtalo de nuevo.');
    } finally {
      btn.disabled = false;
      btn.textContent = textoOriginal;
    }
  });
}

/* =============================================================================
   COMPARTIR
   ============================================================================= */

function activarCompartir() {
  document.getElementById('btnCompartir').addEventListener('click', abrirMenuCompartir);
  document.getElementById('btnCompartir2').addEventListener('click', abrirMenuCompartir);
}

async function abrirMenuCompartir() {
  if (!santuario) return;
  const url = urlPublicaSantuario(santuario.slug);

  if (navigator.share) {
    const ok = await compartirSantuario({ slug: santuario.slug, nombre: santuario.nombre });
    if (ok) return;
  }

  abrirModal({
    titulo: 'Compartir este santuario',
    contenidoHtml: `
      <div class="san-compartir-menu">
        <button type="button" data-accion="copiar">Copiar enlace</button>
        <a href="https://wa.me/?text=${encodeURIComponent(`Visita el santuario digital de ${santuario.nombre}: ${url}`)}" target="_blank" rel="noopener">WhatsApp</a>
        <a href="mailto:?subject=${encodeURIComponent(`Santuario digital de ${santuario.nombre}`)}&body=${encodeURIComponent(url)}">Correo</a>
      </div>
    `,
  });

  document.querySelector('[data-accion="copiar"]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.exito('Enlace copiado.');
    } catch {
      toast.error('No se pudo copiar el enlace.');
    }
  });
}

/* =============================================================================
   PANTALLA COMPLETA
   ============================================================================= */

function activarPantallaCompleta() {
  document.getElementById('btnPantallaCompleta').addEventListener('click', () => {
    document.body.classList.toggle('san-cuerpo-fullscreen');
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  });
}

/* =============================================================================
   REVELADO AL HACER SCROLL (idéntico a app.js, replicado porque cada
   entrypoint de página es independiente)
   ============================================================================= */

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
    { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
  );
  elementos.forEach((el) => observador.observe(el));
}
