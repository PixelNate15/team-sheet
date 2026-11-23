-- =====================================================================
-- Table and function privileges for signed-in users.
--
-- Newer Supabase projects no longer grant the API roles access to new
-- tables automatically, so this is done explicitly. Granting table access
-- is only the first gate: Row Level Security (see the schema migration)
-- still decides which rows each user can read or change.
-- Signed-out (anon) users get nothing.
-- =====================================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Internal helpers stay private (re-revoked after the blanket grant above).
revoke execute on function public.send_push(uuid[], text, text, jsonb) from authenticated;
revoke execute on function public.generate_join_code() from authenticated;
revoke execute on function public.handle_new_user() from authenticated;

-- Nothing for signed-out users.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;
