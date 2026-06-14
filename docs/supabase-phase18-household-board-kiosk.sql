-- =====================================================================
-- FASE 18 — NestLoop: "Modo Tablero" (kiosk de cocina)
-- Aplicado en Supabase (proyecto zzaqgynyezsgcbdynekc) el 2026-06-14.
-- Función de solo-lectura que recibe SOLO el código de la casa (sin cuenta)
-- y devuelve un resumen seguro: miembros, turnos (a quién le toca),
-- horarios y saldos netos por pareja. NO expone fotos, comprobantes,
-- correos ni detalles de gastos. El código de invitación es la llave.
-- La usa la ruta pública /tablero (components/BoardScreen.tsx).
-- =====================================================================
create or replace function public.get_household_board(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_hid uuid;
  v_name text;
  v_result jsonb;
begin
  if coalesce(trim(p_invite_code), '') = '' then
    return jsonb_build_object('ok', false);
  end if;

  select id, name into v_hid, v_name
  from public.households
  where upper(invite_code) = upper(trim(p_invite_code));

  if v_hid is null then
    return jsonb_build_object('ok', false);
  end if;

  select jsonb_build_object(
    'ok', true,
    'household', v_name,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.full_name, 'color', pr.color)
                       order by hm.created_at)
      from public.household_members hm
      join public.profiles pr on pr.id = hm.profile_id
      where hm.household_id = v_hid
    ), '[]'::jsonb),
    'rotations', coalesce((
      select jsonb_agg(t.obj order by t.created_at)
      from (
        select r.created_at,
          jsonb_build_object(
            'title', r.title, 'cadence', r.cadence, 'icon', r.icon,
            'current', cur.full_name, 'currentColor', cur.color
          ) as obj
        from public.task_rotations r
        left join lateral (
          select pr.full_name, pr.color
          from public.task_rotation_members m
          join public.profiles pr on pr.id = m.profile_id
          where m.rotation_id = r.id
          order by m.position offset r.current_index limit 1
        ) cur on true
        where r.household_id = v_hid
      ) t
    ), '[]'::jsonb),
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', sl.day_of_week, 'name', pr.full_name, 'color', pr.color,
        'start', left(sl.starts_at::text, 5), 'end', left(sl.ends_at::text, 5), 'label', sl.label
      ) order by sl.day_of_week, sl.starts_at)
      from public.schedule_slots sl
      join public.profiles pr on pr.id = sl.profile_id
      where sl.household_id = v_hid
    ), '[]'::jsonb),
    'debts', coalesce((
      with open as (
        select e.paid_by as creditor, s.profile_id as debtor, sum(s.amount_cents)::int as cents
        from public.expense_shares s
        join public.expenses e on e.id = s.expense_id
        where e.household_id = v_hid and e.archived_at is null
          and s.status <> 'confirmed' and s.profile_id <> e.paid_by and s.amount_cents > 0
        group by e.paid_by, s.profile_id
      ),
      pairs as (
        select least(debtor, creditor) as a, greatest(debtor, creditor) as b from open group by 1, 2
      ),
      nets as (
        select p.a, p.b,
          coalesce((select cents from open o where o.debtor = p.a and o.creditor = p.b), 0)
          - coalesce((select cents from open o where o.debtor = p.b and o.creditor = p.a), 0) as net
        from pairs p
      )
      select jsonb_agg(jsonb_build_object(
        'from', fn.full_name, 'fromColor', fn.color,
        'to', tn.full_name, 'toColor', tn.color,
        'amount', round(abs(n.net) / 100.0, 2)
      ) order by abs(n.net) desc)
      from nets n
      join public.profiles fn on fn.id = case when n.net >= 0 then n.a else n.b end
      join public.profiles tn on tn.id = case when n.net >= 0 then n.b else n.a end
      where n.net <> 0
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.get_household_board(text) from public;
grant execute on function public.get_household_board(text) to anon, authenticated;
