-- =====================================================================
-- FASE 12 — NestLoop: ownership real para horarios
-- =====================================================================
-- Qué resuelve:
--   * Cada horario guarda quién lo creó (`created_by`).
--   * Admins pueden editar/eliminar cualquier horario de su casa.
--   * Miembros solo pueden editar/eliminar horarios creados por ellos.
--   * Los horarios existentes se asignan al admin de la casa si existe;
--     si no hay admin, se asignan a la persona del propio horario.
-- =====================================================================

alter table public.schedule_slots
  add column if not exists created_by uuid references public.profiles(id);

update public.schedule_slots ss
set created_by = coalesce(
  (
    select hm.profile_id
    from public.household_members hm
    where hm.household_id = ss.household_id
      and hm.role = 'admin'
    order by hm.created_at asc
    limit 1
  ),
  ss.profile_id
)
where ss.created_by is null;

alter table public.schedule_slots
  alter column created_by set not null;

create index if not exists schedule_slots_created_by_idx
  on public.schedule_slots(created_by);
create index if not exists schedule_slots_household_id_idx
  on public.schedule_slots(household_id);
create index if not exists schedule_slots_profile_id_idx
  on public.schedule_slots(profile_id);

create or replace function public.is_household_member_profile(
  target_household_id uuid,
  target_profile_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household_id
      and hm.profile_id = target_profile_id
  );
$$;

revoke execute on function public.is_household_member_profile(uuid, uuid)
  from public, anon;
grant execute on function public.is_household_member_profile(uuid, uuid)
  to authenticated;

revoke update on table public.schedule_slots from authenticated;
grant update (profile_id, day_of_week, starts_at, ends_at, label)
  on table public.schedule_slots
  to authenticated;

drop policy if exists "members read slots" on public.schedule_slots;
create policy "members read slots" on public.schedule_slots
  for select
  to authenticated
  using (public.is_household_member(household_id));

drop policy if exists "members create slots" on public.schedule_slots;
drop policy if exists "members create own slots" on public.schedule_slots;
create policy "members create own slots" on public.schedule_slots
  for insert
  to authenticated
  with check (
    public.is_household_member(household_id)
    and created_by = (select auth.uid())
    and public.is_household_member_profile(household_id, profile_id)
  );

drop policy if exists "members update slots" on public.schedule_slots;
drop policy if exists "admins and creators update slots" on public.schedule_slots;
create policy "admins and creators update slots" on public.schedule_slots
  for update
  to authenticated
  using (
    public.is_household_member(household_id)
    and (
      public.is_household_admin(household_id)
      or created_by = (select auth.uid())
    )
  )
  with check (
    public.is_household_member(household_id)
    and public.is_household_member_profile(household_id, profile_id)
    and (
      public.is_household_admin(household_id)
      or created_by = (select auth.uid())
    )
  );

drop policy if exists "members delete slots" on public.schedule_slots;
drop policy if exists "admins and creators delete slots" on public.schedule_slots;
create policy "admins and creators delete slots" on public.schedule_slots
  for delete
  to authenticated
  using (
    public.is_household_member(household_id)
    and (
      public.is_household_admin(household_id)
      or created_by = (select auth.uid())
    )
  );
