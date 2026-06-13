-- =====================================================================
-- FASE 16b - NestLoop: hardening de grants para settlements
-- =====================================================================
-- La tabla solo necesita SELECT directo para usuarios autenticados.
-- Las escrituras se hacen exclusivamente a traves del RPC settle_with.
-- =====================================================================

revoke all on table public.settlements from anon, authenticated;
grant select on table public.settlements to authenticated;

revoke execute on function public.settle_with(uuid, text, text) from public, anon;
grant execute on function public.settle_with(uuid, text, text) to authenticated;
