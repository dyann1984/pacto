-- PACTO: registrar un reembolso de PayPal identificándolo por su captura.
-- Aplicar como propietario de base después de 202610140001_refunds.sql.
-- Seguro para reintentos: si la migración ya existe, la transacción se revierte sin cambios.
--
-- Hallado en la prueba de extremo a extremo con PayPal Sandbox (12 de octubre de 2026): el
-- aviso firmado PAYMENT.CAPTURE.REFUNDED llega con el REEMBOLSO como recurso. No trae el
-- order_id; solo enlaza a la captura (rel "up"). El webhook intentaba traducir captura ->
-- orden leyendo `payments`, pero el rol de servicio no tiene SELECT sobre esa tabla (a
-- propósito: solo ejecuta funciones), así que el reembolso no se registraba.
--
-- En lugar de ampliar los permisos del rol de servicio, esta función hace la traducción
-- dentro de la base y delega en `record_payment_refund`, con sus mismas reglas: solo el
-- servidor sin sesión, solo lo que se cobró, idempotente y auditado.

begin;

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='record_payment_refund'
  ) then
    raise exception 'PREREQUISITE_MISSING: aplicar primero 202610140001_refunds.sql';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='record_payment_refund_by_capture'
  ) then
    raise exception 'MIGRATION_ALREADY_APPLIED: 202610150001_refund_by_capture.sql';
  end if;
end $$;

create function public.record_payment_refund_by_capture(p_capture_id text, p_refund_id text default null) returns text
language plpgsql security definer set search_path='' as $$
declare v_order text;
begin
  -- Igual que record_payment_refund: nadie declara un reembolso desde el navegador.
  if auth.uid() is not null then raise exception 'REFUND_NOT_ALLOWED'; end if;
  if p_capture_id is null or length(p_capture_id) not between 3 and 128 then raise exception 'INVALID_INPUT'; end if;
  select order_id into v_order from public.payments where capture_id=p_capture_id;
  if v_order is null then raise exception 'NOT_FOUND'; end if;
  return public.record_payment_refund(v_order, p_refund_id);
end; $$;

-- Solo el rol de servicio (el webhook firmado). Ningún cliente.
revoke execute on function public.record_payment_refund_by_capture(text,text) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname='service_role') then
    execute 'grant execute on function public.record_payment_refund_by_capture(text,text) to service_role';
  end if;
end $$;

commit;
