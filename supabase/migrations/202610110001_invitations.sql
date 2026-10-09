-- PACTO: invitación del proveedor por enlace seguro y nombres legibles de participantes.
-- Aplicar como propietario de base después de 202610100001_demo_example.sql.
-- Seguro para reintentos: si la migración ya existe, la transacción se revierte sin cambios.
--
-- Solo añade: una tabla nueva (invitations) y cuatro RPC. No modifica tablas, políticas
-- ni funciones existentes, de modo que el código ya desplegado sigue funcionando igual.
-- El enlace contiene un token aleatorio de un solo uso; en la base solo se guarda su
-- SHA-256, por lo que ni un participante ni un administrador puede reconstruirlo.

begin;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='pactos' and column_name='is_demo_example') then
    raise exception 'PREREQUISITE_MISSING: aplicar primero 202610100001_demo_example.sql';
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='invitations') then
    raise exception 'MIGRATION_ALREADY_APPLIED: 202610110001_invitations.sql';
  end if;
end $$;

-- 1. Invitaciones -----------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  pacto_id uuid not null references public.pactos(id),
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  invitee_email text check (invitee_email is null or length(invitee_email) between 3 and 254),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index invitations_pacto on public.invitations(pacto_id, created_at desc);

alter table public.invitations enable row level security;
create policy member_invitations on public.invitations for select to authenticated using (public.is_participant(pacto_id));
revoke all on public.invitations from anon, authenticated;
-- Lectura por columnas: el hash del token nunca se entrega a clientes.
grant select (id, pacto_id, invitee_email, created_by, created_at, expires_at, accepted_by, accepted_at, revoked_at)
  on public.invitations to authenticated;

-- 2. Crear invitación (solo el comprador, mientras no haya proveedor) --------------
-- Devuelve el token en claro una única vez; las invitaciones abiertas anteriores se revocan.
create function public.create_invitation(p_id uuid, p_email text default null) returns text
language plpgsql security definer set search_path='' as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_token text;
  v_id uuid;
begin
  perform 1 from public.pactos where id=p_id for update;
  if not exists(select 1 from public.participants where pacto_id=p_id and user_id=auth.uid() and role='BUYER') then raise exception 'NOT_FOUND'; end if;
  if (select status from public.pactos where id=p_id)<>'ACTIVE' then raise exception 'PACTO_NOT_ACTIVE'; end if;
  if exists(select 1 from public.participants where pacto_id=p_id and role='SELLER') then raise exception 'SELLER_ALREADY_JOINED'; end if;
  if v_email is not null and (length(v_email)>254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then raise exception 'INVALID_INPUT'; end if;
  update public.invitations set revoked_at=now() where pacto_id=p_id and accepted_at is null and revoked_at is null;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.invitations(pacto_id, token_sha256, invitee_email, created_by)
    values (p_id, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_email, auth.uid())
    returning id into v_id;
  insert into public.audit_events(pacto_id, actor_id, event_type, object_id) values (p_id, auth.uid(), 'INVITATION_CREATED', v_id);
  return v_token;
end; $$;

-- 3. Vista previa para quien abre el enlace ---------------------------------------
-- Solo muestra el contenido del acuerdo mientras la invitación sigue abierta (o si la
-- aceptó quien consulta); en cualquier otro caso devuelve únicamente el estado.
create function public.invitation_preview(p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v public.invitations;
  v_pacto public.pactos;
  v_agreement public.agreements;
  v_status text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v from public.invitations where token_sha256=encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if v.id is null then return jsonb_build_object('status', 'NOT_FOUND'); end if;
  select * into v_pacto from public.pactos where id=v.pacto_id;
  v_status := case
    when v.accepted_by=auth.uid() then 'JOINED'
    when v.accepted_at is not null or v.revoked_at is not null then 'USED'
    when v.expires_at<now() then 'EXPIRED'
    when v_pacto.status<>'ACTIVE' then 'INACTIVE'
    when exists(select 1 from public.participants where pacto_id=v.pacto_id and user_id=auth.uid()) then 'OWN'
    -- La restricción por correo se comprueba ANTES de revelar nada del acuerdo:
    -- un enlace nominal filtrado no muestra título, alcance ni importe a terceros.
    when v.invitee_email is not null
         and lower(coalesce((select email from auth.users where id=auth.uid()), '')) <> v.invitee_email
      then 'EMAIL_MISMATCH'
    else 'OPEN' end;
  if v_status not in ('OPEN', 'JOINED', 'OWN') then return jsonb_build_object('status', v_status); end if;
  select * into v_agreement from public.agreements where pacto_id=v.pacto_id order by version desc limit 1;
  return jsonb_build_object(
    'status', v_status,
    'pacto_id', v.pacto_id,
    'title', v_pacto.title,
    'scope', v_agreement.scope,
    'total_cents', v_agreement.total_cents,
    'expires_at', v.expires_at,
    'email_restricted', v.invitee_email is not null);
end; $$;

-- 4. Aceptar la invitación: quien la abre se une como proveedor -------------------
create function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v public.invitations; v_hash text := encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v from public.invitations where token_sha256=v_hash;
  if v.id is null then raise exception 'INVITATION_NOT_FOUND'; end if;
  -- Mismo orden de bloqueo que create_invitation (Pacto y después invitación) para
  -- que aceptar y regenerar a la vez se serialicen sin interbloqueo; se relee tras bloquear.
  perform 1 from public.pactos where id=v.pacto_id for update;
  select * into v from public.invitations where id=v.id for update;
  if v.accepted_by=auth.uid() then return v.pacto_id; end if;
  if v.accepted_at is not null or v.revoked_at is not null then raise exception 'INVITATION_USED'; end if;
  if v.expires_at<now() then raise exception 'INVITATION_EXPIRED'; end if;
  if (select status from public.pactos where id=v.pacto_id)<>'ACTIVE' then raise exception 'PACTO_NOT_ACTIVE'; end if;
  if exists(select 1 from public.participants where pacto_id=v.pacto_id and user_id=auth.uid()) then raise exception 'DISTINCT_PARTIES_REQUIRED'; end if;
  if exists(select 1 from public.participants where pacto_id=v.pacto_id and role='SELLER') then raise exception 'SELLER_ALREADY_JOINED'; end if;
  if not exists(select 1 from public.agreements where pacto_id=v.pacto_id and state='DRAFT') then raise exception 'INVALID_STATE'; end if;
  if v.invitee_email is not null
     and lower(coalesce((select email from auth.users where id=auth.uid()), '')) <> v.invitee_email then
    raise exception 'INVITATION_EMAIL_MISMATCH';
  end if;
  insert into public.participants values (v.pacto_id, auth.uid(), 'SELLER');
  update public.invitations set accepted_by=auth.uid(), accepted_at=now() where id=v.id;
  insert into public.audit_events(pacto_id, actor_id, event_type, object_id) values (v.pacto_id, auth.uid(), 'PARTICIPANT_ADDED', auth.uid());
  return v.pacto_id;
end; $$;

-- 5. Nombres legibles de los participantes, solo para participantes ---------------
-- Sustituye los UUID en la interfaz. Las sesiones DEMO (anónimas) no tienen correo.
create function public.participant_directory(p_id uuid) returns table(user_id uuid, role text, label text)
language sql stable security definer set search_path='' as $$
  select p.user_id, p.role, coalesce(nullif(pr.display_name, ''), u.email, 'Visitante DEMO')
  from public.participants p
  left join public.profiles pr on pr.id=p.user_id
  left join auth.users u on u.id=p.user_id
  where p.pacto_id=p_id and public.is_participant(p_id);
$$;

revoke execute on function public.create_invitation(uuid, text), public.invitation_preview(text), public.accept_invitation(text), public.participant_directory(uuid) from public, anon;
grant execute on function public.create_invitation(uuid, text), public.invitation_preview(text), public.accept_invitation(text), public.participant_directory(uuid) to authenticated;

commit;
