-- PACTO Fase 2: cierre con doble confirmación, cancelación auditada y análisis de IA.
-- Aplicar como propietario de base después de 202610020001_foundation.sql.
-- Seguro para reintentos: si la migración ya existe, la transacción se revierte sin cambios.
-- Ver docs/supabase-migrations.md antes de ejecutar.

begin;

-- 0. Guardas: prerrequisito presente y migración no aplicada todavía -------------
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='participants') then
    raise exception 'PREREQUISITE_MISSING: aplicar primero 202610020001_foundation.sql';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='pactos' and column_name='status') then
    raise exception 'MIGRATION_ALREADY_APPLIED: 202610080001_closure_cancellation_ai.sql';
  end if;
end $$;

-- 1. Estado del Pacto y detalle de auditoría ------------------------------------
alter table public.pactos
  add column status text not null default 'ACTIVE' check (status in ('ACTIVE','CLOSED','CANCELLED')),
  add column status_reason text check (status_reason is null or length(status_reason) between 10 and 500),
  add column status_changed_at timestamptz;

alter table public.audit_events
  add column detail text check (detail is null or length(detail) <= 500);

-- 2. Confirmaciones de cierre (una por participante y versión aceptada) -----------
create table public.closure_confirmations (
  pacto_id uuid not null references public.pactos(id),
  agreement_id uuid not null references public.agreements(id),
  user_id uuid not null references auth.users(id),
  note text not null default '' check (length(note) <= 500),
  confirmed_at timestamptz not null default now(),
  primary key (pacto_id, user_id)
);

-- 3. Análisis de IA registrados como evidencia -------------------------------------
create table public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  pacto_id uuid not null references public.pactos(id),
  agreement_id uuid not null references public.agreements(id),
  requested_by uuid not null references auth.users(id),
  provider text not null check (provider = 'ANTHROPIC'),
  model text not null check (length(model) between 3 and 80),
  input_sha256 text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  result jsonb not null check (jsonb_typeof(result) = 'object' and pg_column_size(result) < 100000),
  created_at timestamptz not null default now()
);
create index ai_analyses_agreement on public.ai_analyses(agreement_id, created_at desc);

-- 4. RLS -----------------------------------------------------------------------------
alter table public.closure_confirmations enable row level security;
alter table public.ai_analyses enable row level security;
create policy member_closures on public.closure_confirmations for select to authenticated using(public.is_participant(pacto_id));
create policy member_ai_analyses on public.ai_analyses for select to authenticated using(public.is_participant(pacto_id));
revoke all on public.closure_confirmations, public.ai_analyses from anon, authenticated;
grant select on public.closure_confirmations, public.ai_analyses to authenticated;

-- 5. RPC existentes: ningún cambio de acuerdo con un Pacto cerrado o cancelado ----
create or replace function public.add_seller(p_id uuid,p_user_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.pactos where id=p_id for update;
 if not exists(select 1 from public.participants where pacto_id=p_id and user_id=auth.uid() and role='BUYER') then raise exception 'NOT_FOUND'; end if;
 if (select status from public.pactos where id=p_id)<>'ACTIVE' then raise exception 'PACTO_NOT_ACTIVE'; end if;
 if not exists(select 1 from public.agreements where pacto_id=p_id and state='DRAFT') then raise exception 'INVALID_STATE'; end if;
 if p_user_id=auth.uid() then raise exception 'DISTINCT_PARTIES_REQUIRED'; end if;
 insert into public.participants values(p_id,p_user_id,'SELLER');
 insert into public.audit_events(pacto_id,actor_id,event_type,object_id) values(p_id,auth.uid(),'PARTICIPANT_ADDED',p_user_id);
end; $$;

create or replace function public.submit_agreement(a_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.agreements;
begin
 select * into a from public.agreements where id=a_id for update;
 if a.id is null or not public.is_participant(a.pacto_id) then raise exception 'NOT_FOUND'; end if;
 if (select status from public.pactos where id=a.pacto_id)<>'ACTIVE' then raise exception 'PACTO_NOT_ACTIVE'; end if;
 if a.state<>'DRAFT' then raise exception 'INVALID_TRANSITION'; end if;
 if (select count(*) from public.participants where pacto_id=a.pacto_id)<>2 then raise exception 'BOTH_PARTIES_REQUIRED'; end if;
 if (select coalesce(sum(amount_cents),0) from public.milestones where agreement_id=a_id)<>a.total_cents then raise exception 'INVALID_TOTAL'; end if;
 update public.agreements set state='REVIEW' where id=a_id;
 insert into public.audit_events(pacto_id,actor_id,event_type,object_id) values(a.pacto_id,auth.uid(),'AGREEMENT_SUBMITTED',a_id);
end; $$;

create or replace function public.accept_agreement(a_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.agreements;
begin
 select * into a from public.agreements where id=a_id for update;
 if a.id is null or not public.is_participant(a.pacto_id) then raise exception 'NOT_FOUND'; end if;
 if (select status from public.pactos where id=a.pacto_id)<>'ACTIVE' then raise exception 'PACTO_NOT_ACTIVE'; end if;
 if a.state<>'REVIEW' then raise exception 'INVALID_TRANSITION'; end if;
 insert into public.acceptances(agreement_id,user_id) values(a_id,auth.uid()) on conflict do nothing;
 if found then
  insert into public.audit_events(pacto_id,actor_id,event_type,object_id) values(a.pacto_id,auth.uid(),'AGREEMENT_ACCEPTED',a_id);
 end if;
 if (select count(*) from public.acceptances where agreement_id=a_id)=2 then
  update public.agreements set state='SUPERSEDED' where pacto_id=a.pacto_id and state='ACCEPTED' and id<>a_id;
  update public.agreements set state='ACCEPTED' where id=a_id;
 end if;
end; $$;

create or replace function public.revise_agreement(a_id uuid,p_scope text,p_total_cents bigint) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.agreements; n uuid; m uuid;
begin
 select * into a from public.agreements where id=a_id for update;
 if a.id is null or not public.is_participant(a.pacto_id) then raise exception 'NOT_FOUND'; end if;
 if (select status from public.pactos where id=a.pacto_id)<>'ACTIVE' then raise exception 'PACTO_NOT_ACTIVE'; end if;
 if a.state='SUPERSEDED' then raise exception 'INVALID_TRANSITION'; end if;
 -- Cualquier cambio de alcance invalida las confirmaciones de cierre existentes.
 delete from public.closure_confirmations where pacto_id=a.pacto_id;
 if a.state='ACCEPTED' then
  insert into public.agreements(pacto_id,version,scope,total_cents) values(a.pacto_id,a.version+1,trim(p_scope),p_total_cents) returning id into n;
  insert into public.milestones(agreement_id,title,amount_cents,sequence) values(n,'Entrega acordada',p_total_cents,1) returning id into m;
  insert into public.acceptance_criteria(milestone_id,description) values(m,trim(p_scope));
 else
  n:=a_id;
  delete from public.acceptances where agreement_id=a_id;
  update public.agreements set scope=trim(p_scope),total_cents=p_total_cents,state='DRAFT' where id=a_id;
  update public.milestones set amount_cents=p_total_cents where agreement_id=a_id;
  update public.acceptance_criteria set description=trim(p_scope) where milestone_id in(select id from public.milestones where agreement_id=a_id);
 end if;
 insert into public.audit_events(pacto_id,actor_id,event_type,object_id) values(a.pacto_id,auth.uid(),'AGREEMENT_UPDATED',n);
 return n;
end; $$;

-- 6. Cierre con confirmación de ambas partes -------------------------------------
create function public.confirm_closure(p_id uuid,p_note text default '') returns text
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

-- 7. Cancelación con motivo obligatorio ------------------------------------------
create function public.cancel_pacto(p_id uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare v_pacto public.pactos; v_reason text := trim(coalesce(p_reason,''));
begin
 select * into v_pacto from public.pactos where id=p_id for update;
 if v_pacto.id is null or not public.is_participant(p_id) then raise exception 'NOT_FOUND'; end if;
 if v_pacto.status<>'ACTIVE' then raise exception 'PACTO_NOT_ACTIVE'; end if;
 if length(v_reason) not between 10 and 500 then raise exception 'INVALID_INPUT'; end if;
 update public.pactos set status='CANCELLED', status_reason=v_reason, status_changed_at=now() where id=p_id;
 insert into public.audit_events(pacto_id,actor_id,event_type,object_id,detail) values(p_id,auth.uid(),'PACTO_CANCELLED',p_id,v_reason);
end; $$;

-- 8. Análisis de IA: registro de evidencia por participantes -----------------------
create function public.record_ai_analysis(a_id uuid,p_model text,p_input_sha256 text,p_result jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_agreement public.agreements; v_id uuid;
begin
 select * into v_agreement from public.agreements where id=a_id;
 if v_agreement.id is null or not public.is_participant(v_agreement.pacto_id) then raise exception 'NOT_FOUND'; end if;
 insert into public.ai_analyses(pacto_id,agreement_id,requested_by,provider,model,input_sha256,result)
  values(v_agreement.pacto_id,a_id,auth.uid(),'ANTHROPIC',p_model,p_input_sha256,p_result) returning id into v_id;
 insert into public.audit_events(pacto_id,actor_id,event_type,object_id,detail)
  values(v_agreement.pacto_id,auth.uid(),'AI_ANALYSIS_RECORDED',a_id,left(p_model,500));
 return v_id;
end; $$;

-- 9. Permisos: solo usuarios autenticados ejecutan las RPC nuevas ----------------
revoke execute on function public.confirm_closure(uuid,text),public.cancel_pacto(uuid,text),public.record_ai_analysis(uuid,text,text,jsonb) from public,anon;
grant execute on function public.confirm_closure(uuid,text),public.cancel_pacto(uuid,text),public.record_ai_analysis(uuid,text,text,jsonb) to authenticated;

commit;
