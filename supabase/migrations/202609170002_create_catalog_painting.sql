-- Create new catalogue entries through one narrowly scoped author-only RPC.
-- Browser clients keep no direct INSERT, UPDATE, or DELETE privilege on paintings.

revoke insert, update, delete on table public.paintings from anon, authenticated;

create or replace function public.create_catalog_painting(
  p_title text,
  p_price bigint,
  p_material text,
  p_year integer,
  p_technique text,
  p_width_cm numeric,
  p_height_cm numeric,
  p_in_stock boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id public.paintings.id%type;
  new_row jsonb;
  id_sequence text;
begin
  if (select auth.uid()) is null
     or coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') <> 'author' then
    raise exception 'Author role required' using errcode = '42501';
  end if;

  p_title := btrim(coalesce(p_title, ''));
  p_material := btrim(coalesce(p_material, ''));
  p_technique := btrim(coalesce(p_technique, ''));

  if char_length(p_title) < 1 or char_length(p_title) > 180 then
    raise exception 'Invalid title' using errcode = '22023';
  end if;
  if char_length(p_material) < 1 or char_length(p_material) > 250 then
    raise exception 'Invalid material' using errcode = '22023';
  end if;
  if p_price < 0 or p_price > 1000000000 then
    raise exception 'Invalid price' using errcode = '22023';
  end if;
  if p_year < 1000 or p_year > extract(year from now())::integer + 1 then
    raise exception 'Invalid year' using errcode = '22023';
  end if;
  if p_width_cm <= 0 or p_width_cm > 10000 or p_height_cm <= 0 or p_height_cm > 10000 then
    raise exception 'Invalid dimensions' using errcode = '22023';
  end if;
  if p_technique not in ('живопись', 'графика', 'коллаж', 'акварель', 'мифология', 'авиация', 'анимация', 'карикатура', 'принт') then
    raise exception 'Invalid technique' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.create_catalog_painting'));
  select coalesce(max(id), 0) + 1 into new_id from public.paintings;

  insert into public.paintings as painting (
    id, title, price, material, year, technique, width_cm, height_cm,
    in_stock, frontpage, image_url, artstation_url, created_at, updated_at,
    flag_image_broken, flag_description_error, flag_hidden
  ) values (
    new_id, p_title, p_price, p_material, p_year, p_technique, p_width_cm, p_height_cm,
    p_in_stock, false, '', '', now(), now(), false, false, true
  )
  returning to_jsonb(painting.*) into new_row;

  id_sequence := pg_catalog.pg_get_serial_sequence('public.paintings', 'id');
  if id_sequence is not null then
    perform pg_catalog.setval(id_sequence::regclass, new_id, true);
  end if;

  return new_row;
end;
$$;

revoke all on function public.create_catalog_painting(text, bigint, text, integer, text, numeric, numeric, boolean) from public, anon;
grant execute on function public.create_catalog_painting(text, bigint, text, integer, text, numeric, numeric, boolean) to authenticated;

comment on function public.create_catalog_painting(text, bigint, text, integer, text, numeric, numeric, boolean) is
  'Creates a hidden catalogue draft for authenticated users with app_metadata.role=author.';
