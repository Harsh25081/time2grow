import { readSheet } from 'read-excel-file/browser';
import type { Database, Json } from '../../types/database';

export type LeadSource = Database['public']['Tables']['leads']['Row']['source'];
export type LeadStatus = Database['public']['Tables']['leads']['Row']['status'];

export type ParsedLead = {
  fullName: string;
  company: string;
  email: string;
  phone: string;
  source: LeadSource;
  status: LeadStatus;
  leadScore: number;
  estimatedValue: number | null;
  nextFollowUpAt: string | null;
  notes: string;
  campaignName: string;
  externalLeadId: string | null;
  metadata: Json;
};

export type LeadParseResult = {
  rows: ParsedLead[];
  skipped: number;
  headers: string[];
};

type RawRow = Record<string, unknown>;

const headerAliases = {
  fullName: ['name', 'full name', 'lead name', 'customer name', 'contact name', 'first name'],
  company: ['company', 'business', 'brand', 'organization', 'organisation'],
  email: ['email', 'email address', 'e-mail'],
  phone: ['phone', 'mobile', 'phone number', 'contact number', 'whatsapp', 'whatsapp number'],
  source: ['source', 'lead source', 'platform', 'channel'],
  status: ['status', 'stage', 'pipeline status'],
  leadScore: ['score', 'lead score', 'quality score'],
  estimatedValue: ['value', 'estimated value', 'deal value', 'budget', 'revenue'],
  nextFollowUpAt: ['follow up', 'follow-up', 'next follow up', 'next follow-up', 'follow up date'],
  notes: ['notes', 'note', 'message', 'requirement', 'comments'],
  campaignName: ['campaign', 'campaign name', 'ad campaign', 'utm campaign'],
  externalLeadId: ['id', 'lead id', 'external id', 'form id', 'submission id'],
};

const sourceValues: LeadSource[] = ['manual', 'website', 'social', 'ads', 'referral', 'whatsapp', 'campaign', 'event', 'other'];
const statusValues: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'archived'];

export async function parseLeadFile(file: File, fallbackSource: LeadSource): Promise<LeadParseResult> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const rows = extension === 'xlsx'
    ? rowsFromSheet(await readSheet(file))
    : rowsFromDelimitedText(await file.text(), extension === 'tsv' ? '\t' : ',');

  return normalizeRows(rows, fallbackSource, { importFile: file.name, importMode: 'file' });
}

export function parseSourceLeads(metadata: Json, fallbackSource: LeadSource, sourceKey: string): LeadParseResult {
  const rows = extractSourceRows(metadata);
  return normalizeRows(rows, fallbackSource, { importMode: 'source_sync', sourceKey });
}

function rowsFromSheet(sheet: unknown[][]): RawRow[] {
  if (sheet.length < 2) return [];
  const headers = sheet[0].map((cell) => String(cell ?? '').trim());
  return sheet.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function rowsFromDelimitedText(text: string, delimiter: ',' | '\t'): RawRow[] {
  const records = parseDelimited(text, delimiter);
  if (records.length < 2) return [];
  const headers = records[0].map((header) => header.trim());
  return records.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function normalizeRows(rows: RawRow[], fallbackSource: LeadSource, metadataBase: Record<string, Json>): LeadParseResult {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  let skipped = 0;
  const normalized = rows
    .map((row) => normalizeRow(row, fallbackSource, metadataBase))
    .filter((row): row is ParsedLead => {
      if (!row) skipped += 1;
      return Boolean(row);
    });

  return { rows: normalized, skipped, headers };
}

function normalizeRow(row: RawRow, fallbackSource: LeadSource, metadataBase: Record<string, Json>): ParsedLead | null {
  const fullName = stringField(row, headerAliases.fullName) || [stringField(row, ['first name']), stringField(row, ['last name'])].filter(Boolean).join(' ');
  const email = stringField(row, headerAliases.email);
  const phone = stringField(row, headerAliases.phone);

  if (!fullName && !email && !phone) return null;

  const source = normalizeSource(stringField(row, headerAliases.source), fallbackSource);
  const status = normalizeStatus(stringField(row, headerAliases.status));
  const externalLeadId = stringField(row, headerAliases.externalLeadId) || email || phone || null;

  return {
    fullName: fullName || email || phone || 'Unnamed lead',
    company: stringField(row, headerAliases.company),
    email,
    phone,
    source,
    status,
    leadScore: boundedNumber(stringField(row, headerAliases.leadScore), 0, 100, 25),
    estimatedValue: nullableNumber(stringField(row, headerAliases.estimatedValue)),
    nextFollowUpAt: dateValue(stringField(row, headerAliases.nextFollowUpAt)),
    notes: stringField(row, headerAliases.notes),
    campaignName: stringField(row, headerAliases.campaignName),
    externalLeadId,
    metadata: { ...metadataBase, raw: cleanRow(row) },
  };
}

function stringField(row: RawRow, aliases: string[]) {
  const key = Object.keys(row).find((header) => aliases.includes(normalizeHeader(header)));
  const value = key ? row[key] : '';
  return String(value ?? '').trim();
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function normalizeSource(value: string, fallback: LeadSource): LeadSource {
  const normalized = value.trim().toLowerCase().replace(/[_\s-]+/g, '_');
  if (sourceValues.includes(normalized as LeadSource)) return normalized as LeadSource;
  if (normalized.includes('meta') || normalized.includes('google') || normalized.includes('ad')) return 'ads';
  if (normalized.includes('whatsapp')) return 'whatsapp';
  if (normalized.includes('refer')) return 'referral';
  if (normalized.includes('web') || normalized.includes('site')) return 'website';
  if (normalized.includes('instagram') || normalized.includes('facebook') || normalized.includes('linkedin') || normalized.includes('social')) return 'social';
  return fallback;
}

function normalizeStatus(value: string): LeadStatus {
  const normalized = value.trim().toLowerCase().replace(/[_\s-]+/g, '_');
  if (statusValues.includes(normalized as LeadStatus)) return normalized as LeadStatus;
  if (normalized.includes('win') || normalized.includes('sold') || normalized.includes('closed')) return 'won';
  if (normalized.includes('lost') || normalized.includes('reject')) return 'lost';
  if (normalized.includes('qual')) return 'qualified';
  if (normalized.includes('proposal') || normalized.includes('quote')) return 'proposal';
  if (normalized.includes('contact')) return 'contacted';
  return 'new';
}

function boundedNumber(value: string, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function nullableNumber(value: string) {
  const parsed = Number(value.replace(/[^0-9.-]+/g, ''));
  if (!Number.isFinite(parsed) || value.trim() === '') return null;
  return Math.max(0, parsed);
}

function dateValue(value: string) {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function extractSourceRows(metadata: Json): RawRow[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const record = metadata as Record<string, unknown>;
  for (const key of ['leads', 'leadRows', 'lead_rows', 'leadInbox', 'formSubmissions', 'submissions', 'contacts']) {
    const value = record[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return [];
}

function isRecord(value: unknown): value is RawRow {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanRow(row: RawRow): Json {
  const clean: Record<string, Json> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) continue;
    if (value instanceof Date) clean[key] = value.toISOString();
    else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) clean[key] = value;
    else clean[key] = String(value);
  }
  return clean;
}

function parseDelimited(text: string, delimiter: ',' | '\t') {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}
