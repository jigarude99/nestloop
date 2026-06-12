-- =====================================================================
-- FASE 14 - NestLoop: Web Push real con suscripciones, cola y recordatorios
-- =====================================================================
-- CRON secret: la funcion compara SHA-256. El secreto real vive en Vercel.
-- =====================================================================

create extension if not exists "pgcrypto";

create table if not exists public.notification_preferences (
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  push_enabled boolean not null default true,
  reminder_days integer not null default 3 check (reminder_days between 1 and 14),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, profile_id)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('expense_due', 'payment_confirmation', 'task_turn', 'schedule_slot')),
  subject_id uuid not null,
  title text not null,
  body text not null,
  url text not null default '/',
  status text not null default 'pending' check (status in ('pending', 'sent', 'resolved')),
  send_count integer not null default 0,
  next_due_at timestamptz,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, kind, subject_id)
);

create index if not exists push_subscriptions_profile_id_idx
  on public.push_subscriptions(profile_id);
create index if not exists push_subscriptions_household_id_idx
  on public.push_subscriptions(household_id);
create index if not exists notification_deliveries_due_idx
  on public.notification_deliveries(status, next_due_at);
create index if not exists notification_deliveries_profile_id_idx
  on public.notification_deliveries(profile_id);

grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select on public.notification_deliveries to authenticated;

alter table public.push_subscriptions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_deliveries enable row level security;

drop policy if exists "members manage own push subscriptions" on public.push_subscriptions;
create policy "members manage own push subscriptions"
on public.push_subscriptions
for all
to authenticated
using (
  profile_id = (select auth.uid())
  and public.is_household_member(household_id)
)
with check (
  profile_id = (select auth.uid())
  and public.is_household_member(household_id)
);

drop policy if exists "members manage own notification preferences" on public.notification_preferences;
create policy "members manage own notification preferences"
on public.notification_preferences
for all
to authenticated
using (
  profile_id = (select auth.uid())
  and public.is_household_member(household_id)
)
with check (
  profile_id = (select auth.uid())
  and public.is_household_member(household_id)
);

drop policy if exists "members read own notification deliveries" on public.notification_deliveries;
create policy "members read own notification deliveries"
on public.notification_deliveries
for select
to authenticated
using (
  profile_id = (select auth.uid())
  and public.is_household_member(household_id)
);

create or replace function public.is_valid_notification_secret(p_secret text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select encode(extensions.digest(convert_to(coalesce(p_secret, ''), 'UTF8'), 'sha256'), 'hex')
    = '046f5b224f8832eda6b60d3fd7d44b297b185eb9662e918ad323500463069c1c';
$$;

revoke execute on function public.is_valid_notification_secret(text) from public, anon, authenticated;

create or replace function public.upsert_notification_delivery(
  p_household_id uuid,
  p_profile_id uuid,
  p_kind text,
  p_subject_id uuid,
  p_title text,
  p_body text,
  p_url text default '/'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_profile_id is null or p_subject_id is null then
    return;
  end if;

  insert into public.notification_preferences (household_id, profile_id)
  values (p_household_id, p_profile_id)
  on conflict (household_id, profile_id) do nothing;

  insert into public.notification_deliveries (
    household_id,
    profile_id,
    kind,
    subject_id,
    title,
    body,
    url,
    status,
    next_due_at
  )
  values (
    p_household_id,
    p_profile_id,
    p_kind,
    p_subject_id,
    p_title,
    p_body,
    coalesce(nullif(p_url, ''), '/'),
    'pending',
    now()
  )
  on conflict (profile_id, kind, subject_id) do update
    set title = excluded.title,
        body = excluded.body,
        url = excluded.url,
        status = case
          when public.notification_deliveries.status = 'resolved' then 'pending'
          else public.notification_deliveries.status
        end,
        next_due_at = coalesce(public.notification_deliveries.next_due_at, now()),
        updated_at = now();
end;
$$;

revoke execute on function public.upsert_notification_delivery(uuid, uuid, text, uuid, text, text, text)
  from public, anon, authenticated;

create or replace function public.queue_expense_share_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.expenses%rowtype;
  v_payer text;
begin
  if new.status <> 'pending' or new.amount_cents <= 0 then
    return new;
  end if;

  select * into v_expense from public.expenses where id = new.expense_id;
  if not found or v_expense.archived_at is not null or new.profile_id = v_expense.paid_by then
    return new;
  end if;

  select full_name into v_payer from public.profiles where id = v_expense.paid_by;

  perform public.upsert_notification_delivery(
    v_expense.household_id,
    new.profile_id,
    'expense_due',
    new.expense_id,
    'Tienes un pago pendiente',
    'Debes ' || to_char((new.amount_cents / 100.0), 'FM$999,999,990.00') ||
      ' a ' || coalesce(v_payer, 'alguien') || ' por "' || v_expense.title || '".',
    '/?view=expenses&expense=' || new.expense_id::text
  );

  return new;
end;
$$;

create or replace function public.queue_payment_confirmation_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.expenses%rowtype;
  v_sender text;
begin
  if new.status <> 'sent' or old.status = 'sent' then
    return new;
  end if;

  select * into v_expense from public.expenses where id = new.expense_id;
  if not found or v_expense.archived_at is not null or v_expense.paid_by is null then
    return new;
  end if;

  select full_name into v_sender from public.profiles where id = new.profile_id;

  perform public.upsert_notification_delivery(
    v_expense.household_id,
    v_expense.paid_by,
    'payment_confirmation',
    new.id,
    'Pago por confirmar',
    coalesce(v_sender, 'Alguien') || ' marco ' ||
      to_char((new.amount_cents / 100.0), 'FM$999,999,990.00') ||
      ' como efectivo en "' || v_expense.title || '".',
    '/?view=expenses&expense=' || new.expense_id::text
  );

  return new;
end;
$$;

create or replace function public.queue_current_turn_notification(p_rotation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rotation public.task_rotations%rowtype;
  v_profile_id uuid;
begin
  select * into v_rotation from public.task_rotations where id = p_rotation_id;
  if not found then
    return;
  end if;

  select profile_id into v_profile_id
  from public.task_rotation_members
  where rotation_id = p_rotation_id
    and position = v_rotation.current_index
  limit 1;

  if v_profile_id is null then
    return;
  end if;

  perform public.upsert_notification_delivery(
    v_rotation.household_id,
    v_profile_id,
    'task_turn',
    v_rotation.id,
    'Te toca un turno',
    'Ahora te toca: ' || v_rotation.title || '.',
    '/?view=tasks'
  );
end;
$$;

create or replace function public.queue_rotation_member_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rotation public.task_rotations%rowtype;
begin
  select * into v_rotation from public.task_rotations where id = new.rotation_id;
  if found and new.position = v_rotation.current_index then
    perform public.queue_current_turn_notification(new.rotation_id);
  end if;
  return new;
end;
$$;

create or replace function public.queue_rotation_update_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.current_index is distinct from old.current_index then
    perform public.queue_current_turn_notification(new.id);
  end if;
  return new;
end;
$$;

create or replace function public.queue_schedule_slot_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.upsert_notification_delivery(
    new.household_id,
    new.profile_id,
    'schedule_slot',
    new.id,
    'Horario asignado',
    'Tienes "' || new.label || '" el dia ' || (new.day_of_week + 1)::text ||
      ' de ' || left(new.starts_at::text, 5) || ' a ' || left(new.ends_at::text, 5) || '.',
    '/?view=calendar'
  );
  return new;
end;
$$;

drop trigger if exists on_expense_share_notify on public.expense_shares;
create trigger on_expense_share_notify
  after insert on public.expense_shares
  for each row execute function public.queue_expense_share_notification();

drop trigger if exists on_expense_share_confirmation_notify on public.expense_shares;
create trigger on_expense_share_confirmation_notify
  after update of status on public.expense_shares
  for each row execute function public.queue_payment_confirmation_notification();

drop trigger if exists on_rotation_member_notify on public.task_rotation_members;
create trigger on_rotation_member_notify
  after insert on public.task_rotation_members
  for each row execute function public.queue_rotation_member_notification();

drop trigger if exists on_rotation_update_notify on public.task_rotations;
create trigger on_rotation_update_notify
  after update of current_index on public.task_rotations
  for each row execute function public.queue_rotation_update_notification();

drop trigger if exists on_schedule_slot_notify on public.schedule_slots;
create trigger on_schedule_slot_notify
  after insert or update of profile_id, day_of_week, starts_at, ends_at, label on public.schedule_slots
  for each row execute function public.queue_schedule_slot_notification();

create or replace function public.refresh_notification_queue()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_preferences (household_id, profile_id)
  select hm.household_id, hm.profile_id
  from public.household_members hm
  on conflict (household_id, profile_id) do nothing;

  insert into public.notification_deliveries (
    household_id, profile_id, kind, subject_id, title, body, url, status, next_due_at
  )
  select
    e.household_id,
    s.profile_id,
    'expense_due',
    e.id,
    'Tienes un pago pendiente',
    'Debes ' || to_char((s.amount_cents / 100.0), 'FM$999,999,990.00') ||
      ' por "' || e.title || '".',
    '/?view=expenses&expense=' || e.id::text,
    'pending',
    now()
  from public.expenses e
  join public.expense_shares s on s.expense_id = e.id
  where e.archived_at is null
    and s.profile_id <> e.paid_by
    and s.status in ('pending', 'rejected')
    and s.amount_cents > 0
  on conflict (profile_id, kind, subject_id) do update
    set title = excluded.title,
        body = excluded.body,
        url = excluded.url,
        status = case
          when public.notification_deliveries.status = 'resolved' then 'pending'
          else public.notification_deliveries.status
        end,
        next_due_at = coalesce(public.notification_deliveries.next_due_at, now()),
        updated_at = now();

  insert into public.notification_deliveries (
    household_id, profile_id, kind, subject_id, title, body, url, status, next_due_at
  )
  select
    e.household_id,
    e.paid_by,
    'payment_confirmation',
    s.id,
    'Pago por confirmar',
    coalesce(p.full_name, 'Alguien') || ' marco pago en efectivo para "' || e.title || '".',
    '/?view=expenses&expense=' || e.id::text,
    'pending',
    now()
  from public.expenses e
  join public.expense_shares s on s.expense_id = e.id
  left join public.profiles p on p.id = s.profile_id
  where e.archived_at is null
    and s.status = 'sent'
    and s.profile_id <> e.paid_by
  on conflict (profile_id, kind, subject_id) do update
    set title = excluded.title,
        body = excluded.body,
        url = excluded.url,
        status = case
          when public.notification_deliveries.status = 'resolved' then 'pending'
          else public.notification_deliveries.status
        end,
        next_due_at = coalesce(public.notification_deliveries.next_due_at, now()),
        updated_at = now();

  insert into public.notification_deliveries (
    household_id, profile_id, kind, subject_id, title, body, url, status, next_due_at
  )
  select
    r.household_id,
    m.profile_id,
    'task_turn',
    r.id,
    'Te toca un turno',
    'Ahora te toca: ' || r.title || '.',
    '/?view=tasks',
    'pending',
    now()
  from public.task_rotations r
  join public.task_rotation_members m on m.rotation_id = r.id and m.position = r.current_index
  on conflict (profile_id, kind, subject_id) do update
    set title = excluded.title,
        body = excluded.body,
        url = excluded.url,
        status = case
          when public.notification_deliveries.status = 'resolved' then 'pending'
          else public.notification_deliveries.status
        end,
        next_due_at = coalesce(public.notification_deliveries.next_due_at, now()),
        updated_at = now();

  update public.notification_deliveries nd
  set status = 'resolved',
      updated_at = now()
  where nd.status <> 'resolved'
    and (
      (
        nd.kind = 'expense_due'
        and not exists (
          select 1
          from public.expenses e
          join public.expense_shares s on s.expense_id = e.id
          where e.id = nd.subject_id
            and e.archived_at is null
            and s.profile_id = nd.profile_id
            and s.status in ('pending', 'rejected')
        )
      )
      or (
        nd.kind = 'payment_confirmation'
        and not exists (
          select 1
          from public.expense_shares s
          join public.expenses e on e.id = s.expense_id
          where s.id = nd.subject_id
            and e.archived_at is null
            and s.status = 'sent'
            and e.paid_by = nd.profile_id
        )
      )
      or (
        nd.kind = 'task_turn'
        and not exists (
          select 1
          from public.task_rotations r
          join public.task_rotation_members m on m.rotation_id = r.id and m.position = r.current_index
          where r.id = nd.subject_id
            and m.profile_id = nd.profile_id
        )
      )
    );
end;
$$;

create or replace function public.collect_due_push_notifications(
  p_secret text,
  p_limit integer default 100
)
returns table (
  delivery_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  title text,
  body text,
  url text,
  icon text,
  badge text,
  tag text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_valid_notification_secret(p_secret) then
    raise exception 'Unauthorized';
  end if;

  perform public.refresh_notification_queue();

  return query
  select
    nd.id,
    ps.endpoint,
    ps.p256dh,
    ps.auth,
    nd.title,
    nd.body,
    nd.url,
    '/icon-192.png'::text,
    '/notification-badge.png'::text,
    ('nestloop-' || nd.kind || '-' || nd.subject_id::text)::text
  from public.notification_deliveries nd
  join public.notification_preferences pref
    on pref.household_id = nd.household_id and pref.profile_id = nd.profile_id
  join public.push_subscriptions ps
    on ps.household_id = nd.household_id and ps.profile_id = nd.profile_id
  where pref.push_enabled = true
    and ps.enabled = true
    and nd.status = 'pending'
    and nd.next_due_at is not null
    and nd.next_due_at <= now()
  order by nd.created_at asc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
end;
$$;

create or replace function public.mark_push_notifications_sent(
  p_secret text,
  p_delivery_ids uuid[],
  p_dead_endpoints text[] default array[]::text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_valid_notification_secret(p_secret) then
    raise exception 'Unauthorized';
  end if;

  update public.push_subscriptions
  set enabled = false,
      last_seen_at = now()
  where endpoint = any(coalesce(p_dead_endpoints, array[]::text[]));

  update public.notification_deliveries nd
  set send_count = nd.send_count + 1,
      last_sent_at = now(),
      updated_at = now(),
      status = case when nd.kind = 'schedule_slot' then 'sent' else 'pending' end,
      next_due_at = case
        when nd.kind = 'schedule_slot' then null
        else now() + make_interval(days => coalesce(pref.reminder_days, 3))
      end
  from public.notification_preferences pref
  where nd.id = any(coalesce(p_delivery_ids, array[]::uuid[]))
    and pref.household_id = nd.household_id
    and pref.profile_id = nd.profile_id;
end;
$$;

revoke execute on function public.collect_due_push_notifications(text, integer) from public, anon, authenticated;
grant execute on function public.collect_due_push_notifications(text, integer) to anon, authenticated;

revoke execute on function public.mark_push_notifications_sent(text, uuid[], text[]) from public, anon, authenticated;
grant execute on function public.mark_push_notifications_sent(text, uuid[], text[]) to anon, authenticated;
