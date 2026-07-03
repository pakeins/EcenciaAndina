create or replace function public.eciencia_is_valid_ec_cedula(value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  digits text := regexp_replace(coalesce(value, ''), '\D', '', 'g');
  coefficients int[] := array[2, 1, 2, 1, 2, 1, 2, 1, 2];
  province int;
  third_digit int;
  total int := 0;
  product int;
  expected int;
begin
  if digits !~ '^\d{10}$' then
    return false;
  end if;

  province := substring(digits from 1 for 2)::int;
  third_digit := substring(digits from 3 for 1)::int;
  if province < 1 or province > 24 or third_digit > 5 then
    return false;
  end if;

  for i in 1..9 loop
    product := substring(digits from i for 1)::int * coefficients[i];
    if product >= 10 then
      product := product - 9;
    end if;
    total := total + product;
  end loop;

  expected := (10 - (total % 10)) % 10;
  return expected = substring(digits from 10 for 1)::int;
end;
$$;

create or replace function public.eciencia_is_valid_ec_ruc(value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  digits text := regexp_replace(coalesce(value, ''), '\D', '', 'g');
  province int;
  third_digit int;
  coefficients int[];
  total int := 0;
  verifier int;
  expected int;
  verifier_position int;
begin
  if digits !~ '^\d{13}$' or right(digits, 3) = '000' then
    return false;
  end if;

  province := substring(digits from 1 for 2)::int;
  third_digit := substring(digits from 3 for 1)::int;
  if province < 1 or province > 24 then
    return false;
  end if;

  if third_digit < 6 then
    return public.eciencia_is_valid_ec_cedula(left(digits, 10));
  elsif third_digit = 6 then
    coefficients := array[3, 2, 7, 6, 5, 4, 3, 2];
    verifier_position := 9;
  elsif third_digit = 9 then
    coefficients := array[4, 3, 2, 7, 6, 5, 4, 3, 2];
    verifier_position := 10;
  else
    return false;
  end if;

  for i in 1..array_length(coefficients, 1) loop
    total := total + substring(digits from i for 1)::int * coefficients[i];
  end loop;

  verifier := 11 - (total % 11);
  if verifier = 11 then
    expected := 0;
  elsif verifier = 10 then
    return false;
  else
    expected := verifier;
  end if;

  return expected = substring(digits from verifier_position for 1)::int;
end;
$$;
