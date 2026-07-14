import { supabase } from '../../lib/supabase';
import type { Database, Json } from '../../types/database';

export type BusinessDnaRow = Database['public']['Tables']['business_dna']['Row'];
export type ClientBusinessDnaRow = Database['public']['Tables']['client_business_dna']['Row'];

// The columns shared by the org's own Business DNA and each client Business DNA
// that downstream features (Poster now, Content/Campaign later) read to brand a
// design. Both row types are structurally assignable to this.
export type BrandDnaFields = {
  website_url: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  brand_colors: Json;
  logo_storage_bucket: string | null;
  logo_storage_path: string | null;
  logo_alt_text: string | null;
  qr_storage_bucket: string | null;
  qr_storage_path: string | null;
};

export type ColorEntry = { label: string; value: string };

function isColorRecord(value: Json): value is { [key: string]: Json | undefined } {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Read the stored brand_colors jsonb (array of { label, value }) into entries.
export function parseBrandColorEntries(value: Json): ColorEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isColorRecord)
    .map((color) => ({
      label: typeof color.label === 'string' ? color.label : '',
      value: typeof color.value === 'string' ? color.value : '',
    }))
    .filter((color) => color.label || color.value);
}

export async function listClientBrandDna(orgId: string): Promise<ClientBusinessDnaRow[]> {
  if (!supabase || !orgId) return [];
  const { data, error } = await supabase
    .from('client_business_dna')
    .select('*')
    .eq('org_id', orgId)
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function deleteClientBrandDna(id: string): Promise<void> {
  if (!supabase || !id) return;
  const { error } = await supabase.from('client_business_dna').delete().eq('id', id);
  if (error) throw error;
}

export async function createBrandDnaSignedUrl(bucket: string | null, path: string | null): Promise<string> {
  if (!supabase || !bucket || !path) return '';
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 7);
  return data?.signedUrl ?? '';
}
