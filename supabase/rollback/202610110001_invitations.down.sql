-- Reversión de 202610110001_invitations.sql. Ejecutar SOLO si hay que retirar las
-- invitaciones. No toca Pactos, acuerdos, participantes ni usuarios: los proveedores que
-- ya se unieron siguen siendo participantes. Se pierden únicamente los enlaces pendientes
-- (las filas de public.invitations) y los nombres legibles de participantes en la interfaz,
-- que vuelve a mostrar "Comprador"/"Proveedor".

begin;

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='invitations') then
    raise exception 'NOTHING_TO_ROLLBACK: 202610110001_invitations.sql no está aplicada';
  end if;
end $$;

drop function public.participant_directory(uuid);
drop function public.accept_invitation(text);
drop function public.invitation_preview(text);
drop function public.create_invitation(uuid, text);
drop table public.invitations;

commit;
