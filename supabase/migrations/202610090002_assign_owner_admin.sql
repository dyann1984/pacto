-- PACTO: asignación administrativa controlada, una sola vez.
-- Promueve a role='admin' EXCLUSIVAMENTE la cuenta de la propietaria del proyecto,
-- verificando que el UUID y el correo coincidan en auth.users antes de escribir nada.
-- No toca auth.users: no modifica contraseña, correo ni identidad de la cuenta.
-- Seguro para reintentos: si la verificación falla, no se aplica ningún cambio.

begin;

do $$
declare v_count integer;
begin
  select count(*) into v_count from auth.users
    where id = 'ea8e6fb5-323c-4565-abd8-647cf12d2c3e'::uuid
      and email = 'dianalopez161184@gmail.com';
  if v_count <> 1 then
    raise exception 'OWNER_VERIFICATION_FAILED: no se encontró una fila de auth.users que coincida con el UUID y el correo esperados. No se aplicó ningún cambio.';
  end if;
end $$;

insert into public.profiles(id, role)
values ('ea8e6fb5-323c-4565-abd8-647cf12d2c3e'::uuid, 'admin')
on conflict (id) do update set role = 'admin';

commit;
