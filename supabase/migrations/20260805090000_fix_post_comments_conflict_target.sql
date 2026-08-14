-- Fixes: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- Root cause: post_comments_external_uidx (from 20260804090000) is a *partial* unique index
-- (`where external_comment_id is not null`). Postgres will only use a partial index as an
-- ON CONFLICT arbiter if the conflicting statement repeats that exact predicate - which
-- PostgREST's upsert(..., { onConflict: 'org_id,provider,external_comment_id' }) does not send.
-- The result is a plain `ON CONFLICT (org_id, provider, external_comment_id)` with no predicate,
-- which cannot match the partial index, so Postgres rejects the upsert.
--
-- Fix: use a regular (non-partial) unique constraint on the same three columns instead. This is
-- safe for outbound replies, which have external_comment_id = null before the platform responds:
-- Postgres unique constraints treat NULL as distinct from every other value (including other
-- NULLs) by default, so any number of rows with a null external_comment_id can still coexist.

drop index if exists public.post_comments_external_uidx;

alter table public.post_comments
  drop constraint if exists post_comments_org_provider_external_key;

alter table public.post_comments
  add constraint post_comments_org_provider_external_key
  unique (org_id, provider, external_comment_id);
