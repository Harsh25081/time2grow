import { readSheet } from 'read-excel-file/browser';
import type { Database, Json } from '../../types/database';

export type LeadSource = Database['public']['Tables']['leads']['Row']['source'];
export type LeadStatus = Database['public']['Tables']['leads']['Row']['status'];
export type LeadType = Database['public']['Tables']['leads']['Row']['lead_type'];

export type ParsedLead = {
  fullName: string;
  company: string;
  email: string;
  phone: string;
  source: LeadSource;
  status: LeadStatus;
  leadType: LeadType;
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
  fullName: [
    'name',
    'full name',
    'lead name',
    'customer name',
    'contact name',
    'client name',
    'user name',
    'prospect name',
    'person name',
    'contact person',
    'full_name',
    'user_full_name',
    'user full name',
    'contact_name',
    'customer_name',
    'lead_name',
    'your name',
    'what is your name',
    'what is your full name',
    'enter your name',
    'enter your full name',
  ],
  firstName: [
    'first name',
    'first_name',
    'firstname',
    'given name',
    'fname',
    'forename',
    'what is your first name',
    'enter your first name',
  ],
  lastName: [
    'last name',
    'last_name',
    'lastname',
    'surname',
    'family name',
    'lname',
    'what is your last name',
    'enter your last name',
  ],
  company: [
    'company',
    'company name',
    'business',
    'business name',
    'brand',
    'brand name',
    'organization',
    'organisation',
    'organization name',
    'organisation name',
    'company_name',
    'business_name',
    'org name',
    'firm',
    'agency',
    'workplace',
    'employer',
  ],
  email: [
    'email',
    'email address',
    'e-mail',
    'e mail',
    'user_email',
    'user email',
    'email_address',
    'work email',
    'business email',
    'personal email',
    'contact email',
    'email id',
    'mail',
    'mail address',
    'what is your email',
    'what is your email address',
    'enter your email',
    'enter your email address',
    'primary email',
  ],
  phone: [
    'phone',
    'mobile',
    'phone number',
    'contact number',
    'contact phone',
    'whatsapp',
    'whatsapp number',
    'phone number string',
    'phone_number',
    'user_phone_number',
    'user phone number',
    'mobile_number',
    'cell',
    'cell number',
    'cellphone',
    'cell phone',
    'telephone',
    'tel',
    'ph',
    'ph number',
    'phone no',
    'mobile no',
    'contact no',
    'what is your phone number',
    'what is your mobile number',
    'what is your phone',
    'enter your phone number',
    'enter your mobile number',
    'enter phone number',
    'primary phone',
  ],
  source: ['source', 'lead source', 'platform', 'channel', 'lead_source', 'source_platform'],
  status: ['status', 'stage', 'pipeline status', 'lead status', 'pipeline_status', 'lead_status'],
  leadType: ['lead type', 'type', 'temperature', 'lead temperature', 'hot warm cold', 'lead_type'],
  leadScore: ['score', 'lead score', 'quality score', 'lead_score'],
  estimatedValue: ['value', 'estimated value', 'deal value', 'budget', 'revenue', 'amount', 'deal amount', 'estimated_value'],
  nextFollowUpAt: ['follow up', 'follow-up', 'next follow up', 'next follow-up', 'follow up date', 'follow_up_date', 'next_follow_up'],
  notes: [
    'notes',
    'note',
    'message',
    'requirement',
    'requirements',
    'comments',
    'comment',
    'job title',
    'job_title',
    'designation',
    'city',
    'state',
    'country',
    'location',
    'address',
    'query',
    'description',
  ],
  campaignName: [
    'campaign',
    'campaign name',
    'ad campaign',
    'utm campaign',
    'ad name',
    'adset name',
    'campaign_name',
    'ad_name',
    'adset_name',
    'form_name',
    'form name',
    'instant form',
    'lead form',
    'lead_form',
  ],
  externalLeadId: [
    'id',
    'lead id',
    'external id',
    'form id',
    'submission id',
    'lead_id',
    'external_lead_id',
    'submission_id',
    'form_id',
    'ad_id',
    'ad id',
  ],
};

const sourceValues: LeadSource[] = [
  'manual',
  'website',
  'social',
  'ads',
  'referral',
  'referrals',
  'whatsapp',
  'instagram',
  'facebook',
  'google_forms',
  'imports',
  'comments',
  'dms',
  'campaign',
  'event',
  'other',
];
const statusValues: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'archived'];
const leadTypeValues: LeadType[] = ['hot', 'warm', 'cold'];

export async function parseLeadFile(file: File, fallbackSource: LeadSource): Promise<LeadParseResult> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  let rows: RawRow[] = [];

  if (extension === 'xlsx' || extension === 'xls') {
    try {
      const sheetData = await readSheet(file);
      rows = rowsFromSheet(sheetData);
    } catch {
      // Fallback to text parsing if readSheet fails
      const text = await file.text();
      rows = rowsFromDelimitedText(text);
    }
  } else {
    const text = await file.text();
    const explicitDelimiter = extension === 'tsv' ? '\t' : undefined;
    rows = rowsFromDelimitedText(text, explicitDelimiter);
  }

  return normalizeRows(rows, fallbackSource, { importFile: file.name, importMode: 'file' });
}

export function parseSourceLeads(metadata: Json, fallbackSource: LeadSource, sourceKey: string): LeadParseResult {
  const rows = extractSourceRows(metadata);
  return normalizeRows(rows, fallbackSource, { importMode: 'source_sync', sourceKey });
}

function rowsFromSheet(sheet: unknown[][]): RawRow[] {
  if (!Array.isArray(sheet) || sheet.length < 2) return [];

  // Find header row (first non-empty row)
  let headerRowIndex = 0;
  while (headerRowIndex < sheet.length && (!Array.isArray(sheet[headerRowIndex]) || sheet[headerRowIndex].every((c) => c === null || c === undefined || String(c).trim() === ''))) {
    headerRowIndex++;
  }

  if (headerRowIndex >= sheet.length - 1) return [];

  const rawHeaders = sheet[headerRowIndex].map((cell, idx) => {
    const val = cell instanceof Date ? cell.toISOString() : String(cell ?? '').trim();
    return val || `column_${idx + 1}`;
  });

  const dataRows = sheet.slice(headerRowIndex + 1);
  return dataRows
    .map((row) => {
      if (!Array.isArray(row)) return null;
      const rowObj: RawRow = {};
      let hasData = false;
      rawHeaders.forEach((header, idx) => {
        const rawVal = row[idx];
        let cellVal: unknown = rawVal;
        if (rawVal instanceof Date) {
          cellVal = rawVal.toISOString();
        } else if (rawVal !== null && rawVal !== undefined) {
          cellVal = typeof rawVal === 'string' ? rawVal.trim() : rawVal;
        } else {
          cellVal = '';
        }
        if (cellVal !== '') hasData = true;
        rowObj[header] = cellVal;
      });
      return hasData ? rowObj : null;
    })
    .filter((r): r is RawRow => Boolean(r));
}

function detectDelimiter(text: string): ',' | ';' | '\t' | '|' {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 10);
  if (lines.length === 0) return ',';

  const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };

  for (const line of lines) {
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes) {
        if (ch === ',') counts[',']++;
        else if (ch === ';') counts[';']++;
        else if (ch === '\t') counts['\t']++;
        else if (ch === '|') counts['|']++;
      }
    }
  }

  let bestDelimiter: ',' | ';' | '\t' | '|' = ',';
  let maxCount = 0;

  for (const [delim, count] of Object.entries(counts) as Array<[',' | ';' | '\t' | '|', number]>) {
    if (count > maxCount) {
      maxCount = count;
      bestDelimiter = delim;
    }
  }

  return bestDelimiter;
}

function rowsFromDelimitedText(text: string, explicitDelimiter?: ',' | '\t' | ';'): RawRow[] {
  // Strip UTF-8 BOM if present
  const cleanText = text.replace(/^﻿/, '').trim();
  if (!cleanText) return [];

  const delimiter = explicitDelimiter || detectDelimiter(cleanText);
  const records = parseDelimited(cleanText, delimiter);
  if (records.length < 2) return [];

  // Find header row
  let headerIndex = 0;
  while (headerIndex < records.length && records[headerIndex].every((c) => !c.trim())) {
    headerIndex++;
  }

  if (headerIndex >= records.length - 1) return [];

  const headers = records[headerIndex].map((header, idx) => {
    const cleaned = header.trim().replace(/^["']|["']$/g, '');
    return cleaned || `column_${idx + 1}`;
  });

  return records
    .slice(headerIndex + 1)
    .map((row) => {
      const rowObj: RawRow = {};
      let hasData = false;
      headers.forEach((header, index) => {
        const val = row[index] !== undefined ? row[index].trim().replace(/^["']|["']$/g, '') : '';
        if (val) hasData = true;
        rowObj[header] = val;
      });
      return hasData ? rowObj : null;
    })
    .filter((r): r is RawRow => Boolean(r));
}

function normalizeRows(rows: RawRow[], fallbackSource: LeadSource, metadataBase: Record<string, Json>): LeadParseResult {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  let skipped = 0;
  const normalized = rows
    .map((row, index) => normalizeRow(row, fallbackSource, metadataBase, index))
    .filter((row): row is ParsedLead => {
      if (!row) {
        skipped += 1;
        return false;
      }
      return true;
    });

  return { rows: normalized, skipped, headers };
}

function normalizeRow(row: RawRow, fallbackSource: LeadSource, metadataBase: Record<string, Json>, rowIndex: number): ParsedLead | null {
  // Check if row has any meaningful non-empty value
  const hasValues = Object.values(row).some((v) => v !== null && v !== undefined && String(v).trim() !== '');
  if (!hasValues) return null;

  // Extract candidate fields via exact alias matching and keyword scanning
  let fullName = findField(row, headerAliases.fullName, (h) => {
    return (
      (h.includes('name') && !h.includes('campaign') && !h.includes('ad') && !h.includes('form') && !h.includes('company') && !h.includes('business') && !h.includes('file') && !h.includes('org')) ||
      h.includes('contact') ||
      h.includes('customer') ||
      h.includes('person') ||
      h.includes('user') ||
      h.includes('client')
    );
  });

  // If full name wasn't found directly, try combining first name and last name
  if (!fullName) {
    const firstName = findField(row, headerAliases.firstName, (h) => h.includes('first') || h.includes('fname') || h.includes('given'));
    const lastName = findField(row, headerAliases.lastName, (h) => h.includes('last') || h.includes('lname') || h.includes('surname') || h.includes('family'));
    if (firstName || lastName) {
      fullName = [firstName, lastName].filter(Boolean).join(' ');
    }
  }

  let email = findField(row, headerAliases.email, (h) => h.includes('email') || h.includes('mail') || h.includes('e-mail'));
  let phone = findField(row, headerAliases.phone, (h) => h.includes('phone') || h.includes('mobile') || h.includes('whatsapp') || h.includes('cell') || h.includes('tel') || h.includes('contact num'));
  const company = findField(row, headerAliases.company, (h) => h.includes('company') || h.includes('business') || h.includes('organization') || h.includes('organisation') || h.includes('brand') || h.includes('firm'));
  const campaignName = findField(row, headerAliases.campaignName, (h) => h.includes('campaign') || h.includes('ad name') || h.includes('adset') || h.includes('form name') || h.includes('form_name'));
  const externalLeadId = findField(row, headerAliases.externalLeadId, (h) => h === 'id' || h.includes('lead id') || h.includes('form id') || h.includes('submission id') || h.includes('lead_id') || h.includes('external id'));

  // Content-based heuristic fallbacks if email or phone weren't recognized by header names
  if (!email) {
    for (const val of Object.values(row)) {
      const str = String(val ?? '').trim();
      if (isEmailPattern(str)) {
        email = str;
        break;
      }
    }
  }

  if (!phone) {
    for (const [key, val] of Object.entries(row)) {
      const str = String(val ?? '').trim();
      const normKey = normalizeHeader(key);
      if (!normKey.includes('date') && !normKey.includes('time') && !normKey.includes('id') && isPhonePattern(str)) {
        phone = str;
        break;
      }
    }
  }

  // If full name is still empty, look for a text string or fallback gracefully
  if (!fullName) {
    if (email) {
      // Use email username part if no name
      const prefix = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
      if (prefix) fullName = capitalizeWords(prefix);
    } else if (phone) {
      fullName = phone;
    } else if (company) {
      fullName = company;
    } else if (externalLeadId) {
      fullName = `Lead #${externalLeadId}`;
    } else {
      // Find first non-empty text string in row that isn't a date/number/url
      for (const val of Object.values(row)) {
        const str = String(val ?? '').trim();
        if (str.length >= 2 && str.length <= 60 && !isEmailPattern(str) && !isPhonePattern(str) && !str.startsWith('http') && !str.startsWith('{')) {
          fullName = str;
          break;
        }
      }
    }
  }

  const finalFullName = fullName || `Lead #${rowIndex + 1}`;
  const source = normalizeSource(findField(row, headerAliases.source, (h) => h.includes('source') || h.includes('channel') || h.includes('platform')), fallbackSource);
  const status = normalizeStatus(findField(row, headerAliases.status, (h) => h.includes('status') || h.includes('stage')));
  const leadScore = boundedNumber(findField(row, headerAliases.leadScore, (h) => h.includes('score')), 0, 100, 25);
  const leadType = normalizeLeadType(findField(row, headerAliases.leadType, (h) => h.includes('type') || h.includes('temp')), leadScore);
  const notes = findField(row, headerAliases.notes, (h) => h.includes('note') || h.includes('message') || h.includes('comment') || h.includes('requirement'));

  return {
    fullName: finalFullName,
    company: company || '',
    email: email || '',
    phone: phone || '',
    source,
    status,
    leadType,
    leadScore,
    estimatedValue: nullableNumber(findField(row, headerAliases.estimatedValue, (h) => h.includes('value') || h.includes('budget') || h.includes('amount') || h.includes('revenue'))),
    nextFollowUpAt: dateValue(findField(row, headerAliases.nextFollowUpAt, (h) => h.includes('follow'))),
    notes: notes || '',
    campaignName: campaignName || '',
    externalLeadId: externalLeadId || email || phone || null,
    metadata: { ...metadataBase, raw: cleanRow(row) },
  };
}

function findField(row: RawRow, aliases: string[], keywordFilter?: (header: string) => boolean): string {
  const rowKeys = Object.keys(row);

  // 1. Exact normalized match
  for (const header of rowKeys) {
    const normalized = normalizeHeader(header);
    if (aliases.includes(normalized)) {
      const val = row[header];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        return String(val).trim();
      }
    }
  }

  // 2. Keyword/substring match
  if (keywordFilter) {
    for (const header of rowKeys) {
      const normalized = normalizeHeader(header);
      if (keywordFilter(normalized)) {
        const val = row[header];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return String(val).trim();
        }
      }
    }
  }

  return '';
}

function normalizeHeader(value: string) {
  return value
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isEmailPattern(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPhonePattern(value: string): boolean {
  if (value.length < 7 || value.length > 25) return false;
  // Check if string contains mostly digits, spaces, hyphens, plus sign, or parentheses
  const digitCount = (value.match(/\d/g) || []).length;
  if (digitCount < 7 || digitCount > 15) return false;
  // Exclude strings that are dates or timestamps (e.g. 2026-09-19T10:00:00)
  if (value.includes('T') || value.includes(':') || /^\d{4}-\d{2}-\d{2}/.test(value)) return false;
  return /^[+]?[\d\s().-]{7,25}$/.test(value);
}

function capitalizeWords(str: string): string {
  return str
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

function normalizeSource(value: string, fallback: LeadSource): LeadSource {
  const normalized = value.trim().toLowerCase().replace(/[_\s-]+/g, '_');
  if (sourceValues.includes(normalized as LeadSource)) return normalized as LeadSource;
  if (normalized.includes('google_form') || normalized.includes('form')) return 'google_forms';
  if (normalized.includes('import') || normalized.includes('sheet') || normalized.includes('excel') || normalized.includes('csv')) return 'imports';
  if (normalized.includes('comment')) return 'comments';
  if (normalized.includes('dm') || normalized.includes('direct_message')) return 'dms';
  if (normalized.includes('instagram') || normalized === 'ig') return 'instagram';
  if (normalized.includes('facebook') || normalized === 'fb') return 'facebook';
  if (normalized.includes('meta') || normalized.includes('google') || normalized.includes('ad')) return 'ads';
  if (normalized.includes('whatsapp')) return 'whatsapp';
  if (normalized.includes('refer')) return 'referrals';
  if (normalized.includes('web') || normalized.includes('site')) return 'website';
  if (normalized.includes('linkedin') || normalized.includes('social')) return 'social';
  return fallback;
}

function normalizeLeadType(value: string, score: number): LeadType {
  const normalized = value.trim().toLowerCase().replace(/[_\s-]+/g, '_');
  if (leadTypeValues.includes(normalized as LeadType)) return normalized as LeadType;
  if (normalized.includes('fire') || normalized.includes('hot')) return 'hot';
  if (normalized.includes('warm')) return 'warm';
  if (normalized.includes('cold')) return 'cold';
  if (score >= 70) return 'hot';
  if (score <= 34) return 'cold';
  return 'warm';
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

function parseDelimited(text: string, delimiter: string): string[][] {
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
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}
