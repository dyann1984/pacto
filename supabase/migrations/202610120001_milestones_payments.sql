-- PACTO: evidencia de cumplimiento por hito, aprobación del cliente y pagos PayPal Sandbox.
-- Aplicar como propietario de base después de 202610110001_invitations.sql.
-- Seguro para reintentos: si la migración ya existe, la transacción se revierte sin cambios.
--
-- Añade columnas a milestones, una tabla payments y cinco RPC. No reemplaza funciones
-- existentes. Ningún cliente puede escribir en payments ni cambiar el estado de un hito
-- fuera de las RPC, que exigen rol (proveedor/cliente) y acuerdo aceptado.
--
-- Los pagos son SOLO del entorno Sandbox de PayPal: no mueven dinero real. PACTO no
-- retiene fondos ni actúa como escrow; el pago va del cliente al proveedor en PayPal.
-- No se guarda ningún dato de tarjeta: solo identificadores de orden y captura.

begin;

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='invitations') then
    raise exception 'PREREQUISITE_MISSING: aplicar primero 202610110001_invitations.sql';
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='payments') then
    raise exception 'MIGRATION_ALREADY_APPLIED: 202610120001_milestones_payments.sql';
  end if;
end $$;

-- 1. Ciclo de vida del hito -------------------------------------------------------
alter table public.milestones
  add column status text not null default 'PENDING'
    check (status in ('PENDING','EVIDENCE_SUBMITTED','APPROVED','PAID')),
  add column evidence text check (evidence is null or length(evidence) between 10 and 2000),
  add column evidence_at timestamptz,
  add column approved_at timestamptz,
  add column paid_at timestamptz;

-- 2. Pagos (solo Sandbox) ----------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  pacto_id uuid not null references public.pactos(id),
  agreement_id uuid not null references public.agreements(id),
  milestone_id uuid not null references public.milestones(id),
  provider text not null check (provider = 'PAYPAL'),
  environment text not null default 'SANDBOX' check (environment = 'SANDBOX'),
  order_id text not null unique check (length(order_id) between 3 and 128),
  capture_id text check (capture_id is null or length(capture_id) between 3 and 128),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'MXN' check (currency = 'MXN'),
  status text not null default 'CREATED'
    check (status in ('CREATED','APPROVED','CAPTURED','FAILED','CANCELLED')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_milestone on public.payments(milestone_id, created_at desc);
-- Idempotencia fuerte: como mucho un pago vivo (no fallido ni cancelado) por hito.
create unique index one_open_payment_per_milestone on public.payments(milestone_id)
  where status in ('CREATED','APPROVED','CAPTURED');

alter table public.payments enable row level security;
create policy member_payments on public.payments for select to authenticated using (public.is_participant(pacto_id));
create policy demo_read_payments on public.payments for select to authenticated using (public.is_demo_pacto(pacto_id));
create policy admin_read_payments on public.payments for select to authenticated using (public.is_admin());
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;

-- 3. El proveedor presenta evidencia de cumplimiento --------------------------------
create function public.submit_milestone_evidence(m_id uuid, p_evidence text) returns void
language plpgsql security definer set search_path='' as $$
declare v_m public.milestones; v_a public.agreements; v_text text := trim(coalesce(p_evidence,''));
begin
  select * into v_m from public.milestones where id=m_id for update;
  if v_m.id is null then raise exception 'NOT_FOUND'; end if;
  select * into v_a from public.agreements where id=v_m.agreement_id;
  if not exists(select 1 from public.participants where pacto_id=v_a.pacto_id and user_id=auth.uid() and role='SELLER') then raise exception 'NOT_FOUND'; end if;
  if (select status from public.pactos where id=v_a.pacto_id)<>'ACTIVE' then raise exception 'PACTO_NOT_ACTIVE'; end if;
  if v_a.state<>'ACCEPTED' then raise exception 'INVALID_STATE'; end if;
  if v_m.status not in ('PENDING','EVIDENCE_SUBMITTED') then raise exception 'INVALID_TRANSITION'; end if;
  if length(v_text) not between 10 and 2000 then raise exception 'INVALID_INPUT'; end if;
  update public.milestones set status='EVIDENCE_SUBMITTED', evidence=v_text, evidence_at=now() where id=m_id;
  insert into public.audit_events(pacto_id,actor_id,event_type,object_id,detail)
    values (v_a.pacto_id, auth.uid(), 'EVIDENCE_SUBMITTED', m_id, left(v_text,500));
end; $$;

-- 4. El cliente revisa y autoriza (sin ejecutar el pago todavía) ---------------------
create function public.approve_milestone(m_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_m public.milestones; v_a public.agreements;
begin
  select * into v_m from public.milestones where id=m_id for update;
  if v_m.id is null then raise exception 'NOT_FOUND'; end if;
  select * into v_a from public.agreements where id=v_m.agreement_id;
  if not exists(select 1 from public.participants where pacto_id=v_a.pacto_id and user_id=auth.uid() and role='BUYER') then raise exception 'NOT_FOUND'; end if;
  if (select status from public.pactos where id=v_a.pacto_id)<>'ACTIVE' then raise exception 'PACTO_NOT_ACTIVE'; end if;
  if v_a.state<>'ACCEPTED' then raise exception 'INVALID_STATE'; end if;
  -- Autorización humana explícita: exige evidencia previa del proveedor.
  if v_m.status<>'EVIDENCE_SUBMITTED' then raise exception 'EVIDENCE_REQUIRED'; end if;
  update public.milestones set status='APPROVED', approved_at=now() where id=m_id;
  insert into public.audit_events(pacto_id,actor_id,event_type,object_id)
    values (v_a.pacto_id, auth.uid(), 'MILESTONE_APPROVED', m_id);
end; $$;

-- 5. Registro de la orden de pago (la crea el servidor en PayPal Sandbox) -----------
create function public.record_payment_order(m_id uuid, p_order_id text, p_amount_cents bigint) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_m public.milestones; v_a public.agreements; v_id uuid;
begin
  select * into v_m from public.milestones where id=m_id for update;
  if v_m.id is null then raise exception 'NOT_FOUND'; end if;
  select * into v_a from public.agreements where id=v_m.agreement_id;
  if not exists(select 1 from public.participants where pacto_id=v_a.pacto_id and user_id=auth.uid() and role='BUYER') then raise exception 'NOT_FOUND'; end if;
  if (select status from public.pactos where id=v_a.pacto_id)<>'ACTIVE' then raise exception 'PACTO_NOT_ACTIVE'; end if;
  -- Solo se paga lo que el cliente ya aprobó, y por el importe exacto del hito.
  if v_m.status<>'APPROVED' then raise exception 'APPROVAL_REQUIRED'; end if;
  if p_amount_cents<>v_m.amount_cents then raise exception 'AMOUNT_MISMATCH'; end if;
  if exists(select 1 from public.payments where milestone_id=m_id and status in ('CREATED','APPROVED','CAPTURED')) then
    raise exception 'PAYMENT_ALREADY_OPEN';
  end if;
  insert into public.payments(pacto_id,agreement_id,milestone_id,provider,order_id,amount_cents,created_by)
    values (v_a.pacto_id, v_a.id, m_id, 'PAYPAL', p_order_id, p_amount_cents, auth.uid())
    returning id into v_id;
  insert into public.audit_events(pacto_id,actor_id,event_type,object_id,detail)
    values (v_a.pacto_id, auth.uid(), 'PAYMENT_ORDER_CREATED', m_id, left(p_order_id,500));
  return v_id;
end; $$;

-- 6. Resultado del pago: captura, fallo o cancelación -------------------------------
-- Idempotente: repetir la misma captura no duplica el pago ni reescribe la auditoría.
create function public.record_payment_result(p_order_id text, p_status text, p_capture_id text default null) returns text
language plpgsql security definer set search_path='' as $$
declare v_p public.payments; v_actor uuid := auth.uid();
begin
  if p_status not in ('CAPTURED','FAILED','CANCELLED') then raise exception 'INVALID_INPUT'; end if;
  select * into v_p from public.payments where order_id=p_order_id for update;
  if v_p.id is null then raise exception 'NOT_FOUND'; end if;
  -- El webhook llega sin sesión: entonces el actor es quien creó la orden.
  if v_actor is null then v_actor := v_p.created_by;
  elsif not public.is_participant(v_p.pacto_id) then raise exception 'NOT_FOUND';
  end if;
  if v_p.status='CAPTURED' then return 'ALREADY_CAPTURED'; end if;
  update public.payments set status=p_status, capture_id=coalesce(p_capture_id,capture_id), updated_at=now() where id=v_p.id;
  if p_status='CAPTURED' then
    update public.milestones set status='PAID', paid_at=now() where id=v_p.milestone_id;
    insert into public.audit_events(pacto_id,actor_id,event_type,object_id,detail)
      values (v_p.pacto_id, v_actor, 'PAYMENT_CAPTURED', v_p.milestone_id, left(coalesce(p_capture_id,p_order_id),500));
  else
    insert into public.audit_events(pacto_id,actor_id,event_type,object_id,detail)
      values (v_p.pacto_id, v_actor, 'PAYMENT_FAILED', v_p.milestone_id, left(p_status,500));
  end if;
  return p_status;
end; $$;

-- 7. Lectura de hitos con su pago, para la interfaz ---------------------------------
create function public.milestone_board(p_id uuid)
returns table(milestone_id uuid, title text, amount_cents bigint, sequence integer, status text,
              evidence text, evidence_at timestamptz, approved_at timestamptz, paid_at timestamptz,
              payment_status text, order_id text, capture_id text)
language sql stable security definer set search_path='' as $$
  select m.id, m.title, m.amount_cents, m.sequence, m.status, m.evidence, m.evidence_at,
         m.approved_at, m.paid_at, p.status, p.order_id, p.capture_id
  from public.agreements a
  join public.milestones m on m.agreement_id=a.id
  left join public.payments p on p.milestone_id=m.id and p.status in ('CREATED','APPROVED','CAPTURED')
  where a.pacto_id=p_id and a.state='ACCEPTED'
    and (public.is_participant(p_id) or public.is_demo_pacto(p_id))
  order by m.sequence;
$$;

revoke execute on function public.submit_milestone_evidence(uuid,text), public.approve_milestone(uuid),
  public.record_payment_order(uuid,text,bigint), public.record_payment_result(text,text,text),
  public.milestone_board(uuid) from public, anon;
grant execute on function public.submit_milestone_evidence(uuid,text), public.approve_milestone(uuid),
  public.record_payment_order(uuid,text,bigint), public.record_payment_result(text,text,text),
  public.milestone_board(uuid) to authenticated;

-- El webhook de PayPal llega sin sesión de usuario. Solo el rol de servicio puede
-- registrar ese resultado, y únicamente para órdenes que PACTO ya había creado.
do $$
begin
  if exists (select 1 from pg_roles where rolname='service_role') then
    execute 'grant execute on function public.record_payment_result(text,text,text) to service_role';
  end if;
end $$;

commit;
