alter function public.match_article_chunks(vector, int, text, text, text) set search_path = public;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.match_article_chunks(vector, int, text, text, text) from public, anon, authenticated;
grant execute on function public.match_article_chunks(vector, int, text, text, text) to service_role;