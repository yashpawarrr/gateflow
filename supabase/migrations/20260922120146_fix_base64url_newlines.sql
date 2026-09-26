/*
# Fix base64url_encode to strip newlines

Postgres encode(..., 'base64') inserts newlines every 76 chars per RFC 2045.
JWT base64url must have no newlines. Updated base64url_encode to strip them.
*/

CREATE OR REPLACE FUNCTION base64url_encode(data bytea)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT replace(replace(replace(encode(data, 'base64'), chr(10), ''), '+', '-'), '/', '_');
$$;
