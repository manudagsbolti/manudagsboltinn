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
