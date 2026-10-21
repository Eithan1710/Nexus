-- Nexus smart reminders: reminders, Web Push subscriptions, and the server-side dispatcher.
-- Delivery runs entirely on the server: pg_cron checks every minute for due reminders and calls
-- the nx-reminders Edge Function, which sends Web Push and records the outcome.

-- ---------- reminders ----------

create table if not exists public.nx_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  notes text not null default '' check (char_length(notes) <= 5000),
  topic_id uuid references public.nx_topics(id) on delete set null,
  -- Next time to notify. For a recurring reminder the server moves it forward after each one.
  due_at timestamptz not null,
  timezone text not null default 'Asia/Jerusalem' check (char_length(timezone) between 1 and 64),
  -- { freq: daily|weekly|monthly|yearly, interval, days[], monthDay, month, time: 'HH:MM' }
  recurrence jsonb check (recurrence is null or (jsonb_typeof(recurrence) = 'object' and recurrence ->> 'freq' in ('daily', 'weekly', 'monthly', 'yearly'))),
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  completed_at timestamptz,
  -- Delivery of the notification for the current due_at. Written by the server only.
  delivery_status text not null default 'scheduled' check (delivery_status in ('scheduled', 'sending', 'retry', 'sent', 'failed')),
  delivery_attempts integer not null default 0,
  next_attempt_at timestamptz,
  claimed_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nx_reminders_user_idx on public.nx_reminders (user_id, due_at);
create index if not exists nx_reminders_topic_idx on public.nx_reminders (topic_id) where topic_id is not null;
-- What the dispatcher scans every minute.
create index if not exists nx_reminders_due_idx on public.nx_reminders (due_at)
  where status = 'pending' and delivery_status in ('scheduled', 'retry', 'sending');

-- Keeps clients from writing delivery bookkeeping, re-arms delivery whenever the time or
-- schedule changes, and validates the timezone and topic.
create or replace function public.nx_reminder_guard()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform now() at time zone new.timezone; -- raises on an unknown timezone
  if new.topic_id is not null and not exists (
    select 1 from public.nx_topics t where t.id = new.topic_id and t.user_id = new.user_id
  ) then
    new.topic_id := null; -- topic deleted (or not ours): keep the reminder, drop the link
  end if;
  if new.status = 'completed' and new.completed_at is null then new.completed_at := now(); end if;
  if new.status <> 'completed' then new.completed_at := null; end if;

  if current_user <> 'authenticated' then
    return new; -- the dispatcher (service role) manages delivery fields itself
  end if;

  if tg_op = 'INSERT' then
    new.delivery_status := 'scheduled';
    new.delivery_attempts := 0;
    new.next_attempt_at := null;
    new.claimed_at := null;
    new.delivered_at := null;
    new.last_error := null;
    return new;
  end if;

  new.delivery_status := old.delivery_status;
  new.delivery_attempts := old.delivery_attempts;
  new.next_attempt_at := old.next_attempt_at;
  new.claimed_at := old.claimed_at;
  new.delivered_at := old.delivered_at;
  new.last_error := old.last_error;
  if new.due_at is distinct from old.due_at
     or new.recurrence is distinct from old.recurrence
     or (new.status = 'pending' and old.status <> 'pending') then
    new.delivery_status := 'scheduled';
    new.delivery_attempts := 0;
    new.next_attempt_at := null;
    new.claimed_at := null;
    new.last_error := null;
  end if;
  return new;
end $$;

create trigger nx_reminders_guard before insert or update on public.nx_reminders
  for each row execute function public.nx_reminder_guard();

alter table public.nx_reminders enable row level security;

create policy "nx_reminders owner select" on public.nx_reminders for select to authenticated using ((select auth.uid()) = user_id);
create policy "nx_reminders owner insert" on public.nx_reminders for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "nx_reminders owner update" on public.nx_reminders for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "nx_reminders owner delete" on public.nx_reminders for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.nx_reminders to authenticated;

-- ---------- push subscriptions ----------
-- RLS is on with no client policies: the browser never reads this table. It registers and
-- removes its own subscription through the functions below, scoped to auth.uid().

create table if not exists public.nx_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 2000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (char_length(user_agent) <= 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0
);
create index if not exists nx_push_subscriptions_user_idx on public.nx_push_subscriptions (user_id);
alter table public.nx_push_subscriptions enable row level security;

create or replace function public.nx_save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  insert into public.nx_push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 400))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, updated_at = now(), failure_count = 0;
  return public.nx_push_status(p_endpoint);
end $$;

create or replace function public.nx_delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = '' as $$
  delete from public.nx_push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- Whether this device's subscription is registered, and how many devices the user has.
create or replace function public.nx_push_status(p_endpoint text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'registered', exists (select 1 from public.nx_push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()),
    'devices', (select count(*) from public.nx_push_subscriptions where user_id = auth.uid()),
    'last_success_at', (select last_success_at from public.nx_push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()),
    'last_failure_at', (select last_failure_at from public.nx_push_subscriptions where endpoint = p_endpoint and user_id = auth.uid())
  );
$$;

-- ---------- dispatcher internals (service role only) ----------

create or replace function public.nx_require_service_role()
returns void language plpgsql stable set search_path = '' as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'forbidden';
  end if;
end $$;

-- Atomically takes the due reminders for one dispatcher run. Rows are locked with SKIP LOCKED
-- and moved to 'sending', so overlapping runs never pick the same reminder. A run that died
-- mid-send is retried once its claim is 3 minutes old.
create or replace function public.nx_claim_due_reminders(max_rows integer default 100)
returns setof public.nx_reminders language plpgsql security definer set search_path = '' as $$
begin
  perform public.nx_require_service_role();
  return query
  update public.nx_reminders r
     set delivery_status = 'sending', claimed_at = now(), delivery_attempts = r.delivery_attempts + 1
   where r.id in (
     select c.id from public.nx_reminders c
      where c.status = 'pending' and c.due_at <= now()
        and (c.delivery_status = 'scheduled'
             or (c.delivery_status = 'retry' and c.next_attempt_at <= now())
             or (c.delivery_status = 'sending' and c.claimed_at < now() - interval '3 minutes'))
      order by c.due_at
      for update skip locked
      limit max_rows)
  returning r.*;
end $$;

-- Vault access for nx_ secrets (cron secret, VAPID key pair).
create or replace function public.nx_get_secret(secret_name text)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.nx_require_service_role();
  if left(secret_name, 3) <> 'nx_' then raise exception 'only nx_ secrets'; end if;
  return (select decrypted_secret from vault.decrypted_secrets where name = secret_name limit 1);
end $$;

-- Stores a secret only if it does not exist yet and returns whichever value is stored, so
-- two first runs racing to create the VAPID keys still agree on one pair.
create or replace function public.nx_init_secret(secret_name text, secret_value text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform public.nx_require_service_role();
  if left(secret_name, 3) <> 'nx_' then raise exception 'only nx_ secrets'; end if;
  if not exists (select 1 from vault.secrets where name = secret_name) then
    begin
      perform vault.create_secret(secret_value, secret_name);
    exception when unique_violation then null;
    end;
  end if;
  return (select decrypted_secret from vault.decrypted_secrets where name = secret_name limit 1);
end $$;

grant execute on function public.nx_save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.nx_delete_push_subscription(text) to authenticated;
grant execute on function public.nx_push_status(text) to authenticated;

-- ---------- schedule ----------
-- The cron secret is generated here and lives only in Vault (never in the repo). The job runs
-- every minute but only calls the Edge Function when something is actually due.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'nx_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'nx_cron_secret', 'Nexus reminders: cron -> nx-reminders function');
  end if;
  if not exists (select 1 from vault.secrets where name = 'nx_project_url') then
    perform vault.create_secret('https://kjfihzskaqcboeejnkak.supabase.co', 'nx_project_url', 'Nexus reminders: Supabase project URL');
  end if;
end $$;

select cron.schedule(
  'nx-reminders-dispatch',
  '* * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'nx_project_url') || '/functions/v1/nx-reminders',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'nx_cron_secret')
    ),
    body := '{"action":"dispatch"}'::jsonb,
    timeout_milliseconds := 25000
  )
  where exists (
    select 1 from public.nx_reminders
     where status = 'pending' and due_at <= now()
       and (delivery_status = 'scheduled'
            or (delivery_status = 'retry' and next_attempt_at <= now())
            or (delivery_status = 'sending' and claimed_at < now() - interval '3 minutes'))
  );
  $cron$
);
