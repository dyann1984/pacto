-- Reversión de 202610130001_closure_requires_delivery.sql.
-- Restaura los cuerpos anteriores de confirm_closure y record_payment_result tal como los
-- dejaron 202610080001_closure_cancellation_ai.sql y 202610120001_milestones_payments.sql.
--
-- ADVERTENCIA: al revertir se vuelven a abrir las dos transiciones inválidas que la
-- migración cierra (cerrar un Pacto sin entrega cumplida, y declarar una captura de PayPal
-- desde una sesión de usuario). Usar solo para volver atrás en una incidencia, no de forma
-- permanente. No borra datos: ningún Pacto ni pago se modifica.

begin;

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

create or replace function public.record_payment_result(p_order_id text, p_status text, p_capture_id text default null) returns text
language plpgsql security definer set search_path='' as $$
declare v_p public.payments; v_actor uuid := auth.uid();
begin
  if p_status not in ('CAPTURED','FAILED','CANCELLED') then raise exception 'INVALID_INPUT'; end if;
  select * into v_p from public.payments where order_id=p_order_id for update;
  if v_p.id is null then raise exception 'NOT_FOUND'; end if;
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

commit;
