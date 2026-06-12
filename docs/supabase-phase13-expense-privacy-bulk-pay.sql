-- =====================================================================
-- FASE 13 - NestLoop: privacidad de gastos y "pagar por todos"
-- =====================================================================
-- Que resuelve:
--   * Permite ocultar un gasto a quienes no participan.
--   * Archiva el gasto original cuando alguien cubre el saldo pendiente.
--   * Crea automaticamente un gasto de reembolso para quienes aun deben.
-- =====================================================================

alter table public.expenses
  add column if not exists hidden_from_non_participants boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists reimburses_expense_id uuid references public.expenses(id) on delete set null;

create index if not exists expenses_archived_at_idx
  on public.expenses(archived_at);
create index if not exists expenses_reimburses_expense_id_idx
  on public.expenses(reimburses_expense_id);

create or replace function public.can_read_expense(target_expense_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.expenses e
    where e.id = target_expense_id
      and e.archived_at is null
      and public.is_household_member(e.household_id)
      and (
        e.hidden_from_non_participants = false
        or e.created_by = (select auth.uid())
        or e.paid_by = (select auth.uid())
        or exists (
          select 1
          from public.expense_shares s
          where s.expense_id = e.id
            and s.profile_id = (select auth.uid())
        )
      )
  );
$$;

revoke execute on function public.can_read_expense(uuid) from public, anon;
grant execute on function public.can_read_expense(uuid) to authenticated;

drop policy if exists "members can read household expenses" on public.expenses;
create policy "members can read household expenses" on public.expenses
  for select
  to authenticated
  using (public.can_read_expense(id));

drop policy if exists "managers update expense" on public.expenses;
create policy "managers update expense" on public.expenses
  for update
  to authenticated
  using (public.can_manage_expense(id))
  with check (public.is_household_member(household_id));

create or replace function public.pay_expense_for_everyone(
  p_expense_id uuid,
  p_method text,
  p_proof_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_expense public.expenses%rowtype;
  v_total_cents integer := 0;
  v_reimbursement_cents integer := 0;
  v_debtor_count integer := 0;
  v_new_expense_id uuid;
  v_payer_name text;
begin
  if v_user is null then
    raise exception 'No autenticado';
  end if;

  if p_method not in ('transfer', 'cash', 'other') then
    raise exception 'Metodo invalido';
  end if;

  select *
    into v_expense
    from public.expenses
    where id = p_expense_id
      and archived_at is null;

  if not found then
    raise exception 'Gasto no encontrado';
  end if;

  if not public.is_household_member(v_expense.household_id) then
    raise exception 'No autorizado';
  end if;

  if v_user = v_expense.paid_by then
    raise exception 'La persona que pago originalmente no necesita cubrir este gasto';
  end if;

  select coalesce(sum(amount_cents), 0)::integer
    into v_total_cents
    from public.expense_shares
    where expense_id = p_expense_id
      and profile_id <> v_expense.paid_by
      and status <> 'confirmed';

  if v_total_cents <= 0 then
    raise exception 'No hay saldo pendiente';
  end if;

  select coalesce(sum(amount_cents), 0)::integer, count(*)::integer
    into v_reimbursement_cents, v_debtor_count
    from public.expense_shares
    where expense_id = p_expense_id
      and profile_id not in (v_expense.paid_by, v_user)
      and status <> 'confirmed'
      and amount_cents > 0;

  if v_reimbursement_cents > 0 and v_debtor_count > 0 then
    select full_name
      into v_payer_name
      from public.profiles
      where id = v_user;

    insert into public.expenses (
      household_id,
      title,
      merchant,
      category,
      amount_cents,
      paid_by,
      purchased_at,
      note,
      created_by,
      hidden_from_non_participants,
      reimburses_expense_id
    )
    values (
      v_expense.household_id,
      'Reembolso: ' || v_expense.title,
      'Pago por todos',
      'Reembolso',
      v_reimbursement_cents,
      v_user,
      current_date,
      'Creado automaticamente porque ' || coalesce(v_payer_name, 'alguien') ||
        ' cubrio el saldo pendiente de "' || v_expense.title || '".',
      v_user,
      true,
      v_expense.id
    )
    returning id into v_new_expense_id;

    insert into public.expense_shares (
      expense_id,
      profile_id,
      amount_cents,
      status
    )
    select
      v_new_expense_id,
      s.profile_id,
      s.amount_cents,
      'pending'
    from public.expense_shares s
    where s.expense_id = p_expense_id
      and s.profile_id not in (v_expense.paid_by, v_user)
      and s.status <> 'confirmed'
      and s.amount_cents > 0;
  end if;

  update public.expense_shares
    set status = 'confirmed',
        payment_method = p_method,
        proof_path = p_proof_path,
        sent_at = now(),
        confirmed_at = now()
    where expense_id = p_expense_id
      and profile_id <> v_expense.paid_by
      and status <> 'confirmed';

  update public.expenses
    set archived_at = now()
    where id = p_expense_id;

  return v_new_expense_id;
end;
$$;

revoke execute on function public.pay_expense_for_everyone(uuid, text, text) from public, anon;
grant execute on function public.pay_expense_for_everyone(uuid, text, text) to authenticated;
