-- Apply through the Supabase SQL editor as database owner. No service key in app.
create table public.profiles (
 id uuid primary key references auth.users(id), display_name text not null default ''
);
create table public.pactos (
 id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 4 and 120),
 environment text not null default 'DEMO' check(environment='DEMO'),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.participants (
 pacto_id uuid not null references public.pactos(id), user_id uuid not null references auth.users(id),
 role text not null check(role in ('BUYER','SELLER')), primary key(pacto_id,user_id), unique(pacto_id,role)
);
create table public.agreements (
 id uuid primary key default gen_random_uuid(), pacto_id uuid not null references public.pactos(id),
 version integer not null check(version>0), state text not null default 'DRAFT' check(state in ('DRAFT','REVIEW','ACCEPTED','SUPERSEDED')),
 scope text not null check(length(scope) between 10 and 5000), total_cents bigint not null check(total_cents between 100 and 100000000),
 currency text not null default 'MXN' check(currency='MXN'), created_at timestamptz not null default now(), unique(pacto_id,version)
);
create unique index one_draft_agreement on public.agreements(pacto_id) where state in ('DRAFT','REVIEW');
create unique index one_accepted_agreement on public.agreements(pacto_id) where state='ACCEPTED';
create table public.milestones (
 id uuid primary key default gen_random_uuid(), agreement_id uuid not null references public.agreements(id),
 title text not null, amount_cents bigint not null check(amount_cents>0), sequence integer not null check(sequence>0), unique(agreement_id,sequence)
);
create table public.acceptance_criteria (
 id uuid primary key default gen_random_uuid(), milestone_id uuid not null references public.milestones(id), description text not null
);
create table public.acceptances (
 agreement_id uuid not null references public.agreements(id), user_id uuid not null references auth.users(id),
 accepted_at timestamptz not null default now(), primary key(agreement_id,user_id)
);
create table public.audit_events (
 id uuid primary key default gen_random_uuid(), pacto_id uuid not null references public.pactos(id), actor_id uuid not null references auth.users(id),
 event_type text not null, object_id uuid not null, created_at timestamptz not null default now()
);
create index participants_user on public.participants(user_id,pacto_id);
create index agreements_pacto on public.agreements(pacto_id);
create index audit_pacto on public.audit_events(pacto_id,created_at);

create function public.is_participant(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.participants where pacto_id=p_id and user_id=auth.uid());
$$;
create function public.can_read_agreement(a_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.agreements a where a.id=a_id and public.is_participant(a.pacto_id));
$$;
create function public.can_read_milestone(m_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.milestones m where m.id=m_id and public.can_read_agreement(m.agreement_id));
$$;
alter table public.profiles enable row level security;
alter table public.pactos enable row level security;
alter table public.participants enable row level security;
alter table public.agreements enable row level security;
alter table public.milestones enable row level security;
alter table public.acceptance_criteria enable row level security;
alter table public.acceptances enable row level security;
alter table public.audit_events enable row level security;
create policy own_profile on public.profiles for select to authenticated using(id=auth.uid());
create policy member_pactos on public.pactos for select to authenticated using(public.is_participant(id));
create policy member_participants on public.participants for select to authenticated using(public.is_participant(pacto_id));
create policy member_agreements on public.agreements for select to authenticated using(public.is_participant(pacto_id));
create policy member_milestones on public.milestones for select to authenticated using(public.can_read_agreement(agreement_id));
create policy member_criteria on public.acceptance_criteria for select to authenticated using(public.can_read_milestone(milestone_id));
create policy member_acceptances on public.acceptances for select to authenticated using(public.can_read_agreement(agreement_id));
create policy member_audit on public.audit_events for select to authenticated using(public.is_participant(pacto_id));
revoke all on public.profiles,public.pactos,public.participants,public.agreements,public.milestones,public.acceptance_criteria,public.acceptances,public.audit_events from anon,authenticated;
grant select on public.profiles,public.pactos,public.participants,public.agreements,public.milestones,public.acceptance_criteria,public.acceptances,public.audit_events to authenticated;

create function public.create_pacto(p_title text,p_scope text,p_total_cents bigint,p_environment text default 'DEMO') returns uuid
language plpgsql security definer set search_path='' as $$
declare p uuid; a uuid; m uuid; u uuid := auth.uid();
begin
 if u is null then raise exception 'AUTH_REQUIRED'; end if;
 insert into public.profiles(id) values(u) on conflict do nothing;
 insert into public.pactos(title,created_by,environment) values(trim(p_title),u,p_environment) returning id into p;
 insert into public.participants values(p,u,'BUYER');
 insert into public.agreements(pacto_id,version,scope,total_cents) values(p,1,trim(p_scope),p_total_cents) returning id into a;
 insert into public.milestones(agreement_id,title,amount_cents,sequence) values(a,'Entrega acordada',p_total_cents,1) returning id into m;
 insert into public.acceptance_criteria(milestone_id,description) values(m,trim(p_scope));
 insert into public.audit_events(pacto_id,actor_id,event_type,object_id) values
 (p,u,'PACTO_CREATED',p),(p,u,'PARTICIPANT_ADDED',u),(p,u,'AGREEMENT_CREATED',a);
 return p;
end; $$;

create function public.add_seller(p_id uuid,p_user_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.pactos where id=p_id for update;
 if not exists(select 1 from public.participants where pacto_id=p_id and user_id=auth.uid() and role='BUYER') then raise exception 'NOT_FOUND'; end if;
 if not exists(select 1 from public.agreements where pacto_id=p_id and state='DRAFT') then raise exception 'INVALID_STATE'; end if;
 if p_user_id=auth.uid() then raise exception 'DISTINCT_PARTIES_REQUIRED'; end if;
 insert into public.participants values(p_id,p_user_id,'SELLER');
 insert into public.audit_events(pacto_id,actor_id,event_type,object_id) values(p_id,auth.uid(),'PARTICIPANT_ADDED',p_user_id);
end; $$;

create function public.submit_agreement(a_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.agreements;
begin
 select * into a from public.agreements where id=a_id for update;
 if a.id is null or not public.is_participant(a.pacto_id) then raise exception 'NOT_FOUND'; end if;
 if a.state<>'DRAFT' then raise exception 'INVALID_TRANSITION'; end if;
 if (select count(*) from public.participants where pacto_id=a.pacto_id)<>2 then raise exception 'BOTH_PARTIES_REQUIRED'; end if;
 if (select coalesce(sum(amount_cents),0) from public.milestones where agreement_id=a_id)<>a.total_cents then raise exception 'INVALID_TOTAL'; end if;
 update public.agreements set state='REVIEW' where id=a_id;
 insert into public.audit_events(pacto_id,actor_id,event_type,object_id) values(a.pacto_id,auth.uid(),'AGREEMENT_SUBMITTED',a_id);
end; $$;

create function public.accept_agreement(a_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.agreements;
begin
 select * into a from public.agreements where id=a_id for update;
 if a.id is null or not public.is_participant(a.pacto_id) then raise exception 'NOT_FOUND'; end if;
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

create function public.revise_agreement(a_id uuid,p_scope text,p_total_cents bigint) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.agreements; n uuid; m uuid;
begin
 select * into a from public.agreements where id=a_id for update;
 if a.id is null or not public.is_participant(a.pacto_id) then raise exception 'NOT_FOUND'; end if;
 if a.state='SUPERSEDED' then raise exception 'INVALID_TRANSITION'; end if;
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

revoke execute on function public.is_participant(uuid),public.can_read_agreement(uuid),public.can_read_milestone(uuid),public.create_pacto(text,text,bigint,text),public.add_seller(uuid,uuid),public.submit_agreement(uuid),public.accept_agreement(uuid),public.revise_agreement(uuid,text,bigint) from public,anon;
grant execute on function public.is_participant(uuid),public.can_read_agreement(uuid),public.can_read_milestone(uuid),public.create_pacto(text,text,bigint,text),public.add_seller(uuid,uuid),public.submit_agreement(uuid),public.accept_agreement(uuid),public.revise_agreement(uuid,text,bigint) to authenticated;
