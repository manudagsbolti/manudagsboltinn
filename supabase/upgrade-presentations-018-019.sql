-- Existing project on migrations 001-017 only. Does not alter users or passwords.
-- Run once in Supabase SQL Editor before deploying presentations.
begin;
do $$ begin
  if to_regclass('public.presentations') is not null
    or to_regclass('public.presentation_discussion_entries') is not null then
    raise exception 'Publication tables already exist. Inspect applied migrations before retrying.';
  end if;
end $$;
-- Immutable publications are separate from operational game sync.
create table public.presentations (
  id uuid primary key,
  document jsonb not null,
  published_at timestamptz not null default now(),
  created_by uuid not null default auth.uid()
);
alter table public.presentations enable row level security;
revoke all on public.presentations from anon, authenticated;

create function public.publish_presentation(document jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists(select 1 from public.app_admins where user_id=auth.uid()) then
    raise exception 'Admin required' using errcode='42501';
  end if;
  if $1->>'schemaVersion' <> '1' or jsonb_typeof($1->'slides') is distinct from 'array'
    or jsonb_array_length($1->'slides')=0 or jsonb_typeof($1->'source') is distinct from 'object'
    or coalesce(length($1->>'title'),0)=0 then
    raise exception 'Invalid publication';
  end if;
  -- Same-ID retries are safe; published documents cannot be replaced.
  insert into public.presentations(id,document) values (($1->>'id')::uuid,$1)
  on conflict(id) do nothing;
  if not exists(select 1 from public.presentations p where p.id=($1->>'id')::uuid and p.document=$1) then
    raise exception 'Publication is immutable';
  end if;
end $$;

create function public.list_presentations() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists(select 1 from public.app_admins where user_id=auth.uid()) then
    raise exception 'Admin required' using errcode='42501';
  end if;
  return (select coalesce(jsonb_agg(document order by published_at desc),'[]'::jsonb) from public.presentations);
end $$;

-- Public readers receive only the deliberately published slides, never raw facts.
create function public.get_published_presentation(presentation_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select document - 'source' from public.presentations where id=presentation_id;
$$;
revoke all on function public.publish_presentation(jsonb) from public, anon;
revoke all on function public.list_presentations() from public, anon;
revoke all on function public.get_published_presentation(uuid) from public;
grant execute on function public.publish_presentation(jsonb) to authenticated;
grant execute on function public.list_presentations() to authenticated;
grant execute on function public.get_published_presentation(uuid) to anon, authenticated;

-- Append-only meeting outcomes, separate from frozen public slide decks.
create table public.presentation_discussion_entries (
  id uuid primary key,
  document jsonb not null,
  received_at timestamptz not null default now(),
  created_by uuid not null default auth.uid()
);
alter table public.presentation_discussion_entries enable row level security;
revoke all on public.presentation_discussion_entries from public, anon, authenticated;

create function public.save_discussion_entry(document jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists(select 1 from public.app_admins where user_id=auth.uid()) then
    raise exception 'Admin required' using errcode='42501';
  end if;
  if jsonb_typeof($1) is distinct from 'object'
    or coalesce(length(trim($1->>'topic')),0)=0
    or coalesce(length(trim($1->>'outcome')),0)=0
    or coalesce(length($1->>'presentationTitle'),0)=0
    or coalesce(length($1->>'eventDate'),0)=0
    or coalesce(length($1->>'createdAt'),0)=0 then
    raise exception 'Invalid discussion entry';
  end if;
  perform ($1->>'presentationId')::uuid;
  insert into public.presentation_discussion_entries(id,document)
  values (($1->>'id')::uuid,$1) on conflict(id) do nothing;
  if not exists(select 1 from public.presentation_discussion_entries e where e.id=($1->>'id')::uuid and e.document=$1) then
    raise exception 'Discussion entry is immutable';
  end if;
end $$;

create function public.list_discussion_entries() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not exists(select 1 from public.app_admins where user_id=auth.uid()) then
    raise exception 'Admin required' using errcode='42501';
  end if;
  return (select coalesce(jsonb_agg(document order by received_at desc),'[]'::jsonb) from public.presentation_discussion_entries);
end $$;
revoke all on function public.save_discussion_entry(jsonb), public.list_discussion_entries() from public, anon;
grant execute on function public.save_discussion_entry(jsonb), public.list_discussion_entries() to authenticated;
commit;
