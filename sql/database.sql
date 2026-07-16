-- =============================================================================
-- ALLINYAY · Santuarios Digitales
-- Esquema de base de datos PostgreSQL (Supabase)
-- =============================================================================
-- Cómo ejecutar:
--   1. Abre tu proyecto en https://app.supabase.com
--   2. Ve a "SQL Editor" → "New query"
--   3. Pega TODO este archivo y presiona "Run"
--   4. Luego ejecuta /policies/rls.sql y /policies/storage.sql en ese orden
-- =============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";       -- búsqueda difusa de texto (ILIKE / índices GIN)

-- =============================================================================
-- FUNCIÓN COMPARTIDA: mantener updated_at sincronizado en cada UPDATE
-- =============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- FUNCIÓN COMPARTIDA: generar un slug corto y único para /s/{slug}
-- =============================================================================
create or replace function public.generar_slug()
returns text
language plpgsql
as $$
declare
  candidato text;
begin
  loop
    -- 8 caracteres alfanuméricos en minúscula, ej: 7d4b5a91
    candidato := substr(md5(gen_random_uuid()::text), 1, 8);
    exit when not exists (select 1 from public.santuarios where slug = candidato);
  end loop;
  return candidato;
end;
$$;

-- =============================================================================
-- 1) TABLA: usuarios
-- Perfil extendido de cada administrador (1:1 con auth.users)
-- =============================================================================
create table if not exists public.usuarios (
  id             uuid primary key references auth.users(id) on delete cascade,
  nombre         text not null default '',
  email          text not null,
  telefono       text,
  rol            text not null default 'admin' check (rol in ('admin', 'superadmin', 'editor')),
  avatar_url     text,
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger trg_usuarios_updated_at
  before update on public.usuarios
  for each row execute function public.set_updated_at();

comment on table public.usuarios is 'Perfil extendido de administradores de la plataforma';

-- Crea automáticamente una fila en usuarios cuando alguien se registra en auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.usuarios (id, email, nombre)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nombre', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- 2) TABLA: familias
-- Grupo/cliente dueño de uno o más santuarios
-- =============================================================================
create table if not exists public.familias (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references public.usuarios(id) on delete cascade,
  nombre          text not null,
  email_contacto  text,
  telefono        text,
  notas           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_familias_usuario on public.familias(usuario_id);

create trigger trg_familias_updated_at
  before update on public.familias
  for each row execute function public.set_updated_at();

comment on table public.familias is 'Familias o clientes propietarios de santuarios';

-- =============================================================================
-- 3) TABLA: santuarios
-- El corazón del sistema: cada amigurumi = un santuario digital
-- =============================================================================
create table if not exists public.santuarios (
  id                    uuid primary key default gen_random_uuid(),
  usuario_id            uuid not null references public.usuarios(id) on delete cascade,
  familia_id            uuid references public.familias(id) on delete set null,

  -- identificador corto usado en la URL pública: /s/{slug}
  slug                  text not null unique default public.generar_slug(),

  -- contenido principal (preserva los campos editables del prototipo original)
  nombre                text not null default 'En memoria de',
  historia              text not null default '',
  fecha_conmemoracion    text,
  cuidado_por           text,

  -- multimedia de portada
  portada_url           text,
  foto_principal_url    text,

  -- personalización visual
  color_primario        text not null default '#d3a34e',
  color_fondo           text not null default '#130f1e',
  tipografia            text not null default 'Fraunces',
  plantilla             text not null default 'clasico',

  -- comportamiento del santuario público
  comentarios_activos    boolean not null default true,
  mapa_lat              double precision,
  mapa_lng              double precision,

  -- ciclo de vida
  estado                text not null default 'activo' check (estado in ('borrador', 'activo', 'archivado', 'eliminado')),
  publicado             boolean not null default true,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_santuarios_usuario on public.santuarios(usuario_id);
create index if not exists idx_santuarios_familia on public.santuarios(familia_id);
create index if not exists idx_santuarios_slug on public.santuarios(slug);
create index if not exists idx_santuarios_estado on public.santuarios(estado);
create index if not exists idx_santuarios_nombre_trgm on public.santuarios using gin (nombre gin_trgm_ops);

create trigger trg_santuarios_updated_at
  before update on public.santuarios
  for each row execute function public.set_updated_at();

comment on table public.santuarios is 'Cada fila es el santuario digital de un amigurumi conmemorativo, accesible en /s/{slug}';
comment on column public.santuarios.slug is 'Identificador corto y único usado en la URL pública /s/{slug}';

-- =============================================================================
-- 4) TABLA: archivos
-- Registro de todo archivo subido a Supabase Storage (imágenes, video, audio)
-- =============================================================================
create table if not exists public.archivos (
  id              uuid primary key default gen_random_uuid(),
  santuario_id    uuid not null references public.santuarios(id) on delete cascade,
  bucket          text not null default 'allinyay-storage',
  ruta            text not null,                 -- ej: santuarios/{uuid}/images/foo.jpg
  tipo            text not null check (tipo in ('imagen', 'video', 'audio', 'documento')),
  mime            text,
  tamano_bytes    bigint,
  ancho           integer,
  alto            integer,
  duracion_seg    numeric,
  thumbnail_ruta  text,
  subido_por      uuid references public.usuarios(id) on delete set null,
  es_publico      boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists idx_archivos_santuario on public.archivos(santuario_id);
create index if not exists idx_archivos_tipo on public.archivos(tipo);

comment on table public.archivos is 'Metadatos de cada archivo almacenado en el bucket allinyay-storage';

-- =============================================================================
-- 5) TABLA: recuerdos
-- Fotos, videos, audios, frases y momentos de la galería/timeline
-- =============================================================================
create table if not exists public.recuerdos (
  id            uuid primary key default gen_random_uuid(),
  santuario_id  uuid not null references public.santuarios(id) on delete cascade,
  archivo_id    uuid references public.archivos(id) on delete set null,
  tipo          text not null check (tipo in ('imagen', 'video', 'audio', 'frase', 'evento')),
  titulo        text,
  descripcion   text,
  fecha_evento  date,
  destacado     boolean not null default false,
  orden         integer not null default 0,
  creado_por    uuid references public.usuarios(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_recuerdos_santuario on public.recuerdos(santuario_id);
create index if not exists idx_recuerdos_destacado on public.recuerdos(santuario_id, destacado);
create index if not exists idx_recuerdos_orden on public.recuerdos(santuario_id, orden);

create trigger trg_recuerdos_updated_at
  before update on public.recuerdos
  for each row execute function public.set_updated_at();

comment on table public.recuerdos is 'Elementos de la galería y el timeline de un santuario (fotos, videos, audios, frases, eventos)';

-- =============================================================================
-- 6) TABLA: comentarios
-- Mensajes que dejan los visitantes que escanean el QR
-- =============================================================================
create table if not exists public.comentarios (
  id            uuid primary key default gen_random_uuid(),
  santuario_id  uuid not null references public.santuarios(id) on delete cascade,
  archivo_id    uuid references public.archivos(id) on delete set null,  -- foto opcional adjunta
  nombre        text not null,
  mensaje       text,
  aprobado      boolean not null default false,   -- moderación: oculto hasta que el admin lo apruebe
  ip_hash       text,                              -- hash de IP para limitar spam, nunca la IP en crudo
  created_at    timestamptz not null default now()
);

create index if not exists idx_comentarios_santuario on public.comentarios(santuario_id);
create index if not exists idx_comentarios_aprobado on public.comentarios(santuario_id, aprobado);

comment on table public.comentarios is 'Mensajes de visitantes, sujetos a moderación por el administrador';

-- =============================================================================
-- 7) TABLA: visitas
-- Registro de cada vez que se abre un santuario (para estadísticas)
-- =============================================================================
create table if not exists public.visitas (
  id            uuid primary key default gen_random_uuid(),
  santuario_id  uuid not null references public.santuarios(id) on delete cascade,
  origen        text,           -- 'qr', 'link_directo', 'compartido'
  pais          text,
  dispositivo   text,           -- 'movil', 'tablet', 'escritorio'
  user_agent_hash text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_visitas_santuario on public.visitas(santuario_id);
create index if not exists idx_visitas_fecha on public.visitas(santuario_id, created_at);

comment on table public.visitas is 'Registro de visitas a cada santuario, usado para estadísticas del dashboard';

-- =============================================================================
-- 8) TABLA: qr
-- Metadatos del código QR generado para cada santuario
-- =============================================================================
create table if not exists public.qr (
  id              uuid primary key default gen_random_uuid(),
  santuario_id    uuid not null references public.santuarios(id) on delete cascade unique,
  url_destino     text not null,
  png_ruta        text,
  svg_ruta        text,
  color_oscuro    text not null default '#130f1e',
  color_claro     text not null default '#ffffff',
  veces_escaneado integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_qr_updated_at
  before update on public.qr
  for each row execute function public.set_updated_at();

comment on table public.qr is 'Código QR único generado automáticamente para cada santuario';

-- =============================================================================
-- 9) TABLA: estadisticas
-- Agregados diarios pre-calculados por santuario (para que el dashboard sea rápido)
-- =============================================================================
create table if not exists public.estadisticas (
  id              uuid primary key default gen_random_uuid(),
  santuario_id    uuid not null references public.santuarios(id) on delete cascade,
  fecha           date not null default current_date,
  visitas_total   integer not null default 0,
  comentarios_total integer not null default 0,
  recuerdos_total integer not null default 0,
  created_at      timestamptz not null default now(),
  unique (santuario_id, fecha)
);

create index if not exists idx_estadisticas_santuario_fecha on public.estadisticas(santuario_id, fecha);

comment on table public.estadisticas is 'Agregados diarios por santuario, usados para las gráficas del dashboard';

-- =============================================================================
-- 10) TABLA: configuracion
-- Ajustes globales de la plataforma (clave/valor), editable desde el panel admin
-- =============================================================================
create table if not exists public.configuracion (
  clave         text primary key,
  valor         jsonb not null default '{}'::jsonb,
  descripcion   text,
  updated_at    timestamptz not null default now()
);

create trigger trg_configuracion_updated_at
  before update on public.configuracion
  for each row execute function public.set_updated_at();

comment on table public.configuracion is 'Ajustes globales de la plataforma en formato clave/valor';

insert into public.configuracion (clave, valor, descripcion) values
  ('marca', '{"nombre": "ALLINYAY", "eslogan": "Amigurumis conmemorativos"}', 'Nombre y eslogan de la marca'),
  ('limites', '{"tamano_max_imagen_mb": 8, "tamano_max_video_mb": 25, "tamano_max_audio_mb": 15}', 'Límites de subida de archivos')
on conflict (clave) do nothing;

-- =============================================================================
-- TRIGGER: al crear un santuario, crear automáticamente su fila de QR
-- =============================================================================
create or replace function public.crear_qr_automatico()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.qr (santuario_id, url_destino)
  values (new.id, '/s/' || new.slug);
  return new;
end;
$$;

drop trigger if exists on_santuario_created on public.santuarios;
create trigger on_santuario_created
  after insert on public.santuarios
  for each row execute function public.crear_qr_automatico();

-- =============================================================================
-- TRIGGER: mantener el contador de veces_escaneado y estadisticas.visitas_total
-- =============================================================================
create or replace function public.registrar_visita_stats()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.estadisticas (santuario_id, fecha, visitas_total)
  values (new.santuario_id, current_date, 1)
  on conflict (santuario_id, fecha)
  do update set visitas_total = public.estadisticas.visitas_total + 1;
  return new;
end;
$$;

drop trigger if exists on_visita_created on public.visitas;
create trigger on_visita_created
  after insert on public.visitas
  for each row execute function public.registrar_visita_stats();

-- =============================================================================
-- VISTA: santuarios_publicos
-- Simplifica la carga del santuario.html público (solo columnas seguras)
-- =============================================================================
create or replace view public.santuarios_publicos as
select
  id, slug, nombre, historia, fecha_conmemoracion, cuidado_por,
  portada_url, foto_principal_url, color_primario, color_fondo,
  tipografia, plantilla, comentarios_activos, mapa_lat, mapa_lng
from public.santuarios
where estado = 'activo' and publicado = true;

comment on view public.santuarios_publicos is 'Vista de solo lectura usada por santuario.html, expone únicamente columnas seguras para el público';

-- =============================================================================
-- FUNCIÓN: registrar_escaneo_qr
-- Incrementa el contador de escaneos de un santuario público. Se expone como
-- RPC (no como UPDATE directo a la tabla "qr") a propósito: las políticas RLS
-- de "qr" solo permiten UPDATE al dueño (policies/rls.sql, "qr_update_propio"),
-- así que un visitante anónimo que escanea el QR no podría incrementar el
-- contador con un UPDATE directo. Esta función, con SECURITY DEFINER, hace
-- justo un incremento seguro y nada más: no expone ninguna otra escritura.
-- =============================================================================
create or replace function public.registrar_escaneo_qr(p_santuario_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.qr
  set veces_escaneado = veces_escaneado + 1
  where santuario_id = p_santuario_id
    and exists (
      select 1 from public.santuarios s
      where s.id = p_santuario_id
        and s.estado = 'activo' and s.publicado = true
    );
end;
$$;

comment on function public.registrar_escaneo_qr(uuid) is 'Incrementa qr.veces_escaneado de forma segura, invocable por cualquier visitante (anon) vía RPC';

grant execute on function public.registrar_escaneo_qr(uuid) to anon, authenticated;
