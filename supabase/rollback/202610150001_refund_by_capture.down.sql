-- Revierte 202610150001_refund_by_capture.sql. Solo elimina la función nueva: no toca pagos,
-- hitos ni auditoría. Tras revertir, un reembolso cuyo aviso no traiga order_id vuelve a no
-- registrarse (el webhook lo reconoce con 200 y lo deja en el registro de errores).
begin;
drop function if exists public.record_payment_refund_by_capture(text,text);
commit;
