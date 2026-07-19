-- Add Shopify as a connectable source on the Connections page. Shopify is a data/reporting source
-- (store orders & revenue), not a publish destination, so publishing to it is rejected downstream —
-- but it needs to pass the same provider/handle_type check constraints to be saved as a handle.

alter table public.integration_accounts
  drop constraint if exists integration_accounts_provider_check;
alter table public.integration_accounts
  add constraint integration_accounts_provider_check
  check (provider in ('facebook', 'instagram', 'linkedin', 'youtube', 'google_ads', 'whatsapp', 'slack', 'telegram', 'shopify'));
alter table public.distribution_handles
  drop constraint if exists distribution_handles_provider_check;
alter table public.distribution_handles
  add constraint distribution_handles_provider_check
  check (provider in ('facebook', 'instagram', 'linkedin', 'youtube', 'google_ads', 'whatsapp', 'slack', 'telegram', 'shopify'));
alter table public.distribution_handles
  drop constraint if exists distribution_handles_handle_type_check;
alter table public.distribution_handles
  add constraint distribution_handles_handle_type_check
  check (handle_type in ('facebook_page', 'instagram_business', 'linkedin_page', 'youtube_channel', 'google_ads_customer', 'whatsapp_phone_number', 'slack_channel', 'telegram_channel', 'shopify_store'));
alter table public.publish_targets
  drop constraint if exists publish_targets_provider_check;
alter table public.publish_targets
  add constraint publish_targets_provider_check
  check (provider in ('facebook', 'instagram', 'linkedin', 'youtube', 'google_ads', 'whatsapp', 'slack', 'telegram', 'shopify'));
