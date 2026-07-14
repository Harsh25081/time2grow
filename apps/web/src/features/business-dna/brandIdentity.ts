import type { Database } from '../../types/database';

type BusinessDnaIdentity = Pick<Database['public']['Tables']['business_dna']['Row'], 'website_url'> | null;

export function deriveBrandDisplayName(orgName: string | null | undefined, dna: BusinessDnaIdentity) {
  const cleanOrgName = (orgName ?? '').trim();
  if (cleanOrgName && !isDefaultWorkspaceName(cleanOrgName)) return cleanOrgName;

  const domainName = brandNameFromWebsite(dna?.website_url);
  if (domainName) return domainName;

  return cleanOrgName || 'time2grow';
}

function isDefaultWorkspaceName(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === 'workspace' || normalized.endsWith("'s workspace");
}

function brandNameFromWebsite(value: string | null | undefined) {
  const raw = (value ?? '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\./i, '');
    const root = host.split('.').filter(Boolean)[0] ?? '';
    if (!root) return '';
    if (root.toLowerCase().includes('ad96')) return 'AD96';
    return root
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  } catch {
    return '';
  }
}
