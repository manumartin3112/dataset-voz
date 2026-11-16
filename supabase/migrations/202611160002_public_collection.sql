-- Ejecutar DESPUÉS de 202611150001_collection.sql. Conserva los datos anteriores.
alter table public.voice_takes alter column invite_hash drop not null;
alter table public.voice_takes add column if not exists size_bytes bigint not null default 0;
create table if not exists public.voice_collection_settings (
 id boolean primary key default true check(id),
 enabled boolean not null default true,
 max_total_bytes bigint not null default 700000000,
 max_takes_per_day integer not null default 400
);
insert into public.voice_collection_settings(id) values(true) on conflict do nothing;
alter table public.voice_collection_settings enable row level security;
revoke all on public.voice_collection_settings from public, anon, authenticated;
grant all on public.voice_collection_settings to service_role;
-- Solo el receptor con service_role puede reservar; no se abre Storage ni las tablas.
create or replace function public.reserve_public_voice_take(p_meta jsonb,p_sha text,p_filename text,p_bytes bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare settings voice_collection_settings; old voice_takes; sibling voice_takes; result voice_takes;
begin
 select * into settings from voice_collection_settings where id=true for update;
 if not found or not settings.enabled then raise exception 'Collection unavailable'; end if;
 if p_bytes<44 or p_bytes>8000000 or p_filename !~ '^[A-Za-z0-9_-]+[.]wav$' or length(p_filename)>255 then raise exception 'Invalid file'; end if;
 if p_meta->>'consent' is distinct from 'true' or p_meta->>'protocol_version' is distinct from '2-public-original-phrases' then raise exception 'Invalid protocol'; end if;
 select * into old from voice_takes where id=(p_meta->>'id')::uuid;
 if found then
  if old.invite_hash is not null or old.sha256<>p_sha or old.metadata<>p_meta or old.object_path<>p_filename or old.size_bytes<>p_bytes then raise exception 'Take conflict'; end if;
  return to_jsonb(old);
 end if;
 if (select coalesce(sum(size_bytes),0) from voice_takes)+p_bytes>settings.max_total_bytes or
    (select count(*) from voice_takes where received_at>=date_trunc('day',now()))>=settings.max_takes_per_day then raise exception 'Collection unavailable'; end if;
 select * into sibling from voice_takes where session=(p_meta->>'session')::uuid limit 1;
 if found and (sibling.invite_hash is not null or
    (sibling.metadata - array['id','phrase_id','take','recorded_at','seconds','sample_rate']) is distinct from
    (p_meta - array['id','phrase_id','take','recorded_at','seconds','sample_rate'])) then raise exception 'Session conflict'; end if;
 insert into voice_takes(id,session,phrase_id,take,sha256,metadata,object_path,size_bytes)
 values((p_meta->>'id')::uuid,(p_meta->>'session')::uuid,p_meta->>'phrase_id',(p_meta->>'take')::integer,p_sha,p_meta,p_filename,p_bytes) returning * into result;
 return to_jsonb(result);
end $$;
revoke all on function public.reserve_public_voice_take(jsonb,text,text,bigint) from public,anon,authenticated;
grant execute on function public.reserve_public_voice_take(jsonb,text,text,bigint) to service_role;
