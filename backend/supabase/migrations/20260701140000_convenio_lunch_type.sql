-- Tipo de almuerzo contratado por convenio (empresa).
-- Los clientes de convenio reciben este tipo fijo en el bot Telegram;
-- los clientes frecuentes siguen eligiendo el paquete.
-- Depende de 20260701120000_official_lunch_packages.sql (crea el tipo 9).

alter table public.convenios
  add column if not exists id_tipo_almuerzo bigint
    references public.tipos_almuerzo(id_tipo_almuerzo);

-- Backfill: convenios sin tipo -> Almuerzo del Dia (9), solo si el tipo existe.
update public.convenios c
set id_tipo_almuerzo = 9
where c.id_tipo_almuerzo is null
  and exists (
    select 1 from public.tipos_almuerzo t where t.id_tipo_almuerzo = 9
  );

alter table public.convenios
  alter column id_tipo_almuerzo set default 9;

create index if not exists idx_convenios_id_tipo_almuerzo
  on public.convenios(id_tipo_almuerzo);

notify pgrst, 'reload schema';
