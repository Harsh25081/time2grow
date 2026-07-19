import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Copy,
  FileText,
  Gauge,
  Image as ImageIcon,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Video,
  Wand2,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import type { Database, Json } from '../../types/database';
import { BrandDnaSelect, SELF_BRAND_ID, useBrandDna } from '../business-dna/useBrandDna';

type BusinessDnaRow = Database['public']['Tables']['business_dna']['Row'];
type ContentItemRow = Database['public']['Tables']['content_items']['Row'];
type CampaignRow = Pick<Database['public']['Tables']['campaigns']['Row'], 'id' | 'name' | 'status' | 'client_business_dna_id'>;
type ContentStatus = ContentItemRow['status'];

type CreatorMode = 'post' | 'video';
type PostTarget = 'linkedin' | 'blog' | 'community';
type ContentLanguage = 'te' | 'en' | 'te-en' | 'hi' | 'hi-en' | 'kn' | 'kn-en';
type PostLength = 'short' | 'standard' | 'long';
type ScriptDuration = '15' | '30' | '45' | '60' | '90';
type LibraryFilter = 'all' | ContentStatus;

type PostVariant = {
  target: PostTarget;
  title: string;
  body: string;
  cta: string;
  hashtags: string[];
  visualConcept: string;
};

type ScriptCharacter = { name: string; role: string; description: string };
type ScriptDialogueLine = { character: string; line: string };
type ScriptScene = {
  sceneNumber: number;
  time: string;
  heading: string;
  visual: string;
  screenplay: string;
  dialogue: ScriptDialogueLine[];
  voiceOver: string;
  screenText: string;
  shotNotes: string;
};

type ViralityPillar = { name: string; score: number; note: string };
type ViralityScore = {
  score: number;
  pillars: ViralityPillar[];
  summary: string;
  revisions: number;
  passed: boolean;
  threshold: number;
};

type ReviewStatus = 'approved' | 'needs_work' | 'blocked';
type ReviewCheckStatus = 'pass' | 'warn' | 'fail';
type ReviewResult = {
  score: number;
  verdict: ReviewStatus;
  summary: string;
  checkedAt: string;
  checks: Array<{ name: string; score: number; status: ReviewCheckStatus; note: string }>;
  fixes: string[];
  evidence: {
    contentType: string;
    visualReviewed: boolean;
    businessDnaUsed: boolean;
  };
};

type PostSource = { url: string };

type GeneratedPost = {
  kind: 'post';
  title: string;
  summary: string;
  variants: PostVariant[];
  virality?: ViralityScore;
  sources?: PostSource[];
};

type GeneratedScript = {
  kind: 'video';
  title: string;
  summary: string;
  duration: string;
  language: string;
  concept: string;
  creativeDirection: string;
  creativeDirectionLabel: string;
  characters: ScriptCharacter[];
  scenes: ScriptScene[];
  finalVoiceOver: string;
  caption: string;
  hashtags: string[];
  whyItWorks: string;
  virality?: ViralityScore;
};

type GeneratedContent = GeneratedPost | GeneratedScript;

const VIRALITY_THRESHOLD = 75;

type PostVisual = {
  imageDataUrl: string;
  imagePrompt: string;
  format: string;
};

type CreatorForm = {
  mode: CreatorMode;
  topic: string;
  postTarget: PostTarget;
  language: ContentLanguage;
  length: PostLength;
  scriptLanguage: ContentLanguage;
  scriptDuration: ScriptDuration;
  scriptType: string;
  tone: string;
  offer: string;
  callToAction: string;
  audience: string;
  keywords: string;
};

type EditingContentItem = {
  id: string;
  title: string;
  body: string;
  status: ContentStatus;
};

const contentWriterRoles = ['owner', 'admin', 'editor'] as const;

const postTargets: Array<{ value: PostTarget; label: string }> = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'blog', label: 'Blog' },
  { value: 'community', label: 'Community' },
];

const scriptDurations: Array<{ value: ScriptDuration; label: string }> = [
  { value: '15', label: '15 sec' },
  { value: '30', label: '30 sec' },
  { value: '45', label: '45 sec' },
  { value: '60', label: '1 min' },
  { value: '90', label: '1.5 min' },
];

const languageOptions: Array<{ value: ContentLanguage; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'te', label: 'Telugu' },
  { value: 'te-en', label: 'Telugu + English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'hi-en', label: 'Hindi + English' },
  { value: 'kn', label: 'Kannada' },
  { value: 'kn-en', label: 'Kannada + English' },
];

const postLengths: PostLength[] = ['short', 'standard', 'long'];

const postLengthLabels: Record<PostLength, string> = {
  short: 'Short',
  standard: 'Standard',
  long: 'Long',
};

// Mirrors the ranges the Edge Function sends to the model, so the dropdown never promises a
// length the agent was not asked for.
const postWordRanges: Record<PostTarget, Record<PostLength, [number, number]>> = {
  linkedin: { short: [60, 110], standard: [120, 200], long: [220, 320] },
  community: { short: [40, 80], standard: [90, 150], long: [160, 240] },
  blog: { short: [300, 500], standard: [600, 900], long: [1000, 1400] },
};

const libraryFilters: Array<{ value: LibraryFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'ready', label: 'Ready' },
  { value: 'draft', label: 'Draft' },
  { value: 'queued', label: 'Queued' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

const statusOptions: Array<{ value: ContentStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'ready', label: 'Ready' },
  { value: 'queued', label: 'Queued' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

const initialForm: CreatorForm = {
  mode: 'post',
  topic: '',
  postTarget: 'linkedin',
  language: 'en',
  length: 'standard',
  scriptLanguage: 'te-en',
  scriptDuration: '30',
  scriptType: 'direct ad',
  tone: 'clear and useful',
  offer: '',
  callToAction: '',
  audience: '',
  keywords: '',
};

export function ContentCreatorPage() {
  const { organization, user, membership } = useAuth();
  const [businessDna, setBusinessDna] = useState<BusinessDnaRow | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [contentItems, setContentItems] = useState<ContentItemRow[]>([]);
  const [form, setForm] = useState<CreatorForm>(initialForm);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [generated, setGenerated] = useState<GeneratedContent | null>(null);
  const [visual, setVisual] = useState<PostVisual | null>(null);
  const [savedMediaUrl, setSavedMediaUrl] = useState('');
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [editingContentItem, setEditingContentItem] = useState<EditingContentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingVisual, setGeneratingVisual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState('');
  const [reviewingItemId, setReviewingItemId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const canWriteContent = contentWriterRoles.some((role) => role === membership?.role);
  const readOnly = Boolean(membership?.role) && !canWriteContent;
  const isAgency = organization?.org_type === 'agency';
  const { clients, selectedClient, selectedId: brandSelectionId, setSelectedId: setBrandSelectionId } = useBrandDna(organization?.id, isAgency);
  const selectedBusinessDna = selectedClient ?? businessDna;
  const clientNameById = useMemo(() => new Map(clients.map((client) => [client.id, client.name])), [clients]);
  const selectedBrandName = selectedClient?.name ?? organization?.name ?? 'Business DNA';

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');

      if (!supabase || !organization?.id) {
        setBusinessDna(null);
        setCampaigns([]);
        setContentItems([]);
        setLoading(false);
        return;
      }

      const [
        { data: dnaData, error: dnaError },
        { data: campaignData, error: campaignError },
        { data: contentData, error: contentError },
      ] = await Promise.all([
        supabase.from('business_dna').select('*').eq('org_id', organization.id).maybeSingle(),
        supabase
          .from('campaigns')
          .select('id, name, status, client_business_dna_id')
          .eq('org_id', organization.id)
          .neq('status', 'archived')
          .order('updated_at', { ascending: false })
          .limit(100),
        supabase
          .from('content_items')
          .select('*')
          .eq('org_id', organization.id)
          .in('content_type', ['post', 'video', 'poster'])
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(24),
      ]);

      if (!active) return;

      if (dnaError) setError(errorMessage(dnaError, 'Could not load Business DNA.'));
      if (campaignError) setError(errorMessage(campaignError, 'Could not load campaigns.'));
      if (contentError) setError(errorMessage(contentError, 'Could not load saved content.'));

      setBusinessDna(dnaData ?? null);
      setCampaigns(campaignData ?? []);
      setContentItems(contentData ?? []);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [organization?.id]);

  const postVariant = generated?.kind === 'post' ? generated.variants[0] ?? null : null;
  const campaignOptions = useMemo(
    () => campaigns.filter((campaign) => campaignMatchesBrand(campaign, isAgency, brandSelectionId)),
    [brandSelectionId, campaigns, isAgency],
  );

  useEffect(() => {
    if (selectedCampaignId && !campaignOptions.some((campaign) => campaign.id === selectedCampaignId)) {
      setSelectedCampaignId('');
    }
  }, [campaignOptions, selectedCampaignId]);

  const contentCounts = useMemo(() => {
    const counts = new Map<LibraryFilter, number>([['all', contentItems.length]]);
    for (const item of contentItems) {
      counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
    }
    return counts;
  }, [contentItems]);

  const visibleContentItems = useMemo(() => {
    if (libraryFilter === 'all') return contentItems;
    return contentItems.filter((item) => item.status === libraryFilter);
  }, [contentItems, libraryFilter]);

  function updateForm<K extends keyof CreatorForm>(key: K, value: CreatorForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handlePostTargetChange(target: PostTarget) {
    // LinkedIn is a professional, mostly English feed, so default it back to English while
    // still letting the user pick Telugu afterwards. Blog/community keep the current language.
    setForm((current) => ({
      ...current,
      postTarget: target,
      language: target === 'linkedin' ? 'en' : current.language,
    }));
  }

  function resetDraft() {
    setGenerated(null);
    setVisual(null);
    setSavedMediaUrl('');
  }

  function switchMode(mode: CreatorMode) {
    setForm((current) => ({ ...current, mode }));
    resetDraft();
    setMessage('');
    setError('');
  }

  function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runGenerate();
  }

  async function runGenerate() {
    if (!supabase || !organization?.id) return;

    if (!canWriteContent) {
      setError('Ask an owner, admin, or editor to create content here.');
      return;
    }

    if (!selectedBusinessDna) {
      setError(isAgency && brandSelectionId !== SELF_BRAND_ID ? 'Save this client Business DNA before generating content.' : 'Save Business DNA before generating content.');
      return;
    }

    if (!form.topic.trim()) {
      setError(form.mode === 'post' ? 'Enter a post brief first.' : 'Enter a video script brief first.');
      return;
    }

    setGenerating(true);
    setMessage('');
    setError('');

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ai-handler', {
        body: {
          action: 'generate_content',
          orgId: organization.id,
          clientBusinessDnaId: selectedClient?.id ?? null,
          contentType: form.mode,
          topic: form.topic,
          postTarget: form.postTarget,
          language: form.language,
          length: form.length,
          scriptLanguage: form.scriptLanguage,
          scriptDuration: form.scriptDuration,
          scriptType: form.scriptType,
          tone: form.tone,
          offer: form.offer,
          callToAction: form.callToAction,
          audience: form.audience,
          keywords: form.keywords,
          previousCreativeDirection: readPreviousCreativeDirection(organization.id),
        },
      });

      if (invokeError) throw new Error(await edgeFunctionErrorMessage(invokeError, 'ai-handler'));

      const content = normalizeGeneratedContent(data?.content);
      if (!content) throw new Error('AI did not return usable content.');

      if (content.kind === 'video') rememberCreativeDirection(organization.id, content.creativeDirection);

      resetDraft();
      setGenerated(content);
      setMessage(form.mode === 'post' ? 'Post generated.' : 'Video script generated.');
    } catch (generateError) {
      setError(errorMessage(generateError, 'Could not generate content.'));
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateVisual() {
    if (!supabase || !organization?.id || !postVariant) return;

    if (!canWriteContent) {
      setError('Ask an owner, admin, or editor to create visuals here.');
      return;
    }

    setGeneratingVisual(true);
    setMessage('');
    setError('');

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ai-handler', {
        body: {
          action: 'generate_post_visual',
          orgId: organization.id,
          clientBusinessDnaId: selectedClient?.id ?? null,
          target: postVariant.target,
          topic: form.topic,
          postBody: postVariant.body,
          visualConcept: postVariant.visualConcept,
          tone: form.tone,
          audience: form.audience,
        },
      });

      if (invokeError) throw new Error(await edgeFunctionErrorMessage(invokeError, 'ai-handler'));

      const nextVisual = normalizeVisual(data?.visual);
      if (!nextVisual) throw new Error('AI did not return a usable image.');

      setVisual(nextVisual);
      setSavedMediaUrl('');
      setMessage('Visual generated.');
    } catch (visualError) {
      setError(errorMessage(visualError, 'Could not generate the visual.'));
    } finally {
      setGeneratingVisual(false);
    }
  }

  async function uploadVisual(title: string) {
    if (!supabase || !organization?.id || !visual) return null;

    const blob = await fetch(visual.imageDataUrl).then((response) => response.blob());
    const storagePath = `${organization.id}/content-studio/${Date.now()}-${safeFileName(title)}.png`;

    const { error: uploadError } = await supabase.storage
      .from('post-media')
      .upload(storagePath, blob, { cacheControl: '3600', contentType: 'image/png', upsert: false });
    if (uploadError) throw new Error(errorMessage(uploadError, 'Could not upload the visual.'));

    const { data: signed } = await supabase.storage
      .from('post-media')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    return signed?.signedUrl ?? null;
  }

  async function handleSaveDraft() {
    if (!supabase || !organization?.id || !user?.id || !generated) return;

    if (!canWriteContent) {
      setError('Ask an owner, admin, or editor to save content here.');
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    try {
      const title = draftTitle(generated) || form.topic;
      const mediaUrl = visual ? await uploadVisual(title) : null;

      const { data, error: saveError } = await supabase
        .from('content_items')
        .insert({
          org_id: organization.id,
          client_business_dna_id: selectedClient?.id ?? null,
          campaign_id: selectedCampaignId || null,
          content_type: generated.kind === 'video' ? 'video' : 'post',
          title,
          body: renderContentToText(generated),
          media_url: mediaUrl,
          metadata: buildMetadata(generated, visual, {
            source: selectedClient ? 'client_business_dna' : 'business_dna',
            clientBusinessDnaId: selectedClient?.id ?? null,
            name: selectedBrandName,
          }, selectedCampaignId || null),
          status: 'ready',
          created_by: user.id,
        })
        .select('*')
        .single();

      if (saveError) throw saveError;

      setContentItems((current) => [data, ...current].slice(0, 24));
      if (mediaUrl) setSavedMediaUrl(mediaUrl);
      setMessage('Saved to Content Studio.');
    } catch (saveError) {
      setError(errorMessage(saveError, 'Could not save content.'));
    } finally {
      setSaving(false);
    }
  }

  function loadSavedItem(item: ContentItemRow) {
    const restored = restoreGeneratedContent(item.metadata);

    setForm((current) => ({ ...current, mode: item.content_type === 'video' ? 'video' : 'post' }));
    if (isAgency) setBrandSelectionId(item.client_business_dna_id ?? SELF_BRAND_ID);
    setSelectedCampaignId(item.campaign_id ?? '');
    setVisual(null);
    setSavedMediaUrl(item.media_url ?? '');

    if (restored) {
      setGenerated(restored);
      setMessage('Loaded saved item into the draft preview.');
    } else {
      // Items saved before structured metadata existed only ever had plain text.
      setGenerated({
        kind: 'post',
        title: item.title,
        summary: 'Saved library item',
        variants: [
          {
            target: form.postTarget,
            title: item.title,
            body: item.body ?? '',
            cta: '',
            hashtags: [],
            visualConcept: '',
          },
        ],
      });
      setMessage('Loaded saved item as plain text.');
    }

    setError('');
  }

  function startEditingItem(item: ContentItemRow) {
    if (!canWriteContent) return;
    setEditingContentItem({
      id: item.id,
      title: item.title,
      body: item.body ?? '',
      status: item.status,
    });
    setMessage('');
    setError('');
  }

  async function handleUpdateContentItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !organization?.id || !editingContentItem) return;

    if (!canWriteContent) {
      setError('Ask an owner, admin, or editor to update content here.');
      return;
    }

    const title = editingContentItem.title.trim();
    if (!title) {
      setError('Enter a title before saving this content item.');
      return;
    }

    setUpdatingItemId(editingContentItem.id);
    setMessage('');
    setError('');

    try {
      const { data, error: updateError } = await supabase
        .from('content_items')
        .update({
          title,
          body: editingContentItem.body.trim() || null,
          status: editingContentItem.status,
          // Hand-edited text and the structured draft would otherwise disagree forever.
          metadata: null,
        })
        .eq('id', editingContentItem.id)
        .eq('org_id', organization.id)
        .select('*')
        .single();

      if (updateError) throw updateError;

      setContentItems((current) => current.map((item) => (item.id === data.id ? data : item)));
      setEditingContentItem(null);
      setMessage('Content item updated.');
    } catch (updateError) {
      setError(errorMessage(updateError, 'Could not update content item.'));
    } finally {
      setUpdatingItemId('');
    }
  }

  async function handleArchiveToggle(item: ContentItemRow) {
    if (!supabase || !organization?.id) return;

    if (!canWriteContent) {
      setError('Ask an owner, admin, or editor to archive content here.');
      return;
    }

    const nextStatus: ContentStatus = item.status === 'archived' ? 'draft' : 'archived';
    setUpdatingItemId(item.id);
    setMessage('');
    setError('');

    try {
      const { data, error: updateError } = await supabase
        .from('content_items')
        .update({ status: nextStatus })
        .eq('id', item.id)
        .eq('org_id', organization.id)
        .select('*')
        .single();

      if (updateError) throw updateError;

      setContentItems((current) => current.map((contentItem) => (contentItem.id === data.id ? data : contentItem)));
      if (editingContentItem?.id === item.id) setEditingContentItem(null);
      setMessage(nextStatus === 'archived' ? 'Content item archived.' : 'Content item restored.');
    } catch (updateError) {
      setError(errorMessage(updateError, 'Could not update content item.'));
    } finally {
      setUpdatingItemId('');
    }
  }

  async function handleReviewItem(item: ContentItemRow) {
    if (!supabase || !organization?.id) return;

    if (!canWriteContent) {
      setError('Ask an owner, admin, or editor to review content here.');
      return;
    }

    if (!businessDna && !item.client_business_dna_id) {
      setError('Save Business DNA before reviewing content.');
      return;
    }

    setReviewingItemId(item.id);
    setMessage('');
    setError('');

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ai-handler', {
        body: {
          action: 'review_asset',
          orgId: organization.id,
          contentItemId: item.id,
        },
      });

      if (invokeError) throw new Error(await edgeFunctionErrorMessage(invokeError, 'ai-handler'));

      const review = normalizeReview(data?.review);
      if (!review) throw new Error('AI did not return a usable review.');

      const nextMetadata = normalizeMetadata(data?.contentItem?.metadata) ?? withReviewMetadata(item.metadata, review);
      setContentItems((current) => current.map((contentItem) => (
        contentItem.id === item.id ? { ...contentItem, metadata: nextMetadata } : contentItem
      )));
      setMessage(`Review complete: ${review.score}/100.`);
    } catch (reviewError) {
      setError(errorMessage(reviewError, 'Could not review this content.'));
    } finally {
      setReviewingItemId('');
    }
  }

  async function handleCopy() {
    if (!generated) return;
    await navigator.clipboard?.writeText(renderContentToText(generated)).catch(() => null);
    setMessage('Copied.');
  }

  async function copyItemBody(item: ContentItemRow) {
    if (!item.body) return;
    await navigator.clipboard?.writeText(item.body).catch(() => null);
    setMessage('Copied.');
  }

  const previewImage = visual?.imageDataUrl || savedMediaUrl;

  return (
    <div className="page-stack content-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Create</p>
          <h2>Content Studio</h2>
        </div>
        <span className={readOnly || !selectedBusinessDna ? 'status-pill warning' : 'status-pill success'}>
          {readOnly ? 'Read only' : selectedBusinessDna ? `DNA ready: ${selectedBrandName}` : 'DNA needed'}
        </span>
      </header>

      {loading ? (
        <section className="empty-state" aria-label="Loading Content Studio">
          <Loader2 className="spin" size={28} />
          <h3>Loading Content Studio</h3>
        </section>
      ) : (
        <div className="content-creator-grid">
          <section className="draft-panel creator-panel" aria-label="Generate content">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Prompt</p>
                <h3>{form.mode === 'post' ? 'Post writer' : 'Video script writer'}</h3>
              </div>
              <Wand2 size={21} />
            </div>

            <div className="content-mode-switch" role="tablist" aria-label="Content type">
              <button type="button" role="tab" aria-selected={form.mode === 'post'} className={form.mode === 'post' ? 'is-active' : ''} onClick={() => switchMode('post')}>
                <FileText size={16} />
                <span>Post</span>
              </button>
              <button type="button" role="tab" aria-selected={form.mode === 'video'} className={form.mode === 'video' ? 'is-active' : ''} onClick={() => switchMode('video')}>
                <Video size={16} />
                <span>Video script</span>
              </button>
            </div>

            {readOnly ? <p className="form-message warning">Ask an owner, admin, or editor to create and save content.</p> : null}

            <form className="draft-form creator-form" onSubmit={handleGenerate}>
              {isAgency ? (
                <BrandDnaSelect
                  label="Content for"
                  selfLabel={organization?.name ?? 'Agency brand'}
                  clients={clients}
                  value={brandSelectionId}
                  onChange={setBrandSelectionId}
                />
              ) : null}

              <CampaignSelect
                campaigns={campaignOptions}
                value={selectedCampaignId}
                onChange={setSelectedCampaignId}
              />

              <label className="draft-body-field">
                <span>{form.mode === 'post' ? 'Post brief' : 'Script brief'}</span>
                <textarea
                  value={form.topic}
                  onChange={(event) => updateForm('topic', event.target.value)}
                  rows={4}
                  placeholder={form.mode === 'post' ? 'Example: LinkedIn post for local business owners about festive campaign planning' : 'Example: 30 sec Telugu ad script for salon festive offer'}
                />
              </label>

              {form.mode === 'post' ? (
                <>
                  <label>
                    <span>Post type</span>
                    <select value={form.postTarget} onChange={(event) => handlePostTargetChange(event.target.value as PostTarget)}>
                      {postTargets.map((target) => <option key={target.value} value={target.value}>{target.label}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Length</span>
                    <select value={form.length} onChange={(event) => updateForm('length', event.target.value as PostLength)}>
                      {postLengths.map((length) => (
                        <option key={length} value={length}>
                          {postLengthLabels[length]} ({postWordRanges[form.postTarget][length][0]}-{postWordRanges[form.postTarget][length][1]} words)
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Language</span>
                    <select value={form.language} onChange={(event) => updateForm('language', event.target.value as ContentLanguage)}>
                      {languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <label>
                    <span>Language</span>
                    <select value={form.scriptLanguage} onChange={(event) => updateForm('scriptLanguage', event.target.value as ContentLanguage)}>
                      {languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Duration</span>
                    <select value={form.scriptDuration} onChange={(event) => updateForm('scriptDuration', event.target.value as ScriptDuration)}>
                      {scriptDurations.map((duration) => <option key={duration.value} value={duration.value}>{duration.label}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Script type</span>
                    <select value={form.scriptType} onChange={(event) => updateForm('scriptType', event.target.value)}>
                      <option value="direct ad">Direct ad</option>
                      <option value="story ad">Story ad</option>
                      <option value="cartoon ad">Cartoon ad</option>
                      <option value="family emotion ad">Family emotion ad</option>
                      <option value="showroom ad">Showroom ad</option>
                      <option value="educational short">Educational short</option>
                    </select>
                  </label>
                </>
              )}

              <label>
                <span>Tone</span>
                <select value={form.tone} onChange={(event) => updateForm('tone', event.target.value)}>
                  <option value="clear and useful">Clear</option>
                  <option value="friendly and simple">Friendly</option>
                  <option value="premium and confident">Premium</option>
                  <option value="local and conversational">Local</option>
                  <option value="high energy">High energy</option>
                </select>
              </label>

              <label>
                <span>Audience</span>
                <input value={form.audience} onChange={(event) => updateForm('audience', event.target.value)} placeholder="Optional. Who is this for?" />
              </label>

              <label>
                <span>Keywords</span>
                <input value={form.keywords} onChange={(event) => updateForm('keywords', event.target.value)} placeholder="Optional. Comma separated" />
              </label>

              <label>
                <span>Offer</span>
                <input value={form.offer} onChange={(event) => updateForm('offer', event.target.value)} placeholder="Optional" />
              </label>

              <label>
                <span>CTA</span>
                <input value={form.callToAction} onChange={(event) => updateForm('callToAction', event.target.value)} placeholder="Book a call, DM us, visit site" />
              </label>

              <button className="primary-action draft-body-field" type="submit" disabled={generating || !selectedBusinessDna || !canWriteContent}>
                {generating ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
                <span>{generating ? 'Generating' : form.mode === 'post' ? 'Generate post' : 'Generate script'}</span>
              </button>
            </form>

            {message ? <p className="form-message success">{message}</p> : null}
            {error ? <p className="form-message error">{error}</p> : null}
          </section>

          <section className="draft-panel creator-panel result-panel" aria-label="Generated content">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Draft</p>
                <h3>{generated?.title || (form.mode === 'post' ? 'Generated post' : 'Generated script')}</h3>
              </div>
              <Sparkles size={21} />
            </div>

            {generated ? (
              <>
                {generated.virality ? <ViralityBadge virality={generated.virality} /> : null}
                {generated.kind === 'post' && postVariant ? (
                  <>
                    <article className="generated-draft">
                      <h4>{postVariant.title}</h4>
                      {generated.summary ? <span className="generated-summary">{generated.summary}</span> : null}
                      <p>{postVariant.body}</p>
                      {postVariant.cta ? (
                        <p className="draft-cta">
                          <strong>CTA:</strong> {postVariant.cta}
                        </p>
                      ) : null}
                      <HashtagChips hashtags={postVariant.hashtags} />
                      {generated.sources && generated.sources.length > 0 ? (
                        <div className="post-sources">
                          <span className="post-sources__label">Sources researched</span>
                          <ul>
                            {generated.sources.map((source) => (
                              <li key={source.url}>
                                <a href={source.url} target="_blank" rel="noreferrer noopener">{source.url}</a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </article>

                    <div className="visual-slot">
                      {previewImage ? (
                        <img className="visual-preview" src={previewImage} alt={postVariant.visualConcept || 'Post visual'} />
                      ) : (
                        <div className="visual-placeholder">
                          <ImageIcon size={24} />
                          <span>{postVariant.visualConcept || 'No visual yet.'}</span>
                        </div>
                      )}

                      <div className="creator-actions">
                        <button
                          type="button"
                          className="icon-text-button"
                          onClick={handleGenerateVisual}
                          disabled={generatingVisual || !canWriteContent}
                        >
                          {generatingVisual ? <Loader2 className="spin" size={16} /> : <ImageIcon size={16} />}
                          <span>{generatingVisual ? 'Rendering' : visual ? 'Regenerate visual' : 'Generate visual'}</span>
                        </button>
                        {visual ? (
                          <button type="button" className="icon-text-button" onClick={() => setVisual(null)} disabled={generatingVisual}>
                            <Trash2 size={16} />
                            <span>Remove</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </>
                ) : null}

                {generated.kind === 'video' ? <ScriptView script={generated} /> : null}

                <div className="creator-actions">
                  <button type="button" className="icon-text-button" onClick={handleCopy}>
                    <Copy size={16} />
                    <span>Copy</span>
                  </button>
                  <button type="button" className="icon-text-button" onClick={runGenerate} disabled={generating || !canWriteContent}>
                    {generating ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
                    <span>{generating ? 'Generating' : 'Regenerate'}</span>
                  </button>
                  <button type="button" className="icon-text-button" onClick={handleSaveDraft} disabled={saving || generatingVisual || !canWriteContent}>
                    {saving ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
                    <span>{saving ? 'Saving' : 'Save to library'}</span>
                  </button>
                  <Link className="icon-text-button" to="/social">
                    <Send size={16} />
                    <span>Social Hub</span>
                  </Link>
                </div>
              </>
            ) : (
              <div className="empty-state creator-empty">
                <Sparkles size={30} />
                <h3>No draft yet</h3>
              </div>
            )}
          </section>

          <section className="draft-panel saved-content-panel" aria-label="Saved content">
            <div className="section-heading content-library-heading">
              <div>
                <p className="eyebrow">Library</p>
                <h3>Saved content</h3>
              </div>
              <div className="content-library-actions">
                <div className="library-filter-tabs" aria-label="Filter saved content">
                  {libraryFilters.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      className={libraryFilter === filter.value ? 'is-active' : ''}
                      onClick={() => setLibraryFilter(filter.value)}
                    >
                      <span>{filter.label}</span>
                      <small>{contentCounts.get(filter.value) ?? 0}</small>
                    </button>
                  ))}
                </div>
                <Link className="icon-text-button" to="/social">
                  <Send size={16} />
                  <span>Social Hub</span>
                </Link>
              </div>
            </div>

            {editingContentItem ? (
              <form className="content-edit-form" onSubmit={handleUpdateContentItem} aria-label="Edit saved content">
                <label>
                  <span>Title</span>
                  <input
                    value={editingContentItem.title}
                    onChange={(event) => setEditingContentItem((current) => current ? { ...current, title: event.target.value } : current)}
                  />
                </label>
                <label>
                  <span>Status</span>
                  <select
                    value={editingContentItem.status}
                    onChange={(event) => setEditingContentItem((current) => current ? { ...current, status: event.target.value as ContentStatus } : current)}
                  >
                    {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                  </select>
                </label>
                <label className="draft-body-field">
                  <span>Body</span>
                  <textarea
                    rows={5}
                    value={editingContentItem.body}
                    onChange={(event) => setEditingContentItem((current) => current ? { ...current, body: event.target.value } : current)}
                  />
                </label>
                <div className="creator-actions draft-body-field">
                  <button type="button" className="icon-text-button" onClick={() => setEditingContentItem(null)}>
                    <X size={16} />
                    <span>Cancel</span>
                  </button>
                  <button type="submit" className="icon-text-button" disabled={updatingItemId === editingContentItem.id}>
                    {updatingItemId === editingContentItem.id ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
                    <span>{updatingItemId === editingContentItem.id ? 'Saving' : 'Save changes'}</span>
                  </button>
                </div>
              </form>
            ) : null}

            <div className="saved-content-list">
              {visibleContentItems.length > 0 ? visibleContentItems.map((item) => {
                const review = itemReview(item.metadata);
                return (
                  <article className={`saved-content-row ${item.status === 'archived' ? 'is-archived' : ''}`} key={item.id}>
                    <div className="saved-content-row__main">
                      <strong>{item.title}</strong>
                      <p>{item.body || 'No body text saved.'}</p>
                      <div className="saved-content-row__meta">
                        <span>{contentTypeLabel(item.content_type)}</span>
                        {isAgency ? <span>{item.client_business_dna_id ? clientNameById.get(item.client_business_dna_id) ?? 'Client brand' : organization?.name ?? 'Agency brand'}</span> : null}
                        <span>{contentStatusLabel(item.status)}</span>
                        <ViralityChip score={itemViralityScore(item.metadata)} />
                        <ReviewChip review={review} />
                      </div>
                      <ReviewSummary review={review} />
                    </div>
                    <div className="saved-content-row__side">
                      <small>{formatDate(item.created_at)}</small>
                      <div className="saved-content-row__actions">
                        <button type="button" className="icon-text-button" onClick={() => loadSavedItem(item)}>
                          <CheckCircle2 size={16} />
                          <span>Preview</span>
                        </button>
                        <button type="button" className="icon-text-button" onClick={() => copyItemBody(item)}>
                          <Copy size={16} />
                          <span>Copy</span>
                        </button>
                        {canWriteContent ? (
                          <>
                            <button type="button" className="icon-text-button" disabled={reviewingItemId === item.id || updatingItemId === item.id} onClick={() => handleReviewItem(item)}>
                              {reviewingItemId === item.id ? <Loader2 className="spin" size={16} /> : <ShieldCheck size={16} />}
                              <span>{reviewingItemId === item.id ? 'Reviewing' : review ? 'Review again' : 'Review'}</span>
                            </button>
                            <button type="button" className="icon-text-button" onClick={() => startEditingItem(item)}>
                              <Pencil size={16} />
                              <span>Edit</span>
                            </button>
                            <button type="button" className="icon-text-button" disabled={updatingItemId === item.id} onClick={() => handleArchiveToggle(item)}>
                              {updatingItemId === item.id ? <Loader2 className="spin" size={16} /> : item.status === 'archived' ? <RotateCcw size={16} /> : <Archive size={16} />}
                              <span>{item.status === 'archived' ? 'Restore' : 'Archive'}</span>
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              }) : (
                <div className="queue-empty">
                  <Sparkles size={20} />
                  <span>{contentItems.length > 0 ? 'No saved items match this filter.' : 'No saved drafts yet.'}</span>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function HashtagChips({ hashtags }: { hashtags: string[] }) {
  if (hashtags.length === 0) return null;
  return (
    <div className="hashtag-chips">
      {hashtags.map((hashtag) => <span key={hashtag}>#{hashtag}</span>)}
    </div>
  );
}

function ViralityBadge({ virality }: { virality: ViralityScore }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`virality-badge ${virality.passed ? 'is-strong' : 'is-weak'}`}>
      <button type="button" className="virality-badge__head" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <Gauge size={16} />
        <strong>Virality {virality.score}/100</strong>
        <span className="virality-badge__state">
          {virality.passed ? `Meets target (${virality.threshold})` : `Below target (${virality.threshold})`}
          {virality.revisions > 0 ? ` · revised ${virality.revisions}×` : ''}
        </span>
        {virality.summary ? <span className="virality-badge__summary">{virality.summary}</span> : null}
        {virality.pillars.length > 0 ? <span className="virality-badge__toggle">{open ? 'Hide' : 'Details'}</span> : null}
      </button>
      {open && virality.pillars.length > 0 ? (
        <ul className="virality-pillars">
          {virality.pillars.map((pillar) => (
            <li key={pillar.name}>
              <span className="virality-pillars__name">{pillar.name}</span>
              <span className="virality-pillars__score">{pillar.score}</span>
              {pillar.note ? <span className="virality-pillars__note">{pillar.note}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ViralityChip({ score }: { score: number | null }) {
  if (score === null) return null;
  return <span className={`virality-chip ${score >= VIRALITY_THRESHOLD ? 'is-strong' : 'is-weak'}`}>Virality {score}</span>;
}

function ReviewChip({ review }: { review: ReviewResult | null }) {
  if (!review) return null;
  const strong = review.verdict === 'approved' && review.score >= 80;
  return <span className={`review-chip ${strong ? 'is-strong' : review.verdict === 'blocked' ? 'is-blocked' : 'is-weak'}`}>Review {review.score}</span>;
}

function ReviewSummary({ review }: { review: ReviewResult | null }) {
  if (!review) return null;
  const topFix = review.fixes[0] || review.checks.find((check) => check.status !== 'pass')?.note || '';
  return (
    <div className={`review-summary review-summary--${review.verdict}`}>
      <div>
        <ShieldCheck size={16} />
        <strong>{reviewVerdictLabel(review.verdict)}</strong>
        <span>{review.summary}</span>
      </div>
      {topFix ? <p>{topFix}</p> : null}
      <small>{review.evidence.visualReviewed ? 'Image reviewed' : 'Text review only'} · {formatDate(review.checkedAt)}</small>
    </div>
  );
}

function CampaignSelect({ campaigns, value, onChange }: { campaigns: CampaignRow[]; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span>Campaign</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">No campaign selected</option>
        {campaigns.map((campaign) => (
          <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
        ))}
      </select>
    </label>
  );
}

function campaignMatchesBrand(campaign: CampaignRow, isAgency: boolean, brandSelectionId: string) {
  if (!isAgency) return true;
  if (brandSelectionId === SELF_BRAND_ID) return !campaign.client_business_dna_id;
  return campaign.client_business_dna_id === brandSelectionId;
}

function itemViralityScore(metadata: Json | null): number | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const virality = (metadata as Record<string, unknown>).virality;
  if (!virality || typeof virality !== 'object' || Array.isArray(virality)) return null;
  const score = (virality as Record<string, unknown>).score;
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  return Math.min(100, Math.max(0, Math.round(score)));
}

function itemReview(metadata: Json | null): ReviewResult | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return normalizeReview((metadata as Record<string, unknown>).review);
}

function normalizeReview(value: unknown): ReviewResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const verdict = stringChoice<ReviewStatus>(record.verdict, ['approved', 'needs_work', 'blocked']);
  const evidence = record.evidence && typeof record.evidence === 'object' && !Array.isArray(record.evidence)
    ? record.evidence as Record<string, unknown>
    : {};
  const checks = Array.isArray(record.checks)
    ? record.checks
        .map((check) => {
          if (!check || typeof check !== 'object' || Array.isArray(check)) return null;
          const checkRecord = check as Record<string, unknown>;
          const status = stringChoice<ReviewCheckStatus>(checkRecord.status, ['pass', 'warn', 'fail']);
          const name = stringValue(checkRecord.name).slice(0, 80);
          if (!name || !status) return null;
          return {
            name,
            score: clampScore(checkRecord.score),
            status,
            note: stringValue(checkRecord.note).slice(0, 260),
          };
        })
        .filter((check): check is ReviewResult['checks'][number] => Boolean(check))
    : [];

  if (!verdict || checks.length === 0) return null;
  return {
    score: clampScore(record.score),
    verdict,
    summary: stringValue(record.summary).slice(0, 500),
    checkedAt: stringValue(record.checkedAt) || new Date().toISOString(),
    checks,
    fixes: Array.isArray(record.fixes) ? record.fixes.map((fix) => stringValue(fix).slice(0, 180)).filter(Boolean).slice(0, 6) : [],
    evidence: {
      contentType: stringValue(evidence.contentType).slice(0, 40),
      visualReviewed: evidence.visualReviewed === true,
      businessDnaUsed: evidence.businessDnaUsed === true,
    },
  };
}

function normalizeMetadata(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : null;
}

function withReviewMetadata(metadata: Json | null, review: ReviewResult): Json {
  return {
    ...(metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata as Record<string, Json | undefined> : {}),
    review: review as unknown as Json,
  };
}

function contentTypeLabel(value: ContentItemRow['content_type']) {
  return {
    post: 'Post',
    video: 'Video script',
    poster: 'Poster',
  }[value];
}

function reviewVerdictLabel(value: ReviewStatus) {
  return {
    approved: 'Approved',
    needs_work: 'Needs work',
    blocked: 'Blocked',
  }[value];
}

function stringChoice<T extends string>(value: unknown, allowed: T[]) {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : null;
}

function ScriptView({ script }: { script: GeneratedScript }) {
  return (
    <article className="generated-draft script-draft">
      <div className="script-meta">
        {script.duration ? <span>{script.duration}</span> : null}
        {script.language ? <span>{languageLabel(script.language)}</span> : null}
        {script.creativeDirectionLabel ? <span>{script.creativeDirectionLabel}</span> : null}
      </div>

      {script.concept ? <p className="script-concept">{script.concept}</p> : null}

      {script.characters.length > 0 ? (
        <section className="script-characters">
          <h5>Characters</h5>
          <ul>
            {script.characters.map((character) => (
              <li key={character.name}>
                <strong>{character.name}</strong>
                {character.role ? <em>{character.role}</em> : null}
                {character.description ? <span>{character.description}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="scene-list">
        {script.scenes.map((scene) => (
          <section className="scene-card" key={scene.sceneNumber}>
            <header>
              <span className="scene-number">Scene {scene.sceneNumber}</span>
              {scene.time ? <span className="scene-time">{scene.time}</span> : null}
              {scene.heading ? <h5>{scene.heading}</h5> : null}
            </header>

            <ScriptField label="Visual" value={scene.visual} />
            <ScriptField label="Action" value={scene.screenplay} />

            {scene.dialogue.length > 0 ? (
              <div className="scene-field">
                <span className="scene-field__label">Dialogue</span>
                <ul className="scene-dialogue">
                  {scene.dialogue.map((line, index) => (
                    <li key={`${scene.sceneNumber}-${index}`}>
                      <strong>{line.character}</strong>
                      <span>{line.line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <ScriptField label="Voice-over" value={scene.voiceOver} />
            <ScriptField label="Screen text" value={scene.screenText} />
            <ScriptField label="Shot notes" value={scene.shotNotes} />
          </section>
        ))}
      </div>

      <ScriptField label="Final voice-over" value={script.finalVoiceOver} />
      <ScriptField label="Caption" value={script.caption} />
      <HashtagChips hashtags={script.hashtags} />
      <ScriptField label="Why it works" value={script.whyItWorks} />
    </article>
  );
}

function ScriptField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="scene-field">
      <span className="scene-field__label">{label}</span>
      <p>{value}</p>
    </div>
  );
}

function languageLabel(value: string) {
  return languageOptions.find((option) => option.value === value)?.label ?? value;
}

function draftTitle(content: GeneratedContent) {
  if (content.kind === 'post') return content.variants[0]?.title || content.title;
  return content.title;
}

function buildMetadata(
  content: GeneratedContent,
  visual: PostVisual | null,
  brand: { source: 'business_dna' | 'client_business_dna'; clientBusinessDnaId: string | null; name: string },
  campaignId: string | null,
): Json {
  const base = { ...content } as unknown as Record<string, Json>;
  base.brand = brand as unknown as Json;
  if (campaignId) base.campaignId = campaignId;
  if (visual) base.visual = { imagePrompt: visual.imagePrompt, format: visual.format };
  return base as Json;
}

function renderContentToText(content: GeneratedContent) {
  if (content.kind === 'post') return renderPostToText(content);
  return renderScriptToText(content);
}

function renderPostToText(post: GeneratedPost) {
  const variant = post.variants[0];
  if (!variant) return '';

  const lines = [variant.body];
  if (variant.cta) lines.push(variant.cta);
  if (variant.hashtags.length > 0) lines.push(variant.hashtags.map((hashtag) => `#${hashtag}`).join(' '));
  return lines.join('\n\n');
}

function renderScriptToText(script: GeneratedScript) {
  const lines: string[] = [];
  const header = [script.title, script.duration, languageLabel(script.language)].filter(Boolean).join(' - ');
  if (header) lines.push(header);
  if (script.concept) lines.push(script.concept);

  if (script.characters.length > 0) {
    lines.push('Characters');
    for (const character of script.characters) {
      lines.push([character.name, character.role, character.description].filter(Boolean).join(' - '));
    }
  }

  for (const scene of script.scenes) {
    lines.push([`Scene ${scene.sceneNumber}`, scene.time, scene.heading].filter(Boolean).join(' - '));
    if (scene.visual) lines.push(`Visual: ${scene.visual}`);
    if (scene.screenplay) lines.push(`Action: ${scene.screenplay}`);
    for (const line of scene.dialogue) lines.push(`${line.character}: ${line.line}`);
    if (scene.voiceOver) lines.push(`Voice-over: ${scene.voiceOver}`);
    if (scene.screenText) lines.push(`Screen text: ${scene.screenText}`);
    if (scene.shotNotes) lines.push(`Shot notes: ${scene.shotNotes}`);
  }

  if (script.finalVoiceOver) lines.push(`Final voice-over: ${script.finalVoiceOver}`);
  if (script.caption) lines.push(`Caption: ${script.caption}`);
  if (script.hashtags.length > 0) lines.push(script.hashtags.map((hashtag) => `#${hashtag}`).join(' '));
  if (script.whyItWorks) lines.push(`Why it works: ${script.whyItWorks}`);

  return lines.join('\n\n');
}

function restoreGeneratedContent(metadata: Json | null): GeneratedContent | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return normalizeGeneratedContent(metadata);
}

function normalizeVisual(value: unknown): PostVisual | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const imageDataUrl = stringValue(record.imageDataUrl);
  if (!imageDataUrl.startsWith('data:image/')) return null;
  return { imageDataUrl, imagePrompt: stringValue(record.imagePrompt), format: stringValue(record.format) };
}

function normalizeGeneratedContent(value: unknown): GeneratedContent | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.kind === 'video') return normalizeScript(record);
  return normalizePost(record);
}

function normalizePost(record: Record<string, unknown>): GeneratedPost | null {
  const variants = Array.isArray(record.variants)
    ? record.variants.map(normalizeVariant).filter((variant): variant is PostVariant => Boolean(variant))
    : [];
  if (variants.length === 0) return null;

  return {
    kind: 'post',
    title: stringValue(record.title) || variants[0].title,
    summary: stringValue(record.summary),
    variants,
    virality: normalizeVirality(record.virality),
    sources: normalizeSources(record.sources),
  };
}

function normalizeSources(value: unknown): PostSource[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const url = stringValue((item as Record<string, unknown>).url);
      return /^https?:\/\//i.test(url) ? { url } : null;
    })
    .filter((source): source is PostSource => Boolean(source));
}

function normalizeVariant(value: unknown): PostVariant | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const target = targetValue(record.target) || targetValue(record.platform);
  const body = stringValue(record.body);
  if (!target || !body) return null;

  return {
    target,
    title: stringValue(record.title) || targetLabel(target),
    body,
    cta: stringValue(record.cta),
    hashtags: stringArray(record.hashtags),
    visualConcept: stringValue(record.visualConcept),
  };
}

function normalizeScript(record: Record<string, unknown>): GeneratedScript | null {
  const scenes = Array.isArray(record.scenes)
    ? record.scenes.map(normalizeScene).filter((scene): scene is ScriptScene => Boolean(scene))
    : [];
  if (scenes.length === 0) return null;

  const concept = stringValue(record.concept);

  return {
    kind: 'video',
    title: stringValue(record.title),
    summary: stringValue(record.summary) || concept,
    duration: stringValue(record.duration),
    language: stringValue(record.language),
    concept,
    creativeDirection: stringValue(record.creativeDirection),
    creativeDirectionLabel: stringValue(record.creativeDirectionLabel),
    characters: Array.isArray(record.characters)
      ? record.characters.map(normalizeCharacter).filter((character): character is ScriptCharacter => Boolean(character))
      : [],
    scenes,
    finalVoiceOver: stringValue(record.finalVoiceOver),
    caption: stringValue(record.caption),
    hashtags: stringArray(record.hashtags),
    whyItWorks: stringValue(record.whyItWorks),
    virality: normalizeVirality(record.virality),
  };
}

function normalizeVirality(value: unknown): ViralityScore | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.score !== 'number' && typeof record.score !== 'string') return undefined;
  const pillars = Array.isArray(record.pillars)
    ? record.pillars
        .map((pillar) => {
          if (!pillar || typeof pillar !== 'object') return null;
          const item = pillar as Record<string, unknown>;
          const name = stringValue(item.name);
          if (!name) return null;
          return { name, score: clampScore(item.score), note: stringValue(item.note) };
        })
        .filter((pillar): pillar is ViralityPillar => Boolean(pillar))
    : [];
  const score = clampScore(record.score);
  const threshold = typeof record.threshold === 'number' ? record.threshold : VIRALITY_THRESHOLD;
  return {
    score,
    pillars,
    summary: stringValue(record.summary),
    revisions: typeof record.revisions === 'number' ? record.revisions : 0,
    // Older saved items have no `passed`; derive it from the score vs threshold.
    passed: typeof record.passed === 'boolean' ? record.passed : score >= threshold,
    threshold,
  };
}

function clampScore(value: unknown) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(100, Math.max(0, Math.round(num)));
}

function normalizeCharacter(value: unknown): ScriptCharacter | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const name = stringValue(record.name);
  if (!name) return null;
  return { name, role: stringValue(record.role), description: stringValue(record.description) };
}

function normalizeScene(value: unknown, index: number): ScriptScene | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const dialogue = Array.isArray(record.dialogue)
    ? record.dialogue.map(normalizeDialogueLine).filter((line): line is ScriptDialogueLine => Boolean(line))
    : [];

  return {
    sceneNumber: typeof record.sceneNumber === 'number' && record.sceneNumber > 0 ? record.sceneNumber : index + 1,
    time: stringValue(record.time),
    heading: stringValue(record.heading),
    visual: stringValue(record.visual),
    screenplay: stringValue(record.screenplay),
    dialogue,
    voiceOver: stringValue(record.voiceOver),
    screenText: stringValue(record.screenText),
    shotNotes: stringValue(record.shotNotes),
  };
}

function normalizeDialogueLine(value: unknown): ScriptDialogueLine | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const line = stringValue(record.line);
  if (!line) return null;
  return { character: stringValue(record.character) || 'Voice', line };
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => stringValue(item).replace(/^#+/, ''))
    .filter((item) => item.length > 0);
}

function targetValue(value: unknown): PostTarget | '' {
  return value === 'linkedin' || value === 'blog' || value === 'community' ? value : '';
}

function targetLabel(target: PostTarget) {
  return postTargets.find((item) => item.value === target)?.label ?? target;
}

function creativeDirectionMemoryKey(orgId: string) {
  return `time2grow.content.lastCreativeDirection.${orgId}`;
}

function readPreviousCreativeDirection(orgId: string) {
  try {
    return window.localStorage.getItem(creativeDirectionMemoryKey(orgId)) ?? '';
  } catch {
    return '';
  }
}

function rememberCreativeDirection(orgId: string, direction: string) {
  if (!direction) return;
  try {
    window.localStorage.setItem(creativeDirectionMemoryKey(orgId), direction);
  } catch {
    // Generation still works when storage is disabled or unavailable.
  }
}
function safeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'post-visual';
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
}

function contentStatusLabel(status: ContentStatus) {
  return status.replace('_', ' ');
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

async function edgeFunctionErrorMessage(error: unknown, functionName: string) {
  const response = edgeFunctionResponse(error);
  if (response) {
    const detail = await response
      .clone()
      .json()
      .then((body) => {
        if (body && typeof body === 'object' && typeof body.error === 'string') return body.error;
        if (body && typeof body === 'object' && typeof body.message === 'string') return body.message;
        return '';
      })
      .catch(() => response.clone().text().catch(() => ''));

    if (detail.trim()) return detail.trim();
  }

  const message = errorMessage(error, '');
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('failed to send a request to the edge function') || lowerMessage.includes('failed to fetch')) {
    return `Could not reach the ${functionName} Edge Function. Deploy ${functionName} in Supabase Edge Functions for this project, then refresh and try again.`;
  }

  if (lowerMessage.includes('edge function returned a non-2xx status code')) {
    return `${functionName} returned an error. Check the Supabase Edge Function logs for the exact issue.`;
  }

  return message || `Could not call the ${functionName} Edge Function.`;
}

function edgeFunctionResponse(error: unknown) {
  if (!error || typeof error !== 'object') return null;
  const context = (error as Record<string, unknown>).context;
  return context instanceof Response ? context : null;
}
