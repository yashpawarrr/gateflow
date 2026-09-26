/*
# Drop old RPC function signatures before re-creating with auth
*/

DROP FUNCTION IF EXISTS create_pass(uuid, text, text, timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS approve_pass(uuid, uuid);
DROP FUNCTION IF EXISTS reject_pass(uuid, uuid);
DROP FUNCTION IF EXISTS verify_and_scan(text, uuid);
