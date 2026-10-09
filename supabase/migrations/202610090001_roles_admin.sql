-- PACTO Fase 3: registro público, roles y panel administrativo.
-- Aplicar como propietario de base después de 202610080001_closure_cancellation_ai.sql.
-- Seguro para reintentos: si la migración ya existe, la transacción se revierte sin cambios.

begin;

-- 0. Guardas --------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='pactos' and column_name='status') then
    raise exception 'PREREQUISITE_MISSING: aplicar primero 202610080001_closure_cancellation_ai.sql';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='role') then
    raise exception 'MIGRATION_ALREADY_APPLIED: 202610090001_roles_admin.sql';
  end if;
end $$;

-- 1. Rol por usuario: 'user' por defecto, nunca elegible por el cliente -----------
alter table public.profiles
  add column role text not null default 'user' check (role in ('user','admin'));

-- 2. Alta automática de perfil al registrarse (trigger oficial de Supabase) -------
-- Garantiza que TODO usuario nuevo, sin importar el correo, recibe role='user'.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id) values (new.id) on conflict do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Helper de autorización -------------------------------------------------------
create function public.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;

-- 4. RLS adicional: los administradores ven todo; los demás, solo lo suyo --------
-- Políticas aditivas (OR con las existentes): no reducen el aislamiento actual.
create policy admin_read_profiles on public.profiles for select to authenticated using (public.is_admin());
create policy admin_read_pactos on public.pactos for select to authenticated using (public.is_admin());
create policy admin_read_participants on public.participants for select to authenticated using (public.is_admin());
create policy admin_read_agreements on public.agreements for select to authenticated using (public.is_admin());
create policy admin_read_audit on public.audit_events for select to authenticated using (public.is_admin());

-- 5. Lectura administrativa de usuarios (auth.users no es accesible a clientes) ---
-- Expone solo campos no sensibles; nunca hashes de contraseña ni tokens.
create function public.admin_list_users() returns table(
  id uuid, email text, role text, created_at timestamptz,
  confirmed boolean, last_sign_in_at timestamptz
) language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return query
    select u.id, u.email::text, coalesce(p.role,'user'), u.created_at,
           (u.email_confirmed_at is not null), u.last_sign_in_at
    from auth.users u
    left join public.profiles p on p.id = u.id
    order by u.created_at;
end; $$;

revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

commit;
