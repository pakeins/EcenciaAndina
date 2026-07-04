-- El menu diario por componentes solo exige plato fuerte (segundos).
-- Sopa, entrada, postre, bebida y guarnicion son opcionales, por lo que la
-- restriccion de menu_envios ya no debe exigir sopa: un menu sin sopa debe
-- poder enviarse y persistirse en menu_envios.

alter table public.menu_envios
  drop constraint if exists menu_envios_sections_check;

alter table public.menu_envios
  add constraint menu_envios_sections_check
  check (
    jsonb_typeof(menu_payload->'segundos') = 'array'
    and jsonb_array_length(menu_payload->'segundos') > 0
    and (not (menu_payload ? 'entradas') or jsonb_typeof(menu_payload->'entradas') = 'array')
    and (not (menu_payload ? 'sopas') or jsonb_typeof(menu_payload->'sopas') = 'array')
    and (not (menu_payload ? 'postres') or jsonb_typeof(menu_payload->'postres') = 'array')
    and (not (menu_payload ? 'bebidas') or jsonb_typeof(menu_payload->'bebidas') = 'array')
    and (not (menu_payload ? 'guarniciones') or jsonb_typeof(menu_payload->'guarniciones') = 'array')
  );

notify pgrst, 'reload schema';
