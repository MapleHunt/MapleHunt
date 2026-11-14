-- MapleHunt — migration 0004: profile names for Google sign-in
-- Email sign-up sends display_name; Google sends full_name / name. Use whichever
-- is there so party members see a real name instead of an email address.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', '')
    )
  );
  return new;
end;
$$;

-- Fill in names for anyone who already signed up without one.
update public.profiles p
   set display_name = coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(u.raw_user_meta_data ->> 'name', ''))
  from auth.users u
 where u.id = p.id and p.display_name is null;
