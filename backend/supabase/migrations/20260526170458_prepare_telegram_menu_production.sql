create table if not exists public.menu_diario (
  id_menu_diario uuid primary key default gen_random_uuid(),
  fecha date not null,
  id_alimento bigint not null references public.alimentos(id_alimento) on delete cascade,
  imagen_url text,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (fecha, id_alimento)
);

alter table public.menu_diario enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'eciencia-menu-assets',
  'eciencia-menu-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();
