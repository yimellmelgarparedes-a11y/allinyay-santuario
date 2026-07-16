/**
 * ALLINYAY · js/dashboard.js
 * -----------------------------------------------------------------------------
 * Punto de entrada del panel de administración (dashboard.html). Orquesta:
 *   - Autenticación y navbar de administrador
 *   - Resumen (stats + comentarios pendientes de todos los santuarios)
 *   - Listado de santuarios (buscar, filtrar, crear, duplicar, eliminar)
 *   - Editor de un santuario: Contenido / Multimedia / Comentarios / QR
 * Todos los datos vienen de Supabase; no hay estado que sobreviva a un
 * refresh salvo lo que ya está guardado en la base de datos.
 * -----------------------------------------------------------------------------
 */
import { requerirSesion, obtenerPerfil } from './auth.js';
import { tabla, storageBucket } from './supabase.js';
import { validarArchivo, subirArchivo, eliminarArchivo } from './storage.js';
import { urlPublicaSantuario, dibujarQr, descargarDataUrl, compartirSantuario } from './qr.js';
import { escapeHtml, formatearFecha, debounce, copiarAlPortapapeles } from './utils.js';
import { renderNavbar } from '../components/navbar.js';
import { abrirModal, confirmarAccion } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { botonCargando, actualizarBarraProgreso } from '../components/loader.js';

/* =============================================================================
   ESTADO DEL MÓDULO
   ============================================================================= */
let usuarioActual = null;
let santuariosCache = [];
let filtroTexto = '';
let filtroEstadoActual = '';

let santuarioActivo = null;
let recuerdosCache = [];
let comentariosCache = [];
let multimediaCargada = false;
let comentariosCargados = false;
let qrCargado = false;
let qrPngActual = null;
let qrSvgActual = null;

/* =============================================================================
   ARRANQUE
   ============================================================================= */
document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    usuarioActual = await requerirSesion();
  } catch {
    return; // requerirSesion ya redirige a /login.html
  }

  const perfil = await obtenerPerfil();
  renderNavbar(document.getElementById('navbar'), 'admin', {
    nombreUsuario: perfil?.nombre || usuarioActual.email,
  });
  document.getElementById('saludoNombre').textContent = perfil?.nombre ? `, ${perfil.nombre}` : '';

  configurarSidebar();
  configurarListaSantuarios();
  configurarEditor();

  await Promise.all([cargarResumen(), cargarSantuarios()]);
}

/* =============================================================================
   NAVEGACIÓN ENTRE VISTAS
   ============================================================================= */
function mostrarVista(nombre) {
  document.querySelectorAll('.dash-vista').forEach((v) => v.classList.remove('dash-vista-activa'));
  const mapa = { resumen: 'vistaResumen', santuarios: 'vistaSantuarios', editor: 'vistaEditor' };
  document.getElementById(mapa[nombre]).classList.add('dash-vista-activa');
  document.querySelectorAll('.dash-nav-item').forEach((b) => {
    b.classList.toggle('dash-nav-activo', b.dataset.vista === nombre);
  });
  window.scrollTo({ top: 0, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
}

function configurarSidebar() {
  document.querySelectorAll('.dash-nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      mostrarVista(btn.dataset.vista);
      if (btn.dataset.vista === 'santuarios') pintarSantuarios();
    });
  });
}

/* =============================================================================
   RESUMEN
   ============================================================================= */
async function cargarResumen() {
  const { data: lista } = await tabla('santuarios').select('id, estado').eq('usuario_id', usuarioActual.id);
  const todos = lista || [];
  const ids = todos.map((s) => s.id);

  let visitasTotal = 0;
  let pendientes = [];

  if (ids.length) {
    const { count } = await tabla('visitas').select('id', { count: 'exact', head: true }).in('santuario_id', ids);
    visitasTotal = count || 0;

    const { data: pend } = await tabla('comentarios')
      .select('*, santuario:santuario_id(nombre)')
      .in('santuario_id', ids)
      .eq('aprobado', false)
      .order('created_at', { ascending: false })
      .limit(8);
    pendientes = pend || [];
  }

  const grid = document.getElementById('statsGrid');
  grid.innerHTML = [
    tarjetaStat(iconoSantuario(), todos.length, 'Santuarios en total'),
    tarjetaStat(iconoLlama(), todos.filter((s) => s.estado === 'activo').length, 'Activos'),
    tarjetaStat(iconoOjo(), visitasTotal, 'Visitas totales'),
    tarjetaStat(iconoMensaje(), pendientes.length, 'Mensajes por aprobar'),
  ].join('');

  pintarPendientes(pendientes);
}

function pintarPendientes(lista) {
  const cont = document.getElementById('pendientesLista');
  if (!lista.length) {
    cont.innerHTML = estadoVacioHtml('Todo al día', 'No tienes mensajes pendientes de moderar por ahora.');
    return;
  }
  cont.innerHTML = `<div class="comentarios-lista">${lista
    .map(
      (c) => `
    <div class="comentario-fila comentario-fila-pendiente">
      <div class="comentario-cuerpo">
        <strong>${escapeHtml(c.nombre)}</strong>
        <p>${escapeHtml(c.mensaje || '')}</p>
        <span>De "${escapeHtml(c.santuario?.nombre || 'un santuario')}" · ${formatearFecha(c.created_at)}</span>
      </div>
      <div class="comentario-acciones">
        <button class="comentario-aprobar" data-accion="aprobar" data-id="${c.id}" aria-label="Aprobar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
        </button>
        <button class="comentario-borrar" data-accion="borrar-comentario" data-id="${c.id}" aria-label="Eliminar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>
    </div>`
    )
    .join('')}</div>`;
}

// Delegación de clics para el panel de pendientes (resumen).
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('pendientesLista').addEventListener('click', (e) => {
    const aprobar = e.target.closest('[data-accion="aprobar"]');
    if (aprobar) return aprobarComentario(aprobar.dataset.id, true);
    const borrar = e.target.closest('[data-accion="borrar-comentario"]');
    if (borrar) return borrarComentario(borrar.dataset.id, true);
  });
});

function tarjetaStat(icono, valor, etiqueta) {
  return `<div class="dash-stat"><div class="dash-stat-icono">${icono}</div><strong>${valor}</strong><span>${etiqueta}</span></div>`;
}

/* =============================================================================
   LISTADO DE SANTUARIOS
   ============================================================================= */
function configurarListaSantuarios() {
  document.getElementById('btnNuevoSantuario').addEventListener('click', crearSantuario);

  document.getElementById('buscarSantuario').addEventListener(
    'input',
    debounce((e) => {
      filtroTexto = e.target.value;
      pintarSantuarios();
    }, 250)
  );

  document.getElementById('filtroEstado').addEventListener('change', (e) => {
    filtroEstadoActual = e.target.value;
    pintarSantuarios();
  });

  document.getElementById('santuariosGrid').addEventListener('click', (e) => {
    const dup = e.target.closest('[data-accion="duplicar"]');
    if (dup) {
      e.stopPropagation();
      return duplicarSantuario(dup.closest('.santuario-card').dataset.id);
    }
    const del = e.target.closest('[data-accion="eliminar"]');
    if (del) {
      e.stopPropagation();
      return eliminarSantuarioFn(del.closest('.santuario-card').dataset.id);
    }
    const card = e.target.closest('.santuario-card');
    if (card) abrirEditor(card.dataset.id);
  });

  document.getElementById('btnVolverLista').addEventListener('click', () => {
    mostrarVista('santuarios');
    pintarSantuarios();
  });
}

async function cargarSantuarios() {
  const grid = document.getElementById('santuariosGrid');
  const { data, error } = await tabla('santuarios')
    .select('*')
    .eq('usuario_id', usuarioActual.id)
    .order('created_at', { ascending: false });

  if (error) {
    grid.innerHTML = estadoVacioHtml('No se pudieron cargar tus santuarios', 'Recarga la página o inténtalo más tarde.');
    return;
  }
  santuariosCache = data || [];
  pintarSantuarios();
}

function pintarSantuarios() {
  const grid = document.getElementById('santuariosGrid');
  const texto = filtroTexto.trim().toLowerCase();
  const filtrados = santuariosCache.filter((s) => {
    const coincideTexto = !texto || s.nombre.toLowerCase().includes(texto);
    const coincideEstado = !filtroEstadoActual || s.estado === filtroEstadoActual;
    return coincideTexto && coincideEstado;
  });

  if (!filtrados.length) {
    grid.innerHTML = estadoVacioHtml(
      santuariosCache.length ? 'Nada coincide con tu búsqueda' : 'Aún no tienes santuarios',
      santuariosCache.length ? 'Prueba con otro término o cambia el filtro.' : 'Crea el primero con el botón "+ Nuevo santuario".'
    );
    return;
  }

  grid.innerHTML = filtrados.map(tarjetaSantuarioHtml).join('');
}

function tarjetaSantuarioHtml(s) {
  const estiloMedia = s.portada_url ? ` style="background-image:url('${s.portada_url}')"` : '';
  return `
  <div class="santuario-card" data-id="${s.id}" tabindex="0">
    <div class="santuario-card-menu">
      <button data-accion="duplicar" aria-label="Duplicar" title="Duplicar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
      </button>
      <button data-accion="eliminar" aria-label="Eliminar" title="Eliminar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      </button>
    </div>
    <div class="santuario-card-media"${estiloMedia}>${s.portada_url ? '' : iconoLlama()}</div>
    <div class="santuario-card-body">
      <h3>${escapeHtml(s.nombre)}</h3>
      <p>/s/${escapeHtml(s.slug)}</p>
      <div class="santuario-card-pie">
        <span class="badge badge-${s.estado}">${s.estado}</span>
      </div>
    </div>
  </div>`;
}

async function crearSantuario() {
  const restaurar = botonCargando(document.getElementById('btnNuevoSantuario'), 'Creando…');
  try {
    const { data, error } = await tabla('santuarios')
      .insert({ usuario_id: usuarioActual.id, nombre: 'Nuevo santuario', estado: 'borrador', publicado: false })
      .select()
      .single();
    if (error) throw error;
    santuariosCache.unshift(data);
    toast.exito('Santuario creado. Ahora complétalo.');
    abrirEditor(data.id);
  } catch {
    toast.error('No se pudo crear el santuario.');
  } finally {
    restaurar();
  }
}

async function duplicarSantuario(id) {
  const original = santuariosCache.find((s) => s.id === id);
  if (!original) return;
  const confirmado = await confirmarAccion({
    titulo: 'Duplicar santuario',
    mensaje: `Se creará una copia de "${escapeHtml(original.nombre)}" con el mismo contenido y estilo (sin fotos, videos ni audios).`,
    textoConfirmar: 'Duplicar',
  });
  if (!confirmado) return;

  const { id: _id, slug: _slug, created_at, updated_at, portada_url, foto_principal_url, ...resto } = original;
  const { data, error } = await tabla('santuarios')
    .insert({ ...resto, nombre: `${resto.nombre} (copia)`, estado: 'borrador', publicado: false })
    .select()
    .single();

  if (error) {
    toast.error('No se pudo duplicar el santuario.');
    return;
  }
  santuariosCache.unshift(data);
  pintarSantuarios();
  toast.exito('Santuario duplicado.');
}

async function eliminarSantuarioFn(id) {
  const s = santuariosCache.find((x) => x.id === id);
  if (!s) return;
  const confirmado = await confirmarAccion({
    titulo: 'Eliminar santuario',
    mensaje: `Esto borrará "${escapeHtml(s.nombre)}" junto con sus fotos, videos, audios y mensajes. Esta acción no se puede deshacer.`,
    textoConfirmar: 'Eliminar',
    peligroso: true,
  });
  if (!confirmado) return;

  try {
    const { data: archivos } = await tabla('archivos').select('id').eq('santuario_id', id);
    for (const a of archivos || []) {
      try {
        await eliminarArchivo(a.id);
      } catch {
        /* si un archivo falla al borrarse del storage, seguimos con el resto */
      }
    }
    const { error } = await tabla('santuarios').delete().eq('id', id);
    if (error) throw error;
    santuariosCache = santuariosCache.filter((x) => x.id !== id);
    pintarSantuarios();
    toast.exito('Santuario eliminado.');
  } catch {
    toast.error('No se pudo eliminar el santuario.');
  }
}

/* =============================================================================
   EDITOR — configuración general (tabs + volver)
   ============================================================================= */
function configurarEditor() {
  document.querySelectorAll('.editor-tab').forEach((btn) => {
    btn.addEventListener('click', () => cambiarTabEditor(btn.dataset.tab));
  });
  configurarFormularioContenido();
  configurarMultimedia();
  configurarComentarios();
  configurarQr();
}

async function abrirEditor(id) {
  let s = santuariosCache.find((x) => x.id === id);
  if (!s) {
    const { data } = await tabla('santuarios').select('*').eq('id', id).single();
    s = data;
  }
  if (!s) {
    toast.error('No se encontró el santuario.');
    return;
  }
  santuarioActivo = s;
  multimediaCargada = false;
  comentariosCargados = false;
  qrCargado = false;

  mostrarVista('editor');
  poblarFormularioContenido(s);
  actualizarCabeceraEditor(s);
  cambiarTabEditor('contenido');
}

function actualizarCabeceraEditor(s) {
  document.getElementById('editorTitulo').textContent = s.nombre || 'Sin nombre';
  document.getElementById('editorSlug').textContent = `/s/${s.slug}`;
  const badge = document.getElementById('editorEstadoBadge');
  badge.textContent = s.estado;
  badge.className = `badge badge-${s.estado}`;
  document.getElementById('btnVerPublico').href = urlPublicaSantuario(s.slug);
}

function cambiarTabEditor(tab) {
  document.querySelectorAll('.editor-tab').forEach((b) => {
    const activo = b.dataset.tab === tab;
    b.classList.toggle('editor-tab-activo', activo);
    b.setAttribute('aria-selected', String(activo));
  });
  document.querySelectorAll('.editor-panel').forEach((p) => {
    p.hidden = p.dataset.panel !== tab;
  });
  if (tab === 'multimedia' && !multimediaCargada) {
    multimediaCargada = true;
    cargarMultimedia();
  }
  if (tab === 'comentarios' && !comentariosCargados) {
    comentariosCargados = true;
    cargarComentarios();
  }
  if (tab === 'qr' && !qrCargado) {
    qrCargado = true;
    cargarQr();
  }
}

/* =============================================================================
   EDITOR — TAB CONTENIDO
   ============================================================================= */
function configurarFormularioContenido() {
  const colorPrimario = document.getElementById('cColorPrimario');
  const colorPrimarioTexto = document.getElementById('cColorPrimarioTexto');
  const colorFondo = document.getElementById('cColorFondo');
  const colorFondoTexto = document.getElementById('cColorFondoTexto');
  sincronizarColor(colorPrimario, colorPrimarioTexto);
  sincronizarColor(colorFondo, colorFondoTexto);

  document.getElementById('formContenido').addEventListener('submit', guardarContenido);
}

function sincronizarColor(inputColor, inputTexto) {
  inputColor.addEventListener('input', () => (inputTexto.value = inputColor.value));
  inputTexto.addEventListener('input', () => {
    if (/^#([0-9a-f]{3}){1,2}$/i.test(inputTexto.value)) inputColor.value = inputTexto.value;
  });
}

function poblarFormularioContenido(s) {
  const form = document.getElementById('formContenido');
  form.nombre.value = s.nombre || '';
  form.historia.value = s.historia || '';
  form.fecha_conmemoracion.value = s.fecha_conmemoracion || '';
  form.cuidado_por.value = s.cuidado_por || '';
  form.tipografia.value = s.tipografia || 'Fraunces';
  form.plantilla.value = s.plantilla || 'clasico';
  form.mapa_lat.value = s.mapa_lat ?? '';
  form.mapa_lng.value = s.mapa_lng ?? '';
  form.estado.value = s.estado || 'borrador';
  form.publicado.checked = !!s.publicado;
  form.comentarios_activos.checked = !!s.comentarios_activos;

  document.getElementById('cColorPrimario').value = s.color_primario || '#d3a34e';
  document.getElementById('cColorPrimarioTexto').value = s.color_primario || '#d3a34e';
  document.getElementById('cColorFondo').value = s.color_fondo || '#130f1e';
  document.getElementById('cColorFondoTexto').value = s.color_fondo || '#130f1e';
}

async function guardarContenido(e) {
  e.preventDefault();
  const form = e.target;
  const restaurar = botonCargando(document.getElementById('btnGuardarContenido'), 'Guardando…');

  const cambios = {
    nombre: form.nombre.value.trim() || 'Sin nombre',
    historia: form.historia.value.trim(),
    fecha_conmemoracion: form.fecha_conmemoracion.value.trim() || null,
    cuidado_por: form.cuidado_por.value.trim() || null,
    tipografia: form.tipografia.value,
    plantilla: form.plantilla.value,
    color_primario: document.getElementById('cColorPrimarioTexto').value || '#d3a34e',
    color_fondo: document.getElementById('cColorFondoTexto').value || '#130f1e',
    mapa_lat: form.mapa_lat.value ? Number(form.mapa_lat.value) : null,
    mapa_lng: form.mapa_lng.value ? Number(form.mapa_lng.value) : null,
    estado: form.estado.value,
    publicado: form.publicado.checked,
    comentarios_activos: form.comentarios_activos.checked,
  };

  try {
    const { data, error } = await tabla('santuarios').update(cambios).eq('id', santuarioActivo.id).select().single();
    if (error) throw error;
    santuarioActivo = data;
    const idx = santuariosCache.findIndex((x) => x.id === data.id);
    if (idx > -1) santuariosCache[idx] = data;
    actualizarCabeceraEditor(data);
    mostrarGuardado();
    toast.exito('Cambios guardados.');
  } catch {
    toast.error('No se pudieron guardar los cambios.');
  } finally {
    restaurar();
  }
}

let temporizadorGuardado;
function mostrarGuardado() {
  const el = document.getElementById('editorGuardadoTexto');
  el.textContent = 'Guardado ✓';
  el.classList.add('visible');
  clearTimeout(temporizadorGuardado);
  temporizadorGuardado = setTimeout(() => el.classList.remove('visible'), 2200);
}

/* =============================================================================
   EDITOR — TAB MULTIMEDIA
   ============================================================================= */
function configurarMultimedia() {
  configurarUploaderSlot('uploaderPortada');
  configurarUploaderSlot('uploaderPrincipal');

  document.getElementById('btnSubirRecuerdo').addEventListener('click', () => {
    document.getElementById('inputRecuerdoArchivo').click();
  });
  document.getElementById('inputRecuerdoArchivo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) subirRecuerdoArchivo(file);
    e.target.value = '';
  });
  document.getElementById('btnAgregarFrase').addEventListener('click', abrirModalFrase);

  document.getElementById('recuerdosGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-accion="borrar-recuerdo"]');
    if (btn) borrarRecuerdo(btn.dataset.id);
  });
}

function configurarUploaderSlot(id) {
  const caja = document.getElementById(id);
  const input = caja.querySelector('input[type="file"]');
  const campo = caja.dataset.campo;

  caja.addEventListener('click', () => input.click());
  caja.addEventListener('dragover', (e) => {
    e.preventDefault();
    caja.classList.add('uploader-arrastrando');
  });
  caja.addEventListener('dragleave', () => caja.classList.remove('uploader-arrastrando'));
  caja.addEventListener('drop', (e) => {
    e.preventDefault();
    caja.classList.remove('uploader-arrastrando');
    const file = e.dataTransfer.files[0];
    if (file) subirImagenPortada(caja, file, campo);
  });
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (file) subirImagenPortada(caja, file, campo);
    input.value = '';
  });
}

async function cargarMultimedia() {
  pintarUploaderPreview('uploaderPortada', santuarioActivo.portada_url);
  pintarUploaderPreview('uploaderPrincipal', santuarioActivo.foto_principal_url);

  const grid = document.getElementById('recuerdosGrid');
  grid.innerHTML = '<div class="loading-row"><span class="spin"></span> Cargando galería…</div>';

  const { data, error } = await tabla('recuerdos')
    .select('*, archivo:archivo_id(*)')
    .eq('santuario_id', santuarioActivo.id)
    .order('orden', { ascending: true });

  if (error) {
    grid.innerHTML = estadoVacioHtml('No se pudo cargar la galería', 'Intenta recargar la página.');
    return;
  }
  recuerdosCache = data || [];
  pintarRecuerdos();
}

function pintarUploaderPreview(cajaId, url) {
  const caja = document.getElementById(cajaId);
  const vacio = caja.querySelector('.uploader-vacio');
  const img = caja.querySelector('.uploader-preview');
  if (url) {
    img.src = url;
    img.hidden = false;
    vacio.hidden = true;
  } else {
    img.hidden = true;
    vacio.hidden = false;
  }
}

async function subirImagenPortada(caja, file, campo) {
  try {
    validarArchivo(file);
  } catch (e) {
    toast.error(e.message);
    return;
  }
  const progresoEl = document.createElement('div');
  progresoEl.className = 'ay-progreso';
  progresoEl.innerHTML = '<div class="ay-progreso-barra"></div>';
  caja.appendChild(progresoEl);

  try {
    const { url } = await subirArchivo({
      santuarioId: santuarioActivo.id,
      file,
      destino: 'cover',
      onProgreso: (p) => actualizarBarraProgreso(progresoEl, p),
    });
    const { data, error } = await tabla('santuarios').update({ [campo]: url }).eq('id', santuarioActivo.id).select().single();
    if (error) throw error;
    santuarioActivo = data;
    const idx = santuariosCache.findIndex((x) => x.id === data.id);
    if (idx > -1) santuariosCache[idx] = data;
    pintarUploaderPreview(caja.id, url);
    toast.exito('Imagen subida.');
  } catch (e) {
    toast.error(e.message || 'No se pudo subir la imagen.');
  } finally {
    progresoEl.remove();
  }
}

async function subirRecuerdoArchivo(file) {
  let tipoDetectado;
  try {
    tipoDetectado = validarArchivo(file);
  } catch (e) {
    toast.error(e.message);
    return;
  }
  toast.info('Subiendo archivo…');
  try {
    const { archivo } = await subirArchivo({ santuarioId: santuarioActivo.id, file, destino: tipoDetectado });
    const { data, error } = await tabla('recuerdos')
      .insert({
        santuario_id: santuarioActivo.id,
        archivo_id: archivo.id,
        tipo: tipoDetectado,
        orden: recuerdosCache.length,
        creado_por: usuarioActual.id,
      })
      .select('*, archivo:archivo_id(*)')
      .single();
    if (error) throw error;
    recuerdosCache.push(data);
    pintarRecuerdos();
    toast.exito('Agregado a la galería.');
  } catch (e) {
    toast.error(e.message || 'No se pudo subir el archivo.');
  }
}

function abrirModalFrase() {
  const cerrar = abrirModal({
    titulo: 'Agregar frase o evento',
    contenidoHtml: `
      <div class="modal-campo">
        <label for="fraseTipo">Tipo</label>
        <select id="fraseTipo">
          <option value="frase">Frase</option>
          <option value="evento">Evento</option>
        </select>
      </div>
      <div class="modal-campo">
        <label for="fraseTitulo">Título</label>
        <input id="fraseTitulo" type="text" placeholder="Ej: El día que llegó a casa" />
      </div>
      <div class="modal-campo">
        <label for="fraseDescripcion">Descripción</label>
        <textarea id="fraseDescripcion" rows="3" placeholder="Cuenta este momento…"></textarea>
      </div>
    `,
    acciones: [
      { texto: 'Cancelar', clase: 'btn-ghost', onClick: () => cerrar() },
      {
        texto: 'Agregar',
        clase: 'btn',
        onClick: () => {
          const tipo = document.getElementById('fraseTipo').value;
          const titulo = document.getElementById('fraseTitulo').value.trim();
          const descripcion = document.getElementById('fraseDescripcion').value.trim();
          cerrar();
          crearRecuerdoTexto(tipo, titulo, descripcion);
        },
      },
    ],
  });
}

async function crearRecuerdoTexto(tipo, titulo, descripcion) {
  try {
    const { data, error } = await tabla('recuerdos')
      .insert({
        santuario_id: santuarioActivo.id,
        tipo,
        titulo: titulo || null,
        descripcion: descripcion || null,
        orden: recuerdosCache.length,
        creado_por: usuarioActual.id,
      })
      .select()
      .single();
    if (error) throw error;
    recuerdosCache.push(data);
    pintarRecuerdos();
    toast.exito('Agregado a la galería.');
  } catch {
    toast.error('No se pudo agregar.');
  }
}

function pintarRecuerdos() {
  const grid = document.getElementById('recuerdosGrid');
  if (!recuerdosCache.length) {
    grid.innerHTML = estadoVacioHtml('Galería vacía', 'Sube fotos, videos o audios, o agrega una frase.');
    return;
  }
  grid.innerHTML = recuerdosCache.map(recuerdoTileHtml).join('');
}

function recuerdoTileHtml(r) {
  let contenido;
  if ((r.tipo === 'imagen' || r.tipo === 'video') && r.archivo?.ruta) {
    const { data: urlData } = storageBucket().getPublicUrl(r.archivo.ruta);
    contenido =
      r.tipo === 'imagen'
        ? `<img src="${urlData.publicUrl}" alt="${escapeHtml(r.titulo || 'Recuerdo')}" loading="lazy" />`
        : `<video src="${urlData.publicUrl}" muted></video>`;
  } else if (r.tipo === 'audio') {
    contenido = `<div class="recuerdo-item-frase">♪ ${escapeHtml(r.titulo || 'Audio')}</div>`;
  } else {
    contenido = `<div class="recuerdo-item-frase">"${escapeHtml(r.titulo || r.descripcion || 'Sin título')}"</div>`;
  }
  return `
  <div class="recuerdo-item" data-id="${r.id}">
    ${contenido}
    ${r.destacado ? '<span class="recuerdo-destacado-marca">Destacado</span>' : ''}
    <button class="recuerdo-borrar" data-accion="borrar-recuerdo" data-id="${r.id}" aria-label="Eliminar recuerdo">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
    </button>
  </div>`;
}

async function borrarRecuerdo(id) {
  const confirmado = await confirmarAccion({
    titulo: 'Eliminar recuerdo',
    mensaje: 'Esto quitará este elemento de la galería del santuario.',
    textoConfirmar: 'Eliminar',
    peligroso: true,
  });
  if (!confirmado) return;

  const r = recuerdosCache.find((x) => x.id === id);
  try {
    if (r?.archivo_id) {
      try {
        await eliminarArchivo(r.archivo_id);
      } catch {
        /* si falla borrar el archivo del storage, igual quitamos la fila de recuerdos */
      }
    }
    const { error } = await tabla('recuerdos').delete().eq('id', id);
    if (error) throw error;
    recuerdosCache = recuerdosCache.filter((x) => x.id !== id);
    pintarRecuerdos();
    toast.exito('Eliminado.');
  } catch {
    toast.error('No se pudo eliminar.');
  }
}

/* =============================================================================
   EDITOR — TAB COMENTARIOS
   ============================================================================= */
function configurarComentarios() {
  document.getElementById('comentariosLista').addEventListener('click', (e) => {
    const aprobar = e.target.closest('[data-accion="aprobar"]');
    if (aprobar) return aprobarComentario(aprobar.dataset.id, false);
    const borrar = e.target.closest('[data-accion="borrar-comentario"]');
    if (borrar) return borrarComentario(borrar.dataset.id, false);
  });
}

async function cargarComentarios() {
  const cont = document.getElementById('comentariosLista');
  cont.innerHTML = '<div class="loading-row"><span class="spin"></span> Cargando comentarios…</div>';
  const { data, error } = await tabla('comentarios')
    .select('*')
    .eq('santuario_id', santuarioActivo.id)
    .order('created_at', { ascending: false });
  if (error) {
    cont.innerHTML = estadoVacioHtml('No se pudieron cargar', 'Intenta de nuevo más tarde.');
    return;
  }
  comentariosCache = data || [];
  pintarComentarios();
}

function pintarComentarios() {
  const cont = document.getElementById('comentariosLista');
  if (!comentariosCache.length) {
    cont.innerHTML = estadoVacioHtml('Sin mensajes todavía', 'Cuando alguien deje un mensaje aparecerá aquí para tu aprobación.');
    return;
  }
  cont.innerHTML = comentariosCache.map(comentarioFilaHtml).join('');
}

function comentarioFilaHtml(c) {
  return `
  <div class="comentario-fila ${!c.aprobado ? 'comentario-fila-pendiente' : ''}">
    <div class="comentario-cuerpo">
      <strong>${escapeHtml(c.nombre)}</strong>
      <p>${escapeHtml(c.mensaje || '')}</p>
      <span>${formatearFecha(c.created_at)} · ${c.aprobado ? 'Publicado' : 'Pendiente de aprobación'}</span>
    </div>
    <div class="comentario-acciones">
      ${
        !c.aprobado
          ? `<button class="comentario-aprobar" data-accion="aprobar" data-id="${c.id}" aria-label="Aprobar"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg></button>`
          : ''
      }
      <button class="comentario-borrar" data-accion="borrar-comentario" data-id="${c.id}" aria-label="Eliminar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      </button>
    </div>
  </div>`;
}

/** @param {boolean} desdeResumen si la acción viene del panel "Resumen" (para saber qué repintar) */
async function aprobarComentario(id, desdeResumen) {
  try {
    const { error } = await tabla('comentarios').update({ aprobado: true }).eq('id', id);
    if (error) throw error;
    toast.exito('Mensaje aprobado.');
    if (desdeResumen) {
      cargarResumen();
    } else {
      const idx = comentariosCache.findIndex((x) => x.id === id);
      if (idx > -1) comentariosCache[idx].aprobado = true;
      pintarComentarios();
      cargarResumen();
    }
  } catch {
    toast.error('No se pudo aprobar el mensaje.');
  }
}

async function borrarComentario(id, desdeResumen) {
  const confirmado = await confirmarAccion({
    titulo: 'Eliminar mensaje',
    mensaje: 'El mensaje se eliminará para siempre.',
    textoConfirmar: 'Eliminar',
    peligroso: true,
  });
  if (!confirmado) return;
  try {
    const { error } = await tabla('comentarios').delete().eq('id', id);
    if (error) throw error;
    toast.exito('Eliminado.');
    if (desdeResumen) {
      cargarResumen();
    } else {
      comentariosCache = comentariosCache.filter((x) => x.id !== id);
      pintarComentarios();
      cargarResumen();
    }
  } catch {
    toast.error('No se pudo eliminar.');
  }
}

/* =============================================================================
   EDITOR — TAB QR & ESTADÍSTICAS
   ============================================================================= */
function configurarQr() {
  document.getElementById('btnCopiarLink').addEventListener('click', async () => {
    const ok = await copiarAlPortapapeles(urlPublicaSantuario(santuarioActivo.slug));
    toast[ok ? 'exito' : 'error'](ok ? 'Enlace copiado.' : 'No se pudo copiar el enlace.');
  });
  document.getElementById('btnDescargarPng').addEventListener('click', () => {
    if (qrPngActual) descargarDataUrl(qrPngActual, `qr-${santuarioActivo.slug}.png`);
  });
  document.getElementById('btnDescargarSvg').addEventListener('click', () => {
    if (qrSvgActual) descargarDataUrl(qrSvgActual, `qr-${santuarioActivo.slug}.svg`);
  });
  document.getElementById('btnCompartirQr').addEventListener('click', async () => {
    const ok = await compartirSantuario({ slug: santuarioActivo.slug, nombre: santuarioActivo.nombre });
    if (!ok) {
      const copiado = await copiarAlPortapapeles(urlPublicaSantuario(santuarioActivo.slug));
      toast.info(copiado ? 'Tu navegador no soporta compartir directo: copiamos el enlace.' : 'Copia el enlace manualmente para compartirlo.');
    }
  });
}

async function cargarQr() {
  const urlPublica = urlPublicaSantuario(santuarioActivo.slug);
  document.getElementById('qrUrlTexto').textContent = urlPublica;

  const contenedor = document.getElementById('qrDibujo');
  contenedor.innerHTML = '<div class="loading-row"><span class="spin"></span> Generando QR…</div>';
  try {
    const { png, svg } = await dibujarQr({
      contenedor,
      texto: urlPublica,
      colorOscuro: santuarioActivo.color_fondo || '#130f1e',
      colorClaro: '#ffffff',
    });
    qrPngActual = png;
    qrSvgActual = svg;
  } catch {
    toast.error('No se pudo generar el QR.');
  }

  const { data: qrRow } = await tabla('qr').select('*').eq('santuario_id', santuarioActivo.id).single();
  document.getElementById('qrVecesEscaneado').textContent = qrRow?.veces_escaneado ?? 0;

  const { count: visitasCount } = await tabla('visitas')
    .select('id', { count: 'exact', head: true })
    .eq('santuario_id', santuarioActivo.id);
  document.getElementById('qrVisitasTotal').textContent = visitasCount ?? 0;

  const { count: comentariosCount } = await tabla('comentarios')
    .select('id', { count: 'exact', head: true })
    .eq('santuario_id', santuarioActivo.id);
  document.getElementById('qrComentariosTotal').textContent = comentariosCount ?? 0;

  await pintarMiniChart();
}

async function pintarMiniChart() {
  const cont = document.getElementById('miniChart');
  const desde = new Date();
  desde.setDate(desde.getDate() - 6);

  const { data } = await tabla('estadisticas')
    .select('fecha, visitas_total')
    .eq('santuario_id', santuarioActivo.id)
    .gte('fecha', desde.toISOString().slice(0, 10))
    .order('fecha', { ascending: true });

  const porFecha = {};
  (data || []).forEach((d) => (porFecha[d.fecha] = d.visitas_total));

  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dias.push(d.toISOString().slice(0, 10));
  }
  const valores = dias.map((f) => porFecha[f] || 0);
  const max = Math.max(1, ...valores);

  cont.innerHTML = valores
    .map((v) => `<div class="mini-chart-barra" style="height:${Math.max(6, (v / max) * 100)}%" title="${v} visita(s)"></div>`)
    .join('');
}

/* =============================================================================
   AYUDANTES DE PLANTILLA
   ============================================================================= */
function estadoVacioHtml(titulo, texto) {
  return `
  <div class="estado-vacio">
    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 3c2 3-1 4-1 6.5a2.5 2.5 0 0 0 5 0c0-1.5-1-2.5-1-2.5s1.6 2.2 1.6 4.5a4.1 4.1 0 0 1-8.2 0c0-4.7 3.6-5.3 3.6-8.5z"/><path d="M4 21c1.6-2 4-3 8-3s6.4 1 8 3"/></svg>
    <h4>${titulo}</h4>
    <p>${texto}</p>
  </div>`;
}

function iconoSantuario() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="10" width="18" height="11" rx="1.5"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></svg>`;
}
function iconoLlama() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 3c2 3-1 4-1 6.5a2.5 2.5 0 0 0 5 0c0-1.5-1-2.5-1-2.5s1.6 2.2 1.6 4.5a4.1 4.1 0 0 1-8.2 0c0-4.7 3.6-5.3 3.6-8.5z"/></svg>`;
}
function iconoOjo() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
}
function iconoMensaje() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
}
