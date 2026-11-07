-- rls_auto_enable() is an event-trigger function (event trigger "ensure_rls"). It is not meant to be
-- called through the API, so remove EXECUTE from the API-facing roles. The event trigger keeps firing:
-- EXECUTE privilege is only checked when an event trigger is created, not when it fires.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
