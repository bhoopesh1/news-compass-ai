create extension if not exists vector;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id);

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  regions text[] not null default array['global'],
  languages text[] not null default array['en'],
  categories text[] not null default array['general'],
  interests text[] not null default '{}',
  alerts_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.user_preferences to authenticated;
grant all on public.user_preferences to service_role;
alter table public.user_preferences enable row level security;
create policy "own prefs all" on public.user_preferences for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_url text unique,
  title text not null,
  description text,
  content text,
  ai_summary text,
  category text not null default 'general',
  region text not null default 'global',
  language text not null default 'en',
  tags text[] not null default '{}',
  image_url text,
  author text,
  is_breaking boolean not null default false,
  published_at timestamptz not null default now(),
  ingested_at timestamptz not null default now(),
  embedding vector(1536)
);
create index articles_published_idx on public.articles (published_at desc);
create index articles_filters_idx on public.articles (region, language, category, published_at desc);
create index articles_breaking_idx on public.articles (is_breaking, published_at desc) where is_breaking = true;
create index articles_embedding_idx on public.articles using hnsw (embedding vector_cosine_ops);
grant select on public.articles to authenticated, anon;
grant all on public.articles to service_role;
alter table public.articles enable row level security;
create policy "articles public read" on public.articles for select to authenticated, anon using (true);

create table public.article_chunks (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  unique (article_id, chunk_index)
);
create index article_chunks_embedding_idx on public.article_chunks using hnsw (embedding vector_cosine_ops);
create index article_chunks_article_idx on public.article_chunks (article_id);
grant select on public.article_chunks to authenticated, anon;
grant all on public.article_chunks to service_role;
alter table public.article_chunks enable row level security;
create policy "chunks public read" on public.article_chunks for select to authenticated, anon using (true);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.articles(id) on delete cascade,
  headline text not null,
  region text not null default 'global',
  language text not null default 'en',
  category text not null default 'general',
  severity text not null default 'standard',
  created_at timestamptz not null default now()
);
create index alerts_created_idx on public.alerts (created_at desc);
grant select on public.alerts to authenticated, anon;
grant all on public.alerts to service_role;
alter table public.alerts enable row level security;
create policy "alerts public read" on public.alerts for select to authenticated, anon using (true);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_user_idx on public.conversations (user_id, updated_at desc);
grant select, insert, update, delete on public.conversations to authenticated;
grant all on public.conversations to service_role;
alter table public.conversations enable row level security;
create policy "own conversations all" on public.conversations for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  citations jsonb,
  created_at timestamptz not null default now()
);
create index messages_conv_idx on public.messages (conversation_id, created_at);
grant select, insert, delete on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
create policy "own messages all" on public.messages for all to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()));

create or replace function public.match_article_chunks(
  query_embedding vector(1536),
  match_count int default 6,
  region_filter text default null,
  language_filter text default null,
  category_filter text default null
) returns table (
  chunk_id uuid,
  article_id uuid,
  content text,
  title text,
  source text,
  source_url text,
  region text,
  language text,
  category text,
  published_at timestamptz,
  similarity float
) language sql stable as $$
  select c.id as chunk_id, a.id as article_id, c.content, a.title, a.source, a.source_url,
         a.region, a.language, a.category, a.published_at,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.article_chunks c
  join public.articles a on a.id = c.article_id
  where (region_filter is null or a.region = region_filter)
    and (language_filter is null or a.language = language_filter)
    and (category_filter is null or a.category = category_filter)
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  insert into public.user_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();