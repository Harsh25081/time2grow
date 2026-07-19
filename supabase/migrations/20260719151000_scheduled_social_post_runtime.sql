-- The Cron job itself is configured per environment because its HTTP headers
-- come from that environment's encrypted Vault secrets.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
