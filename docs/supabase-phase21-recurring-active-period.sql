-- =====================================================================
-- FASE 21 — Pagos mensuales: "periodo activo" en lugar de "mes en curso"
-- Aplicado en Supabase (proyecto zzaqgynyezsgcbdynekc) el 2026-06-25.
-- =====================================================================
-- Problema: la app asumía que el pago vigente es siempre el del MES EN CURSO,
-- así que si al crear la cuenta el día de pago de este mes ya había pasado,
-- la marcaba como "vencida" de inmediato.
--
-- Arreglo: "periodo activo" = primer mes (desde un ANCLA) que aún NO han
-- pagado todos los participantes. El ancla es el mes de creación si se creó
-- en/antes del día de pago; si no, el mes siguiente. Así una cuenta creada
-- después del plazo de este mes arranca en el mes siguiente (p. ej. julio), y
-- avanza sola mes a mes conforme se va pagando.
--
-- Funciones:
--   recurring_active_period(bill_id) -> 'YYYY-MM'   (ver más abajo)
--   recurring_reminder(titulo, fecha_venc, monto)   (ahora a partir de una
--     FECHA concreta, que puede ser de un mes futuro; nombre de mes en español)
--   refresh_notification_queue()  usa el periodo activo y su fecha de
--     vencimiento; solo avisa dentro de la ventana de 7 días o si está vencido.
-- =====================================================================

create or replace function public.recurring_active_period(p_bill_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_due_day int; v_created timestamptz; v_anchor date; v_p date;
  v_parts int; v_paid int; v_guard int := 0;
begin
  select due_day, created_at into v_due_day, v_created
  from public.recurring_bills where id = p_bill_id;
  if v_due_day is null then return to_char(now(), 'YYYY-MM'); end if;

  v_anchor := date_trunc('month', v_created)::date;
  if extract(day from v_created)::int > least(v_due_day, 28) then
    v_anchor := (v_anchor + interval '1 month')::date;
  end if;
  v_p := v_anchor;

  select count(*) into v_parts
  from public.recurring_bill_shares where bill_id = p_bill_id and amount_cents > 0;
  if v_parts = 0 then return to_char(v_p, 'YYYY-MM'); end if;

  loop
    v_guard := v_guard + 1;
    select count(*) into v_paid
    from public.recurring_bill_shares s
    where s.bill_id = p_bill_id and s.amount_cents > 0
      and exists (select 1 from public.recurring_bill_payments pay
                  where pay.bill_id = p_bill_id and pay.profile_id = s.profile_id
                    and pay.period = to_char(v_p, 'YYYY-MM') and pay.status = 'paid');
    exit when v_paid < v_parts;                 -- alguien no pagó → periodo activo
    v_p := (v_p + interval '1 month')::date;    -- todos pagaron → siguiente mes
    exit when v_guard > 240;
  end loop;
  return to_char(v_p, 'YYYY-MM');
end; $$;
grant execute on function public.recurring_active_period(uuid) to authenticated;

-- recurring_reminder pasa a recibir la FECHA de vencimiento (date) en vez del
-- día, para poder describir un pago de un mes futuro ("5 de julio"). El cuerpo
-- completo y la nueva sección de refresh_notification_queue quedaron aplicados
-- por MCP; en la app, lib/api.ts replica recurring_active_period en el cliente
-- (billActivePeriod) para mostrar el periodo correcto y registrar el pago en
-- el periodo activo.
