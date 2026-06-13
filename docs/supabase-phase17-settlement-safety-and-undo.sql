-- =====================================================================
-- FASE 17 - NestLoop: saldos con comprobante obligatorio y deshacer
-- =====================================================================
-- Aplicado en Supabase el 2026-06-13.
-- Esta migracion agrega trazabilidad de las cuotas cerradas por un saldo,
-- permite deshacer un saldo accidental, y evita cerrar una transferencia
-- sin comprobante cuando el usuario actual es quien debe pagar.
-- =====================================================================

alter table public.settlements
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reverse_reason text;

create table if not exists public.settlement_share_links (
  settlement_id uuid not null references public.settlements(id) on delete cascade,
  expense_share_id uuid not null references public.expense_shares(id) on delete cascade,
  previous_status text not null,
  previous_payment_method text,
  previous_proof_path text,
  previous_sent_at timestamptz,
  previous_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (settlement_id, expense_share_id)
);

create index if not exists settlement_share_links_share_idx
  on public.settlement_share_links(expense_share_id);

alter table public.settlement_share_links enable row level security;

drop policy if exists "members read settlement share links" on public.settlement_share_links;
create policy "members read settlement share links"
on public.settlement_share_links
for select
to authenticated
using (
  exists (
    select 1
    from public.settlements st
    where st.id = settlement_share_links.settlement_id
      and public.is_household_member(st.household_id)
  )
);

-- Backfill para saldos creados antes de que existieran links.
insert into public.settlement_share_links (
  settlement_id,
  expense_share_id,
  previous_status,
  previous_payment_method,
  previous_proof_path,
  previous_sent_at,
  previous_confirmed_at
)
select
  st.id,
  s.id,
  case
    when s.sent_at is not null and s.sent_at < st.created_at - interval '5 seconds' then 'sent'
    else 'pending'
  end,
  case
    when s.sent_at is not null and s.sent_at < st.created_at - interval '5 seconds' then s.payment_method
    else null
  end,
  case
    when s.sent_at is not null and s.sent_at < st.created_at - interval '5 seconds' then s.proof_path
    else null
  end,
  case
    when s.sent_at is not null and s.sent_at < st.created_at - interval '5 seconds' then s.sent_at
    else null
  end,
  null::timestamptz
from public.settlements st
join public.expenses e on e.household_id = st.household_id
join public.expense_shares s on s.expense_id = e.id
where st.reversed_at is null
  and s.status = 'confirmed'
  and s.amount_cents > 0
  and s.confirmed_at between st.created_at - interval '10 seconds' and st.created_at + interval '10 seconds'
  and (
    (e.paid_by = st.from_profile and s.profile_id = st.to_profile)
    or
    (e.paid_by = st.to_profile and s.profile_id = st.from_profile)
  )
on conflict do nothing;

-- Nota: la version aplicada en Supabase tambien reemplaza public.settle_with
-- para guardar links antes de confirmar cuotas y agrega public.undo_settlement.
-- Se deja el SQL completo en la migracion remota de Supabase.

revoke all on table public.settlement_share_links from anon, authenticated;
grant select on table public.settlement_share_links to authenticated;

revoke execute on function public.settle_with(uuid, text, text) from public, anon;
grant execute on function public.settle_with(uuid, text, text) to authenticated;

revoke execute on function public.undo_settlement(uuid, text) from public, anon;
grant execute on function public.undo_settlement(uuid, text) to authenticated;
