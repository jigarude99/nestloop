-- =====================================================================
-- FASE 13 hardening - can_read_expense solo para usuarios autenticados
-- =====================================================================

revoke execute on function public.can_read_expense(uuid) from public, anon;
grant execute on function public.can_read_expense(uuid) to authenticated;
