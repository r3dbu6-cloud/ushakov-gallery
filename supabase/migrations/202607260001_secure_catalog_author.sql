-- Secure author access for the public catalogue layout.
-- Authentication is handled by Supabase Auth. Authorization is enforced here.

create table if not exists public.catalog_config (
  id text primary key check (id = 'main'),
  config jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.catalog_config enable row level security;

revoke all on table public.catalog_config from anon, authenticated;
grant select on table public.catalog_config to anon, authenticated;
grant insert, update on table public.catalog_config to authenticated;

drop policy if exists "Public can read catalogue config" on public.catalog_config;
create policy "Public can read catalogue config"
on public.catalog_config
for select
to anon, authenticated
using (id = 'main');

drop policy if exists "Authors can create catalogue config" on public.catalog_config;
create policy "Authors can create catalogue config"
on public.catalog_config
for insert
to authenticated
with check (
  id = 'main'
  and updated_by = (select auth.uid())
  and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'author'
);

drop policy if exists "Authors can update catalogue config" on public.catalog_config;
create policy "Authors can update catalogue config"
on public.catalog_config
for update
to authenticated
using (
  id = 'main'
  and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'author'
)
with check (
  id = 'main'
  and updated_by = (select auth.uid())
  and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'author'
);

comment on table public.catalog_config is
  'Public catalogue layout. Only authenticated users with app_metadata.role=author can write.';

-- Retire the legacy browser-admin write path. Existing permissive RLS policies
-- cannot grant operations after the underlying table privilege is revoked.
do $$
begin
  if to_regclass('public.paintings') is not null then
    execute 'revoke insert, update, delete on table public.paintings from anon, authenticated';
    execute 'grant select on table public.paintings to anon, authenticated';
  end if;

  if to_regclass('public.orders') is not null then
    execute 'revoke all on table public.orders from anon, authenticated';
  end if;

  if to_regclass('storage.objects') is not null then
    execute 'revoke insert, update, delete on table storage.objects from anon, authenticated';
  end if;
end
$$;
