-- Migration 0006: each phone records which radio it carries (T15).
-- Positions over LoRa only carry the radio's node id ("!a1b2c3d4"); the roster maps
-- that id to a person, so every phone can name who is too far and find the tag holder.
-- Update on party_members was revoked in 0003, so this goes through an RPC that
-- only touches the caller's own row.

create function public.set_mesh_node(p_party uuid, p_node text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_node is not null and p_node !~ '^![0-9a-f]{8}$' then
    raise exception 'invalid node id %', p_node using errcode = '22023';
  end if;

  -- A radio handed to another member: the newest claim wins.
  if p_node is not null then
    update public.party_members set mesh_node_id = null
     where party_id = p_party and mesh_node_id = p_node and profile_id <> uid;
  end if;

  update public.party_members set mesh_node_id = p_node
   where party_id = p_party and profile_id = uid;
  if not found then
    raise exception 'not a member of this party' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.set_mesh_node(uuid, text) from public, anon;
grant execute on function public.set_mesh_node(uuid, text) to authenticated;
