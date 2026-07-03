create index if not exists idx_telegram_order_traces_update_id
  on public.telegram_order_traces (update_id)
  where update_id is not null;
