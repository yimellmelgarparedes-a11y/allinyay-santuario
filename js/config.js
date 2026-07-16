/**
 * ALLINYAY · config.js
 * -----------------------------------------------------------------------------
 * Único archivo que debes editar para conectar la plataforma a TU proyecto
 * de Supabase. No hay backend propio: al ser un sitio estático en GitHub
 * Pages, esta "anon key" pública es la forma normal de conectarse a Supabase
 * desde el navegador. Es segura de exponer porque TODO el acceso real a los
 * datos está controlado por las políticas de Row Level Security (RLS) que
 * instalaste con /policies/rls.sql y /policies/storage.sql — sin esas
 * políticas correctas, ninguna anon key es segura, así que no las omitas.
 *
 * Dónde obtener estos valores:
 *   Supabase Dashboard → tu proyecto → Project Settings → API
 *     - "Project URL"      → SUPABASE_URL
 *     - "anon public" key  → SUPABASE_ANON_KEY
 * -----------------------------------------------------------------------------
 */

export const CONFIG = {
  // -- Conexión a Supabase --------------------------------------------------
  SUPABASE_URL: 'https://mtbtpaspgeigryojfxun.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_6HrjK2OH-sCIzqPHdl13SQ_iEwP2Arz',

  // -- Storage ---------------------------------------------------------------
  STORAGE_BUCKET: 'allinyay-storage',

  // -- Marca -------------------------------------------------------------
  MARCA: {
    nombre: 'ALLINYAY',
    eslogan: 'Amigurumis conmemorativos',
    email: 'hola@allinyay.com',
  },

  // -- Límites de subida de archivos (deben coincidir con la tabla
  //    "configuracion" en la base de datos y con /policies/storage.sql) -----
  LIMITES: {
    imagenMB: 8,
    videoMB: 25,
    audioMB: 15,
    dimensionMaximaImagen: 1600, // px, se redimensiona antes de subir
  },

  // -- Rutas de la app -----------------------------------------------------
  RUTAS: {
    login: '/login.html',
    dashboard: '/dashboard.html',
    santuarioBase: '/s/', // + slug, ej: /s/7d4b5a91
  },
};

/** Verifica que el proyecto ya fue configurado (no quedaron los placeholders) */
export function configuracionValida() {
  return (
    !CONFIG.SUPABASE_URL.includes('TU-PROYECTO') &&
    !CONFIG.SUPABASE_ANON_KEY.includes('TU_ANON_KEY')
  );
}
