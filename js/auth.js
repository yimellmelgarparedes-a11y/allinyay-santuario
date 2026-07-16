/**
 * ALLINYAY · auth.js
 * -----------------------------------------------------------------------------
 * Encapsula toda la interacción con Supabase Auth: inicio de sesión, cierre de
 * sesión, obtención del usuario actual y protección de páginas privadas.
 * -----------------------------------------------------------------------------
 */
import { getSupabase, tabla } from './supabase.js';
import { CONFIG } from './config.js';

/**
 * Inicia sesión con email y contraseña.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{usuario: object}>}
 */
export async function iniciarSesion(email, password) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw traducirErrorAuth(error);
  return { usuario: data.user };
}

/** Cierra la sesión actual y redirige al login. */
export async function cerrarSesion() {
  const supabase = getSupabase();
  await supabase.auth.signOut();
  window.location.href = CONFIG.RUTAS.login;
}

/**
 * Devuelve la sesión activa (o null si no hay ninguna).
 */
export async function obtenerSesion() {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/**
 * Devuelve el perfil extendido (tabla "usuarios") del usuario autenticado.
 */
export async function obtenerPerfil() {
  const sesion = await obtenerSesion();
  if (!sesion) return null;
  const { data, error } = await tabla('usuarios').select('*').eq('id', sesion.user.id).single();
  if (error) {
    console.error('No se pudo cargar el perfil del usuario:', error.message);
    return null;
  }
  return data;
}

/**
 * Protege una página: si no hay sesión activa, redirige a login.html.
 * Debe llamarse al inicio de dashboard.js (y de cualquier otra página privada).
 * @returns {Promise<object>} el usuario autenticado
 */
export async function requerirSesion() {
  const sesion = await obtenerSesion();
  if (!sesion) {
    window.location.href = CONFIG.RUTAS.login;
    throw new Error('Redirigiendo a login: no hay sesión activa');
  }
  return sesion.user;
}

/**
 * Escucha cambios de sesión (login/logout en otra pestaña, expiración de token, etc.)
 * @param {(evento: string, sesion: object|null) => void} callback
 */
export function alCambiarSesion(callback) {
  const supabase = getSupabase();
  supabase.auth.onAuthStateChange((evento, sesion) => callback(evento, sesion));
}

/** Traduce los mensajes de error de Supabase Auth a español, amigables para el usuario. */
function traducirErrorAuth(error) {
  const mensajes = {
    'Invalid login credentials': 'Correo o contraseña incorrectos.',
    'Email not confirmed': 'Debes confirmar tu correo antes de iniciar sesión.',
    'User already registered': 'Ya existe una cuenta con este correo.',
  };
  const traducido = mensajes[error.message] || 'No se pudo iniciar sesión. Inténtalo de nuevo.';
  return new Error(traducido);
}
