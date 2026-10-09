-- PACTO: acceso público de solo exploración (modo DEMO) y un Pacto de ejemplo.
-- Aplicar como propietario de base después de 202610090002_assign_owner_admin.sql.
-- Seguro para reintentos: si la migración ya existe, la transacción se revierte sin cambios.
--
-- No concede ninguna escritura nueva a clientes. No modifica el aislamiento existente
-- entre usuarios reales: solo añade una lectura adicional, aditiva (OR), para Pactos
-- marcados explícitamente como ejemplo público. La marca solo se puede poner por SQL
-- directo (como esta migración), nunca por un cliente ni por ninguna RPC.

begin;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='role') then
    raise exception 'PREREQUISITE_MISSING: aplicar primero 202610090001_roles_admin.sql';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='pactos' and column_name='is_demo_example') then
    raise exception 'MIGRATION_ALREADY_APPLIED: 202610100001_demo_example.sql';
  end if;
end $$;

-- 1. Marca de Pacto de ejemplo público --------------------------------------------
alter table public.pactos
  add column is_demo_example boolean not null default false;

-- 2. Helpers de lectura pública para el ejemplo (mismo patrón que can_read_agreement) --
create function public.is_demo_pacto(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select is_demo_example from public.pactos where id=p_id), false);
$$;

create function public.is_demo_agreement(a_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.agreements a where a.id=a_id and public.is_demo_pacto(a.pacto_id));
$$;

create function public.is_demo_milestone(m_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.milestones m where m.id=m_id and public.is_demo_agreement(m.agreement_id));
$$;

-- 3. RLS adicional, aditiva: cualquier usuario autenticado (incluido anónimo) puede
--    leer el Pacto marcado como ejemplo. No se concede ningún INSERT/UPDATE/DELETE.
create policy demo_read_pactos on public.pactos for select to authenticated using (is_demo_example);
create policy demo_read_participants on public.participants for select to authenticated using (public.is_demo_pacto(pacto_id));
create policy demo_read_agreements on public.agreements for select to authenticated using (public.is_demo_pacto(pacto_id));
create policy demo_read_milestones on public.milestones for select to authenticated using (public.is_demo_agreement(agreement_id));
create policy demo_read_criteria on public.acceptance_criteria for select to authenticated using (public.is_demo_milestone(milestone_id));
create policy demo_read_acceptances on public.acceptances for select to authenticated using (public.is_demo_agreement(agreement_id));
create policy demo_read_audit on public.audit_events for select to authenticated using (public.is_demo_pacto(pacto_id));
create policy demo_read_closures on public.closure_confirmations for select to authenticated using (public.is_demo_pacto(pacto_id));

revoke execute on function public.is_demo_pacto(uuid), public.is_demo_agreement(uuid), public.is_demo_milestone(uuid) from public, anon;
grant execute on function public.is_demo_pacto(uuid), public.is_demo_agreement(uuid), public.is_demo_milestone(uuid) to authenticated;

commit;
