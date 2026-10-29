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
