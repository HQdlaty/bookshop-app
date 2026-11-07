-- Initial schema: enum, tables, indexes, functions, triggers, backfill and RLS policies.
-- Authorization boundary is RLS. Roles are never taken from signup metadata.

-- ---------------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('user', 'admin');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
-- profiles: public-facing user data only (no email).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_not_blank check (display_name ~ '\S'),
  constraint profiles_display_name_length check (char_length(display_name) <= 100)
);

-- user_roles: one row per user. Only admins can write it; see policies below.
create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  constraint categories_name_not_blank check (name ~ '\S')
);

create table public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  description text,
  isbn text unique,
  price numeric(10, 2),
  published_year integer,
  category_id uuid references public.categories (id) on delete set null,
  cover_path text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint books_title_not_blank check (title ~ '\S'),
  constraint books_author_not_blank check (author ~ '\S'),
  constraint books_isbn_not_blank check (isbn is null or isbn ~ '\S'),
  constraint books_price_non_negative check (price is null or price >= 0),
  constraint books_published_year_range check (published_year is null or published_year between 1000 and 2100)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_rating_range check (rating between 1 and 5),
  constraint reviews_body_not_blank check (body ~ '\S'),
  constraint reviews_body_length check (char_length(body) <= 2000),
  constraint reviews_one_per_user_per_book unique (book_id, user_id)
);

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.categories enable row level security;
alter table public.books enable row level security;
alter table public.reviews enable row level security;

-- ---------------------------------------------------------------------------
-- Indexes (foreign keys and sorting)
-- ---------------------------------------------------------------------------
create unique index categories_name_lower_key on public.categories (lower(name));
create index books_category_id_idx on public.books (category_id);
create index books_created_at_idx on public.books (created_at);
create index reviews_user_id_idx on public.reviews (user_id);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- SECURITY DEFINER so it can read user_roles without triggering RLS on user_roles
-- (policies on user_roles call this function; reading it as the caller would recurse).
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = 'admin'::public.app_role
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Creates the profile and default role for every new auth user.
-- display_name comes from the optional 'display_name' signup metadata (a user-chosen label, rendered
-- as plain text by the app). If it is missing or blank, it falls back to 'Reader-<first 6 id chars>'.
-- The email is never used for display_name, so it cannot leak through the public profiles table.
-- The role is always 'user' and is never read from metadata; admins are promoted only by an
-- existing admin or a service-role script.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  v_display_name := left(btrim(new.raw_user_meta_data ->> 'display_name'), 100);
  if v_display_name is null or v_display_name !~ '\S' then
    v_display_name := 'Reader-' || left(new.id::text, 6);
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, v_display_name)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'user'::public.app_role)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- Keeps a review attached to its book and author. RLS cannot compare against the old row,
-- so this trigger blocks changes to book_id and user_id for everyone, including admins.
create function public.freeze_review_keys()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.book_id is distinct from old.book_id or new.user_id is distinct from old.user_id then
    raise exception 'reviews.book_id and reviews.user_id cannot be changed';
  end if;
  return new;
end;
$$;

revoke all on function public.freeze_review_keys() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_updated_at
  before update on public.books
  for each row execute function public.set_updated_at();

create trigger set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

create trigger freeze_review_keys
  before update on public.reviews
  for each row execute function public.freeze_review_keys();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Backfill for users that already exist (does not overwrite existing rows)
-- ---------------------------------------------------------------------------
insert into public.profiles (id, display_name)
select
  u.id,
  case
    when left(btrim(u.raw_user_meta_data ->> 'display_name'), 100) ~ '\S'
      then left(btrim(u.raw_user_meta_data ->> 'display_name'), 100)
    else 'Reader-' || left(u.id::text, 6)
  end
from auth.users u
on conflict (id) do nothing;

insert into public.user_roles (user_id, role)
select u.id, 'user'::public.app_role
from auth.users u
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

-- categories: public read, admin write
create policy "categories_select_public" on public.categories
  for select to anon, authenticated
  using (true);

create policy "categories_insert_admin" on public.categories
  for insert to authenticated
  with check ((select public.is_admin()));

create policy "categories_update_admin" on public.categories
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "categories_delete_admin" on public.categories
  for delete to authenticated
  using ((select public.is_admin()));

-- books: public read, admin write
create policy "books_select_public" on public.books
  for select to anon, authenticated
  using (true);

create policy "books_insert_admin" on public.books
  for insert to authenticated
  with check ((select public.is_admin()));

create policy "books_update_admin" on public.books
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "books_delete_admin" on public.books
  for delete to authenticated
  using ((select public.is_admin()));

-- reviews: public read; authors write their own; admins can moderate
create policy "reviews_select_public" on public.reviews
  for select to anon, authenticated
  using (true);

create policy "reviews_insert_own" on public.reviews
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "reviews_update_own_or_admin" on public.reviews
  for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "reviews_delete_own_or_admin" on public.reviews
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- profiles: public read; no INSERT policy (rows are created by handle_new_user)
create policy "profiles_select_public" on public.profiles
  for select to anon, authenticated
  using (true);

create policy "profiles_update_own_or_admin" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

create policy "profiles_delete_admin" on public.profiles
  for delete to authenticated
  using ((select public.is_admin()));

-- user_roles: read own row (or all as admin); only admins can write
create policy "user_roles_select_own_or_admin" on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "user_roles_insert_admin" on public.user_roles
  for insert to authenticated
  with check ((select public.is_admin()));

create policy "user_roles_update_admin" on public.user_roles
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "user_roles_delete_admin" on public.user_roles
  for delete to authenticated
  using ((select public.is_admin()));
