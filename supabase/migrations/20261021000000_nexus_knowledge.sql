-- Nexus: personal knowledge hub. Tables are prefixed nx_ because the Supabase
-- project is shared with other apps.

create table if not exists public.nx_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  icon text not null default 'lightbulb' check (char_length(icon) <= 40),
  color text not null default 'indigo' check (char_length(color) <= 20),
  position double precision not null default 0,
  pinned boolean not null default false,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nx_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  topic_id uuid not null references public.nx_topics(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 300),
  content text not null default '' check (char_length(content) <= 200000),
  pinned boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nx_topics_user_idx on public.nx_topics (user_id);
create index if not exists nx_items_user_idx on public.nx_items (user_id, updated_at desc);
create index if not exists nx_items_topic_idx on public.nx_items (topic_id);

-- An item may only live in a topic owned by the same user.
create or replace function public.nx_check_item_topic()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.nx_topics t where t.id = new.topic_id and t.user_id = new.user_id) then
    raise exception 'topic not found';
  end if;
  return new;
end $$;

-- Server-owned version counter, used by the client for conflict detection.
create or replace function public.nx_bump_version()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.version := old.version + 1;
  return new;
end $$;

create trigger nx_items_topic_check before insert or update of topic_id, user_id on public.nx_items
  for each row execute function public.nx_check_item_topic();

create trigger nx_items_version before update on public.nx_items
  for each row execute function public.nx_bump_version();

alter table public.nx_topics enable row level security;
alter table public.nx_items enable row level security;

create policy "nx_topics owner select" on public.nx_topics for select to authenticated using ((select auth.uid()) = user_id);
create policy "nx_topics owner insert" on public.nx_topics for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "nx_topics owner update" on public.nx_topics for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "nx_topics owner delete" on public.nx_topics for delete to authenticated using ((select auth.uid()) = user_id);

create policy "nx_items owner select" on public.nx_items for select to authenticated using ((select auth.uid()) = user_id);
create policy "nx_items owner insert" on public.nx_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "nx_items owner update" on public.nx_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "nx_items owner delete" on public.nx_items for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.nx_topics, public.nx_items to authenticated;
