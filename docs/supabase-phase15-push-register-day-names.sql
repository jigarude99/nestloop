-- =====================================================================
-- FASE 15 — NestLoop: registro robusto de push + nombres de día en avisos
-- Aplicado en Supabase (proyecto zzaqgynyezsgcbdynekc) el 2026-06-12.
-- =====================================================================
-- 15.1 Problema: el upsert por endpoint fallaba con RLS si la suscripción
--      del navegador quedó registrada a nombre de OTRO miembro (teléfono
--      compartido o cambio de sesión). Este RPC reasigna el endpoint al
--      usuario actual. El cliente (lib/api.ts) ahora usa este RPC.
-- 15.2 La notificación de horario decía "el dia 2"; ahora usa el nombre
--      del día ("el martes").
-- =====================================================================

create or replace function public.register_push_subscription(
  p_household_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not public.is_household_member(p_household_id) then raise exception 'No autorizado'; end if;
  if coalesce(p_endpoint, '') = '' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Suscripción inválida';
  end if;

  -- El endpoint identifica al navegador: siempre pertenece al último usuario que lo registró.
  delete from public.push_subscriptions where endpoint = p_endpoint;

  insert into public.push_subscriptions (household_id, profile_id, endpoint, p256dh, auth, user_agent, enabled, last_seen_at)
  values (p_household_id, auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent, true, now());
end;
$$;

revoke execute on function public.register_push_subscription(uuid, text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(uuid, text, text, text, text) to authenticated;

create or replace function public.queue_schedule_slot_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days text[] := array['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
begin
  perform public.upsert_notification_delivery(
    new.household_id,
    new.profile_id,
    'schedule_slot',
    new.id,
    'Horario asignado',
    'Tienes "' || new.label || '" el ' || v_days[(new.day_of_week % 7) + 1] ||
      ' de ' || left(new.starts_at::text, 5) || ' a ' || left(new.ends_at::text, 5) || '.',
    '/?view=calendar'
  );
  return new;
end;
$$;
