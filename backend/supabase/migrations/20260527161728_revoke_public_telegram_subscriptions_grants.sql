revoke all on table public.telegram_subscriptions from anon, authenticated;

grant all on table public.telegram_subscriptions to service_role;
