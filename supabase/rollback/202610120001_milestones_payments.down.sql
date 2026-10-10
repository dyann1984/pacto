-- Reversión de 202610120001_milestones_payments.sql. Ejecutar SOLO si hay que retirar
-- hitos con evidencia y pagos. No toca Pactos, acuerdos, participantes ni usuarios.
-- Se pierden los registros de pagos de Sandbox y la evidencia de cumplimiento.

begin;

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='payments') then
    raise exception 'NOTHING_TO_ROLLBACK: 202610120001_milestones_payments.sql no está aplicada';
  end if;
end $$;

drop function public.milestone_board(uuid);
drop function public.record_payment_result(text,text,text);
drop function public.record_payment_order(uuid,text,bigint);
drop function public.approve_milestone(uuid);
drop function public.submit_milestone_evidence(uuid,text);
drop table public.payments;
alter table public.milestones
  drop column status,
  drop column evidence,
  drop column evidence_at,
  drop column approved_at,
  drop column paid_at;

commit;
