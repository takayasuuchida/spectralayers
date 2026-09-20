-- Additive attendance validation only. No stored rows or RPC permissions change.
CREATE OR REPLACE FUNCTION public.furikko_pair_validate(p_data jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE t jsonb; n numeric; k text; ids text[] := ARRAY[]::text[]; names text[] := ARRAY[]::text[];
BEGIN
  IF p_data IS NULL OR octet_length(p_data::text) > 65536 OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF NOT (p_data ?& ARRAY['tables','setMin','casts','waiting','castNames']) OR p_data - ARRAY['tables','setMin','casts','waiting','castNames','castStatus'] <> '{}'::jsonb THEN RETURN false; END IF;
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
  IF p_data ? 'castStatus' THEN
    IF jsonb_typeof(p_data->'castStatus') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF NOT ((p_data->'castStatus') ?& names) OR (p_data->'castStatus') - names <> '{}'::jsonb THEN RETURN false; END IF;
    n := 0;
    FOREACH k IN ARRAY names LOOP
      IF jsonb_typeof(p_data->'castStatus'->k) IS DISTINCT FROM 'string' OR p_data->'castStatus'->>k NOT IN ('present','late','off') THEN RETURN false; END IF;
      IF p_data->'castStatus'->>k = 'present' THEN n := n + 1; END IF;
    END LOOP;
    IF cardinality(names) > 0 AND (p_data->'casts'->>'now')::numeric <> n THEN RETURN false; END IF;
  END IF;
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
