import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, Inbox, Loader2, MessageSquareReply, Plus, Save, Send, UserPlus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Database, Json } from '../../types/database';
import { useAuth } from '../auth/AuthProvider';
import { BrandDnaSelect, SELF_BRAND_ID, useBrandDna } from '../business-dna/useBrandDna';

type InboxThreadRow = Database['public']['Tables']['inbox_threads']['Row'];
type InboxMessageRow = Database['public']['Tables']['inbox_messages']['Row'];
type InboxThreadStatus = InboxThreadRow['status'];
type InboxPriority = InboxThreadRow['priority'];
type InboxChannel = InboxThreadRow['channel'];
type MessageDirection = InboxMessageRow['direction'];
type LeadRow = Pick<Database['public']['Tables']['leads']['Row'], 'id' | 'full_name' | 'company' | 'email' | 'phone' | 'status' | 'client_business_dna_id' | 'campaign_id'>;
type CampaignRow = Pick<Database['public']['Tables']['campaigns']['Row'], 'id' | 'name' | 'status' | 'client_business_dna_id'>;
type HandleRow = Pick<Database['public']['Tables']['distribution_handles']['Row'], 'id' | 'provider' | 'display_name' | 'is_enabled'>;
type InboxFilter = 'all' | InboxThreadStatus;

type ThreadForm = {
  brandSelectionId: string;
  channel: InboxChannel;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  priority: InboxPriority;
  leadId: string;
  campaignId: string;
  distributionHandleId: string;
  firstMessage: string;
};

const writerRoles = ['owner', 'admin', 'editor'] as const;

const emptyForm: ThreadForm = {
  brandSelectionId: SELF_BRAND_ID,
  channel: 'whatsapp',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  priority: 'normal',
  leadId: '',
  campaignId: '',
  distributionHandleId: '',
  firstMessage: '',
};

const statusOptions: Array<{ value: InboxThreadStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'replied', label: 'Replied' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'archived', label: 'Archived' },
];

const filters: Array<{ value: InboxFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'replied', label: 'Replied' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'archived', label: 'Archived' },
];

const channelOptions: Array<{ value: InboxChannel; label: string }> = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'slack', label: 'Slack' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'website', label: 'Website' },
  { value: 'email', label: 'Email' },
  { value: 'other', label: 'Other' },
];

const priorityOptions: Array<{ value: InboxPriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

export function InboxPage() {
  const { organization, user, membership } = useAuth();
  const [threads, setThreads] = useState<InboxThreadRow[]>([]);
  const [messages, setMessages] = useState<InboxMessageRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [handles, setHandles] = useState<HandleRow[]>([]);
  const [form, setForm] = useState<ThreadForm>(emptyForm);
  const [selectedBrandId, setSelectedBrandId] = useState(SELF_BRAND_ID);
  const [selectedThreadId, setSelectedThreadId] = useState('');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replyMode, setReplyMode] = useState<MessageDirection>('outbound');
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const canWrite = writerRoles.some((role) => role === membership?.role);
  const readOnly = Boolean(membership?.role) && !canWrite;
  const isAgency = organization?.org_type === 'agency';
  const { clients } = useBrandDna(organization?.id, isAgency);
  const clientNameById = useMemo(() => new Map(clients.map((client) => [client.id, client.name])), [clients]);
  const leadById = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads]);
  const campaignById = useMemo(() => new Map(campaigns.map((campaign) => [campaign.id, campaign])), [campaigns]);
  const handleById = useMemo(() => new Map(handles.map((handle) => [handle.id, handle])), [handles]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');

      if (!supabase || !organization?.id) {
        setThreads([]);
        setLeads([]);
        setCampaigns([]);
        setHandles([]);
        setLoading(false);
        return;
      }

      const [
        { data: threadData, error: threadError },
        { data: leadData, error: leadError },
        { data: campaignData, error: campaignError },
        { data: handleData, error: handleError },
      ] = await Promise.all([
        supabase
          .from('inbox_threads')
          .select('*')
          .eq('org_id', organization.id)
          .order('last_message_at', { ascending: false })
          .limit(150),
        supabase
          .from('leads')
          .select('id, full_name, company, email, phone, status, client_business_dna_id, campaign_id')
          .eq('org_id', organization.id)
          .neq('status', 'archived')
          .order('updated_at', { ascending: false })
          .limit(150),
        supabase
          .from('campaigns')
          .select('id, name, status, client_business_dna_id')
          .eq('org_id', organization.id)
          .neq('status', 'archived')
          .order('updated_at', { ascending: false })
          .limit(100),
        supabase
          .from('distribution_handles')
          .select('id, provider, display_name, is_enabled')
          .eq('org_id', organization.id)
          .eq('is_enabled', true)
          .order('updated_at', { ascending: false }),
      ]);

      if (!active) return;
      if (threadError) setError(errorMessage(threadError, 'Could not load inbox conversations.'));
      if (leadError) setError(errorMessage(leadError, 'Could not load leads.'));
      if (campaignError) setError(errorMessage(campaignError, 'Could not load campaigns.'));
      if (handleError) setError(errorMessage(handleError, 'Could not load connected handles.'));
      setThreads(threadData ?? []);
      setLeads(leadData ?? []);
      setCampaigns(campaignData ?? []);
      setHandles(handleData ?? []);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [organization?.id]);

  const visibleThreads = useMemo(() => {
    return threads.filter((thread) => {
      if (isAgency && selectedBrandId !== SELF_BRAND_ID && thread.client_business_dna_id !== selectedBrandId) return false;
      if (isAgency && selectedBrandId === SELF_BRAND_ID && thread.client_business_dna_id) return false;
      if (filter !== 'all' && thread.status !== filter) return false;
      return true;
    });
  }, [filter, isAgency, selectedBrandId, threads]);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? visibleThreads[0] ?? null,
    [selectedThreadId, threads, visibleThreads],
  );

  useEffect(() => {
    if (!selectedThread) {
      setSelectedThreadId('');
      setMessages([]);
      return;
    }
    if (selectedThread.id !== selectedThreadId) setSelectedThreadId(selectedThread.id);
  }, [selectedThread, selectedThreadId]);

  useEffect(() => {
    let active = true;

    async function loadMessages() {
      if (!supabase || !organization?.id || !selectedThread?.id) {
        setMessages([]);
        return;
      }

      setMessagesLoading(true);
      const { data, error: loadError } = await supabase
        .from('inbox_messages')
        .select('*')
        .eq('org_id', organization.id)
        .eq('thread_id', selectedThread.id)
        .order('created_at', { ascending: true });

      if (!active) return;
      if (loadError) setError(errorMessage(loadError, 'Could not load this conversation.'));
      setMessages(data ?? []);
      setMessagesLoading(false);
    }

    loadMessages();
    return () => {
      active = false;
    };
  }, [organization?.id, selectedThread?.id]);

  const counts = useMemo(() => {
    const next = new Map<InboxFilter, number>([['all', threads.length]]);
    for (const thread of threads) next.set(thread.status, (next.get(thread.status) ?? 0) + 1);
    return next;
  }, [threads]);

  const summary = useMemo(() => {
    const active = threads.filter((thread) => !['resolved', 'archived'].includes(thread.status)).length;
    const high = threads.filter((thread) => thread.priority === 'high' && !['resolved', 'archived'].includes(thread.status)).length;
    const linkedLeads = threads.filter((thread) => thread.lead_id).length;
    return { active, high, linkedLeads };
  }, [threads]);

  const formCampaignOptions = useMemo(
    () => campaigns.filter((campaign) => rowMatchesBrand(campaign.client_business_dna_id, isAgency, form.brandSelectionId)),
    [campaigns, form.brandSelectionId, isAgency],
  );

  const formLeadOptions = useMemo(
    () => leads.filter((lead) => rowMatchesBrand(lead.client_business_dna_id, isAgency, form.brandSelectionId)),
    [form.brandSelectionId, isAgency, leads],
  );

  useEffect(() => {
    if (form.campaignId && !formCampaignOptions.some((campaign) => campaign.id === form.campaignId)) updateForm('campaignId', '');
    if (form.leadId && !formLeadOptions.some((lead) => lead.id === form.leadId)) updateForm('leadId', '');
  }, [form.campaignId, form.leadId, formCampaignOptions, formLeadOptions]);

  function updateForm<K extends keyof ThreadForm>(key: K, value: ThreadForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setForm({ ...emptyForm, brandSelectionId: selectedBrandId });
    setShowCreate(true);
    setMessage('');
    setError('');
  }

  async function handleCreateThread(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !organization?.id || !user?.id) return;
    if (!canWrite) {
      setError('Ask an owner, admin, or editor to manage Inbox conversations.');
      return;
    }

    const contactName = form.contactName.trim();
    const firstMessage = form.firstMessage.trim();
    if (!contactName) {
      setError('Enter the contact name first.');
      return;
    }
    if (!firstMessage) {
      setError('Add the first message or note.');
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    const now = new Date().toISOString();
    const lead = form.leadId ? leadById.get(form.leadId) : null;
    const payload = {
      org_id: organization.id,
      client_business_dna_id: isAgency && form.brandSelectionId !== SELF_BRAND_ID ? form.brandSelectionId : null,
      campaign_id: form.campaignId || lead?.campaign_id || null,
      lead_id: form.leadId || null,
      distribution_handle_id: form.distributionHandleId || null,
      channel: form.channel,
      contact_name: contactName,
      contact_email: form.contactEmail.trim() || lead?.email || null,
      contact_phone: form.contactPhone.trim() || lead?.phone || null,
      priority: form.priority,
      status: 'open' as const,
      last_message_preview: firstMessage,
      last_message_at: now,
      metadata: { source: 'manual_inbox' } satisfies Json,
      created_by: user.id,
    };

    try {
      const { data: thread, error: insertError } = await supabase
        .from('inbox_threads')
        .insert(payload)
        .select('*')
        .single();
      if (insertError) throw insertError;

      const { data: insertedMessages, error: messageError } = await supabase
        .from('inbox_messages')
        .insert({
          org_id: organization.id,
          thread_id: thread.id,
          direction: 'inbound',
          body: firstMessage,
          sender_name: contactName,
          sender_handle: form.contactEmail.trim() || form.contactPhone.trim() || null,
          metadata: { source: 'manual_inbox' } satisfies Json,
          created_by: user.id,
        })
        .select('*');
      if (messageError) throw messageError;

      setThreads((current) => [thread, ...current]);
      setSelectedThreadId(thread.id);
      setMessages(insertedMessages ?? []);
      setForm(emptyForm);
      setShowCreate(false);
      setMessage('Conversation created.');
    } catch (createError) {
      setError(errorMessage(createError, 'Could not create this conversation.'));
    } finally {
      setSaving(false);
    }
  }

  async function saveReply() {
    if (!supabase || !organization?.id || !user?.id || !selectedThread) return;
    if (!canWrite) {
      setError('Ask an owner, admin, or editor to reply here.');
      return;
    }

    const body = replyBody.trim();
    if (!body) {
      setError('Write a reply or internal note first.');
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    const now = new Date().toISOString();
    try {
      const { data: inserted, error: insertError } = await supabase
        .from('inbox_messages')
        .insert({
          org_id: organization.id,
          thread_id: selectedThread.id,
          direction: replyMode,
          body,
          sender_name: replyMode === 'inbound' ? selectedThread.contact_name : organization.name,
          sender_handle: replyMode === 'internal' ? null : selectedThread.channel,
          metadata: { source: 'workspace_inbox' } satisfies Json,
          created_by: user.id,
        })
        .select('*')
        .single();
      if (insertError) throw insertError;

      const nextStatus = replyMode === 'outbound' ? 'replied' : selectedThread.status;
      const { data: updatedThread, error: updateError } = await supabase
        .from('inbox_threads')
        .update({
          status: nextStatus,
          last_message_preview: body,
          last_message_at: now,
        })
        .eq('id', selectedThread.id)
        .eq('org_id', organization.id)
        .select('*')
        .single();
      if (updateError) throw updateError;

      setMessages((current) => [...current, inserted]);
      setThreads((current) => sortThreads(current.map((thread) => (thread.id === updatedThread.id ? updatedThread : thread))));
      setReplyBody('');
      setMessage(replyMode === 'internal' ? 'Note saved.' : 'Reply saved.');
    } catch (replyError) {
      setError(errorMessage(replyError, 'Could not save this message.'));
    } finally {
      setSaving(false);
    }
  }

  async function patchThread(thread: InboxThreadRow, patch: Database['public']['Tables']['inbox_threads']['Update']) {
    if (!supabase || !organization?.id || !canWrite) return;
    setUpdatingId(thread.id);
    setMessage('');
    setError('');
    try {
      const { data, error: updateError } = await supabase
        .from('inbox_threads')
        .update(patch)
        .eq('id', thread.id)
        .eq('org_id', organization.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      setThreads((current) => sortThreads(current.map((item) => (item.id === data.id ? data : item))));
      setMessage('Conversation updated.');
    } catch (patchError) {
      setError(errorMessage(patchError, 'Could not update conversation.'));
    } finally {
      setUpdatingId('');
    }
  }

  async function createLeadFromThread() {
    if (!supabase || !organization?.id || !user?.id || !selectedThread) return;
    if (!canWrite) return;

    setSaving(true);
    setMessage('');
    setError('');

    try {
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .insert({
          org_id: organization.id,
          client_business_dna_id: selectedThread.client_business_dna_id,
          campaign_id: selectedThread.campaign_id,
          full_name: selectedThread.contact_name,
          email: selectedThread.contact_email,
          phone: selectedThread.contact_phone,
          source: channelToLeadSource(selectedThread.channel),
          status: 'new',
          lead_score: selectedThread.priority === 'high' ? 70 : 35,
          notes: selectedThread.last_message_preview,
          metadata: { inboxThreadId: selectedThread.id } satisfies Json,
          created_by: user.id,
        })
        .select('id, full_name, company, email, phone, status, client_business_dna_id, campaign_id')
        .single();
      if (leadError) throw leadError;

      const { data: updatedThread, error: updateError } = await supabase
        .from('inbox_threads')
        .update({ lead_id: lead.id })
        .eq('id', selectedThread.id)
        .eq('org_id', organization.id)
        .select('*')
        .single();
      if (updateError) throw updateError;

      setLeads((current) => [lead, ...current]);
      setThreads((current) => current.map((thread) => (thread.id === updatedThread.id ? updatedThread : thread)));
      setMessage('Lead created from conversation.');
    } catch (leadError) {
      setError(errorMessage(leadError, 'Could not create a lead from this conversation.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack inbox-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Engage</p>
          <h2>Inbox</h2>
        </div>
        <div className="page-header-actions">
          <span className={readOnly ? 'status-pill warning' : 'status-pill success'}>
            {readOnly ? 'Read only' : `${threads.length} conversations`}
          </span>
          <button type="button" className="icon-text-button" onClick={openCreate} disabled={!canWrite}>
            <Plus size={16} />
            <span>New conversation</span>
          </button>
        </div>
      </header>

      {loading ? (
        <section className="empty-state" aria-label="Loading inbox">
          <Loader2 className="spin" size={28} />
          <h3>Loading Inbox</h3>
        </section>
      ) : (
        <div className="inbox-workspace">
          <section className="lead-summary-strip" aria-label="Inbox summary">
            <article>
              <span>Active</span>
              <strong>{summary.active}</strong>
              <small>Open, pending, or replied</small>
            </article>
            <article>
              <span>High priority</span>
              <strong>{summary.high}</strong>
              <small>Needs faster attention</small>
            </article>
            <article>
              <span>Linked leads</span>
              <strong>{summary.linkedLeads}</strong>
              <small>Conversations tied to CRM</small>
            </article>
          </section>

          {showCreate ? (
            <section className="draft-panel inbox-action-panel" aria-label="Create conversation">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Conversation</p>
                  <h3>New conversation</h3>
                </div>
                <button type="button" className="icon-button" onClick={() => setShowCreate(false)} aria-label="Close conversation form">
                  <X size={16} />
                </button>
              </div>

              {readOnly ? <p className="form-message warning">Ask an owner, admin, or editor to manage Inbox conversations.</p> : null}

              <form className="draft-form creator-form" onSubmit={handleCreateThread}>
                {isAgency ? (
                  <BrandDnaSelect
                    label="Conversation for"
                    selfLabel={organization?.name ?? 'Agency brand'}
                    clients={clients}
                    value={form.brandSelectionId}
                    onChange={(id) => updateForm('brandSelectionId', id)}
                  />
                ) : null}
                <label>
                  <span>Channel</span>
                  <select value={form.channel} onChange={(event) => updateForm('channel', event.target.value as InboxChannel)}>
                    {channelOptions.map((channel) => <option key={channel.value} value={channel.value}>{channel.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>Connected handle</span>
                  <select value={form.distributionHandleId} onChange={(event) => updateForm('distributionHandleId', event.target.value)}>
                    <option value="">No handle selected</option>
                    {handles.map((handle) => (
                      <option key={handle.id} value={handle.id}>{handle.display_name} - {channelLabel(handle.provider as InboxChannel)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Contact name</span>
                  <input value={form.contactName} onChange={(event) => updateForm('contactName', event.target.value)} placeholder="Customer or lead name" />
                </label>
                <label>
                  <span>Email</span>
                  <input type="email" value={form.contactEmail} onChange={(event) => updateForm('contactEmail', event.target.value)} placeholder="name@example.com" />
                </label>
                <label>
                  <span>Phone</span>
                  <input value={form.contactPhone} onChange={(event) => updateForm('contactPhone', event.target.value)} placeholder="+91..." />
                </label>
                <label>
                  <span>Lead</span>
                  <select value={form.leadId} onChange={(event) => updateForm('leadId', event.target.value)}>
                    <option value="">No lead selected</option>
                    {formLeadOptions.map((lead) => <option key={lead.id} value={lead.id}>{lead.full_name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Campaign</span>
                  <select value={form.campaignId} onChange={(event) => updateForm('campaignId', event.target.value)}>
                    <option value="">No campaign selected</option>
                    {formCampaignOptions.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Priority</span>
                  <select value={form.priority} onChange={(event) => updateForm('priority', event.target.value as InboxPriority)}>
                    {priorityOptions.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
                  </select>
                </label>
                <label className="draft-body-field">
                  <span>First message</span>
                  <textarea value={form.firstMessage} onChange={(event) => updateForm('firstMessage', event.target.value)} rows={3} placeholder="Paste the customer message or add a quick note" />
                </label>
                <div className="creator-actions draft-body-field">
                  <button type="button" className="icon-text-button" onClick={() => setShowCreate(false)}>
                    <X size={16} />
                    <span>Cancel</span>
                  </button>
                  <button className="primary-action" type="submit" disabled={saving || !canWrite}>
                    {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
                    <span>{saving ? 'Saving' : 'Create conversation'}</span>
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <section className="inbox-board" aria-label="Inbox conversations">
            <div className="draft-panel inbox-list-panel">
              <div className="section-heading content-library-heading">
                <div>
                  <p className="eyebrow">Queue</p>
                  <h3>Conversations</h3>
                </div>
                {isAgency ? (
                  <BrandDnaSelect
                    label="Brand"
                    selfLabel={organization?.name ?? 'Agency brand'}
                    clients={clients}
                    value={selectedBrandId}
                    onChange={setSelectedBrandId}
                  />
                ) : null}
              </div>

              <div className="library-filter-tabs" aria-label="Filter inbox">
                {filters.map((item) => (
                  <button key={item.value} type="button" className={filter === item.value ? 'is-active' : ''} onClick={() => setFilter(item.value)}>
                    <span>{item.label}</span>
                    <small>{counts.get(item.value) ?? 0}</small>
                  </button>
                ))}
              </div>

              <div className="inbox-thread-list">
                {visibleThreads.length > 0 ? visibleThreads.map((thread) => {
                  const lead = thread.lead_id ? leadById.get(thread.lead_id) : null;
                  return (
                    <button
                      type="button"
                      className={thread.id === selectedThread?.id ? 'inbox-thread is-active' : 'inbox-thread'}
                      key={thread.id}
                      onClick={() => setSelectedThreadId(thread.id)}
                    >
                      <span className={`inbox-priority ${thread.priority}`}>{priorityLabel(thread.priority)}</span>
                      <strong>{thread.contact_name}</strong>
                      <small>{thread.last_message_preview || 'No message preview'}</small>
                      <span>{[channelLabel(thread.channel), statusLabel(thread.status), lead ? 'Lead linked' : null].filter(Boolean).join(' - ')}</span>
                    </button>
                  );
                }) : (
                  <div className="queue-empty">
                    <Inbox size={20} />
                    <span>{threads.length > 0 ? 'No conversations match this filter.' : 'No conversations yet.'}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="draft-panel inbox-detail-panel">
              {selectedThread ? (
                <>
                  <div className="inbox-detail-header">
                    <div>
                      <p className="eyebrow">{channelLabel(selectedThread.channel)}</p>
                      <h3>{selectedThread.contact_name}</h3>
                      <div className="saved-content-row__meta">
                        <span>{statusLabel(selectedThread.status)}</span>
                        <span>{priorityLabel(selectedThread.priority)} priority</span>
                        {isAgency ? <span>{selectedThread.client_business_dna_id ? clientNameById.get(selectedThread.client_business_dna_id) ?? 'Client brand' : organization?.name ?? 'Agency brand'}</span> : null}
                        {selectedThread.campaign_id ? <span>{campaignById.get(selectedThread.campaign_id)?.name ?? 'Campaign'}</span> : null}
                        {selectedThread.distribution_handle_id ? <span>{handleById.get(selectedThread.distribution_handle_id)?.display_name ?? 'Connected handle'}</span> : null}
                      </div>
                    </div>
                    {canWrite ? (
                      <div className="saved-content-row__actions">
                        {!selectedThread.lead_id ? (
                          <button type="button" className="icon-text-button" onClick={createLeadFromThread} disabled={saving}>
                            <UserPlus size={16} />
                            <span>Create lead</span>
                          </button>
                        ) : null}
                        <label className="task-status-select">
                          <select value={selectedThread.status} disabled={updatingId === selectedThread.id} onChange={(event) => patchThread(selectedThread, { status: event.target.value as InboxThreadStatus })}>
                            {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="icon-text-button"
                          disabled={updatingId === selectedThread.id}
                          onClick={() => patchThread(selectedThread, { status: selectedThread.status === 'archived' ? 'open' : 'archived' })}
                        >
                          {selectedThread.status === 'archived' ? <CheckCircle2 size={16} /> : <Archive size={16} />}
                          <span>{selectedThread.status === 'archived' ? 'Restore' : 'Archive'}</span>
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="inbox-contact-line">
                    <span>{[selectedThread.contact_email, selectedThread.contact_phone].filter(Boolean).join(' - ') || 'No direct contact saved'}</span>
                    <span>Last message {formatDateTime(selectedThread.last_message_at)}</span>
                  </div>

                  <div className="inbox-message-list" aria-label="Conversation messages">
                    {messagesLoading ? (
                      <div className="queue-empty">
                        <Loader2 className="spin" size={18} />
                        <span>Loading conversation</span>
                      </div>
                    ) : messages.length > 0 ? messages.map((item) => (
                      <article className={`inbox-message ${item.direction}`} key={item.id}>
                        <div>
                          <strong>{directionLabel(item.direction)}</strong>
                          <span>{formatDateTime(item.created_at)}</span>
                        </div>
                        <p>{item.body}</p>
                      </article>
                    )) : (
                      <div className="queue-empty">
                        <MessageSquareReply size={20} />
                        <span>No messages saved for this conversation yet.</span>
                      </div>
                    )}
                  </div>

                  {canWrite ? (
                    <div className="inbox-composer">
                      <div className="library-filter-tabs" aria-label="Message type">
                        <button type="button" className={replyMode === 'outbound' ? 'is-active' : ''} onClick={() => setReplyMode('outbound')}>
                          <span>Reply</span>
                        </button>
                        <button type="button" className={replyMode === 'internal' ? 'is-active' : ''} onClick={() => setReplyMode('internal')}>
                          <span>Note</span>
                        </button>
                        <button type="button" className={replyMode === 'inbound' ? 'is-active' : ''} onClick={() => setReplyMode('inbound')}>
                          <span>Inbound</span>
                        </button>
                      </div>
                      <textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} rows={3} placeholder="Write the next reply or internal note" />
                      <button type="button" className="primary-action" onClick={saveReply} disabled={saving}>
                        {saving ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
                        <span>{saving ? 'Saving' : replyMode === 'internal' ? 'Save note' : 'Save message'}</span>
                      </button>
                    </div>
                  ) : (
                    <p className="form-message warning">Ask an owner, admin, or editor to reply or update Inbox conversations.</p>
                  )}
                </>
              ) : (
                <div className="queue-empty">
                  <Inbox size={20} />
                  <span>Select or create a conversation.</span>
                </div>
              )}
            </div>
          </section>

          {message ? <p className="form-message success">{message}</p> : null}
          {error ? <p className="form-message error">{error}</p> : null}
        </div>
      )}
    </div>
  );
}

function rowMatchesBrand(clientBusinessDnaId: string | null, isAgency: boolean, brandSelectionId: string) {
  if (!isAgency) return true;
  if (brandSelectionId === SELF_BRAND_ID) return !clientBusinessDnaId;
  return clientBusinessDnaId === brandSelectionId;
}

function sortThreads(rows: InboxThreadRow[]) {
  return [...rows].sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
}

function channelToLeadSource(channel: InboxChannel): Database['public']['Tables']['leads']['Row']['source'] {
  if (channel === 'whatsapp') return 'whatsapp';
  if (channel === 'website' || channel === 'email') return 'website';
  if (channel === 'google_ads') return 'ads';
  if (['facebook', 'instagram', 'linkedin', 'youtube', 'slack', 'telegram'].includes(channel)) return 'social';
  return 'other';
}

function channelLabel(value: InboxChannel) {
  return channelOptions.find((channel) => channel.value === value)?.label ?? value.replace('_', ' ');
}

function statusLabel(value: InboxThreadStatus) {
  return statusOptions.find((status) => status.value === value)?.label ?? value.replace('_', ' ');
}

function priorityLabel(value: InboxPriority) {
  return priorityOptions.find((priority) => priority.value === value)?.label ?? value;
}

function directionLabel(value: MessageDirection) {
  if (value === 'outbound') return 'Workspace reply';
  if (value === 'internal') return 'Internal note';
  return 'Customer';
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint, record.code]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    if (parts.length > 0) return parts.join(' - ');
  }
  return fallback;
}
