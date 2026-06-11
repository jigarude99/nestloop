create or replace function public.is_household_member(target_household_id uuid)
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
      and hm.profile_id = auth.uid()
  );
$$;

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
      and public.is_household_member(e.household_id)
  );
$$;

drop policy if exists "members can read their households" on public.households;
drop policy if exists "members can read household members" on public.household_members;
drop policy if exists "members can read profiles in their households" on public.profiles;
drop policy if exists "members can read household expenses" on public.expenses;
drop policy if exists "members can create household expenses" on public.expenses;
drop policy if exists "members can read expense shares" on public.expense_shares;

create policy "members can read their households"
on public.households for select
using (public.is_household_member(id));

create policy "members can read household members"
on public.household_members for select
using (public.is_household_member(household_id));

create policy "members can read profiles in their households"
on public.profiles for select
using (
  id = auth.uid()
  or exists (
    select 1
    from public.household_members other_member
    where public.is_household_member(other_member.household_id)
      and other_member.profile_id = profiles.id
  )
);

create policy "members can read household expenses"
on public.expenses for select
using (public.is_household_member(household_id));

create policy "members can create household expenses"
on public.expenses for insert
with check (
  created_by = auth.uid()
  and public.is_household_member(household_id)
);

create policy "members can read expense shares"
on public.expense_shares for select
using (public.can_read_expense(expense_id));
