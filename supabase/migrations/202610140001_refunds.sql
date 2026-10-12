-- PACTO: reembolsos de PayPal Sandbox, registrados solo cuando PayPal los confirma.
-- Aplicar como propietario de base después de 202610130001_closure_requires_delivery.sql.
-- Seguro para reintentos: si la migración ya existe, la transacción se revierte sin cambios.
--
-- Cierra el riesgo R-4 de docs/audit-report-2026-10-10.md: hasta ahora un reembolso hecho
-- en PayPal no dejaba rastro en PACTO. El aviso `PAYMENT.CAPTURE.REFUNDED` se reconocía y
-- no revertía nada, y un `PAYMENT.CAPTURE.REVERSED` posterior a la captura recibía
-- `ALREADY_CAPTURED` sin cambiar ni auditar nada. El hito quedaba `PAID` para siempre.
--
-- Principio, el mismo que rige la captura: un reembolso es un hecho externo. PACTO no lo
-- declara, lo registra. Solo lo escribe el servidor sin sesión de usuario (rol de
-- servicio), tras un webhook de PayPal con firma verificada. Ninguna sesión de cliente
-- puede marcar un pago como reembolsado.
--
-- Efecto sobre el hito: vuelve de `PAID` a `APPROVED`. Sigue entregado y autorizado —la
-- entrega no se deshace— pero deja de constar como pagado, y el cliente puede volver a
-- pagarlo. El cierre del Pacto no se bloquea: cerrar nunca dependió del pago.

begin;

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='payments') then
    raise exception 'PREREQUISITE_MISSING: aplicar primero 202610120001_milestones_payments.sql';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='record_payment_result'
      and pg_get_functiondef(p.oid) like '%CAPTURE_NOT_ALLOWED%'
  ) then
    raise exception 'PREREQUISITE_MISSING: aplicar primero 202610130001_closure_requires_delivery.sql';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='payments' and column_name='refund_id') then
    raise exception 'MIGRATION_ALREADY_APPLIED: 202610140001_refunds.sql';
  end if;
end $$;

-- 1. Estado y rastro del reembolso ------------------------------------------------
alter table public.payments
  add column refund_id text check (refund_id is null or length(refund_id) between 3 and 128),
  add column refunded_at timestamptz;

alter table public.payments drop constraint payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('CREATED','APPROVED','CAPTURED','FAILED','CANCELLED','REFUNDED'));

-- `REFUNDED` queda FUERA del índice de pago vivo: un hito reembolsado vuelve a admitir
-- una orden nueva, igual que uno cancelado.
--   create unique index one_open_payment_per_milestone ... where status in ('CREATED','APPROVED','CAPTURED')

-- 2. Registrar el reembolso que PayPal confirma -------------------------------------
-- Idempotente: repetir el mismo aviso no duplica la auditoría ni reescribe el rastro.
create function public.record_payment_refund(p_order_id text, p_refund_id text default null) returns text
language plpgsql security definer set search_path='' as $$
declare v_p public.payments;
begin
  -- Nadie declara un reembolso desde el navegador. Solo el servidor sin sesión, igual
  -- que con la captura: la fuente de verdad es el webhook firmado de PayPal.
  if auth.uid() is not null then raise exception 'REFUND_NOT_ALLOWED'; end if;
  select * into v_p from public.payments where order_id=p_order_id for update;
  if v_p.id is null then raise exception 'NOT_FOUND'; end if;
  if v_p.status='REFUNDED' then return 'ALREADY_REFUNDED'; end if;
  -- Solo se reembolsa lo que se llegó a cobrar.
  if v_p.status<>'CAPTURED' then raise exception 'INVALID_TRANSITION'; end if;

  update public.payments
     set status='REFUNDED', refund_id=coalesce(p_refund_id, refund_id), refunded_at=now(), updated_at=now()
   where id=v_p.id;
  -- La entrega sigue entregada y autorizada; solo deja de constar como pagada.
  update public.milestones set status='APPROVED', paid_at=null where id=v_p.milestone_id;
  insert into public.audit_events(pacto_id,actor_id,event_type,object_id,detail)
    values (v_p.pacto_id, v_p.created_by, 'PAYMENT_REFUNDED', v_p.milestone_id,
            left(coalesce(p_refund_id, v_p.capture_id, p_order_id),500));
  return 'REFUNDED';
end; $$;

-- 3. El tablero muestra el reembolso en vez de ocultarlo ----------------------------
-- Antes se unía al «pago vivo»; un pago reembolsado desaparecía y el hito parecía no
-- haberse pagado nunca. Ahora se toma el pago relevante más reciente, que puede estar
-- reembolsado. Se mantienen fuera FAILED y CANCELLED, como hasta ahora, y el LATERAL
-- garantiza una sola fila por hito aunque haya un intento posterior.
create or replace function public.milestone_board(p_id uuid)
returns table(milestone_id uuid, title text, amount_cents bigint, sequence integer, status text,
              evidence text, evidence_at timestamptz, approved_at timestamptz, paid_at timestamptz,
              payment_status text, order_id text, capture_id text)
language sql stable security definer set search_path='' as $$
  select m.id, m.title, m.amount_cents, m.sequence, m.status, m.evidence, m.evidence_at,
         m.approved_at, m.paid_at, p.status, p.order_id, p.capture_id
  from public.agreements a
  join public.milestones m on m.agreement_id=a.id
  left join lateral (
    select pay.status, pay.order_id, pay.capture_id
    from public.payments pay
    where pay.milestone_id=m.id and pay.status in ('CREATED','APPROVED','CAPTURED','REFUNDED')
    order by pay.created_at desc
    limit 1
  ) p on true
  where a.pacto_id=p_id and a.state='ACCEPTED'
    and (public.is_participant(p_id) or public.is_demo_pacto(p_id))
  order by m.sequence;
$$;

-- 4. Permisos: la RPC de reembolso NO se concede a los clientes ---------------------
revoke execute on function public.record_payment_refund(text,text) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname='service_role') then
    execute 'grant execute on function public.record_payment_refund(text,text) to service_role';
  end if;
end $$;

commit;
