-- PACTO: el cierre exige entrega cumplida, y una captura de pago solo la afirma el servidor.
-- Aplicar como propietario de base después de 202610120001_milestones_payments.sql.
-- Seguro para reintentos: si la migración ya existe, la transacción se revierte sin cambios.
--
-- No crea tablas, columnas, políticas ni permisos nuevos: solo reemplaza el cuerpo de dos
-- RPC existentes para cerrar dos transiciones inválidas que la auditoría reprodujo.
--
-- 1. confirm_closure permitía cerrar un Pacto con sus hitos en PENDING: sin evidencia del
--    proveedor, sin autorización del cliente y sin pago. El Pacto quedaba CLOSED mientras la
--    sección de entregas seguía diciendo «Pendiente de entrega», para siempre. Ahora el cierre
--    exige que cada hito del acuerdo aceptado esté APPROVED (el cliente revisó la evidencia)
--    o PAID. No exige el pago: PACTO no es escrow y el cierre nunca libera fondos.
--
-- 2. record_payment_result aceptaba p_status='CAPTURED' de cualquier participante con sesión.
--    El proveedor podía marcar su propio hito como PAID sin que PayPal hubiera cobrado nada,
--    inventando el identificador de comprobante. Una captura es un hecho externo: solo la
--    puede afirmar el servidor, que la verifica contra PayPal y escribe con el rol de
--    servicio (sin sesión de usuario). Con sesión, quien creó la orden solo puede abandonarla
--    (FAILED o CANCELLED).
--
-- Los Pactos ya cerrados no se tocan: confirm_closure solo actúa sobre Pactos ACTIVE.

begin;

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='payments') then
    raise exception 'PREREQUISITE_MISSING: aplicar primero 202610120001_milestones_payments.sql';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='confirm_closure'
      and pg_get_functiondef(p.oid) like '%DELIVERY_REQUIRED%'
  ) then
    raise exception 'MIGRATION_ALREADY_APPLIED: 202610130001_closure_requires_delivery.sql';
  end if;
end $$;

-- 1. Cierre: ninguna parte puede confirmar antes de que la entrega esté cumplida ---------
create or replace function public.confirm_closure(p_id uuid,p_note text default '') returns text
language plpgsql security definer set search_path='' as $$
declare v_pacto public.pactos; v_agreement uuid; v_count integer; v_note text := trim(coalesce(p_note,''));
begin
 select * into v_pacto from public.pactos where id=p_id for update;
 if v_pacto.id is null or not public.is_participant(p_id) then raise exception 'NOT_FOUND'; end if;
 if v_pacto.status<>'ACTIVE' then raise exception 'PACTO_NOT_ACTIVE'; end if;
 if length(v_note)>500 then raise exception 'INVALID_INPUT'; end if;
 if exists(select 1 from public.agreements where pacto_id=p_id and state in ('DRAFT','REVIEW')) then raise exception 'PENDING_PROPOSAL'; end if;
 select id into v_agreement from public.agreements where pacto_id=p_id and state='ACCEPTED';
 if v_agreement is null then raise exception 'INVALID_STATE'; end if;
 -- Requisito de entrega y evidencia: cada hito debe haber pasado por la evidencia del
 -- proveedor y la autorización del cliente. Cerrar antes dejaba el Pacto CLOSED con la
 -- entrega eternamente pendiente, sin forma de corregirlo.
 if exists(select 1 from public.milestones where agreement_id=v_agreement and status not in ('APPROVED','PAID')) then
  raise exception 'DELIVERY_REQUIRED';
 end if;
 insert into public.closure_confirmations(pacto_id,agreement_id,user_id,note) values(p_id,v_agreement,auth.uid(),v_note) on conflict do nothing;
 if found then
  insert into public.audit_events(pacto_id,actor_id,event_type,object_id,detail) values(p_id,auth.uid(),'CLOSURE_CONFIRMED',v_agreement,nullif(v_note,''));
 end if;
 select count(*) into v_count from public.closure_confirmations where pacto_id=p_id and agreement_id=v_agreement;
 if v_count=2 then
  update public.pactos set status='CLOSED', status_changed_at=now() where id=p_id;
  insert into public.audit_events(pacto_id,actor_id,event_type,object_id) values(p_id,auth.uid(),'PACTO_CLOSED',v_agreement);
  return 'CLOSED';
 end if;
 return 'CONFIRMED';
end; $$;

-- 2. Resultado del pago: una captura solo la afirma el servidor ---------------------------
-- Idempotente: repetir la misma captura no duplica el pago ni reescribe la auditoría.
create or replace function public.record_payment_result(p_order_id text, p_status text, p_capture_id text default null) returns text
language plpgsql security definer set search_path='' as $$
declare v_p public.payments; v_actor uuid := auth.uid();
begin
  if p_status not in ('CAPTURED','FAILED','CANCELLED') then raise exception 'INVALID_INPUT'; end if;
  select * into v_p from public.payments where order_id=p_order_id for update;
  if v_p.id is null then raise exception 'NOT_FOUND'; end if;
  -- Con sesión de usuario, solo quien creó la orden (el cliente) la conoce: para el
  -- proveedor y para un extraño la orden simplemente no existe.
  if v_actor is not null and v_p.created_by<>v_actor then raise exception 'NOT_FOUND'; end if;
  if v_p.status='CAPTURED' then return 'ALREADY_CAPTURED'; end if;
  -- Nadie declara un cobro desde el navegador. La captura la registra el servidor con el
  -- rol de servicio (sin sesión), después de verificarla contra PayPal o de recibir un
  -- webhook con firma válida.
  if v_actor is not null and p_status='CAPTURED' then raise exception 'CAPTURE_NOT_ALLOWED'; end if;
  -- El webhook llega sin sesión: entonces el actor auditado es quien creó la orden.
  v_actor := coalesce(v_actor, v_p.created_by);
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

commit;
