-- Postgres lets everyone (PUBLIC) execute new functions by default, which
-- included signed-out users. Only signed-in users may call the app's
-- functions; internal helpers stay private.

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

revoke execute on function public.send_push(uuid[], text, text, jsonb) from authenticated;
revoke execute on function public.generate_join_code() from authenticated;
revoke execute on function public.handle_new_user() from authenticated;

-- Functions created in later migrations: signed-in users only.
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public grant execute on functions to authenticated;
