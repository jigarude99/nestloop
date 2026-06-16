-- =====================================================================
-- FASE 19 — Privacidad de turnos + poderes de administrador
-- Aplicado en Supabase (proyecto zzaqgynyezsgcbdynekc) el 2026-06-16.
-- =====================================================================
-- 18. Privacidad de turnos: un turno "oculto" solo lo ven sus participantes
--     y el administrador (como los gastos privados). El kiosk /tablero
--     tampoco muestra turnos ocultos (ver get_household_board, fase 18).
-- 19. El administrador puede gestionar TODO: editar/eliminar cualquier gasto
--     y marcar/deshacer cualquier turno (no solo el propio).
-- =====================================================================

alter table public.task_rotations
  add column if not exists hidden_from_non_participants boolean not null default false;

create or replace function public.can_read_rotation(target_rotation_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.task_rotations r
    where r.id = target_rotation_id
      and public.is_household_member(r.household_id)
      and (
        coalesce(r.hidden_from_non_participants, false) = false
        or public.is_household_admin(r.household_id)
        or exists (select 1 from public.task_rotation_members m
                   where m.rotation_id = r.id and m.profile_id = auth.uid())
      )
  );
$$;
revoke execute on function public.can_read_rotation(uuid) from public, anon;
grant execute on function public.can_read_rotation(uuid) to authenticated;

drop policy if exists "members read rotations" on public.task_rotations;
create policy "members read rotations" on public.task_rotations
  for select to authenticated using (public.can_read_rotation(id));
drop policy if exists "members read rotation members" on public.task_rotation_members;
create policy "members read rotation members" on public.task_rotation_members
  for select to authenticated using (public.can_read_rotation(rotation_id));
drop policy if exists "members read task events" on public.task_events;
create policy "members read task events" on public.task_events
  for select to authenticated using (public.can_read_rotation(rotation_id));

-- Admin: gestionar cualquier gasto
create or replace function public.can_manage_expense(target_expense_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.expenses e
    where e.id = target_expense_id
      and (e.created_by = auth.uid() or e.paid_by = auth.uid()
           or public.is_household_admin(e.household_id))
  );
$$;
drop policy if exists "creator deletes expense" on public.expenses;
create policy "creator deletes expense" on public.expenses
  for delete to authenticated
  using (created_by = auth.uid() or paid_by = auth.uid() or public.is_household_admin(household_id));

-- Admin: marcar/deshacer cualquier turno — ver complete_rotation / undo_rotation
-- (recreadas con bypass de admin; el cuerpo completo quedó aplicado por MCP).
