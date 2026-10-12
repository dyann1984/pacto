-- Revierte 202610160001_ai_quota.sql. No toca ningún análisis. Tras revertir, la aplicación
-- no puede consultar el cupo y rechaza el análisis (falla cerrado), así que revertir la base
-- exige revertir antes el código que llama a ai_quota().
begin;
drop function if exists public.ai_quota();
drop index if exists public.ai_analyses_created_at_idx;
commit;
