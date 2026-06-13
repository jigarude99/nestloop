-- =====================================================================
-- FASE 16 - NestLoop: settlements / netting entre dos personas
-- =====================================================================
-- Esta migracion fue aplicada en Supabase durante la sesion de Claude.
-- Se conserva aqui para que el repositorio documente la estructura real.
-- =====================================================================

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  from_profile uuid not null references public.profiles(id) on delete cascade,
  to_profile uuid not null references public.profiles(id) on delete cascade,
  net_cents integer not null default 0,
  gross_owed_cents integer not null default 0,
  gross_owing_cents integer not null default 0,
  shares_cleared integer not null default 0,
  method text check (method in ('transfer', 'cash', 'other')),
  proof_path text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists settlements_household_id_idx
  on public.settlements(household_id, created_at desc);

create index if not exists settlements_profiles_idx
  on public.settlements(from_profile, to_profile);

alter table public.settlements enable row level security;

drop policy if exists "members read household settlements" on public.settlements;
create policy "members read household settlements"
on public.settlements
for select
to authenticated
using (public.is_household_member(household_id));

create or replace function public.settle_with(
  p_other_id uuid,
  p_method text default 'other',
  p_proof_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_household uuid;
  v_i_owe integer := 0;
  v_owes_me integer := 0;
  v_net integer;
  v_from uuid;
  v_to uuid;
  v_cleared integer := 0;
  v_settlement_id uuid;
begin
  if v_user is null then raise exception 'No autenticado'; end if;
  if p_other_id is null or p_other_id = v_user then raise exception 'Persona invalida'; end if;
  if p_method not in ('transfer', 'cash', 'other') then raise exception 'Metodo invalido'; end if;

  select hm.household_id into v_household
  from public.household_members hm
  join public.household_members hm2
    on hm2.household_id = hm.household_id and hm2.profile_id = p_other_id
  where hm.profile_id = v_user
  limit 1;

  if v_household is null then raise exception 'No comparten casa'; end if;

  select coalesce(sum(s.amount_cents), 0) into v_i_owe
  from public.expense_shares s
  join public.expenses e on e.id = s.expense_id
  where e.household_id = v_household
    and e.archived_at is null
    and e.paid_by = p_other_id
    and s.profile_id = v_user
    and s.status <> 'confirmed'
    and s.amount_cents > 0;

  select coalesce(sum(s.amount_cents), 0) into v_owes_me
  from public.expense_shares s
  join public.expenses e on e.id = s.expense_id
  where e.household_id = v_household
    and e.archived_at is null
    and e.paid_by = v_user
    and s.profile_id = p_other_id
    and s.status <> 'confirmed'
    and s.amount_cents > 0;

  if v_i_owe = 0 and v_owes_me = 0 then
    raise exception 'No hay cuentas que saldar';
  end if;

  v_net := v_i_owe - v_owes_me;
  if v_net >= 0 then
    v_from := v_user;
    v_to := p_other_id;
  else
    v_from := p_other_id;
    v_to := v_user;
  end if;

  with updated as (
    update public.expense_shares s
    set status = 'confirmed',
        payment_method = coalesce(p_method, 'other'),
        confirmed_at = now(),
        sent_at = coalesce(s.sent_at, now())
    from public.expenses e
    where e.id = s.expense_id
      and e.household_id = v_household
      and e.archived_at is null
      and s.status <> 'confirmed'
      and s.amount_cents > 0
      and (
        (e.paid_by = p_other_id and s.profile_id = v_user)
        or
        (e.paid_by = v_user and s.profile_id = p_other_id)
      )
    returning 1
  )
  select count(*) into v_cleared from updated;

  insert into public.settlements (
    household_id,
    from_profile,
    to_profile,
    net_cents,
    gross_owed_cents,
    gross_owing_cents,
    shares_cleared,
    method,
    proof_path,
    created_by
  )
  values (
    v_household,
    v_from,
    v_to,
    abs(v_net),
    v_i_owe,
    v_owes_me,
    v_cleared,
    p_method,
    p_proof_path,
    v_user
  )
  returning id into v_settlement_id;

  return jsonb_build_object(
    'settlement_id', v_settlement_id,
    'net_cents', abs(v_net),
    'from', v_from,
    'to', v_to,
    'cleared', v_cleared
  );
end;
$$;

