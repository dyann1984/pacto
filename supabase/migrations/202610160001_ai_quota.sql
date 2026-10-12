-- PACTO: cupo de análisis con IA por persona y global, para acotar el gasto.
-- Aplicar como propietario de base después de 202610150001_refund_by_capture.sql.
-- Seguro para reintentos: si la migración ya existe, la transacción se revierte sin cambios.
--
-- Con la IA activa en público, el único tope era 3 análisis por versión de acuerdo. Pero
-- crear un Pacto o una versión nueva no tiene límite, y las sesiones anónimas (Modo DEMO y
-- Modo Juez) se obtienen sin registro: cada llamada al proveedor se paga, así que el gasto
-- no tenía techo. Un tope solo por persona tampoco basta, porque basta con abrir otra
-- sesión anónima; hace falta además un tope global.
--
-- RLS impide, con razón, que una sesión cuente los análisis de otros. Esta función devuelve
-- únicamente dos recuentos —nunca filas, contenidos ni identidades— y la aplicación decide
-- el tope antes de llamar al proveedor.

begin;

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='ai_analyses') then
    raise exception 'PREREQUISITE_MISSING: aplicar primero 202610080001_closure_cancellation_ai.sql';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='ai_quota'
  ) then
    raise exception 'MIGRATION_ALREADY_APPLIED: 202610160001_ai_quota.sql';
  end if;
end $$;

-- Índice para que los recuentos por ventana de tiempo no recorran toda la tabla.
create index if not exists ai_analyses_created_at_idx on public.ai_analyses(created_at);

create function public.ai_quota() returns table(mine_24h integer, all_1h integer)
language sql stable security definer set search_path='' as $$
  select
    (select count(*)::int from public.ai_analyses
      where requested_by = auth.uid() and created_at > now() - interval '24 hours'),
    (select count(*)::int from public.ai_analyses
      where created_at > now() - interval '1 hour');
$$;

-- Solo sesiones iniciadas (incluidas las anónimas de la DEMO): son las únicas que analizan.
revoke execute on function public.ai_quota() from public, anon;
grant execute on function public.ai_quota() to authenticated;

commit;
