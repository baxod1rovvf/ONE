-- ONE sync — run this once in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run inside a project another site already uses: it only creates
-- objects whose names start with "one_" and touches nothing else.
--
-- What is stored: one encrypted blob per synced group of devices. The data is
-- encrypted in the browser before upload, so the database only ever sees
-- ciphertext. The tables are locked (row level security on, no policies);
-- the only way in is through the four functions below.

create table if not exists public.one_vaults (
  id text primary key,
  auth_hash text not null,
  data text not null,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.one_pairings (
  code_hash text primary key,
  payload text not null,
  expires_at timestamptz not null
);

create table if not exists public.one_pair_failures (
  at timestamptz not null default now()
);

alter table public.one_vaults enable row level security;
alter table public.one_pairings enable row level security;
alter table public.one_pair_failures enable row level security;
revoke all on table public.one_vaults, public.one_pairings, public.one_pair_failures from anon, authenticated;

-- Read the vault. Returns status "same" when nothing changed since p_known_version.
create or replace function public.one_pull(p_vault text, p_auth text, p_known_version bigint default 0)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.one_vaults;
begin
  select * into v from public.one_vaults where id = p_vault;
  if not found then
    return json_build_object('status', 'missing');
  end if;
  if v.auth_hash <> encode(sha256(convert_to(p_auth, 'UTF8')), 'hex') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v.version = p_known_version then
    return json_build_object('status', 'same', 'version', v.version);
  end if;
  return json_build_object('status', 'ok', 'version', v.version, 'data', v.data);
end;
$$;

-- Write the vault. p_base_version must match the stored version (0 creates a new vault);
-- otherwise returns status "conflict" with the current data so the device can merge and retry.
create or replace function public.one_push(p_vault text, p_auth text, p_data text, p_base_version bigint)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.one_vaults;
  h text := encode(sha256(convert_to(p_auth, 'UTF8')), 'hex');
begin
  if length(p_vault) <> 64 or length(p_data) > 5000000 then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  select * into v from public.one_vaults where id = p_vault for update;
  if not found then
    if p_base_version <> 0 then
      return json_build_object('status', 'missing');
    end if;
    insert into public.one_vaults (id, auth_hash, data) values (p_vault, h, p_data);
    return json_build_object('status', 'ok', 'version', 1);
  end if;
  if v.auth_hash <> h then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v.version <> p_base_version then
    return json_build_object('status', 'conflict', 'version', v.version, 'data', v.data);
  end if;
  update public.one_vaults set data = p_data, version = v.version + 1, updated_at = now() where id = p_vault;
  return json_build_object('status', 'ok', 'version', v.version + 1);
end;
$$;

-- Offer a 6-digit pairing code for 10 minutes. The payload is encrypted with the code.
create or replace function public.one_pair_create(p_code_hash text, p_payload text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(p_code_hash) <> 64 or length(p_payload) > 2000 then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  delete from public.one_pairings where expires_at < now();
  delete from public.one_pair_failures where at < now() - interval '1 hour';
  if exists (select 1 from public.one_pairings where code_hash = p_code_hash) then
    return json_build_object('status', 'taken');
  end if;
  insert into public.one_pairings (code_hash, payload, expires_at)
  values (p_code_hash, p_payload, now() + interval '10 minutes');
  return json_build_object('status', 'ok', 'expires_in', 600);
end;
$$;

-- Use a pairing code. Works once. Too many wrong codes pause pairing for 15 minutes,
-- which keeps anyone from guessing a 6-digit code.
create or replace function public.one_pair_claim(p_code_hash text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.one_pairings;
  fails int;
begin
  select count(*) into fails from public.one_pair_failures where at > now() - interval '15 minutes';
  if fails >= 30 then
    return json_build_object('status', 'locked');
  end if;
  delete from public.one_pairings
  where code_hash = p_code_hash and expires_at > now()
  returning * into r;
  if not found then
    insert into public.one_pair_failures default values;
    return json_build_object('status', 'invalid');
  end if;
  return json_build_object('status', 'ok', 'payload', r.payload);
end;
$$;

revoke all on function public.one_pull(text, text, bigint) from public;
revoke all on function public.one_push(text, text, text, bigint) from public;
revoke all on function public.one_pair_create(text, text) from public;
revoke all on function public.one_pair_claim(text) from public;
grant execute on function public.one_pull(text, text, bigint) to anon, authenticated;
grant execute on function public.one_push(text, text, text, bigint) to anon, authenticated;
grant execute on function public.one_pair_create(text, text) to anon, authenticated;
grant execute on function public.one_pair_claim(text) to anon, authenticated;
