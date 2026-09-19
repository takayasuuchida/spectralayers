-- Additive, isolated two-store board. Does not reference legacy tables or RPCs.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.furikko_pair_rooms (
  read_hash bytea PRIMARY KEY,
  vivace_write_hash bytea NOT NULL,
  anela_write_hash bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (octet_length(read_hash) = 32 AND octet_length(vivace_write_hash) = 32 AND octet_length(anela_write_hash) = 32),
  CHECK (read_hash <> vivace_write_hash AND read_hash <> anela_write_hash AND vivace_write_hash <> anela_write_hash)
);
CREATE TABLE public.furikko_pair_state (
  room_hash bytea NOT NULL REFERENCES public.furikko_pair_rooms(read_hash) ON DELETE CASCADE,
  store_id text NOT NULL CHECK (store_id IN ('vivace', 'anela')),
  data jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Allocating a room does not claim that either store is online.
  seen_at timestamptz NOT NULL DEFAULT '1970-01-01 00:00:00+00',
  PRIMARY KEY (room_hash, store_id)
);
ALTER TABLE public.furikko_pair_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.furikko_pair_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.furikko_pair_rooms, public.furikko_pair_state FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.furikko_pair_validate(p_data jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE t jsonb; n numeric; k text; ids text[] := ARRAY[]::text[]; names text[] := ARRAY[]::text[];
BEGIN
  IF p_data IS NULL OR octet_length(p_data::text) > 65536 OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF NOT (p_data ?& ARRAY['tables','setMin','casts','waiting','castNames']) OR p_data - ARRAY['tables','setMin','casts','waiting','castNames'] <> '{}'::jsonb THEN RETURN false; END IF;
  IF jsonb_typeof(p_data->'setMin') IS DISTINCT FROM 'number' OR p_data->>'setMin' NOT IN ('50','60') THEN RETURN false; END IF;
  IF jsonb_typeof(p_data->'casts') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF NOT ((p_data->'casts') ?& ARRAY['now','total']) OR (p_data->'casts') - ARRAY['now','total'] <> '{}'::jsonb THEN RETURN false; END IF;
  FOREACH k IN ARRAY ARRAY['now','total'] LOOP
    IF jsonb_typeof(p_data->'casts'->k) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
    n := (p_data->'casts'->>k)::numeric;
    IF n <> trunc(n) OR n < 0 OR n > 60 THEN RETURN false; END IF;
  END LOOP;
  IF (p_data->'casts'->>'now')::numeric > (p_data->'casts'->>'total')::numeric THEN RETURN false; END IF;
  IF jsonb_typeof(p_data->'castNames') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(p_data->'castNames') > 60 THEN RETURN false; END IF;
  FOR t IN SELECT value FROM jsonb_array_elements(p_data->'castNames') LOOP
    IF jsonb_typeof(t) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    k := t #>> '{}';
    IF char_length(k) NOT BETWEEN 1 AND 24 OR btrim(k, U&'\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') <> k OR k ~ '[[:cntrl:]]' OR
       k ~ U&'[\007F-\009F]' OR k = ANY(names) THEN RETURN false; END IF;
    names := array_append(names,k);
  END LOOP;
  IF cardinality(names) > 0 AND (p_data->'casts'->>'total')::numeric <> cardinality(names) THEN RETURN false; END IF;
  IF jsonb_typeof(p_data->'waiting') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(p_data->'waiting') > 30 THEN RETURN false; END IF;
  FOR t IN SELECT value FROM jsonb_array_elements(p_data->'waiting') LOOP
    IF jsonb_typeof(t) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF NOT (t ?& ARRAY['id','guests','at']) OR t - ARRAY['id','guests','at'] <> '{}'::jsonb THEN RETURN false; END IF;
    IF jsonb_typeof(t->'id') IS DISTINCT FROM 'string' OR (t->>'id') !~ '^[A-Za-z0-9_-]{1,48}$' OR (t->>'id') = ANY(ids) THEN RETURN false; END IF;
    ids := array_append(ids,t->>'id');
    FOREACH k IN ARRAY ARRAY['guests','at'] LOOP
      IF jsonb_typeof(t->k) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
      n := (t->>k)::numeric;
      IF n <> trunc(n) OR n < 1 OR (k = 'guests' AND n > 20) OR (k = 'at' AND n > 4102444800000) THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  ids := ARRAY[]::text[];
  IF jsonb_typeof(p_data->'tables') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(p_data->'tables') > 20 THEN RETURN false; END IF;
  FOR t IN SELECT value FROM jsonb_array_elements(p_data->'tables') LOOP
    IF jsonb_typeof(t) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF NOT (t ?& ARRAY['id','label','cap','guests','startAt','planAt','min']) OR
       t - ARRAY['id','label','cap','guests','startAt','planAt','min'] <> '{}'::jsonb THEN RETURN false; END IF;
    IF jsonb_typeof(t->'id') IS DISTINCT FROM 'string' OR (t->>'id') !~ '^[A-Za-z0-9_-]{1,48}$' OR (t->>'id') = ANY(ids) THEN RETURN false; END IF;
    ids := array_append(ids, t->>'id');
    IF jsonb_typeof(t->'label') IS DISTINCT FROM 'string' OR char_length(t->>'label') NOT BETWEEN 1 AND 24 OR
       btrim(t->>'label', U&'\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') = '' OR (t->>'label') ~ '[[:cntrl:]]' OR (t->>'label') ~ U&'[\007F-\009F]' THEN RETURN false; END IF;
    FOREACH k IN ARRAY ARRAY['cap','guests','startAt','planAt','min'] LOOP
      IF jsonb_typeof(t->k) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
      n := (t->>k)::numeric;
      IF n <> trunc(n) THEN RETURN false; END IF;
      IF k = 'cap' AND (n < 1 OR n > 12) THEN RETURN false; END IF;
      IF k = 'guests' AND (n < 0 OR n > 20) THEN RETURN false; END IF;
      IF k IN ('startAt','planAt') AND (n < 0 OR n > 4102444800000) THEN RETURN false; END IF;
      IF k = 'min' AND (n < 5 OR n > 600) THEN RETURN false; END IF;
    END LOOP;
    IF (t->>'startAt')::numeric > 0 AND (t->>'planAt')::numeric > 0 THEN RETURN false; END IF;
    IF (t->>'guests')::numeric = 0 AND ((t->>'startAt')::numeric <> 0 OR (t->>'planAt')::numeric <> 0) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.furikko_pair_validate(jsonb) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_furikko_pair(p_room text, p_vivace_key text, p_anela_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rh bytea; doc jsonb;
BEGIN
  IF p_room IS NULL OR p_vivace_key IS NULL OR p_anela_key IS NULL OR
     p_room !~ '^[0-9a-f]{48}$' OR p_vivace_key !~ '^[0-9a-f]{48}$' OR p_anela_key !~ '^[0-9a-f]{48}$' OR
     p_room = p_vivace_key OR p_room = p_anela_key OR p_vivace_key = p_anela_key THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'Invalid room credentials';
  END IF;
  rh := extensions.digest(p_room, 'sha256');
  INSERT INTO public.furikko_pair_rooms(read_hash, vivace_write_hash, anela_write_hash)
    VALUES(rh, extensions.digest(p_vivace_key, 'sha256'), extensions.digest(p_anela_key, 'sha256'));
  SELECT jsonb_build_object('tables', jsonb_agg(jsonb_build_object('id','t'||i, 'label','卓'||i,
    'cap',4, 'guests',0, 'startAt',0, 'planAt',0, 'min',50) ORDER BY i),
    'setMin',50, 'casts', jsonb_build_object('now',0,'total',0), 'waiting','[]'::jsonb, 'castNames','[]'::jsonb) INTO doc FROM generate_series(1,6) AS i;
  INSERT INTO public.furikko_pair_state(room_hash, store_id, data) VALUES(rh, 'vivace', doc), (rh, 'anela', doc);
  RETURN jsonb_build_object('created',true);
END;
$$;

CREATE FUNCTION public.get_furikko_pair(p_room text)
RETURNS TABLE(store_id text, data jsonb, revision bigint, updated_at timestamptz, seen_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rh bytea;
BEGIN
  IF p_room IS NULL OR p_room !~ '^[0-9a-f]{48}$' THEN RAISE SQLSTATE 'PT403' USING MESSAGE = 'Invalid room'; END IF;
  rh := extensions.digest(p_room, 'sha256');
  IF NOT EXISTS(SELECT 1 FROM public.furikko_pair_rooms r WHERE r.read_hash = rh) THEN
    RAISE SQLSTATE 'PT403' USING MESSAGE = 'Invalid room';
  END IF;
  RETURN QUERY SELECT s.store_id,s.data,s.revision,s.updated_at,s.seen_at FROM public.furikko_pair_state s WHERE s.room_hash = rh;
END;
$$;

CREATE FUNCTION public.put_furikko_pair(p_room text, p_store text, p_write_key text, p_expected_revision bigint, p_data jsonb)
RETURNS TABLE(store_id text, data jsonb, revision bigint, updated_at timestamptz, seen_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rh bytea;
BEGIN
  IF p_room IS NULL OR p_room !~ '^[0-9a-f]{48}$' OR p_write_key IS NULL OR p_write_key !~ '^[0-9a-f]{48}$' OR
     p_store IS NULL OR p_store NOT IN ('vivace','anela') THEN RAISE SQLSTATE 'PT403' USING MESSAGE = 'Invalid store credentials'; END IF;
  rh := extensions.digest(p_room, 'sha256');
  IF NOT EXISTS(SELECT 1 FROM public.furikko_pair_rooms r WHERE r.read_hash = rh AND
    CASE p_store WHEN 'vivace' THEN r.vivace_write_hash ELSE r.anela_write_hash END = extensions.digest(p_write_key, 'sha256')) THEN
    RAISE SQLSTATE 'PT403' USING MESSAGE = 'Invalid store credentials';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0 OR NOT public.furikko_pair_validate(p_data) OR
     octet_length(jsonb_build_object('p_room',p_room,'p_store',p_store,'p_write_key',p_write_key,
       'p_expected_revision',p_expected_revision,'p_data',p_data)::text) > 65536 THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE = 'Invalid document or revision';
  END IF;
  RETURN QUERY UPDATE public.furikko_pair_state s SET data=p_data, revision=s.revision+1, updated_at=now(), seen_at=now()
    WHERE s.room_hash=rh AND s.store_id=p_store AND s.revision=p_expected_revision
    RETURNING s.store_id,s.data,s.revision,s.updated_at,s.seen_at;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE = 'Revision conflict'; END IF;
END;
$$;

CREATE FUNCTION public.heartbeat_furikko_pair(p_room text, p_store text, p_write_key text)
RETURNS TABLE(seen_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE rh bytea;
BEGIN
  IF p_room IS NULL OR p_room !~ '^[0-9a-f]{48}$' OR p_write_key IS NULL OR p_write_key !~ '^[0-9a-f]{48}$' OR
     p_store IS NULL OR p_store NOT IN ('vivace','anela') THEN RAISE SQLSTATE 'PT403' USING MESSAGE = 'Invalid store credentials'; END IF;
  rh := extensions.digest(p_room, 'sha256');
  IF NOT EXISTS(SELECT 1 FROM public.furikko_pair_rooms r WHERE r.read_hash = rh AND
    CASE p_store WHEN 'vivace' THEN r.vivace_write_hash ELSE r.anela_write_hash END = extensions.digest(p_write_key,'sha256')) THEN
    RAISE SQLSTATE 'PT403' USING MESSAGE = 'Invalid store credentials';
  END IF;
  RETURN QUERY UPDATE public.furikko_pair_state s SET seen_at=now() WHERE s.room_hash=rh AND s.store_id=p_store RETURNING s.seen_at;
END;
$$;

REVOKE ALL ON FUNCTION public.create_furikko_pair(text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_furikko_pair(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.put_furikko_pair(text,text,text,bigint,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_furikko_pair(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_furikko_pair(text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_furikko_pair(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.put_furikko_pair(text,text,text,bigint,jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_furikko_pair(text,text,text) TO anon, authenticated;
