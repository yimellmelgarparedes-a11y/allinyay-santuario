/**
 * ALLINYAY · supabase.js
 * -----------------------------------------------------------------------------
 * Inicializa un único cliente de Supabase compartido por toda la aplicación.
 * Se importa el SDK oficial directamente desde un CDN (ESM), sin necesidad de
 * build step, para poder alojar el proyecto en GitHub Pages como sitio estático.
 * -----------------------------------------------------------------------------
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { CONFIG, configuracionValida } from './config.js';

let clienteSingleton = null;

/**
 * Devuelve el cliente de Supabase, creándolo la primera vez que se solicita.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function getSupabase() {
  if (!configuracionValida()) {
    throw new Error(
      'Supabase no está configurado. Edita js/config.js con tu SUPABASE_URL y SUPABASE_ANON_KEY.'
    );
  }
  if (!clienteSingleton) {
    clienteSingleton = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return clienteSingleton;
}

/** Atajo directo a supabase.from(tabla) */
export function tabla(nombre) {
  return getSupabase().from(nombre);
}

/** Atajo directo a supabase.storage.from(bucket) */
export function storageBucket() {
  return getSupabase().storage.from(CONFIG.STORAGE_BUCKET);
}
