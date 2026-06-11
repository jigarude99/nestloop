-- =====================================================================
-- FASE 7 — NestLoop: RLS completo, Storage, onboarding y trigger de perfiles
-- =====================================================================
-- Aplicado en Supabase (proyecto zzaqgynyezsgcbdynekc) el 2026-06-10.
-- Idempotente: se puede volver a correr sin romper nada.
--
-- Qué resuelve (auditoría Fase 7):
--   * Tablas de turnos/horarios tenían RLS habilitado pero CERO políticas
--     (quedaban inaccesibles). Ahora tienen CRUD completo por household.
--   * Faltaban políticas de escritura (crear divisiones de gasto, gestionar
--     miembros, editar/borrar). Añadidas.
--   * Buckets de Storage 'receipts' y 'payment-proofs' sin políticas.
--     Añadidas (acceso solo a miembros del household; 1er segmento de la
--     ruta del archivo = household_id).
--   * No existía trigger para crear el profile al registrarse un usuario.
--     Añadido (on_auth_user_created).
--   * Onboarding: funciones create_household() y join_household() + columna
--     households.invite_code para unirse con un código corto.
--
-- Convención de rutas en Storage: <household_id>/<...>/archivo
-- =====================================================================

-- 0. Código de invitación -------------------------------------------------
alter table public.households add column if not exists invite_code text;
create unique index if not exists households_invite_code_key
  on public.households (invite_code);

-- 1. Funciones helper (SECURITY DEFINER => evitan recursión en RLS) --------
create or replace function public.is_household_member(target_household_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.household_members hm
    where hm.household_id = target_household_id and hm.profile_id = auth.uid());
$$;

create or replace function public.is_household_admin(target_household_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.household_members hm
    where hm.household_id = target_household_id
      and hm.profile_id = auth.uid() and hm.role = 'admin');
$$;

create or replace function public.can_read_expense(target_expense_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.expenses e
    where e.id = target_expense_id and public.is_household_member(e.household_id));
$$;

create or replace function public.can_manage_expense(target_expense_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.expenses e
    where e.id = target_expense_id
      and (e.created_by = auth.uid() or e.paid_by = auth.uid()));
$$;

create or replace function public.can_access_rotation(target_rotation_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.task_rotations r
    where r.id = target_rotation_id and public.is_household_member(r.household_id));
$$;

grant execute on function public.is_household_member(uuid) to anon, authenticated;
grant execute on function public.is_household_admin(uuid)  to anon, authenticated;
grant execute on function public.can_read_expense(uuid)    to anon, authenticated;
grant execute on function public.can_manage_expense(uuid)  to anon, authenticated;
grant execute on function public.can_access_rotation(uuid) to anon, authenticated;

-- 2. Onboarding RPC (SECURITY DEFINER => sortean el bootstrap de RLS) ------
create or replace function public.create_household(p_name text)
returns public.households language plpgsql security definer set search_path = public as $$
declare v_household public.households; v_code text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.households where invite_code = v_code);
  end loop;
  insert into public.households (name, invite_code)
    values (coalesce(nullif(trim(p_name), ''), 'Mi casa'), v_code)
    returning * into v_household;
  insert into public.household_members (household_id, profile_id, role)
    values (v_household.id, auth.uid(), 'admin');
  return v_household;
end; $$;

create or replace function public.join_household(p_invite_code text)
returns public.households language plpgsql security definer set search_path = public as $$
declare v_household public.households;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select * into v_household from public.households where invite_code = upper(trim(p_invite_code));
  if not found then raise exception 'Código de invitación inválido'; end if;
  insert into public.household_members (household_id, profile_id, role)
    values (v_household.id, auth.uid(), 'member')
    on conflict (household_id, profile_id) do nothing;
  return v_household;
end; $$;

-- Onboarding requiere sesión iniciada (sin acceso anónimo)
revoke execute on function public.create_household(text) from anon, public;
revoke execute on function public.join_household(text)   from anon, public;
grant  execute on function public.create_household(text) to authenticated;
grant  execute on function public.join_household(text)   to authenticated;

-- 3. Trigger: crear profile al registrarse un usuario ---------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
                           split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end; $$;
-- Es trigger, no debe exponerse como RPC
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- 4. Políticas RLS faltantes ---------------------------------------------
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "admins update household" on public.households;
create policy "admins update household" on public.households for update
  using (public.is_household_admin(id)) with check (public.is_household_admin(id));

drop policy if exists "admins add members" on public.household_members;
create policy "admins add members" on public.household_members for insert
  with check (public.is_household_admin(household_id));
drop policy if exists "admins update members" on public.household_members;
create policy "admins update members" on public.household_members for update
  using (public.is_household_admin(household_id)) with check (public.is_household_admin(household_id));
drop policy if exists "admins remove members" on public.household_members;
create policy "admins remove members" on public.household_members for delete
  using (public.is_household_admin(household_id));

drop policy if exists "managers update expense" on public.expenses;
create policy "managers update expense" on public.expenses for update
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
drop policy if exists "creator deletes expense" on public.expenses;
create policy "creator deletes expense" on public.expenses for delete
  using (created_by = auth.uid() or paid_by = auth.uid());

drop policy if exists "managers create shares" on public.expense_shares;
create policy "managers create shares" on public.expense_shares for insert
  with check (public.can_manage_expense(expense_id));
drop policy if exists "managers delete shares" on public.expense_shares;
create policy "managers delete shares" on public.expense_shares for delete
  using (public.can_manage_expense(expense_id));

drop policy if exists "members read rotations" on public.task_rotations;
create policy "members read rotations" on public.task_rotations for select
  using (public.is_household_member(household_id));
drop policy if exists "members create rotations" on public.task_rotations;
create policy "members create rotations" on public.task_rotations for insert
  with check (public.is_household_member(household_id));
drop policy if exists "members update rotations" on public.task_rotations;
create policy "members update rotations" on public.task_rotations for update
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
drop policy if exists "members delete rotations" on public.task_rotations;
create policy "members delete rotations" on public.task_rotations for delete
  using (public.is_household_member(household_id));

drop policy if exists "members read rotation members" on public.task_rotation_members;
create policy "members read rotation members" on public.task_rotation_members for select
  using (public.can_access_rotation(rotation_id));
drop policy if exists "members create rotation members" on public.task_rotation_members;
create policy "members create rotation members" on public.task_rotation_members for insert
  with check (public.can_access_rotation(rotation_id));
drop policy if exists "members update rotation members" on public.task_rotation_members;
create policy "members update rotation members" on public.task_rotation_members for update
  using (public.can_access_rotation(rotation_id)) with check (public.can_access_rotation(rotation_id));
drop policy if exists "members delete rotation members" on public.task_rotation_members;
create policy "members delete rotation members" on public.task_rotation_members for delete
  using (public.can_access_rotation(rotation_id));

drop policy if exists "members read task events" on public.task_events;
create policy "members read task events" on public.task_events for select
  using (public.can_access_rotation(rotation_id));
drop policy if exists "members create task events" on public.task_events;
create policy "members create task events" on public.task_events for insert
  with check (public.can_access_rotation(rotation_id) and profile_id = auth.uid());
drop policy if exists "members delete task events" on public.task_events;
create policy "members delete task events" on public.task_events for delete
  using (public.can_access_rotation(rotation_id));

drop policy if exists "members read slots" on public.schedule_slots;
create policy "members read slots" on public.schedule_slots for select
  using (public.is_household_member(household_id));
drop policy if exists "members create slots" on public.schedule_slots;
create policy "members create slots" on public.schedule_slots for insert
  with check (public.is_household_member(household_id));
drop policy if exists "members update slots" on public.schedule_slots;
create policy "members update slots" on public.schedule_slots for update
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
drop policy if exists "members delete slots" on public.schedule_slots;
create policy "members delete slots" on public.schedule_slots for delete
  using (public.is_household_member(household_id));

-- 5. Storage: buckets 'receipts' y 'payment-proofs' -----------------------
-- Ruta: <household_id>/<...>/archivo  (1er segmento = household)
drop policy if exists "household members read files" on storage.objects;
create policy "household members read files" on storage.objects for select to authenticated
  using (bucket_id in ('receipts','payment-proofs')
    and public.is_household_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "household members upload files" on storage.objects;
create policy "household members upload files" on storage.objects for insert to authenticated
  with check (bucket_id in ('receipts','payment-proofs')
    and public.is_household_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "household members update files" on storage.objects;
create policy "household members update files" on storage.objects for update to authenticated
  using (bucket_id in ('receipts','payment-proofs')
    and public.is_household_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "household members delete files" on storage.objects;
create policy "household members delete files" on storage.objects for delete to authenticated
  using (bucket_id in ('receipts','payment-proofs')
    and public.is_household_member(((storage.foldername(name))[1])::uuid));
