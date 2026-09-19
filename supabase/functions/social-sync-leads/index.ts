import {
  assertOrgRole,
  decryptToken,
  errorResponse,
  getAuthenticatedUser,
  handleOptions,
  HttpError,
  jsonResponse,
  serviceClient,
} from '../_shared/youtube.ts';

type ServiceClient = ReturnType<typeof serviceClient>;

type PageTarget = {
  pageId: string;
  pageName: string;
  pageToken: string;
};

type FormMeta = {
  id: string;
  name: string;
  pageId: string;
  pageName: string;
  status: string;
  leadsCount: number;
};

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);

    const supabase = serviceClient();
    const user = await getAuthenticatedUser(req, supabase);
    const body = await req.json().catch(() => ({}));
    const orgId = typeof body.orgId === 'string' ? body.orgId : '';
    const provider = typeof body.provider === 'string' ? body.provider : 'meta_ads';
    const action = typeof body.action === 'string' ? body.action : 'sync';
    const selectedFormId = typeof body.formId === 'string' && body.formId.trim() !== '' && body.formId !== 'all'
      ? body.formId.trim()
      : undefined;

    if (!orgId) return jsonResponse({ error: 'Missing orgId.' }, 400);

    await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin', 'editor']);

    if (action === 'list_forms') {
      const result = await listMetaLeadForms(supabase, orgId, provider);
      return jsonResponse(result);
    }

    const result = await syncMetaLeads(supabase, orgId, provider, selectedFormId);
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
});

async function listMetaLeadForms(supabase: ServiceClient, orgId: string, provider: string) {
  const pages = await resolveMetaPages(supabase, orgId);

  if (pages.length === 0) {
    return {
      provider,
      forms: [],
      pagesChecked: [],
      message: 'No connected Facebook Pages found. Connect Facebook in Settings / Connections first.',
    };
  }

  const allForms: FormMeta[] = [];
  const errors: string[] = [];
  const seenFormIds = new Set<string>();

  for (const page of pages) {
    try {
      let nextFormsUrl: string | null = `https://graph.facebook.com/v21.0/${encodeURIComponent(page.pageId)}/leadgen_forms?fields=id,name,status,leads_count,created_time,expired_leads_count,organic_leads_count&limit=100&access_token=${encodeURIComponent(page.pageToken)}`;
      let formsLoop = 0;

      while (nextFormsUrl && formsLoop < 10) {
        formsLoop++;
        const formsRes = await fetch(nextFormsUrl);
        const formsData = await formsRes.json();

        if (formsData.error) {
          errors.push(`Page "${page.pageName}" (${page.pageId}): ${formsData.error.message || 'Error fetching lead forms'}`);
          break;
        }

        const forms = Array.isArray(formsData.data) ? formsData.data : [];
        for (const form of forms) {
          if (!form.id) continue;
          const formIdStr = String(form.id);
          if (seenFormIds.has(formIdStr)) continue;
          seenFormIds.add(formIdStr);

          allForms.push({
            id: formIdStr,
            name: String(form.name || 'Lead Form'),
            pageId: page.pageId,
            pageName: page.pageName,
            status: String(form.status || 'ACTIVE'),
            leadsCount: typeof form.leads_count === 'number' ? form.leads_count : 0,
          });
        }

        nextFormsUrl = typeof formsData?.paging?.next === 'string' ? formsData.paging.next : null;
      }
    } catch (pageError) {
      errors.push(`Page "${page.pageName}": ${pageError instanceof Error ? pageError.message : String(pageError)}`);
    }
  }

  return {
    provider,
    forms: allForms,
    pagesChecked: pages.map((p) => ({ id: p.pageId, name: p.pageName })),
    errors: errors.length > 0 ? errors : undefined,
    message: allForms.length > 0
      ? `Found ${allForms.length} lead form${allForms.length === 1 ? '' : 's'} across ${pages.length} connected page${pages.length === 1 ? '' : 's'}.`
      : `No lead forms found across ${pages.length} connected page${pages.length === 1 ? '' : 's'}.`,
  };
}

async function syncMetaLeads(supabase: ServiceClient, orgId: string, provider: string, targetFormId?: string) {
  const pages = await resolveMetaPages(supabase, orgId);

  if (pages.length === 0) {
    return {
      provider,
      leads: [],
      count: 0,
      pagesChecked: [],
      message: 'No connected Facebook Pages found. Connect Facebook in Settings / Connections first.',
    };
  }

  const allLeads: Record<string, unknown>[] = [];
  const seenLeadIds = new Set<string>();
  const errors: string[] = [];
  let directFormFound = false;

  // If user provided a specific targetFormId, try direct lookup first across all pages
  if (targetFormId) {
    for (const page of pages) {
      try {
        const directFormUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(targetFormId)}?fields=id,name,status,page_id&access_token=${encodeURIComponent(page.pageToken)}`;
        const directRes = await fetch(directFormUrl);
        const directData = await directRes.json();

        if (directData?.id && !directData.error) {
          directFormFound = true;
          const formName = directData.name || 'Lead Form';
          const rawLeads = await fetchFormLeads(targetFormId, page.pageToken);

          for (const rawLead of rawLeads) {
            if (!rawLead.id) continue;
            const leadIdStr = String(rawLead.id);
            if (seenLeadIds.has(leadIdStr)) continue;
            seenLeadIds.add(leadIdStr);

            const leadRow: Record<string, unknown> = {
              id: leadIdStr,
              'lead id': leadIdStr,
              'lead_id': leadIdStr,
              'created_time': rawLead.created_time || new Date().toISOString(),
              campaign: rawLead.campaign_name || formName,
              'campaign name': rawLead.campaign_name || formName,
              'campaign_name': rawLead.campaign_name || formName,
              'ad name': rawLead.ad_name || '',
              'ad_name': rawLead.ad_name || '',
              'ad id': rawLead.ad_id || '',
              'ad_id': rawLead.ad_id || '',
              'form name': formName,
              'form_name': formName,
              'form id': targetFormId,
              'form_id': targetFormId,
              'page name': page.pageName,
              'page_name': page.pageName,
              'page id': page.pageId,
              'page_id': page.pageId,
              source: 'facebook',
            };

            // Flatten field_data
            if (Array.isArray(rawLead.field_data)) {
              for (const field of rawLead.field_data) {
                if (field && typeof field === 'object' && field.name) {
                  const values = field.values;
                  const value = Array.isArray(values) && values.length > 0 ? String(values[0] ?? '') : '';
                  leadRow[field.name] = value;
                }
              }
            }

            allLeads.push(leadRow);
          }
          break; // Found and synced with this page
        }
      } catch {
        // Try next page
      }
    }
  }

  // If no targetFormId or direct lookup didn't yield leads, iterate through all pages and their forms
  if (!targetFormId || (!directFormFound && allLeads.length === 0)) {
    for (const page of pages) {
      try {
        let nextFormsUrl: string | null = `https://graph.facebook.com/v21.0/${encodeURIComponent(page.pageId)}/leadgen_forms?fields=id,name,status,leads_count&limit=100&access_token=${encodeURIComponent(page.pageToken)}`;
        let formsLoop = 0;

        while (nextFormsUrl && formsLoop < 10) {
          formsLoop++;
          const formsRes = await fetch(nextFormsUrl);
          const formsData = await formsRes.json();

          if (formsData.error) {
            errors.push(`Page "${page.pageName}": ${formsData.error.message || 'Error fetching lead forms'}`);
            break;
          }

          const forms = Array.isArray(formsData.data) ? formsData.data : [];

          for (const form of forms) {
            const formId = String(form.id || '');
            const formName = form.name || 'Lead Form';
            if (!formId) continue;

            // If targetFormId specified, skip non-matching forms
            if (targetFormId && formId !== targetFormId) continue;

            try {
              // Concurrently fetch standard live leads and Meta Lead Ads Testing Tool test leads
              const rawLeads = await fetchFormLeads(formId, page.pageToken);

              for (const rawLead of rawLeads) {
                if (!rawLead.id) continue;
                const leadIdStr = String(rawLead.id);
                if (seenLeadIds.has(leadIdStr)) continue;
                seenLeadIds.add(leadIdStr);

                const leadRow: Record<string, unknown> = {
                  id: leadIdStr,
                  'lead id': leadIdStr,
                  'lead_id': leadIdStr,
                  'created_time': rawLead.created_time || new Date().toISOString(),
                  campaign: rawLead.campaign_name || formName,
                  'campaign name': rawLead.campaign_name || formName,
                  'campaign_name': rawLead.campaign_name || formName,
                  'ad name': rawLead.ad_name || '',
                  'ad_name': rawLead.ad_name || '',
                  'ad id': rawLead.ad_id || '',
                  'ad_id': rawLead.ad_id || '',
                  'form name': formName,
                  'form_name': formName,
                  'form id': formId,
                  'form_id': formId,
                  'page name': page.pageName,
                  'page_name': page.pageName,
                  'page id': page.pageId,
                  'page_id': page.pageId,
                  source: 'facebook',
                };

                // Flatten field_data (supports key-value pairs from standard & custom fields)
                if (Array.isArray(rawLead.field_data)) {
                  for (const field of rawLead.field_data) {
                    if (field && typeof field === 'object' && field.name) {
                      const values = field.values;
                      const value = Array.isArray(values) && values.length > 0 ? String(values[0] ?? '') : '';
                      leadRow[field.name] = value;
                    }
                  }
                }

                allLeads.push(leadRow);
              }
            } catch (formError) {
              errors.push(`Form "${formName}": ${formError instanceof Error ? formError.message : String(formError)}`);
            }
          }

          nextFormsUrl = typeof formsData?.paging?.next === 'string' ? formsData.paging.next : null;
        }
      } catch (pageError) {
        errors.push(`Page "${page.pageName}": ${pageError instanceof Error ? pageError.message : String(pageError)}`);
      }
    }
  }

  // Sort latest leads first by created_time
  allLeads.sort((a, b) => {
    const timeA = typeof a.created_time === 'string' ? new Date(a.created_time).getTime() : 0;
    const timeB = typeof b.created_time === 'string' ? new Date(b.created_time).getTime() : 0;
    return timeB - timeA;
  });

  return {
    provider,
    leads: allLeads,
    count: allLeads.length,
    pagesChecked: pages.map((p) => ({ id: p.pageId, name: p.pageName })),
    targetFormId: targetFormId || null,
    errors: errors.length > 0 ? errors : undefined,
    message: allLeads.length > 0
      ? `Retrieved ${allLeads.length} lead${allLeads.length === 1 ? '' : 's'} across ${pages.length} connected page${pages.length === 1 ? '' : 's'}.`
      : `No lead submissions found across ${pages.length} connected page${pages.length === 1 ? '' : 's'}.`,
  };
}

async function fetchFormLeads(formId: string, pageToken: string): Promise<Record<string, unknown>[]> {
  const fields = 'id,created_time,campaign_name,campaign_id,ad_name,ad_id,form_id,field_data';
  const leadsUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(formId)}/leads?fields=${fields}&limit=500&access_token=${encodeURIComponent(pageToken)}`;
  const testLeadsUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(formId)}/test_leads?fields=${fields}&limit=500&access_token=${encodeURIComponent(pageToken)}`;

  const [leadsRes, testLeadsRes] = await Promise.all([
    fetch(leadsUrl),
    fetch(testLeadsUrl),
  ]);

  const [leadsData, testLeadsData] = await Promise.all([
    leadsRes.json().catch(() => ({})),
    testLeadsRes.json().catch(() => ({})),
  ]);

  const results: Record<string, unknown>[] = [];

  if (Array.isArray(leadsData.data)) {
    results.push(...leadsData.data);
  } else if (leadsData.error) {
    // If param error with campaign/ad fields, fallback to minimal fields
    const fallbackUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(formId)}/leads?fields=id,created_time,form_id,field_data&limit=500&access_token=${encodeURIComponent(pageToken)}`;
    const fbRes = await fetch(fallbackUrl);
    const fbData = await fbRes.json().catch(() => ({}));
    if (Array.isArray(fbData.data)) results.push(...fbData.data);
  }

  if (Array.isArray(testLeadsData.data)) {
    results.push(...testLeadsData.data);
  } else if (testLeadsData.error) {
    // Fallback minimal fields for test leads
    const fallbackTestUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(formId)}/test_leads?fields=id,created_time,form_id,field_data&limit=500&access_token=${encodeURIComponent(pageToken)}`;
    const fbTestRes = await fetch(fallbackTestUrl);
    const fbTestData = await fbTestRes.json().catch(() => ({}));
    if (Array.isArray(fbTestData.data)) results.push(...fbTestData.data);
  }

  return results;
}

async function resolveMetaPages(supabase: ServiceClient, orgId: string): Promise<PageTarget[]> {
  const pages: PageTarget[] = [];
  const seenPageIds = new Set<string>();

  // 1. First check oauth_connections to fetch user accounts dynamically for all authorized pages with fresh Page Access Tokens
  const { data: connection } = await supabase
    .from('oauth_connections')
    .select('*')
    .eq('org_id', orgId)
    .eq('provider', 'facebook')
    .maybeSingle();

  if (connection?.access_token_ciphertext) {
    try {
      const userToken = await decryptToken(connection.access_token_ciphertext);
      let nextAccountsUrl: string | null = `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(userToken)}`;
      let pageLoop = 0;
      while (nextAccountsUrl && pageLoop < 5) {
        pageLoop++;
        const accountsRes = await fetch(nextAccountsUrl);
        const accountsData = await accountsRes.json();
        if (accountsData.error) break;
        const accounts = Array.isArray(accountsData.data) ? accountsData.data : [];
        for (const account of accounts) {
          if (account.id && account.access_token && !seenPageIds.has(String(account.id))) {
            pages.push({
              pageId: String(account.id),
              pageName: String(account.name || 'Facebook Page'),
              pageToken: String(account.access_token),
            });
            seenPageIds.add(String(account.id));
          }
        }
        nextAccountsUrl = typeof accountsData?.paging?.next === 'string' ? accountsData.paging.next : null;
      }
    } catch {
      // Skip connection fetch failure
    }
  }

  // 2. Also check saved distribution handles for any additional or previously saved pages
  const { data: handles } = await supabase
    .from('distribution_handles')
    .select('id, external_handle_id, display_name')
    .eq('org_id', orgId)
    .eq('provider', 'facebook')
    .eq('is_enabled', true);

  for (const handle of handles ?? []) {
    if (!handle.external_handle_id || seenPageIds.has(handle.external_handle_id)) continue;

    const { data: creds } = await supabase
      .from('provider_handle_credentials')
      .select('access_token_ciphertext')
      .eq('distribution_handle_id', handle.id)
      .maybeSingle();

    if (creds?.access_token_ciphertext) {
      try {
        const pageToken = await decryptToken(creds.access_token_ciphertext);
        pages.push({
          pageId: handle.external_handle_id,
          pageName: handle.display_name || 'Facebook Page',
          pageToken,
        });
        seenPageIds.add(handle.external_handle_id);
      } catch {
        // Skip un-decryptable credentials
      }
    }
  }

  return pages;
}
