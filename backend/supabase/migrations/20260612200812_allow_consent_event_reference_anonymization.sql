create or replace function public.prevent_telegram_consent_event_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'telegram_consent_events is append-only';
  end if;

  if
    new.id = old.id
    and new.event_type = old.event_type
    and new.consent_version is not distinct from old.consent_version
    and new.notice_sha256 is not distinct from old.notice_sha256
    and new.notice_text is not distinct from old.notice_text
    and new.method = old.method
    and new.telegram_user_id_hmac is not distinct from old.telegram_user_id_hmac
    and new.chat_id_hmac is not distinct from old.chat_id_hmac
    and new.phone_hmac is not distinct from old.phone_hmac
    and new.evidence = old.evidence
    and new.occurred_at = old.occurred_at
    and (
      new.id_cliente is not distinct from old.id_cliente
      or (old.id_cliente is not null and new.id_cliente is null)
    )
    and (
      new.subscription_id is not distinct from old.subscription_id
      or (old.subscription_id is not null and new.subscription_id is null)
    )
    and (
      new.invitation_id is not distinct from old.invitation_id
      or (old.invitation_id is not null and new.invitation_id is null)
    )
  then
    return new;
  end if;

  raise exception 'telegram_consent_events is append-only';
end;
$$;

revoke all on function public.prevent_telegram_consent_event_changes()
  from public, anon, authenticated;
grant execute on function public.prevent_telegram_consent_event_changes()
  to service_role;

comment on function public.prevent_telegram_consent_event_changes()
  is 'Impide alterar evidencia y permite solo anonimizar referencias mediante ON DELETE SET NULL.';
