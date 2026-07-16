/**
 * ALLINYAY · storage.js
 * -----------------------------------------------------------------------------
 * Toda la lógica de Supabase Storage: construcción de rutas organizadas por
 * santuario, compresión/redimensionado de imágenes antes de subir, validación
 * de formato y tamaño, y registro del archivo en la tabla "archivos".
 *
 * Estructura de carpetas dentro del bucket (coincide con /policies/storage.sql):
 *   santuarios/{santuario_id}/cover/...
 *   santuarios/{santuario_id}/images/...
 *   santuarios/{santuario_id}/videos/...
 *   santuarios/{santuario_id}/audios/...
 *   santuarios/{santuario_id}/thumbnails/...
 *   santuarios/{santuario_id}/comentarios/...   (subidas de visitantes)
 * -----------------------------------------------------------------------------
 */
import { storageBucket, tabla } from './supabase.js';
import { CONFIG } from './config.js';
import { generarIdCorto, extensionDeArchivo } from './utils.js';

const CARPETAS = {
  cover: 'cover',
  imagen: 'images',
  video: 'videos',
  audio: 'audios',
  thumbnail: 'thumbnails',
  comentario: 'comentarios',
};

/**
 * Valida el tipo y tamaño de un archivo antes de subirlo.
 * @throws {Error} con un mensaje amigable si el archivo no es válido
 */
export function validarArchivo(file) {
  const esImagen = file.type.startsWith('image/');
  const esVideo = file.type.startsWith('video/');
  const esAudio = file.type.startsWith('audio/');

  if (!esImagen && !esVideo && !esAudio) {
    throw new Error('Formato no compatible. Elige una foto, un video o un audio.');
  }

  const mb = file.size / (1024 * 1024);
  if (esImagen && mb > CONFIG.LIMITES.imagenMB) {
    throw new Error(`La imagen pesa demasiado (máx. ${CONFIG.LIMITES.imagenMB} MB).`);
  }
  if (esVideo && mb > CONFIG.LIMITES.videoMB) {
    throw new Error(`El video pesa demasiado (máx. ${CONFIG.LIMITES.videoMB} MB). Prueba uno más corto.`);
  }
  if (esAudio && mb > CONFIG.LIMITES.audioMB) {
    throw new Error(`El audio pesa demasiado (máx. ${CONFIG.LIMITES.audioMB} MB).`);
  }

  return esImagen ? 'imagen' : esVideo ? 'video' : 'audio';
}

/**
 * Redimensiona y comprime una imagen en el navegador antes de subirla,
 * evitando así subir fotos de 12 MB directas de un celular.
 * @param {File} file
 * @param {number} maxDim ancho/alto máximo en píxeles
 * @returns {Promise<Blob>}
 */
export function comprimirImagen(file, maxDim = CONFIG.LIMITES.dimensionMaximaImagen) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) {
        height = Math.round(height * (maxDim / width));
        width = maxDim;
      } else if (height > maxDim) {
        width = Math.round(width * (maxDim / height));
        height = maxDim;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo comprimir la imagen.'))),
        'image/jpeg',
        0.82
      );
    };
    img.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Sube un archivo (recuerdo, portada, comentario) a la carpeta correspondiente
 * de un santuario, registra sus metadatos en la tabla "archivos" y devuelve
 * la fila creada junto a su URL pública/firmada.
 *
 * @param {object} opciones
 * @param {string} opciones.santuarioId
 * @param {File} opciones.file
 * @param {'cover'|'imagen'|'video'|'audio'|'comentario'} opciones.destino
 * @param {(porcentaje: number) => void} [opciones.onProgreso]
 * @returns {Promise<{archivo: object, url: string}>}
 */
export async function subirArchivo({ santuarioId, file, destino, onProgreso }) {
  const tipoDetectado = validarArchivo(file);
  const carpeta = CARPETAS[destino] || CARPETAS[tipoDetectado];

  let cuerpo = file;
  let contentType = file.type;
  if (tipoDetectado === 'imagen') {
    onProgreso?.(10);
    cuerpo = await comprimirImagen(file);
    contentType = 'image/jpeg';
  }

  const ext = tipoDetectado === 'imagen' ? 'jpg' : extensionDeArchivo(file.name);
  const nombreArchivo = `${generarIdCorto()}.${ext}`;
  const ruta = `santuarios/${santuarioId}/${carpeta}/${nombreArchivo}`;

  onProgreso?.(35);

  const bucket = storageBucket();
  const { error: errorSubida } = await bucket.upload(ruta, cuerpo, {
    contentType,
    upsert: false,
    cacheControl: '3600',
  });
  if (errorSubida) throw new Error('No se pudo subir el archivo. Revisa tu conexión e inténtalo de nuevo.');

  onProgreso?.(75);

  const { data: urlData } = bucket.getPublicUrl(ruta);

  const dimensiones = tipoDetectado === 'imagen' ? await obtenerDimensionesImagen(cuerpo) : {};

  const { data: filaArchivo, error: errorInsert } = await tabla('archivos')
    .insert({
      santuario_id: santuarioId,
      bucket: CONFIG.STORAGE_BUCKET,
      ruta,
      tipo: tipoDetectado,
      mime: contentType,
      tamano_bytes: cuerpo.size,
      ancho: dimensiones.width || null,
      alto: dimensiones.height || null,
    })
    .select()
    .single();

  if (errorInsert) throw new Error('El archivo se subió pero no se pudo registrar. Contacta a soporte.');

  onProgreso?.(100);

  return { archivo: filaArchivo, url: urlData.publicUrl };
}

/** Elimina un archivo del bucket y su fila de metadatos. */
export async function eliminarArchivo(archivoId) {
  const { data: fila, error: errorLectura } = await tabla('archivos')
    .select('ruta')
    .eq('id', archivoId)
    .single();
  if (errorLectura) throw errorLectura;

  const bucket = storageBucket();
  await bucket.remove([fila.ruta]);

  const { error: errorBorrado } = await tabla('archivos').delete().eq('id', archivoId);
  if (errorBorrado) throw errorBorrado;
}

function obtenerDimensionesImagen(blob) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => resolve({});
    img.src = URL.createObjectURL(blob);
  });
}
