-- Phase 22: safely cancel a cash payment that is waiting for confirmation.

create or replace function public.cancel_own_cash_payment(p_expense_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_share_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  update public.expense_shares
  set
    status = 'pending',
    payment_method = null,
    proof_path = null,
    sent_at = null,
    confirmed_at = null
  where expense_id = p_expense_id
    and profile_id = (select auth.uid())
    and status = 'sent'
    and payment_method = 'cash'
  returning id into v_share_id;

  if v_share_id is null then
    raise exception 'Este pago ya no esta esperando confirmacion.';
  end if;

  perform public.refresh_notification_queue();
  return true;
end;
$$;

revoke execute on function public.cancel_own_cash_payment(uuid) from public;
revoke execute on function public.cancel_own_cash_payment(uuid) from anon;
grant execute on function public.cancel_own_cash_payment(uuid) to authenticated;

comment on function public.cancel_own_cash_payment(uuid) is
  'Lets an authenticated member cancel only their own pending cash-payment notice.';
