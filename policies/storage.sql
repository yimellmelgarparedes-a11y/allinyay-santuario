-- =============================================================================
-- ALLINYAY · Políticas de Supabase Storage
-- Ejecutar DESPUÉS de /sql/database.sql y /policies/rls.sql
-- =============================================================================
-- IMPORTANTE: antes de correr este archivo, crea el bucket manualmente:
--   Supabase Dashboard → Storage → "New bucket"
--     Nombre: allinyay-storage
--     Public: NO (lo servimos vía URLs firmadas / policies, no público total)
--
-- Estructura de carpetas dentro del bucket:
--   santuarios/{santuario_id}/cover/...
--   santuarios/{santuario_id}/images/...
--   santuarios/{santuario_id}/videos/...
--   santuarios/{santuario_id}/audios/...
--   santuarios/{santuario_id}/thumbnails/...
-- =============================================================================

-- Función auxiliar: extrae el santuario_id (primer segmento de carpeta) de una ruta
-- Ej: 'santuarios/7d4b5a91-xxxx/images/foto.jpg' -> '7d4b5a91-xxxx'
create or replace function public.allinyay_santuario_id_de_ruta(nombre_objeto text)
returns uuid
language plpgsql
immutable
as $$
declare
  partes text[];
begin
  partes := string_to_array(nombre_objeto, '/');
  if array_length(partes, 1) < 2 or partes[1] <> 'santuarios' then
    return null;
  end if;
  return partes[2]::uuid;
exception when others then
  return null;
end;
$$;

-- =============================================================================
-- LECTURA (SELECT): pública para santuarios activos y publicados
-- =============================================================================
create policy "storage_select_publico"
  on storage.objects for select
  using (
    bucket_id = 'allinyay-storage'
    and exists (
      select 1 from public.santuarios s
      where s.id = public.allinyay_santuario_id_de_ruta(name)
        and s.estado = 'activo' and s.publicado = true
    )
  );

-- Lectura privada: el dueño siempre puede ver sus propios archivos (aunque el
-- santuario esté en borrador o archivado, para poder editarlo desde el dashboard)
create policy "storage_select_propio"
  on storage.objects for select
  using (
    bucket_id = 'allinyay-storage'
    and exists (
      select 1 from public.santuarios s
      where s.id = public.allinyay_santuario_id_de_ruta(name)
        and s.usuario_id = auth.uid()
    )
  );

-- =============================================================================
-- ESCRITURA (INSERT): el administrador dueño puede subir a su propio santuario
-- =============================================================================
create policy "storage_insert_propio"
  on storage.objects for insert
  with check (
    bucket_id = 'allinyay-storage'
    and exists (
      select 1 from public.santuarios s
      where s.id = public.allinyay_santuario_id_de_ruta(name)
        and s.usuario_id = auth.uid()
    )
  );

-- Los visitantes también pueden subir SOLO dentro de la subcarpeta de comentarios,
-- y solo si el santuario tiene comentarios activos.
create policy "storage_insert_visitante"
  on storage.objects for insert
  with check (
    bucket_id = 'allinyay-storage'
    and (string_to_array(name, '/'))[3] = 'comentarios'
    and exists (
      select 1 from public.santuarios s
      where s.id = public.allinyay_santuario_id_de_ruta(name)
        and s.estado = 'activo' and s.publicado = true
        and s.comentarios_activos = true
    )
  );

-- =============================================================================
-- ACTUALIZACIÓN (UPDATE): solo el dueño
-- =============================================================================
create policy "storage_update_propio"
  on storage.objects for update
  using (
    bucket_id = 'allinyay-storage'
    and exists (
      select 1 from public.santuarios s
      where s.id = public.allinyay_santuario_id_de_ruta(name)
        and s.usuario_id = auth.uid()
    )
  );

-- =============================================================================
-- BORRADO (DELETE): solo el dueño
-- =============================================================================
create policy "storage_delete_propio"
  on storage.objects for delete
  using (
    bucket_id = 'allinyay-storage'
    and exists (
      select 1 from public.santuarios s
      where s.id = public.allinyay_santuario_id_de_ruta(name)
        and s.usuario_id = auth.uid()
    )
  );
