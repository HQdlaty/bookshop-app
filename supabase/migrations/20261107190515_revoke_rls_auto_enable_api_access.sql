-- rls_auto_enable() is an event-trigger function (event trigger "ensure_rls"). It is not meant to be
-- called through the API, so remove EXECUTE from the API-facing roles. The event trigger keeps firing:
-- EXECUTE privilege is only checked when an event trigger is created, not when it fires.
--
-- The function exists in the hosted project but is not created by these migrations, so the revoke only runs
-- when the function exists. On a project without it this migration does nothing instead of failing.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;
