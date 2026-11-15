-- Ejecutar en un proyecto nuevo dedicado a la recogida.
create table public.voice_invites (
 token_hash text primary key,
 participant text not null check (participant ~ '^[A-Za-z0-9_-]{3,80}$'),
 expires_at timestamptz not null,
 max_takes integer not null default 24 check(max_takes between 1 and 200),
 revoked boolean not null default false
);
create table public.voice_takes (
 id uuid primary key,
 invite_hash text not null references public.voice_invites(token_hash),
 session uuid not null,
 phrase_id text not null check(phrase_id in ('a','b')),
 take integer not null check(take in (1,2)),
 sha256 text not null,
 metadata jsonb not null,
 object_path text not null unique,
 status text not null default 'pending' check(status in ('pending','complete')),
 received_at timestamptz not null default now(),
 unique(session,phrase_id,take)
);
alter table public.voice_invites enable row level security;
alter table public.voice_takes enable row level security;
revoke all on public.voice_invites, public.voice_takes from anon, authenticated;
grant all on public.voice_invites, public.voice_takes to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('voice-recordings','voice-recordings',false,8000000,array['audio/wav']);

-- Reserva atómica, límites e identidad comprobados también en la base de datos.
create function public.reserve_voice_take(p_hash text,p_meta jsonb,p_sha text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare inv voice_invites; old voice_takes; sibling voice_takes; result voice_takes;
begin
 select * into inv from voice_invites where token_hash=p_hash for update;
 if not found or inv.revoked or inv.expires_at<=now() then raise exception 'Invitation invalid'; end if;
 if p_meta->>'participant' <> inv.participant then raise exception 'Participant mismatch'; end if;
 select * into old from voice_takes where id=(p_meta->>'id')::uuid;
 if found then
  if old.invite_hash<>p_hash or old.sha256<>p_sha or old.metadata<>p_meta then raise exception 'Take conflict'; end if;
  return to_jsonb(old);
 end if;
 if (select count(*) from voice_takes where invite_hash=p_hash)>=inv.max_takes then raise exception 'Invitation quota reached'; end if;
 select * into sibling from voice_takes where session=(p_meta->>'session')::uuid limit 1;
 if found and (sibling.invite_hash<>p_hash or sibling.metadata->>'device'<>p_meta->>'device' or sibling.metadata->>'conditions'<>p_meta->>'conditions' or sibling.metadata->>'session_date'<>p_meta->>'session_date') then raise exception 'Session conflict'; end if;
 insert into voice_takes(id,invite_hash,session,phrase_id,take,sha256,metadata,object_path)
 values ((p_meta->>'id')::uuid,p_hash,(p_meta->>'session')::uuid,p_meta->>'phrase_id',(p_meta->>'take')::integer,p_sha,p_meta,(p_meta->>'id')||'.wav') returning * into result;
 return to_jsonb(result);
end $$;
revoke all on function public.reserve_voice_take(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.reserve_voice_take(text,jsonb,text) to service_role;
