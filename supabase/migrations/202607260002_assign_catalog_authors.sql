-- Grant the catalogue author role to both approved accounts.
-- Fail atomically if either Auth user has not been created yet.

do $$
declare
  missing_emails text[];
begin
  select array_agg(desired.email order by desired.email)
  into missing_emails
  from unnest(array[
    'olegkaraev@gmail.com',
    'slavaushy@gmail.com'
  ]::text[]) as desired(email)
  where not exists (
    select 1
    from auth.users as auth_user
    where lower(auth_user.email) = lower(desired.email)
  );

  if missing_emails is not null then
    raise exception 'Create these Supabase Auth users first: %', array_to_string(missing_emails, ', ');
  end if;

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"author"}'::jsonb
  where lower(email) in (
    'olegkaraev@gmail.com',
    'slavaushy@gmail.com'
  );
end
$$;
