DELETE FROM public.article_chunks WHERE article_id IN (SELECT id FROM public.articles WHERE published_at < '2020-01-01');
DELETE FROM public.alerts WHERE article_id IN (SELECT id FROM public.articles WHERE published_at < '2020-01-01');
DELETE FROM public.articles WHERE published_at < '2020-01-01';