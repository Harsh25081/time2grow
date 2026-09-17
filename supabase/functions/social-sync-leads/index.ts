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

    if (!orgId) return jsonResponse({ error: 'Missing orgId.' }, 400);

    await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin', 'editor']);

    const result = await syncMetaLeads(supabase, orgId, provider);
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
});

async function syncMetaLeads(supabase: ServiceClient, orgId: string, provider: string) {
  const pages = await resolveMetaPages(supabase, orgId);

  if (pages.length === 0) {
    return {
      provider,
      leads: [],
      count: 0,
      message: 'No connected Facebook Pages found. Connect Facebook in Settings / Connections first.',
    };
  }

  const allLeads: Record<string, unknown>[] = [];
  const errors: string[] = [];

  for (const page of pages) {
    try {
      // 1. Fetch Lead Gen Forms for the Page
      const formsUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(page.pageId)}/leadgen_forms?fields=id,name,status,leads_count&limit=100&access_token=${encodeURIComponent(page.pageToken)}`;
      const formsRes = await fetch(formsUrl);
      const formsData = await formsRes.json();

      if (formsData.error) {
        errors.push(`Page "${page.pageName}": ${formsData.error.message || 'Error fetching lead forms'}`);
        continue;
      }

      const forms = Array.isArray(formsData.data) ? formsData.data : [];

      for (const form of forms) {
        const formId = form.id;
        const formName = form.name || 'Lead Form';
        if (!formId) continue;

        try {
          // 2. Fetch Leads for each Form
          const leadsUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(formId)}/leads?fields=id,created_time,campaign_name,campaign_id,ad_name,ad_id,form_id,field_data&limit=500&access_token=${encodeURIComponent(page.pageToken)}`;
          const leadsRes = await fetch(leadsUrl);
          const leadsData = await leadsRes.json();

          if (leadsData.error) {
            errors.push(`Form "${formName}": ${leadsData.error.message || 'Error fetching leads'}`);
            continue;
          }

          const rawLeads = Array.isArray(leadsData.data) ? leadsData.data : [];

          for (const rawLead of rawLeads) {
            if (!rawLead.id) continue;

            const leadRow: Record<string, unknown> = {
              id: String(rawLead.id),
              'lead id': String(rawLead.id),
              'created_time': rawLead.created_time || new Date().toISOString(),
              campaign: rawLead.campaign_name || formName,
              'campaign name': rawLead.campaign_name || formName,
              'ad name': rawLead.ad_name || '',
              'form name': formName,
              'page name': page.pageName,
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
        } catch (formError) {
          errors.push(`Form "${formName}": ${formError instanceof Error ? formError.message : String(formError)}`);
        }
      }
    } catch (pageError) {
      errors.push(`Page "${page.pageName}": ${pageError instanceof Error ? pageError.message : String(pageError)}`);
    }
  }

  return {
    provider,
    leads: allLeads,
    count: allLeads.length,
    pagesChecked: pages.length,
    errors: errors.length > 0 ? errors : undefined,
    message: allLeads.length > 0
      ? `Retrieved ${allLeads.length} lead${allLeads.length === 1 ? '' : 's'} across ${pages.length} page${pages.length === 1 ? '' : 's'}.`
      : `No lead submissions found across ${pages.length} connected page${pages.length === 1 ? '' : 's'}.`,
  };
}

async function resolveMetaPages(supabase: ServiceClient, orgId: string): Promise<PageTarget[]> {
  const pages: PageTarget[] = [];
  const seenPageIds = new Set<string>();

  // 1. Try saved distribution handles first
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

  // 2. If no handles with tokens found, try oauth_connections to fetch user accounts dynamically
  if (pages.length === 0) {
    const { data: connection } = await supabase
      .from('oauth_connections')
      .select('*')
      .eq('org_id', orgId)
      .eq('provider', 'facebook')
      .maybeSingle();

    if (connection?.access_token_ciphertext) {
      try {
        const userToken = await decryptToken(connection.access_token_ciphertext);
        const accountsRes = await fetch(
          `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(userToken)}`
        );
        const accountsData = await accountsRes.json();
        const accounts = Array.isArray(accountsData.data) ? accountsData.data : [];

        for (const account of accounts) {
          if (account.id && account.access_token && !seenPageIds.has(account.id)) {
            pages.push({
              pageId: String(account.id),
              pageName: String(account.name || 'Facebook Page'),
              pageToken: String(account.access_token),
            });
            seenPageIds.add(String(account.id));
          }
        }
      } catch {
        // Skip connection fetch failure
      }
    }
  }

  return pages;
}
