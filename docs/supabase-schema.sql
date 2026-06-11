create extension if not exists "pgcrypto";

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  avatar_url text,
  color text not null default '#0f9f7a',
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, profile_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  merchant text,
  category text not null,
  amount_cents integer not null check (amount_cents > 0),
  paid_by uuid not null references public.profiles(id),
  purchased_at date not null,
  note text,
  receipt_path text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.expense_shares (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  amount_cents integer not null check (amount_cents >= 0),
  status text not null check (status in ('pending', 'sent', 'confirmed', 'rejected')),
  payment_method text check (payment_method in ('transfer', 'cash', 'other')),
  proof_path text,
  sent_at timestamptz,
  confirmed_at timestamptz,
  unique (expense_id, profile_id)
);

create table public.task_rotations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  cadence text not null,
  current_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.task_rotation_members (
  rotation_id uuid not null references public.task_rotations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  position integer not null,
  primary key (rotation_id, profile_id)
);

create table public.task_events (
  id uuid primary key default gen_random_uuid(),
  rotation_id uuid not null references public.task_rotations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  completed_at timestamptz not null default now(),
  note text
);

create table public.schedule_slots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  day_of_week integer not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  label text not null,
  created_at timestamptz not null default now()
);

grant usage on schema public to anon, authenticated;

grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;

alter default privileges in schema public grant select on tables to anon, authenticated;
alter default privileges in schema public grant insert, update, delete on tables to authenticated;

alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.household_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;
alter table public.task_rotations enable row level security;
alter table public.task_rotation_members enable row level security;
alter table public.task_events enable row level security;
alter table public.schedule_slots enable row level security;

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

create policy "participants can update their own share"
on public.expense_shares for update
using (
  profile_id = auth.uid()
  or exists (
    select 1 from public.expenses e
    where e.id = expense_id and e.paid_by = auth.uid()
  )
);
