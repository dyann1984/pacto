-- PACTO: preflight de solo lectura. Ejecutar antes de cualquier migración.
-- No modifica nada. Cada fila indica si el objeto ya existe en el proyecto.
-- Interpretación:
--   Todo false              -> base limpia: aplicar 202610020001_foundation.sql
--   Solo foundation true    -> aplicar 202610080001_closure_cancellation_ai.sql
--   Todo true               -> ambas aplicadas: no volver a ejecutar migraciones
-- Si algún objeto de foundation falta y el resto existe, detenerse y revisar a mano.

select check_name, ok
from (values
  ('foundation: tabla participants',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='participants')),
  ('foundation: rpc create_pacto',
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_pacto')),
  ('foundation: RLS activo en pactos',
    coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='pactos'), false)),
  ('cierre: columna pactos.status',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='pactos' and column_name='status')),
  ('cierre: columna audit_events.detail',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='audit_events' and column_name='detail')),
  ('cierre: tabla closure_confirmations',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='closure_confirmations')),
  ('cierre: rpc confirm_closure',
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='confirm_closure')),
  ('cierre: rpc cancel_pacto',
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cancel_pacto')),
  ('ia: tabla ai_analyses',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='ai_analyses')),
  ('ia: rpc record_ai_analysis',
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_ai_analysis')),
  ('ia: RLS activo en ai_analyses',
    coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='ai_analyses'), false)),
  ('seguridad: anon sin SELECT en pactos',
    case when to_regclass('public.pactos') is null then false
         else not has_table_privilege('anon', 'public.pactos', 'SELECT') end),
  ('roles: columna profiles.role',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='role')),
  ('roles: trigger on_auth_user_created',
    exists(select 1 from pg_trigger where tgname='on_auth_user_created')),
  ('roles: rpc admin_list_users',
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_list_users')),
  -- La asignación de admin a la propietaria se verifica aparte (202610090002), no aquí:
  -- referenciar profiles.role directamente falla en tiempo de análisis si la columna no existe todavía.
  ('demo: columna pactos.is_demo_example',
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='pactos' and column_name='is_demo_example')),
  ('demo: rpc is_demo_pacto',
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='is_demo_pacto')),
  ('invitaciones: tabla invitations',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='invitations')),
  ('invitaciones: rpc accept_invitation',
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='accept_invitation')),
  ('pagos: tabla payments',
    exists(select 1 from information_schema.tables where table_schema='public' and table_name='payments')),
  ('pagos: rpc record_payment_result',
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_payment_result'))
) as checks(check_name, ok);
