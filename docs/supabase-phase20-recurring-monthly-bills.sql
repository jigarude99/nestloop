-- =====================================================================
-- FASE 20 — Pagos mensuales en conjunto (renta, servicios fijos…)
-- Aplicado en Supabase (proyecto zzaqgynyezsgcbdynekc) el 2026-06-24.
-- =====================================================================
-- Idea: obligaciones mensuales que cada quien paga POR SU CUENTA (no es
-- reembolso a una persona). Cada participante marca su parte como pagada
-- cada mes, y recibe recordatorios que se vuelven cada vez más agresivos
-- a medida que se acerca (y pasa) el día de pago.
--
-- Tablas:
--   recurring_bills          (título, día de pago 1..28, casa, creador)
--   recurring_bill_shares    (parte mensual de cada persona)
--   recurring_bill_payments  (pago por mes/persona, con comprobante)
--
-- Seguridad (RLS):
--   - leer: cualquier miembro de la casa
--   - crear: miembro (queda como creador)
--   - editar/borrar la cuenta y sus partes: creador o administrador
--   - marcar/deshacer un pago: la propia persona, o el administrador
--
-- Notificaciones (integradas en el sistema existente):
--   - nuevo kind 'recurring_due'
--   - recurring_reminder(titulo, dia, monto) arma el mensaje según los días
--     que faltan: "se acerca" → "faltan N días" → "mañana" → "hoy" →
--     "VENCIDA hace N días, ¡págala ya!"
--   - refresh_notification_queue(): crea/actualiza el aviso para cada
--     participante que NO pagó el mes en curso (ventana de 7 días o vencido)
--     y lo resuelve en cuanto paga.
--   - mark_push_notifications_sent(): reprograma 'recurring_due' a diario
--     (insiste cada día), a diferencia de los demás avisos (cada 3 días).
--
-- El detalle completo (cuerpos de refresh_notification_queue y
-- mark_push_notifications_sent) quedó aplicado por MCP; aquí va el núcleo.
-- =====================================================================

create table if not exists public.recurring_bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  due_day int not null check (due_day between 1 and 28),
  created_by uuid not null references public.profiles(id),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists recurring_bills_household_idx on public.recurring_bills(household_id);

create table if not exists public.recurring_bill_shares (
  bill_id uuid not null references public.recurring_bills(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents int not null check (amount_cents >= 0),
  primary key (bill_id, profile_id)
);

create table if not exists public.recurring_bill_payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.recurring_bills(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  period text not null,                       -- 'YYYY-MM'
  status text not null default 'paid' check (status in ('paid')),
  method text check (method in ('transfer','cash','other')),
  proof_path text,
  amount_cents int,
  paid_at timestamptz not null default now(),
  unique (bill_id, profile_id, period)
);
create index if not exists recurring_bill_payments_idx on public.recurring_bill_payments(bill_id, period);

grant select, insert, update, delete on public.recurring_bills to authenticated;
grant select, insert, update, delete on public.recurring_bill_shares to authenticated;
grant select, insert, update, delete on public.recurring_bill_payments to authenticated;

alter table public.recurring_bills enable row level security;
alter table public.recurring_bill_shares enable row level security;
alter table public.recurring_bill_payments enable row level security;

-- Helpers
create or replace function public.recurring_bill_household(p_bill_id uuid)
returns uuid language sql security definer set search_path = public stable as $$
  select household_id from public.recurring_bills where id = p_bill_id;
$$;
create or replace function public.can_read_recurring(p_bill_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select public.is_household_member(public.recurring_bill_household(p_bill_id));
$$;
create or replace function public.can_manage_recurring(p_bill_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.recurring_bills b
    where b.id = p_bill_id
      and (b.created_by = auth.uid() or public.is_household_admin(b.household_id))
  );
$$;
revoke execute on function public.recurring_bill_household(uuid), public.can_read_recurring(uuid),
  public.can_manage_recurring(uuid) from public, anon;
grant execute on function public.recurring_bill_household(uuid), public.can_read_recurring(uuid),
  public.can_manage_recurring(uuid) to authenticated;

-- RLS
create policy "members read recurring bills" on public.recurring_bills for select to authenticated
  using (public.is_household_member(household_id));
create policy "members create recurring bills" on public.recurring_bills for insert to authenticated
  with check (created_by = auth.uid() and public.is_household_member(household_id));
create policy "managers update recurring bills" on public.recurring_bills for update to authenticated
  using (public.can_manage_recurring(id)) with check (public.is_household_member(household_id));
create policy "managers delete recurring bills" on public.recurring_bills for delete to authenticated
  using (public.can_manage_recurring(id));

create policy "members read recurring shares" on public.recurring_bill_shares for select to authenticated
  using (public.can_read_recurring(bill_id));
create policy "managers write recurring shares" on public.recurring_bill_shares for all to authenticated
  using (public.can_manage_recurring(bill_id)) with check (public.can_manage_recurring(bill_id));

create policy "members read recurring payments" on public.recurring_bill_payments for select to authenticated
  using (public.can_read_recurring(bill_id));
create policy "own or admin insert recurring payment" on public.recurring_bill_payments for insert to authenticated
  with check (public.can_read_recurring(bill_id) and (profile_id = auth.uid() or public.can_manage_recurring(bill_id)));
create policy "own or admin update recurring payment" on public.recurring_bill_payments for update to authenticated
  using (profile_id = auth.uid() or public.can_manage_recurring(bill_id));
create policy "own or admin delete recurring payment" on public.recurring_bill_payments for delete to authenticated
  using (profile_id = auth.uid() or public.can_manage_recurring(bill_id));

-- Notificaciones: nuevo tipo + mensaje escalonado
alter table public.notification_deliveries drop constraint if exists notification_deliveries_kind_check;
alter table public.notification_deliveries add constraint notification_deliveries_kind_check
  check (kind in ('expense_due','payment_confirmation','task_turn','schedule_slot','recurring_due'));

create or replace function public.recurring_reminder(p_title text, p_due_day int, p_amount_cents int)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_due date := make_date(extract(year from now())::int, extract(month from now())::int, least(p_due_day, 28));
  v_left int := v_due - current_date;
  v_amt text := to_char(p_amount_cents / 100.0, 'FM$999,999,990.00');
  v_title text; v_body text;
begin
  if v_left < 0 then
    v_title := '⚠️ ' || p_title || ' VENCIDA';
    v_body := 'Tu parte es ' || v_amt || ' y lleva ' || (-v_left) || ' día(s) de retraso. ¡Págala ya!';
  elsif v_left = 0 then
    v_title := '⏰ ¡Hoy vence ' || p_title || '!';
    v_body := 'Hoy es el último día. Tu parte: ' || v_amt || '. No lo dejes pasar.';
  elsif v_left = 1 then
    v_title := '⏰ Mañana vence ' || p_title;
    v_body := 'Mañana es la fecha. Tu parte: ' || v_amt || '. No lo olvides.';
  elsif v_left <= 3 then
    v_title := 'Pago mensual: ' || p_title;
    v_body := 'Faltan ' || v_left || ' días para pagar ' || p_title || ' (día ' || p_due_day || '). Tu parte: ' || v_amt || '.';
  else
    v_title := 'Pago mensual: ' || p_title;
    v_body := 'Se acerca el pago de ' || p_title || ' (día ' || p_due_day || '). Tu parte: ' || v_amt || '.';
  end if;
  return jsonb_build_object('title', v_title, 'body', v_body);
end; $$;

-- refresh_notification_queue() agrega una sección 'recurring_due' (insertar/
-- actualizar para participantes que no pagaron el mes, ventana <=7 días o
-- vencido) y resuelve los que ya pagaron. mark_push_notifications_sent()
-- reprograma 'recurring_due' a now() + 1 día (recordatorio diario).
