-- Reversión de 202610140001_refunds.sql.
--
-- ADVERTENCIA: vuelve a dejar PACTO sin tratamiento de reembolsos. Un reembolso hecho en
-- PayPal dejará de registrarse y el hito quedará como pagado. Usar solo para salir de una
-- incidencia causada por esta migración.
--
-- Se niega si existe algún pago ya reembolsado: revertir borraría ese rastro y dejaría
-- hitos marcados como pagados cuando el dinero ya volvió al cliente.

begin;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='payments' and column_name='refund_id') then
    raise exception 'NOTHING_TO_ROLLBACK: 202610140001_refunds.sql no está aplicada';
  end if;
  if exists (select 1 from public.payments where status='REFUNDED') then
    raise exception 'REFUNDS_EXIST: hay reembolsos registrados; revertir perdería ese rastro';
  end if;
end $$;

drop function public.record_payment_refund(text,text);

-- Tablero: se vuelve a la unión por «pago vivo».
create or replace function public.milestone_board(p_id uuid)
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

alter table public.payments drop constraint payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('CREATED','APPROVED','CAPTURED','FAILED','CANCELLED'));

alter table public.payments drop column refund_id, drop column refunded_at;

commit;
