-- =============================================================================
-- ALLINYAY · Políticas de Row Level Security (RLS)
-- Ejecutar DESPUÉS de /sql/database.sql
-- =============================================================================
-- Principio de diseño:
--   · Un administrador (auth.uid()) solo puede leer/editar SUS PROPIOS santuarios
--     y todo lo que cuelga de ellos (recuerdos, archivos, comentarios, qr, etc).
--   · El público (rol "anon") solo puede LEER santuarios activos y publicados,
--     e INSERTAR comentarios y recuerdos de tipo visitante (sin poder editar
--     ni borrar nada, ni leer datos de otros santuarios).
--   · superadmin puede ver todo (soporte / operación de la plataforma).
-- =============================================================================

-- Función auxiliar: ¿el usuario autenticado es dueño de este santuario?
create or replace function public.es_dueno_santuario(p_santuario_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.santuarios s
    where s.id = p_santuario_id
      and s.usuario_id = auth.uid()
  );
$$;

-- Función auxiliar: ¿el usuario autenticado es superadmin?
create or replace function public.es_superadmin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = auth.uid() and u.rol = 'superadmin'
  );
$$;

-- =============================================================================
-- usuarios
-- =============================================================================
alter table public.usuarios enable row level security;

create policy "usuarios_select_propio"
  on public.usuarios for select
  using (id = auth.uid() or public.es_superadmin());

create policy "usuarios_update_propio"
  on public.usuarios for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- =============================================================================
-- familias
-- =============================================================================
alter table public.familias enable row level security;

create policy "familias_select_propias"
  on public.familias for select
  using (usuario_id = auth.uid() or public.es_superadmin());

create policy "familias_insert_propias"
  on public.familias for insert
  with check (usuario_id = auth.uid());

create policy "familias_update_propias"
  on public.familias for update
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

create policy "familias_delete_propias"
  on public.familias for delete
  using (usuario_id = auth.uid());

-- =============================================================================
-- santuarios
-- =============================================================================
alter table public.santuarios enable row level security;

-- Lectura pública: cualquiera (incluido anon) puede ver santuarios activos y publicados
create policy "santuarios_select_publico"
  on public.santuarios for select
  using (estado = 'activo' and publicado = true);

-- Lectura privada: el dueño ve TODOS sus santuarios (incluidos borradores/archivados)
create policy "santuarios_select_propio"
  on public.santuarios for select
  using (usuario_id = auth.uid() or public.es_superadmin());

create policy "santuarios_insert_propio"
  on public.santuarios for insert
  with check (usuario_id = auth.uid());

create policy "santuarios_update_propio"
  on public.santuarios for update
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

create policy "santuarios_delete_propio"
  on public.santuarios for delete
  using (usuario_id = auth.uid());

-- =============================================================================
-- archivos
-- =============================================================================
alter table public.archivos enable row level security;

create policy "archivos_select_publico"
  on public.archivos for select
  using (
    es_publico = true
    and exists (
      select 1 from public.santuarios s
      where s.id = archivos.santuario_id
        and s.estado = 'activo' and s.publicado = true
    )
  );

create policy "archivos_select_propio"
  on public.archivos for select
  using (public.es_dueno_santuario(santuario_id));

create policy "archivos_insert_propio"
  on public.archivos for insert
  with check (public.es_dueno_santuario(santuario_id));

-- Los visitantes también pueden registrar un archivo cuando dejan un recuerdo,
-- siempre que el santuario tenga comentarios activos.
create policy "archivos_insert_visitante"
  on public.archivos for insert
  with check (
    exists (
      select 1 from public.santuarios s
      where s.id = archivos.santuario_id
        and s.estado = 'activo' and s.publicado = true
        and s.comentarios_activos = true
    )
  );

create policy "archivos_update_propio"
  on public.archivos for update
  using (public.es_dueno_santuario(santuario_id));

create policy "archivos_delete_propio"
  on public.archivos for delete
  using (public.es_dueno_santuario(santuario_id));

-- =============================================================================
-- recuerdos
-- =============================================================================
alter table public.recuerdos enable row level security;

create policy "recuerdos_select_publico"
  on public.recuerdos for select
  using (
    exists (
      select 1 from public.santuarios s
      where s.id = recuerdos.santuario_id
        and s.estado = 'activo' and s.publicado = true
    )
  );

create policy "recuerdos_select_propio"
  on public.recuerdos for select
  using (public.es_dueno_santuario(santuario_id));

create policy "recuerdos_insert_propio"
  on public.recuerdos for insert
  with check (public.es_dueno_santuario(santuario_id));

create policy "recuerdos_update_propio"
  on public.recuerdos for update
  using (public.es_dueno_santuario(santuario_id))
  with check (public.es_dueno_santuario(santuario_id));

create policy "recuerdos_delete_propio"
  on public.recuerdos for delete
  using (public.es_dueno_santuario(santuario_id));

-- =============================================================================
-- comentarios
-- =============================================================================
alter table public.comentarios enable row level security;

-- El público solo ve comentarios YA APROBADOS de santuarios activos
create policy "comentarios_select_publico"
  on public.comentarios for select
  using (
    aprobado = true
    and exists (
      select 1 from public.santuarios s
      where s.id = comentarios.santuario_id
        and s.estado = 'activo' and s.publicado = true
    )
  );

-- El dueño ve TODOS los comentarios de su santuario (incluidos pendientes) para moderar
create policy "comentarios_select_propio"
  on public.comentarios for select
  using (public.es_dueno_santuario(santuario_id));

-- Cualquier visitante puede dejar un comentario si el santuario lo permite
create policy "comentarios_insert_visitante"
  on public.comentarios for insert
  with check (
    exists (
      select 1 from public.santuarios s
      where s.id = comentarios.santuario_id
        and s.estado = 'activo' and s.publicado = true
        and s.comentarios_activos = true
    )
  );

-- Solo el dueño puede aprobar/editar (moderación)
create policy "comentarios_update_propio"
  on public.comentarios for update
  using (public.es_dueno_santuario(santuario_id))
  with check (public.es_dueno_santuario(santuario_id));

create policy "comentarios_delete_propio"
  on public.comentarios for delete
  using (public.es_dueno_santuario(santuario_id));

-- =============================================================================
-- visitas
-- =============================================================================
alter table public.visitas enable row level security;

-- Cualquiera puede insertar una visita (se registra al cargar el santuario público)
create policy "visitas_insert_publico"
  on public.visitas for insert
  with check (
    exists (
      select 1 from public.santuarios s
      where s.id = visitas.santuario_id
        and s.estado = 'activo' and s.publicado = true
    )
  );

-- Solo el dueño puede leer las visitas de su santuario (estadísticas privadas)
create policy "visitas_select_propio"
  on public.visitas for select
  using (public.es_dueno_santuario(santuario_id));

-- =============================================================================
-- qr
-- =============================================================================
alter table public.qr enable row level security;

create policy "qr_select_publico"
  on public.qr for select
  using (
    exists (
      select 1 from public.santuarios s
      where s.id = qr.santuario_id
        and s.estado = 'activo' and s.publicado = true
    )
  );

create policy "qr_select_propio"
  on public.qr for select
  using (public.es_dueno_santuario(santuario_id));

create policy "qr_update_propio"
  on public.qr for update
  using (public.es_dueno_santuario(santuario_id))
  with check (public.es_dueno_santuario(santuario_id));

-- =============================================================================
-- estadisticas
-- =============================================================================
alter table public.estadisticas enable row level security;

create policy "estadisticas_select_propio"
  on public.estadisticas for select
  using (public.es_dueno_santuario(santuario_id));

-- =============================================================================
-- configuracion
-- =============================================================================
alter table public.configuracion enable row level security;

-- Lectura pública de configuración (marca, límites) para que la landing la use
create policy "configuracion_select_publico"
  on public.configuracion for select
  using (true);

-- Solo superadmin edita la configuración global
create policy "configuracion_update_superadmin"
  on public.configuracion for update
  using (public.es_superadmin())
  with check (public.es_superadmin());
