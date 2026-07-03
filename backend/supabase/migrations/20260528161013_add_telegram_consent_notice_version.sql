alter table public.telegram_subscriptions
  add column if not exists consent_notice_version text,
  add column if not exists consent_notice_text text;

comment on column public.telegram_subscriptions.consent_notice_version
  is 'Version del aviso de privacidad mostrado al titular antes de aceptar el bot.';

comment on column public.telegram_subscriptions.consent_notice_text
  is 'Texto del aviso aceptado o rechazado para trazabilidad de consentimiento.';
