/*
# Fix mutable search_path on SECURITY DEFINER functions

Sets search_path to 'public' on all SECURITY DEFINER functions to resolve
the Supabase security advisor warning about mutable search_path.
This prevents search path injection attacks.
*/

ALTER FUNCTION public.generate_pass_token(uuid, uuid, timestamptz) SET search_path = public;
ALTER FUNCTION public.verify_pass_token(text) SET search_path = public;
ALTER FUNCTION public.create_pass(uuid, text, text, timestamptz, timestamptz, text) SET search_path = public;
ALTER FUNCTION public.approve_pass(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.reject_pass(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.verify_and_scan(text, uuid) SET search_path = public;
ALTER FUNCTION public.escalate_pending_passes() SET search_path = public;
