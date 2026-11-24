-- Fix: creating a party always failed with
--   "new row violates row-level security policy for table parties".
-- create_party() inserts the party with RETURNING, so Postgres checks the new row
-- against the SELECT policy. That policy only asked is_party_member(id), which
-- can't see the row being inserted (and the tag holder isn't a member yet), so it
-- was always false. The tag holder can now always read their own party.

drop policy "read my parties" on public.parties;

create policy "read my parties" on public.parties for select to authenticated
  using (tag_holder_id = (select auth.uid()) or public.is_party_member(id));
