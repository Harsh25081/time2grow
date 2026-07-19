import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Download, Loader2, Save, Send, Sparkles, Wand2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toPng } from 'html-to-image';
import { env } from '../../lib/env';
import { supabase } from '../../lib/supabase';
import { deriveBrandDisplayName } from '../business-dna/brandIdentity';
import { useBrandDna, BrandDnaSelect, SELF_BRAND_ID } from '../business-dna/useBrandDna';
import type { ClientBusinessDnaRow } from '../business-dna/brandDna';
import { useAuth } from '../auth/AuthProvider';
import type { Database, Json } from '../../types/database';
import {
  buildPalette,
  posterDimensions,
  PosterTemplate,
  EXPORT_PIXEL_RATIO,
  type BrandColor,
  type PosterContent,
  type PosterFormat,
  type PosterTemplateId,
  type Palette as PosterPalette,
} from './PosterTemplate';

type BusinessDnaRow = Database['public']['Tables']['business_dna']['Row'];
type CampaignRow = Pick<Database['public']['Tables']['campaigns']['Row'], 'id' | 'name' | 'status' | 'client_business_dna_id'>;
type PosterLanguage = 'en' | 'te' | 'hi';
type ContactKey = 'website' | 'phone' | 'email';
type ContactDetails = Record<ContactKey, string>;
const CONTACT_FIELDS: { key: ContactKey; label: string; placeholder: string }[] = [
  { key: 'website', label: 'Website', placeholder: 'https://yourbusiness.com' },
  { key: 'phone', label: 'Phone', placeholder: '+91 92769 69696' },
  { key: 'email', label: 'Email', placeholder: 'hello@yourbusiness.com' },
];
type AiPosterLogoPlacement = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';
type AiPosterLogoTreatment = 'plain' | 'light-plate' | 'dark-plate';
type AiPosterLogo = { placement: AiPosterLogoPlacement; treatment: AiPosterLogoTreatment };
type AiPosterProductPlacement = 'left' | 'right' | 'top' | 'bottom' | 'center';
type AiPosterProductTreatment = 'plain' | 'soft-card';
type AiPosterProduct = { placement: AiPosterProductPlacement; treatment: AiPosterProductTreatment; reason?: string };
type ProductImageInput = { src: string; originalSrc: string; name: string; type: string; size: number; cutout: boolean };

type PosterConcept = {
  id: string;
  angle: string;
  template: PosterTemplateId;
  content: PosterContent;
};

// A finished poster image returned by the Python poster agent (text baked in).
type AiPoster = {
  id: string;
  title: string;
  angle: string;
  imageDataUrl: string;
  copy: { headline: string; subheadline: string; callToAction: string; contactText: string };
  logo: AiPosterLogo;
  qr: { placement: AiPosterLogoPlacement };
  product: AiPosterProduct;
};

type AgentConcept = {
  id?: string;
  title?: string;
  angle?: string;
  imageDataUrl?: string;
  imageUrl?: string;
  copy?: Partial<PosterContent> & { message?: string; contactText?: string; footerContact?: string };
  logo?: Partial<AiPosterLogo>;
  logoPlacement?: string;
  logoTreatment?: string;
  productImage?: Partial<AiPosterProduct>;
  product?: Partial<AiPosterProduct>;
  productImagePlacement?: string;
  productImageTreatment?: string;
  productImageReason?: string;
  qr?: { placement?: string };
  qrPlacement?: string;
};

type PosterAgentPayload = {
  ok?: boolean;
  error?: string;
  mode?: string;
  concepts?: AgentConcept[];
  previews?: string[];
  imageDataUrl?: string;
  imageUrl?: string;
  backgroundImageUrl?: string;
  copy?: Partial<PosterContent> & { message?: string; contactText?: string; footerContact?: string };
  poster?: { imageUrl?: string; downloadUrl?: string; title?: string };
};

export function PosterStudioAiPage() {
  const { organization, user, membership } = useAuth();
  const canWrite = membership?.role === 'owner' || membership?.role === 'admin' || membership?.role === 'editor';
  const [businessDna, setBusinessDna] = useState<BusinessDnaRow | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoDisplayUrl, setLogoDisplayUrl] = useState('');
  const [logoIsCutout, setLogoIsCutout] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [brief, setBrief] = useState('');
  const [objective, setObjective] = useState('');
  const [format, setFormat] = useState<PosterFormat>('portrait');
  const [language, setLanguage] = useState<PosterLanguage>('en');
  const [posterCount, setPosterCount] = useState<1 | 2>(1);
  const [offerType, setOfferType] = useState('');
  const [callToAction, setCallToAction] = useState('');
  const [contactShow, setContactShow] = useState<Record<ContactKey, boolean>>({ website: false, phone: false, email: false });
  const [contactValues, setContactValues] = useState<ContactDetails>({ website: '', phone: '', email: '' });
  const [productImage, setProductImage] = useState<ProductImageInput | null>(null);

  const [concepts, setConcepts] = useState<PosterConcept[]>([]);
  const [aiPosters, setAiPosters] = useState<AiPoster[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [scale, setScale] = useState(1);

  const stageRef = useRef<HTMLDivElement>(null);
  const posterRef = useRef<HTMLDivElement>(null);

  // Agency mode: the poster is designed for the selected client's brand DNA
  // instead of the org's own. Single-workspace orgs always use their own DNA.
  const isAgency = organization?.org_type === 'agency';
  const { clients, selectedClient, selectedId: brandSelectionId, setSelectedId: setBrandSelectionId } = useBrandDna(organization?.id, isAgency);
  // The effective brand DNA feeding this poster: a selected client, or our own.
  const selectedDna: BusinessDnaRow | ClientBusinessDnaRow | null = selectedClient ?? businessDna;

  const selfBrandName = useMemo(() => deriveBrandDisplayName(organization?.name, businessDna), [organization?.name, businessDna]);
  const brandName = useMemo(() => (selectedClient ? selectedClient.name : selfBrandName), [selectedClient, selfBrandName]);
  const brandColors = useMemo(() => parseBrandColors(selectedDna), [selectedDna]);
  const basePalette = useMemo(() => buildPalette(brandColors), [brandColors]);
  const palette = basePalette;
  const dim = posterDimensions[format];
  const selectedConcept = useMemo(() => concepts.find((concept) => concept.id === selectedId) ?? concepts[0] ?? null, [concepts, selectedId]);
  const usingAi = aiPosters.length > 0;
  const selectedAiPoster = useMemo(() => aiPosters.find((poster) => poster.id === selectedId) ?? aiPosters[0] ?? null, [aiPosters, selectedId]);
  const posterMemoryKey = organization?.id || user?.id || 'local';
  const campaignOptions = useMemo(
    () => campaigns.filter((campaign) => campaignMatchesBrand(campaign, isAgency, brandSelectionId)),
    [brandSelectionId, campaigns, isAgency],
  );

  useEffect(() => {
    let active = true;

    async function load() {
      if (!supabase || !organization?.id) {
        setCampaigns([]);
        setLoading(false);
        return;
      }

      const [{ data, error: dnaError }, { data: campaignData, error: campaignError }] = await Promise.all([
        supabase
          .from('business_dna')
          .select('*')
          .eq('org_id', organization.id)
          .maybeSingle(),
        supabase
          .from('campaigns')
          .select('id, name, status, client_business_dna_id')
          .eq('org_id', organization.id)
          .neq('status', 'archived')
          .order('updated_at', { ascending: false })
          .limit(100),
      ]);

      if (!active) return;
      if (dnaError) setError(errorMessage(dnaError, 'Could not load Business DNA.'));
      if (campaignError) setError(errorMessage(campaignError, 'Could not load campaigns.'));
      setBusinessDna(data ?? null);
      setCampaigns(campaignData ?? []);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [organization?.id]);

  useEffect(() => {
    if (selectedCampaignId && !campaignOptions.some((campaign) => campaign.id === selectedCampaignId)) {
      setSelectedCampaignId('');
    }
  }, [campaignOptions, selectedCampaignId]);

  // Sign the SELECTED brand's logo/QR (our own or a client's) whenever the
  // selection changes, so the overlays reflect whichever brand this poster is for.
  useEffect(() => {
    let active = true;
    async function signAssets() {
      const dna = selectedDna;
      const nextLogoUrl = dna && dna.logo_storage_bucket && dna.logo_storage_path
        ? await createStorageSignedUrl(dna.logo_storage_bucket, dna.logo_storage_path)
        : '';
      const nextQrUrl = dna && dna.qr_storage_bucket && dna.qr_storage_path
        ? await createStorageSignedUrl(dna.qr_storage_bucket, dna.qr_storage_path)
        : '';
      if (!active) return;
      setLogoUrl(nextLogoUrl);
      setQrUrl(nextQrUrl);
      if (!nextQrUrl) setShowQr(false);
    }
    signAssets();
    return () => {
      active = false;
    };
  }, [selectedDna?.logo_storage_bucket, selectedDna?.logo_storage_path, selectedDna?.qr_storage_bucket, selectedDna?.qr_storage_path]);

  // Prefill the contact boxes from the selected brand DNA and pre-check the ones
  // that have a value, so contact details are opt-out (uncheck what you don't want).
  useEffect(() => {
    if (!selectedDna) return;
    const website = selectedDna.website_url ?? '';
    const phone = selectedDna.contact_phone ?? '';
    const email = selectedDna.contact_email ?? '';
    setContactValues({ website, phone, email });
    setContactShow({ website: Boolean(website), phone: Boolean(phone), email: Boolean(email) });
  }, [selectedDna]);

  // Show the raw logo immediately, then swap in a background-removed version so
  // a white/solid logo backdrop does not appear as a box on the poster.
  useEffect(() => {
    let active = true;
    if (!logoUrl) {
      setLogoDisplayUrl('');
      setLogoIsCutout(false);
      return;
    }
    setLogoDisplayUrl(logoUrl);
    setLogoIsCutout(false);
    removeLogoBackground(logoUrl)
      .then((processed) => {
        if (!active) return;
        setLogoDisplayUrl(processed.src || logoUrl);
        setLogoIsCutout(processed.cutout);
      })
      .catch(() => {
        if (active) {
          setLogoDisplayUrl(logoUrl);
          setLogoIsCutout(false);
        }
      });
    return () => {
      active = false;
    };
  }, [logoUrl]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setScale(Math.min(1.2, Math.max(0.22, el.clientWidth / dim.width)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dim.width]);

  useEffect(() => {
    return () => releaseProductImage(productImage);
  }, [productImage]);
  function updateSelectedContent<K extends keyof PosterContent>(key: K, value: PosterContent[K]) {
    if (!selectedConcept) return;
    const id = selectedConcept.id;
    setConcepts((current) => current.map((concept) => (concept.id === id ? { ...concept, content: { ...concept.content, [key]: value } } : concept)));
  }

  function handleProductImageChange(event: ChangeEvent<HTMLInputElement>) {
    if (!canWrite) {
      event.target.value = '';
      setError('Ask an owner, admin, or editor to generate posters.');
      return;
    }
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Upload a JPG, PNG, or WebP product image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Use a product image under 10 MB so poster generation stays fast.');
      return;
    }

    const rawSrc = URL.createObjectURL(file);
    setError('');
    setProductImage((current) => {
      releaseProductImage(current);
      return { src: rawSrc, originalSrc: rawSrc, name: file.name, type: file.type, size: file.size, cutout: false };
    });

    removeLogoBackground(rawSrc)
      .then((processed) => {
        if (!processed.cutout || !processed.src || processed.src === rawSrc) return;
        setProductImage((current) => {
          if (!current || current.originalSrc !== rawSrc) return current;
          if (rawSrc.startsWith('blob:')) URL.revokeObjectURL(rawSrc);
          return { ...current, src: processed.src, cutout: true };
        });
      })
      .catch(() => undefined);
  }

  function clearProductImage() {
    if (!canWrite) return;
    setProductImage((current) => {
      releaseProductImage(current);
      return null;
    });
  }
  async function handleGenerate() {
    if (!canWrite) {
      setError('Ask an owner, admin, or editor to generate posters.');
      return;
    }
    if (!brief.trim()) {
      setError('Enter a poster brief first.');
      return;
    }

    setGenerating(true);
    setMessage('');
    setError('');
    setAiPosters([]);

    const hasPosterAgent = Boolean(env.posterAgentUrl.trim());

    // Offline only: with no agent configured, the app renders editable templates.
    if (hasPosterAgent) {
      setConcepts([]);
      setSelectedId('');
      setMessage('');
    } else {
      const nextConcepts = buildConceptSet(brief, objective, brandName);
      setConcepts(nextConcepts);
      setSelectedId(nextConcepts[0]?.id ?? '');
      setMessage('No poster agent is configured, so these are editable template concepts. Pick one, edit, then export.');
    }

    const contactDetails: ContactDetails = {
      website: contactShow.website ? contactValues.website.trim() : '',
      phone: contactShow.phone ? contactValues.phone.trim() : '',
      email: contactShow.email ? contactValues.email.trim() : '',
    };
    const learningContext = readPosterLearningContext(posterMemoryKey);

    try {
      const payload = await requestAiPoster({
        brief,
        objective,
        format,
        language,
        posterCount,
        offerType,
        callToAction,
        contactDetails,
        qr: { show: showQr && Boolean(qrUrl) },
        orgId: organization?.id ?? '',
        userId: user?.id ?? '',
        brandName,
        palette,
        businessDna: selectedDna,
        clientBusinessDnaId: selectedClient?.id ?? null,
        logoSource: selectedClient ? 'client_dna' : logoUrl ? 'business_dna' : 'wordmark',
        logoUrl,
        productMarketingMode: Boolean(productImage),
        productImage,
        learningContext,
      });

      if (payload) {
        const rawPosters = extractAiPosters(payload);
        const freshPosters = rejectRepeatedAiPosterHeadlines(rawPosters, learningContext, brief);
        const posters = freshPosters.length > 0 ? freshPosters : rawPosters;
        if (posters.length > 0) {
          setAiPosters(posters);
          setSelectedId(posters[0].id);
          const repeatedCount = rawPosters.length - freshPosters.length;
          rememberPosterRequest(posterMemoryKey, { brief, objective, offerType, ctaInput: callToAction, language, format, posterCount: posters.length, titles: posters.flatMap((poster) => [poster.title, poster.copy.headline]).filter(Boolean).slice(0, 6) });
          setMessage(freshPosters.length > 0
            ? `Your poster agent returned ${posters.length} fresh poster${posters.length > 1 ? 's' : ''}${repeatedCount > 0 ? ` and I skipped ${repeatedCount} repeated headline${repeatedCount > 1 ? 's' : ''}` : ''}. Pick one, then Download, Save, or send to Social Hub.`
            : 'The poster agent reused an older headline, so I am showing the generated poster instead of wasting the wait. Generate again for a fresh direction.');
          return;
        }
        if (payload.ok === false && payload.error) {
          setError(payload.error);
        } else if (hasPosterAgent) {
          setError('The Python poster agent ran but returned no image.');
        }
      } else if (hasPosterAgent) {
        setError('Could not reach the Python poster agent at ' + env.posterAgentUrl.trim() + '.');
      }

      if (hasPosterAgent) setMessage('');
    } catch (generateError) {
      setError(errorMessage(generateError, 'The Python poster agent failed.'));
      if (hasPosterAgent) setMessage('');
    } finally {
      setGenerating(false);
    }
  }

  async function renderPng(): Promise<{ dataUrl: string; blob: Blob }> {
    if (!posterRef.current) throw new Error('Poster is not ready yet.');
    await waitForPaint();
    const dataUrl = await toPng(posterRef.current, {
      pixelRatio: EXPORT_PIXEL_RATIO,
      width: dim.width,
      height: dim.height,
      cacheBust: true,
      backgroundColor: palette.bg,
    });
    const blob = await (await fetch(dataUrl)).blob();
    return { dataUrl, blob };
  }

  function renderAiLogoOverlay(currentScale: number, logoSettings?: AiPosterLogo) {
    const settings = logoDisplayUrl && logoIsCutout ? { ...normalizeLogoSettings(logoSettings), treatment: 'plain' as AiPosterLogoTreatment } : normalizeLogoSettings(logoSettings);
    const maxWidth = Math.max(54, dim.width * 0.2 * currentScale);
    const maxHeight = Math.max(20, Math.min(80, Math.max(56, dim.width * 0.065)) * currentScale);
    const padding = settings.treatment === 'plain' ? 0 : Math.max(3, 8 * currentScale);
    const fontSize = Math.max(8, 22 * currentScale);
    const box = logoOverlayBox(dim.width * currentScale, dim.height * currentScale, maxWidth, maxHeight, padding, settings.placement);
    const usePlate = settings.treatment !== 'plain';
    const darkPlate = settings.treatment === 'dark-plate';

    return (
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: box.left,
          top: box.top,
          zIndex: 2,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          maxWidth,
          maxHeight,
          padding,
          borderRadius: usePlate ? Math.max(2, 6 * currentScale) : 0,
          background: usePlate ? (darkPlate ? 'rgba(15,23,42,0.74)' : 'rgba(255,255,255,0.78)') : 'transparent',
          boxShadow: usePlate ? '0 1px 8px rgba(15,23,42,0.12)' : 'none',
          pointerEvents: 'none',
        }}
      >
        {logoDisplayUrl ? (
          <img src={logoDisplayUrl} alt="" style={{ display: 'block', maxWidth, maxHeight, objectFit: 'contain', filter: usePlate ? undefined : 'drop-shadow(0 2px 5px rgba(15,23,42,0.18))' }} />
        ) : (
          <span style={{ color: darkPlate ? '#FFFFFF' : '#111827', fontSize, fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap', textShadow: usePlate ? undefined : '0 1px 4px rgba(255,255,255,0.45)' }}>{brandName}</span>
        )}
      </span>
    );
  }

  function renderProductOverlay(currentScale: number, productSettings?: AiPosterProduct) {
    if (!productImage) return null;
    const settings = productImage.cutout ? { ...normalizeProductSettings(productSettings), treatment: 'plain' as AiPosterProductTreatment } : normalizeProductSettings(productSettings);
    const frame = productOverlayFrame(dim.width * currentScale, dim.height * currentScale, settings.placement);
    const padding = settings.treatment === 'soft-card' ? Math.max(6, 14 * currentScale) : 0;
    const useCard = settings.treatment === 'soft-card';
    return (
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: frame.left,
          top: frame.top,
          zIndex: 1,
          width: frame.width,
          height: frame.height,
          padding,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: useCard ? Math.max(8, 22 * currentScale) : 0,
          background: useCard ? 'rgba(255,255,255,0.88)' : 'transparent',
          boxShadow: useCard ? '0 12px 34px rgba(15,23,42,0.16)' : 'none',
          pointerEvents: 'none',
        }}
      >
        <img src={productImage.src} alt="" style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: useCard ? undefined : 'drop-shadow(0 12px 22px rgba(15,23,42,0.22))' }} />
      </span>
    );
  }
  function renderQrOverlay(currentScale: number, placement: AiPosterLogoPlacement) {
    if (!showQr || !qrUrl) return null;
    const size = Math.max(40, dim.width * 0.16 * currentScale);
    const padding = Math.max(3, 6 * currentScale);
    const box = logoOverlayBox(dim.width * currentScale, dim.height * currentScale, size, size, padding, placement);
    return (
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: box.left,
          top: box.top,
          zIndex: 2,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size + padding * 2,
          height: size + padding * 2,
          padding,
          borderRadius: Math.max(2, 6 * currentScale),
          background: '#FFFFFF',
          boxShadow: '0 1px 8px rgba(15,23,42,0.16)',
          pointerEvents: 'none',
        }}
      >
        <img src={qrUrl} alt="" style={{ display: 'block', width: size, height: size, objectFit: 'contain' }} />
      </span>
    );
  }

  async function renderAiPosterWithLogo(poster: AiPoster): Promise<{ dataUrl: string; blob: Blob }> {
    try {
      const dataUrl = await composePosterWithLogo(poster.imageDataUrl, dim.width, dim.height, logoDisplayUrl || logoUrl, brandName, poster.logo, showQr ? qrUrl : '', pickQrPlacement(poster.qr.placement, poster.logo.placement), logoIsCutout, productImage?.src || '', poster.product, productImage?.cutout ?? false);
      const blob = await (await fetch(dataUrl)).blob();
      return { dataUrl, blob };
    } catch {
      const blob = await sourceToBlob(poster.imageDataUrl);
      return { dataUrl: poster.imageDataUrl, blob };
    }
  }

  async function downloadAiPoster(poster: AiPoster, index: number) {
    const { dataUrl } = await renderAiPosterWithLogo(poster);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName((poster.copy.headline || poster.title) + ' option ' + (index + 1), dim.exportLabel);
    link.click();
  }

  async function savePosterAsset(blob: Blob, title: string, body: string, index: number) {
    if (!supabase || !organization?.id || !user?.id) throw new Error('Sign in and select a workspace before saving.');
    const name = fileName(title, dim.exportLabel);
    const storagePath = organization.id + '/poster-studio-ai/' + Date.now() + '-' + (index + 1) + '-' + name;

    const { error: uploadError } = await supabase.storage
      .from('post-media')
      .upload(storagePath, blob, { cacheControl: '3600', contentType: 'image/png', upsert: false });
    if (uploadError) throw new Error(errorMessage(uploadError, 'Could not upload the poster.'));

    const { data: signed } = await supabase.storage.from('post-media').createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    const { error: contentError } = await supabase
      .from('content_items')
      .insert({
        org_id: organization.id,
        client_business_dna_id: selectedClient?.id ?? null,
        campaign_id: selectedCampaignId || null,
        content_type: 'poster',
        title,
        body,
        media_url: signed?.signedUrl ?? null,
        metadata: {
          brand: {
            source: selectedClient ? 'client_business_dna' : 'business_dna',
            clientBusinessDnaId: selectedClient?.id ?? null,
            name: brandName,
            campaignId: selectedCampaignId || null,
          },
        },
        status: 'ready',
        created_by: user.id,
      });
    if (contentError) throw new Error(errorMessage(contentError, 'Could not save the poster record.'));
  }

  async function handleDownload(scope: 'selected' | 'all' = 'selected') {
    setError('');
    try {
      if (usingAi) {
        const postersToDownload = scope === 'all' ? aiPosters : selectedAiPoster ? [selectedAiPoster] : [];
        if (postersToDownload.length === 0) {
          setError('Generate a poster first.');
          return;
        }
        for (const poster of postersToDownload) {
          const posterIndex = aiPosters.findIndex((item) => item.id === poster.id);
          await downloadAiPoster(poster, posterIndex >= 0 ? posterIndex : 0);
          rememberPosterChoice(posterMemoryKey, poster, scope === 'all' ? 'download_all' : 'download');
        }
        setMessage(scope === 'all' ? postersToDownload.length + ' posters downloaded as PNG.' : 'Poster downloaded as PNG.');
        return;
      }

      if (!selectedConcept) {
        setError('Generate a poster first.');
        return;
      }
      const { dataUrl } = await renderPng();
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = fileName(selectedConcept.content.headline, dim.exportLabel);
      link.click();
      setMessage('Poster downloaded as PNG.');
    } catch (downloadError) {
      setError(errorMessage(downloadError, 'Could not export the poster.'));
    }
  }

  async function handleSave(scope: 'selected' | 'all' = 'selected') {
    if (!canWrite) {
      setError('Ask an owner, admin, or editor to save posters.');
      return;
    }
    if (!supabase || !organization?.id || !user?.id) return;
    setSaving(true);
    setMessage('');
    setError('');

    try {
      if (usingAi) {
        const postersToSave = scope === 'all' ? aiPosters : selectedAiPoster ? [selectedAiPoster] : [];
        if (postersToSave.length === 0) {
          setError('Generate a poster first.');
          return;
        }
        for (const poster of postersToSave) {
          const posterIndex = aiPosters.findIndex((item) => item.id === poster.id);
          const optionIndex = posterIndex >= 0 ? posterIndex : 0;
          const baseTitle = poster.copy.headline || poster.title || 'Poster';
          const title = scope === 'all' ? baseTitle + ' - Option ' + (optionIndex + 1) : baseTitle;
          const body = [poster.copy.headline, poster.copy.subheadline, poster.copy.callToAction, poster.copy.contactText].filter(Boolean).join('\n');
          const { blob } = await renderAiPosterWithLogo(poster);
          await savePosterAsset(blob, title, body, optionIndex);
          rememberPosterChoice(posterMemoryKey, poster, scope === 'all' ? 'save_all' : 'save');
        }
        setMessage(scope === 'all' ? postersToSave.length + ' posters saved to your library.' : 'Poster saved to your library and ready for Social Hub.');
        return;
      }

      if (!selectedConcept) return;
      const content = selectedConcept.content;
      const blob = (await renderPng()).blob;
      const title = content.headline;
      const body = [content.headline, content.subheadline, content.offer, content.callToAction].filter(Boolean).join('\n');
      await savePosterAsset(blob, title, body, 0);
      setMessage('Poster saved to your library and ready for Social Hub.');
    } catch (saveError) {
      setError(errorMessage(saveError, 'Could not save the poster.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack poster-page ai-poster-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Create</p>
          <h2>AI Poster Studio</h2>
        </div>
      </header>

      {!canWrite ? <p className="form-message warning">You can view and download posters. Ask an owner, admin, or editor to generate or save them.</p> : null}

      {loading ? (
        <section className="empty-state" aria-label="Loading AI Poster Studio">
          <Loader2 className="spin" size={28} />
          <h3>Loading AI Poster Studio</h3>
        </section>
      ) : (
        <div className="ai-poster-layout">
          <section className="draft-panel ai-poster-control" aria-label="AI Poster controls">
            <div className="poster-panel-head"><h3>Brief</h3><Wand2 size={18} /></div>
            {isAgency ? (
              <BrandDnaSelect
                label="Poster for"
                selfLabel={'Our brand' + (selfBrandName ? ' (' + selfBrandName + ')' : '')}
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
            <label className="poster-field">
              <span>Your request</span>
              <textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={4} placeholder="Describe the poster you want, e.g. Diwali wishes from AD96, or a bold laundry service offer" />
            </label>
            <label className="poster-field">
              <span>Goal (optional)</span>
              <input value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Leave blank, or add a goal e.g. festive wishes, lead generation" />
            </label>
            <div className="poster-field">
              <span>Product image (optional)</span>
              <div className="poster-upload-control">
                {productImage ? (
                  <div className="poster-upload-preview">
                    <img src={productImage.src} alt="Uploaded product" />
                    <div>
                      <strong>{productImage.name}</strong>
                      <small>{productImage.cutout ? 'Background removed when possible' : 'Used only for this poster'}</small>
                    </div>
                    <button type="button" className="poster-upload-remove" onClick={clearProductImage} disabled={!canWrite}>Remove</button>
                  </div>
                ) : (
                  <label className="poster-upload-drop">
                    <input type="file" accept="image/*" onChange={handleProductImageChange} disabled={!canWrite} />
                    <span>Upload product photo</span>
                    <small>For this poster only, not Business DNA</small>
                  </label>
                )}
              </div>
            </div>
            <div className="poster-field-row">
              <label className="poster-field">
                <span>Offer type (optional)</span>
                <select value={offerType} onChange={(event) => setOfferType(event.target.value)}>
                  <option value="">None</option>
                  <option value="offer-sale">Offer / sale</option>
                  <option value="lead-generation">Lead generation</option>
                  <option value="event-registration">Event / registration</option>
                  <option value="awareness">Awareness / NGO</option>
                  <option value="launch">Launch / announcement</option>
                  <option value="festive-wishes">Festive wishes</option>
                </select>
              </label>
              <label className="poster-field">
                <span>CTA (optional)</span>
                <input value={callToAction} onChange={(event) => setCallToAction(event.target.value)} placeholder="Book now, Register, Learn more" />
              </label>
            </div>
            <div className="poster-field">
              <span>Contact details to show (optional)</span>
              <div className="poster-check-list">
                {CONTACT_FIELDS.map((field) => (
                  <div key={field.key} className="poster-check-row">
                    <label className="poster-check-toggle">
                      <input
                        type="checkbox"
                        checked={contactShow[field.key]}
                        onChange={(event) => setContactShow((current) => ({ ...current, [field.key]: event.target.checked }))}
                      />
                      <span>{field.label}</span>
                    </label>
                    <input
                      value={contactValues[field.key]}
                      onChange={(event) => setContactValues((current) => ({ ...current, [field.key]: event.target.value }))}
                      placeholder={field.placeholder}
                    />
                  </div>
                ))}
              </div>
            </div>
            <label className="poster-check">
              <input type="checkbox" checked={showQr} disabled={!qrUrl} onChange={(event) => setShowQr(event.target.checked)} />
              <span>{qrUrl ? 'Show QR code on poster' : 'Show QR code (upload one in Business DNA first)'}</span>
            </label>
            <div className="poster-field-row">
              <label className="poster-field">
                <span>Language</span>
                <select value={language} onChange={(event) => setLanguage(event.target.value as PosterLanguage)}>
                  <option value="en">English</option>
                  <option value="te">Telugu</option>
                  <option value="hi">Hindi</option>
                </select>
              </label>
              <label className="poster-field">
                <span>Posters</span>
                <select value={posterCount} onChange={(event) => setPosterCount(Number(event.target.value) as 1 | 2)}>
                  <option value={1}>1 poster</option>
                  <option value={2}>2 posters</option>
                </select>
              </label>
            </div>
            <label className="poster-field">
              <span>Size</span>
              <select value={format} onChange={(event) => setFormat(event.target.value as PosterFormat)}>
                <option value="portrait">Portrait - 1080x1350</option>
                <option value="square">Square - 1080x1080</option>
                <option value="landscape">Landscape - 1200x628</option>
                <option value="story">Story - 1080x1920</option>
                <option value="youtube">YouTube - 1280x720</option>
              </select>
            </label>
            <button type="button" className="primary-action" onClick={handleGenerate} disabled={generating || !canWrite}>
              {generating ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
              <span>{generating ? (posterCount === 2 ? 'Creating posters' : 'Creating poster') : (posterCount === 2 ? 'Generate 2 posters' : 'Generate poster')}</span>
            </button>

            {!usingAi && selectedConcept ? (
              <>
                <div className="poster-panel-head"><h3>Edit selected</h3><Wand2 size={18} /></div>
                <label className="poster-field">
                  <span>Headline</span>
                  <textarea value={selectedConcept.content.headline} onChange={(event) => updateSelectedContent('headline', event.target.value)} rows={2} />
                </label>
                <label className="poster-field">
                  <span>Subheadline</span>
                  <textarea value={selectedConcept.content.subheadline} onChange={(event) => updateSelectedContent('subheadline', event.target.value)} rows={2} />
                </label>
                <div className="poster-field-row">
                  <label className="poster-field"><span>Offer</span><input value={selectedConcept.content.offer} onChange={(event) => updateSelectedContent('offer', event.target.value)} placeholder="Optional" /></label>
                  <label className="poster-field"><span>CTA</span><input value={selectedConcept.content.callToAction} onChange={(event) => updateSelectedContent('callToAction', event.target.value)} placeholder="Optional" /></label>
                </div>
              </>
            ) : null}

          </section>

          <section className="ai-poster-workspace" aria-label="AI Poster canvas">
            <div className="poster-preview-bar poster-canvas-topbar">
              <span className="poster-preview-label">{brandName} - {dim.exportLabel}</span>
              <div className="poster-actions">
                <button type="button" className="primary-action" onClick={() => handleDownload('selected')} disabled={!usingAi && !selectedConcept}><Download size={16} /><span>{usingAi && aiPosters.length > 1 ? 'Download selected' : 'Download PNG'}</span></button>
                {usingAi && aiPosters.length > 1 ? <button type="button" className="icon-text-button" onClick={() => handleDownload('all')}><Download size={16} /><span>Download all</span></button> : null}
                <button type="button" className="icon-text-button" onClick={() => handleSave('selected')} disabled={saving || !canWrite || !selectedDna || (!usingAi && !selectedConcept)}>{saving ? <Loader2 className="spin" size={16} /> : <Save size={16} />}<span>{saving ? 'Saving' : usingAi && aiPosters.length > 1 ? 'Save selected' : 'Save'}</span></button>
                {usingAi && aiPosters.length > 1 ? <button type="button" className="icon-text-button" onClick={() => handleSave('all')} disabled={saving || !canWrite || !selectedDna}>{saving ? <Loader2 className="spin" size={16} /> : <Save size={16} />}<span>{saving ? 'Saving' : 'Save all'}</span></button> : null}
                <Link className="icon-text-button" to="/social"><Send size={16} /><span>Social Hub</span></Link>
              </div>
            </div>

            {usingAi && selectedAiPoster ? (
              <>
                <div className="ai-poster-stage-wrap" ref={stageRef} style={{ minHeight: dim.height * scale + 28 }}>
                  <div style={{ position: 'relative', width: dim.width * scale, height: dim.height * scale }}>
                    <img className="ai-poster-image" src={selectedAiPoster.imageDataUrl} alt={selectedAiPoster.title} style={{ width: '100%', height: '100%', display: 'block' }} />
                    {renderProductOverlay(scale, selectedAiPoster.product)}
                    {renderAiLogoOverlay(scale, selectedAiPoster.logo)}
                    {renderQrOverlay(scale, pickQrPlacement(selectedAiPoster.qr.placement, selectedAiPoster.logo.placement))}
                  </div>
                </div>

                <div className="ai-poster-filmstrip" role="listbox" aria-label="Choose a poster">
                  {aiPosters.map((poster, index) => {
                    const thumbScale = 132 / dim.width;
                    const active = poster.id === selectedAiPoster.id;
                    return (
                      <button
                        key={poster.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={active ? 'ai-poster-thumb is-active' : 'ai-poster-thumb'}
                        onClick={() => setSelectedId(poster.id)}
                      >
                        <span className="ai-poster-thumb-frame" style={{ width: dim.width * thumbScale, height: dim.height * thumbScale, position: 'relative', overflow: 'hidden' }}>
                          <img src={poster.imageDataUrl} alt={poster.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          {renderProductOverlay(thumbScale, poster.product)}
                          {renderAiLogoOverlay(thumbScale, poster.logo)}
                          {renderQrOverlay(thumbScale, pickQrPlacement(poster.qr.placement, poster.logo.placement))}
                        </span>
                        <span className="ai-poster-thumb-meta">
                          <strong>Option {index + 1}</strong>
                          <small>{poster.angle || 'AI poster'}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : selectedConcept ? (
              <>
                <div className="ai-poster-stage-wrap" ref={stageRef} style={{ minHeight: dim.height * scale + 28 }}>
                  <div style={{ transform: 'scale(' + scale + ')', transformOrigin: 'top center', width: dim.width, height: dim.height }}>
                    <PosterTemplate
                      ref={posterRef}
                      template={selectedConcept.template}
                      format={format}
                      content={selectedConcept.content}
                      palette={palette}
                      brandName={brandName}
                      logoUrl={logoDisplayUrl || logoUrl}
                      logoAlt={selectedDna?.logo_alt_text ?? brandName + ' logo'}
                    />
                  </div>
                </div>

                <div className="ai-poster-filmstrip" role="listbox" aria-label="Choose a poster concept">
                  {concepts.map((concept, index) => {
                    const thumbScale = 132 / dim.width;
                    const active = concept.id === selectedConcept.id;
                    return (
                      <button
                        key={concept.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={active ? 'ai-poster-thumb is-active' : 'ai-poster-thumb'}
                        onClick={() => setSelectedId(concept.id)}
                      >
                        <span className="ai-poster-thumb-frame" style={{ width: dim.width * thumbScale, height: dim.height * thumbScale }}>
                          <span className="ai-poster-thumb-scaler" style={{ transform: 'scale(' + thumbScale + ')', width: dim.width, height: dim.height }}>
                            <PosterTemplate
                              template={concept.template}
                              format={format}
                              content={concept.content}
                              palette={palette}
                              brandName={brandName}
                              logoUrl={logoDisplayUrl || logoUrl}
                              logoAlt={brandName + ' logo'}
                            />
                          </span>
                        </span>
                        <span className="ai-poster-thumb-meta">
                          <strong>Option {index + 1}</strong>
                          <small>{concept.angle}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <section className="empty-state" aria-label="No posters yet">
                <Sparkles size={26} />
                <h3>Generate your poster</h3>
                <p>Choose one or two posters, enter a brief, optionally attach a product photo, then Generate.</p>
              </section>
            )}

            {message ? <p className="form-message success">{message}</p> : null}
            {error ? <p className="form-message error">{error}</p> : null}
          </section>
        </div>
      )}
    </div>
  );
}

function CampaignSelect({ campaigns, value, onChange }: { campaigns: CampaignRow[]; value: string; onChange: (value: string) => void }) {
  return (
    <label className="poster-field">
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

async function requestAiPoster(params: {
  brief: string;
  objective: string;
  format: PosterFormat;
  language: PosterLanguage;
  posterCount: 1 | 2;
  offerType: string;
  callToAction: string;
  contactDetails: ContactDetails;
  qr: { show: boolean };
  orgId: string;
  userId: string;
  brandName: string;
  palette: PosterPalette;
  businessDna: BusinessDnaRow | ClientBusinessDnaRow | null;
  clientBusinessDnaId: string | null;
  logoSource?: string;
  logoUrl: string;
  productMarketingMode: boolean;
  productImage: ProductImageInput | null;
  learningContext: PosterLearningContext;
}): Promise<PosterAgentPayload | null> {
  // The Python API is the primary poster engine. The Supabase action remains a
  // safe fallback during local setup or a temporary function outage.
  if (env.posterAgentUrl.trim()) {
    const posterResult = await requestPythonPosterAgent(params);
    if (posterResult?.ok !== false) return posterResult;
  }

  // No reachable Python agent: use the existing server-side Supabase engine.
  const supabaseClient = supabase;
  if (supabaseClient && params.orgId) {
    const results = await Promise.all(Array.from({ length: params.posterCount }, async (_, index) => {
      const { data, error } = await supabaseClient.functions.invoke('ai-handler', {
        body: { action: 'generate_poster_art', orgId: params.orgId, clientBusinessDnaId: params.clientBusinessDnaId, brief: params.brief, format: params.format, language: params.language, offerType: params.offerType, callToAction: params.callToAction, quality: 'high', variantIndex: index, variantCount: params.posterCount },
      });
      return error || !data ? null : data as PosterAgentPayload;
    }));
    const concepts = results
      .flatMap((result, index): AgentConcept[] => {
        if (!result) return [];
        const imageDataUrl = firstImage(result);
        if (!imageDataUrl) return [];
        return [{
          id: 'fallback-' + (index + 1),
          title: stringValue(result.poster?.title) || 'AI poster ' + (index + 1),
          angle: 'AI poster',
          imageDataUrl,
          copy: result.copy,
        }];
      });
    if (concepts.length > 0) return { ok: true, mode: 'poster_set', concepts };
  }

  return null;
}

async function requestPythonPosterAgent(params: {
  brief: string;
  objective: string;
  format: PosterFormat;
  language: PosterLanguage;
  posterCount: 1 | 2;
  offerType: string;
  callToAction: string;
  contactDetails: ContactDetails;
  qr: { show: boolean };
  orgId: string;
  userId: string;
  brandName: string;
  palette: PosterPalette;
  businessDna: BusinessDnaRow | ClientBusinessDnaRow | null;
  clientBusinessDnaId: string | null;
  logoSource?: string;
  logoUrl: string;
  productMarketingMode: boolean;
  productImage: ProductImageInput | null;
  learningContext: PosterLearningContext;
}): Promise<PosterAgentPayload | null> {
  const url = env.posterAgentUrl.trim();
  if (!url || !params.orgId) return null;

  const controller = new AbortController();
  // Planning plus high-quality image generation can take several minutes.
  const timeout = window.setTimeout(() => controller.abort(), 300000);
  try {
    const { data: sessionData } = supabase
      ? await supabase.auth.getSession()
      : { data: { session: null } };
    const accessToken = sessionData.session?.access_token ?? '';
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        mode: 'poster_set',
        action: 'poster_set',
        orgId: params.orgId,
        userId: params.userId,
        clientBusinessDnaId: params.clientBusinessDnaId,
        // Raw request text, unmodified - Python performs the planning and render.
        userIdea: params.brief,
        rawBrief: params.brief,
        brief: params.brief,
        topic: params.brief,
        objective: params.objective,
        format: params.format,
        language: params.language,
        offerType: params.offerType,
        cta: params.callToAction,
        callToAction: params.callToAction,
        contactDetails: params.contactDetails,
        qr: { show: params.qr.show },
        theme: 'custom',
        sizes: [posterDimensions[params.format].exportLabel],
        count: params.posterCount,
        conceptCount: params.posterCount,
        previewCount: params.posterCount,
        brandName: params.brandName,
        palette: params.palette,
        businessDna: buildBusinessDnaPayload(params.businessDna),
        logo: { url: params.logoUrl, brandName: params.brandName, source: params.logoSource ?? (params.logoUrl ? 'business_dna' : 'wordmark') },
        productMarketingMode: params.productMarketingMode,
        productImage: params.productMarketingMode && params.productImage ? { available: true, name: params.productImage.name, type: params.productImage.type, source: 'poster_upload', hasCutout: params.productImage.cutout } : { available: false, source: 'none' },
        learningContext: params.learningContext,
      }),
    });
    if (!response.ok) {
      const details = await response.json().catch(() => null) as { detail?: string; error?: string } | null;
      return {
        ok: false,
        error: details?.detail || details?.error || ('Python poster agent returned HTTP ' + response.status + '.'),
      };
    }
    const payload = (await response.json().catch(() => null)) as PosterAgentPayload | null;
    return payload ?? { ok: false, error: 'Python poster agent returned an empty response.' };
  } catch (requestError) {
    if (requestError instanceof DOMException && requestError.name === 'AbortError') {
      return { ok: false, error: 'Python poster generation timed out after 5 minutes. Try again with a shorter brief.' };
    }
    return {
      ok: false,
      error: errorMessage(requestError, 'Browser could not connect to the Python poster agent at ' + url + '.'),
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

// Read finished images from the Python poster_set shape or Supabase fallback.
function normalizePosterHeadline(value: string) {
  return value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isLazyContentHeadline(value: string) {
  const headline = normalizePosterHeadline(value);
  return [
    /^content without [a-z0-9]+$/,
    /^(manage|launch|create|plan|post|publish|grow|scale|organize) content [a-z0-9]+$/,
    /^content (made|that|for) [a-z0-9]+$/,
  ].some((pattern) => pattern.test(headline));
}

function rejectRepeatedAiPosterHeadlines(posters: AiPoster[], learningContext: PosterLearningContext, brief: string) {
  const forbidden = new Set((learningContext.forbiddenHeadlines || []).map(normalizePosterHeadline).filter(Boolean));
  const requestedText = normalizePosterHeadline(brief);
  const seen = new Set<string>();
  return posters.filter((poster) => {
    const key = normalizePosterHeadline(poster.copy.headline || poster.title);
    if (!key) return true;
    const explicitlyRequested = requestedText.includes(key);
    if (forbidden.has(key) || seen.has(key) || (isLazyContentHeadline(key) && !explicitlyRequested)) return false;
    seen.add(key);
    return true;
  });
}
function extractAiPosters(payload: PosterAgentPayload): AiPoster[] {
  if (Array.isArray(payload.concepts)) {
    return payload.concepts
      .map((concept, index) => {
        const image = stringValue(concept.imageDataUrl) || stringValue(concept.imageUrl);
        if (!image) return null;
        return {
          id: stringValue(concept.id) || 'concept-' + (index + 1),
          title: stringValue(concept.title) || 'Poster ' + (index + 1),
          angle: stringValue(concept.angle),
          imageDataUrl: image,
          copy: {
            headline: stringValue(concept.copy?.headline),
            subheadline: stringValue(concept.copy?.subheadline) || stringValue(concept.copy?.message),
            callToAction: stringValue(concept.copy?.callToAction),
            contactText: stringValue(concept.copy?.contactText) || stringValue(concept.copy?.footerContact),
          },
          logo: normalizeAgentLogo(concept, index),
          qr: { placement: normalizeAgentQr(concept) },
          product: normalizeAgentProduct(concept, index),
        } satisfies AiPoster;
      })
      .filter((poster): poster is AiPoster => Boolean(poster));
  }

  if (Array.isArray(payload.previews) && payload.previews.length) {
    return payload.previews
      .map((preview, index) => stringValue(preview) ? ({
        id: 'preview-' + (index + 1),
        title: 'Preview ' + (index + 1),
        angle: 'AI preview',
        imageDataUrl: stringValue(preview),
        copy: {
          headline: stringValue(payload.copy?.headline),
          subheadline: stringValue(payload.copy?.subheadline) || stringValue(payload.copy?.message),
          callToAction: stringValue(payload.copy?.callToAction),
          contactText: stringValue(payload.copy?.contactText) || stringValue(payload.copy?.footerContact),
        },
        logo: normalizeLogoSettings(),
        qr: { placement: 'bottom-right' as AiPosterLogoPlacement },
        product: normalizeProductSettings(),
      } satisfies AiPoster) : null)
      .filter((poster): poster is AiPoster => Boolean(poster));
  }

  const single = firstImage(payload);
  if (!single) return [];
  return [{
    id: 'concept-1',
    title: stringValue(payload.poster?.title) || 'AI poster',
    angle: 'AI poster',
    imageDataUrl: single,
    copy: {
      headline: stringValue(payload.copy?.headline),
      subheadline: stringValue(payload.copy?.subheadline) || stringValue(payload.copy?.message),
      callToAction: stringValue(payload.copy?.callToAction),
      contactText: stringValue(payload.copy?.contactText) || stringValue(payload.copy?.footerContact),
    },
    logo: normalizeLogoSettings(),
    qr: { placement: 'bottom-right' as AiPosterLogoPlacement },
    product: normalizeProductSettings(),
  }];
}

function firstString(values: unknown) {
  return Array.isArray(values) ? values.map((value) => stringValue(value)).find(Boolean) || '' : '';
}
function firstImage(payload: PosterAgentPayload) {
  return firstString(payload.previews) || stringValue(payload.imageDataUrl)
    || stringValue(payload.backgroundImageUrl)
    || stringValue(payload.imageUrl)
    || stringValue(payload.poster?.imageUrl)
    || stringValue(payload.poster?.downloadUrl);
}

async function sourceToBlob(src: string): Promise<Blob> {
  if (src.startsWith('data:')) {
    const [meta, b64] = src.split(',');
    const mime = /data:([^;]+)/.exec(meta)?.[1] || 'image/png';
    const binary = atob(b64 ?? '');
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mime });
  }
  return (await fetch(src)).blob();
}

// Bake the brand logo into the finished poster at the AI-chosen placement and
// treatment, so downloads/saves match what the preview overlay shows.
async function composePosterWithLogo(imageSrc: string, width: number, height: number, logoUrl: string, brandName: string, logoSettings?: AiPosterLogo, qrUrl?: string, qrPlacement?: AiPosterLogoPlacement, logoIsCutout = false, productImageUrl = '', productSettings?: AiPosterProduct, productIsCutout = false) {
  const settings = logoUrl && logoIsCutout ? { ...normalizeLogoSettings(logoSettings), treatment: 'plain' as AiPosterLogoTreatment } : normalizeLogoSettings(logoSettings);
  const posterImage = await loadCanvasImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available.');

  ctx.drawImage(posterImage, 0, 0, width, height);
  if (productImageUrl) {
    try {
      const productSettingsForExport = productIsCutout ? { ...normalizeProductSettings(productSettings), treatment: 'plain' as AiPosterProductTreatment } : normalizeProductSettings(productSettings);
      const product = await loadCanvasImage(productImageUrl);
      const frame = productOverlayFrame(width, height, productSettingsForExport.placement);
      const productPad = productSettingsForExport.treatment === 'soft-card' ? Math.round(Math.max(16, width * 0.018)) : 0;
      if (productSettingsForExport.treatment === 'soft-card') drawProductPlate(ctx, frame.left, frame.top, frame.width, frame.height);
      drawContainedImage(ctx, product, frame.left + productPad, frame.top + productPad, frame.width - productPad * 2, frame.height - productPad * 2, productSettingsForExport.treatment === 'plain');
    } catch {
      // Product upload failed to load; keep the generated poster usable.
    }
  }
  const margin = Math.round(width * 0.055);
  const targetHeight = Math.round(Math.min(80, Math.max(56, width * 0.065)));
  const maxWidth = Math.round(width * 0.22);
  const usePlate = settings.treatment !== 'plain';
  const darkPlate = settings.treatment === 'dark-plate';
  const padding = usePlate ? Math.round(Math.max(8, width * 0.008)) : 0;
  let drewLogo = false;

  if (logoUrl) {
    try {
      const logo = await loadCanvasImage(logoUrl);
      const ratio = logo.naturalWidth && logo.naturalHeight ? logo.naturalWidth / logo.naturalHeight : 1;
      const logoWidth = Math.min(maxWidth, Math.round(targetHeight * ratio));
      const logoHeight = Math.round(logoWidth / ratio);
      const boxWidth = logoWidth + padding * 2;
      const boxHeight = logoHeight + padding * 2;
      const pos = logoCanvasPosition(width, height, boxWidth, boxHeight, margin, settings.placement);
      if (usePlate) drawLogoPlate(ctx, pos.left, pos.top, boxWidth, boxHeight, darkPlate);
      drawWithOptionalShadow(ctx, !usePlate, () => ctx.drawImage(logo, pos.left + padding, pos.top + padding, logoWidth, logoHeight));
      drewLogo = true;
    } catch {
      drewLogo = false;
    }
  }

  if (!drewLogo) {
    const text = (brandName || 'time2grow').trim();
    const fontSize = Math.round(width * 0.028);
    ctx.font = '800 ' + fontSize + 'px Inter, Arial, sans-serif';
    const textWidth = Math.min(maxWidth, Math.ceil(ctx.measureText(text).width));
    const boxWidth = textWidth + padding * 2;
    const boxHeight = fontSize + padding * 2;
    const pos = logoCanvasPosition(width, height, boxWidth, boxHeight, margin, settings.placement);
    if (usePlate) drawLogoPlate(ctx, pos.left, pos.top, boxWidth, boxHeight, darkPlate);
    ctx.fillStyle = darkPlate ? '#FFFFFF' : '#111827';
    ctx.textBaseline = 'middle';
    drawWithOptionalShadow(ctx, !usePlate, () => ctx.fillText(text, pos.left + padding, pos.top + padding + fontSize / 2, maxWidth));
  }

  if (qrUrl) {
    try {
      const qr = await loadCanvasImage(qrUrl);
      const qrSize = Math.round(width * 0.16);
      const qrPad = Math.round(Math.max(8, width * 0.01));
      const boxWidth = qrSize + qrPad * 2;
      const boxHeight = qrSize + qrPad * 2;
      const pos = logoCanvasPosition(width, height, boxWidth, boxHeight, margin, qrPlacement || 'bottom-right');
      // Solid white quiet-zone so the code always scans, even over busy art.
      drawQrPlate(ctx, pos.left, pos.top, boxWidth, boxHeight);
      ctx.drawImage(qr, pos.left + qrPad, pos.top + qrPad, qrSize, qrSize);
    } catch {
      // QR failed to load; skip it rather than fail the whole export.
    }
  }

  return canvas.toDataURL('image/png');
}

function drawProductPlate(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.shadowColor = 'rgba(15,23,42,0.18)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 12;
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, Math.max(18, Math.round(Math.min(width, height) * 0.06)));
    ctx.fill();
  } else {
    ctx.fillRect(x, y, width, height);
  }
  ctx.restore();
}


function drawContainedImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number, withShadow: boolean) {
  const imageWidth = image.naturalWidth || image.width || 1;
  const imageHeight = image.naturalHeight || image.height || 1;
  const ratio = Math.min(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * ratio;
  const drawHeight = imageHeight * ratio;
  const left = x + (width - drawWidth) / 2;
  const top = y + (height - drawHeight) / 2;
  drawWithOptionalShadow(ctx, withShadow, () => ctx.drawImage(image, left, top, drawWidth, drawHeight));
}
function drawQrPlate(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(15,23,42,0.16)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 8);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, width, height);
  }
  ctx.restore();
}

// Top-left corner of the logo box for a given placement, keeping a safe margin.
function logoCanvasPosition(width: number, height: number, boxWidth: number, boxHeight: number, margin: number, placement: AiPosterLogoPlacement) {
  const left = placement.includes('left')
    ? margin
    : placement.includes('right')
      ? width - boxWidth - margin
      : Math.round((width - boxWidth) / 2);
  const top = placement.startsWith('top') ? margin : height - boxHeight - margin;
  return { left, top };
}

function drawWithOptionalShadow(ctx: CanvasRenderingContext2D, withShadow: boolean, draw: () => void) {
  if (!withShadow) {
    draw();
    return;
  }
  ctx.save();
  ctx.shadowColor = 'rgba(15,23,42,0.28)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  draw();
  ctx.restore();
}

function drawLogoPlate(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, dark: boolean) {
  ctx.save();
  ctx.fillStyle = dark ? 'rgba(15,23,42,0.74)' : 'rgba(255,255,255,0.78)';
  ctx.shadowColor = 'rgba(15,23,42,0.16)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 8);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, width, height);
  }
  ctx.restore();
}

const LOGO_PLACEMENTS: AiPosterLogoPlacement[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center', 'bottom-center'];
const LOGO_TREATMENTS: AiPosterLogoTreatment[] = ['plain', 'light-plate', 'dark-plate'];
const PRODUCT_PLACEMENTS: AiPosterProductPlacement[] = ['left', 'right', 'top', 'bottom', 'center'];
const PRODUCT_TREATMENTS: AiPosterProductTreatment[] = ['plain', 'soft-card'];

function fallbackLogoPlacement(index = 0): AiPosterLogoPlacement {
  const order: AiPosterLogoPlacement[] = ['top-right', 'top-left', 'top-center'];
  return order[Math.abs(index) % order.length];
}

// Coerce whatever the workflow sends (or nothing) into a valid logo setting.
function normalizeLogoSettings(settings?: { placement?: string; treatment?: string } | null, fallbackPlacement: AiPosterLogoPlacement = 'top-right'): AiPosterLogo {
  const placement = settings?.placement as AiPosterLogoPlacement | undefined;
  const treatment = settings?.treatment as AiPosterLogoTreatment | undefined;
  return {
    placement: placement && LOGO_PLACEMENTS.includes(placement) ? placement : fallbackPlacement,
    treatment: treatment && LOGO_TREATMENTS.includes(treatment) ? treatment : 'plain',
  };
}

// The workflow may nest logo hints under `logo` or send them flat.
function normalizeAgentLogo(concept: AgentConcept, index = 0): AiPosterLogo {
  return normalizeLogoSettings({
    placement: stringValue(concept.logo?.placement) || stringValue(concept.logoPlacement),
    treatment: stringValue(concept.logo?.treatment) || stringValue(concept.logoTreatment),
  }, fallbackLogoPlacement(index));
}

function fallbackProductPlacement(index = 0): AiPosterProductPlacement {
  const order: AiPosterProductPlacement[] = ['right', 'left', 'center'];
  return order[Math.abs(index) % order.length];
}

function normalizeProductSettings(settings?: { placement?: string; treatment?: string; reason?: string } | null, fallbackPlacement: AiPosterProductPlacement = 'right'): AiPosterProduct {
  const placement = settings?.placement as AiPosterProductPlacement | undefined;
  const treatment = settings?.treatment as AiPosterProductTreatment | undefined;
  return {
    placement: placement && PRODUCT_PLACEMENTS.includes(placement) ? placement : fallbackPlacement,
    treatment: treatment && PRODUCT_TREATMENTS.includes(treatment) ? treatment : 'soft-card',
    reason: stringValue(settings?.reason),
  };
}

function normalizeAgentProduct(concept: AgentConcept, index = 0): AiPosterProduct {
  const nested: Partial<AiPosterProduct> = concept.productImage ?? concept.product ?? {};
  return normalizeProductSettings({
    placement: stringValue(nested.placement) || stringValue(concept.productImagePlacement),
    treatment: stringValue(nested.treatment) || stringValue(concept.productImageTreatment),
    reason: stringValue(nested.reason) || stringValue(concept.productImageReason),
  }, fallbackProductPlacement(index));
}
function normalizeAgentQr(concept: AgentConcept): AiPosterLogoPlacement {
  const raw = (stringValue(concept.qr?.placement) || stringValue(concept.qrPlacement)) as AiPosterLogoPlacement;
  return LOGO_PLACEMENTS.includes(raw) ? raw : 'bottom-right';
}

// Keep the QR out of the logo's corner; if they collide, shift the QR.
function pickQrPlacement(qr: AiPosterLogoPlacement, logo: AiPosterLogoPlacement): AiPosterLogoPlacement {
  if (qr !== logo) return qr;
  const order: AiPosterLogoPlacement[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'bottom-center', 'top-center'];
  return order.find((placement) => placement !== logo) ?? 'bottom-right';
}

// Top-left corner of the DOM logo overlay box for a given placement.
function logoOverlayBox(width: number, height: number, boxWidth: number, boxHeight: number, padding: number, placement: AiPosterLogoPlacement) {
  const margin = Math.max(6, width * 0.045);
  const totalWidth = boxWidth + padding * 2;
  const totalHeight = boxHeight + padding * 2;
  const left = placement.includes('left')
    ? margin
    : placement.includes('right')
      ? width - totalWidth - margin
      : (width - totalWidth) / 2;
  const top = placement.startsWith('top') ? margin : height - totalHeight - margin;
  return { left, top };
}

function productOverlayFrame(width: number, height: number, placement: AiPosterProductPlacement) {
  const margin = Math.max(14, width * 0.06);
  const isWide = width > height;
  const frameWidth = placement === 'left' || placement === 'right'
    ? width * (isWide ? 0.32 : 0.36)
    : width * (isWide ? 0.34 : 0.5);
  const frameHeight = placement === 'top' || placement === 'bottom'
    ? height * (isWide ? 0.38 : 0.26)
    : height * (isWide ? 0.52 : 0.34);
  const left = placement === 'left'
    ? margin
    : placement === 'right'
      ? width - frameWidth - margin
      : (width - frameWidth) / 2;
  const top = placement === 'top'
    ? margin * 1.4
    : placement === 'bottom'
      ? height - frameHeight - Math.max(margin * 1.4, height * 0.12)
      : (height - frameHeight) / 2;
  return { left, top, width: frameWidth, height: frameHeight };
}
function loadCanvasImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load image.'));
    image.src = src;
  });
}

function colorDistance(r: number, g: number, b: number, bg: [number, number, number]) {
  const dr = r - bg[0];
  const dg = g - bg[1];
  const db = b - bg[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// Remove a flat (e.g. white) background from a logo so only the mark shows when
// overlaid on a poster. Flood-fills from the borders so a white mark surrounded
// by the logo is preserved - only the OUTER connected background is cleared.
// Returns the original src untouched if the logo is already transparent, the
// background is not uniform, or the pixels can't be read (cross-origin taint).
async function removeLogoBackground(src: string): Promise<{ src: string; cutout: boolean }> {
  if (!src) return { src, cutout: false };
  let image: HTMLImageElement;
  try {
    image = await loadCanvasImage(src);
  } catch {
    return { src, cutout: false };
  }
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  if (!w || !h) return { src, cutout: false };

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { src, cutout: false };
  ctx.drawImage(image, 0, 0, w, h);

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, w, h);
  } catch {
    return { src, cutout: false }; // canvas tainted by cross-origin image
  }
  const px = imageData.data;

  // Already has meaningful transparency -> assume it's a clean cutout, leave it.
  let transparent = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 200) transparent += 1;
  if (transparent > w * h * 0.05) return { src, cutout: true };

  // Background color from the four corners; require them to agree (flat bg).
  const cornerOffsets = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4];
  const corners = cornerOffsets.map((o) => [px[o], px[o + 1], px[o + 2]] as [number, number, number]);
  const bg: [number, number, number] = [0, 1, 2].map((c) => Math.round(corners.reduce((s, k) => s + k[c], 0) / corners.length)) as [number, number, number];
  const spread = Math.max(...corners.map((k) => colorDistance(k[0], k[1], k[2], bg)));
  if (spread > 40) return { src, cutout: false }; // corners disagree -> not a flat background

  const tolerance = 42;
  let removedPixels = 0;
  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  const consider = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (visited[idx]) return;
    visited[idx] = 1;
    const o = idx * 4;
    if (colorDistance(px[o], px[o + 1], px[o + 2], bg) <= tolerance) {
      if (px[o + 3] !== 0) removedPixels += 1;
      px[o + 3] = 0;
      stack.push(x, y);
    }
  };
  for (let x = 0; x < w; x += 1) {
    consider(x, 0);
    consider(x, h - 1);
  }
  for (let y = 0; y < h; y += 1) {
    consider(0, y);
    consider(w - 1, y);
  }
  while (stack.length) {
    const y = stack.pop() as number;
    const x = stack.pop() as number;
    consider(x + 1, y);
    consider(x - 1, y);
    consider(x, y + 1);
    consider(x, y - 1);
  }

  if (removedPixels < w * h * 0.01) return { src, cutout: false };
  ctx.putImageData(imageData, 0, 0);
  return { src: canvas.toDataURL('image/png'), cutout: true };
}

type BriefFacts = {
  greeting: string;
  festivalNoun: string;
  brand: string;
  subject: string;
};

const FESTIVALS: Array<{ test: RegExp; greeting: string; noun: string }> = [
  { test: /\b(diwali|deepavali|deepawali|deepwali)\b/i, greeting: 'Happy Diwali', noun: 'Diwali' },
  { test: /\bholi\b/i, greeting: 'Happy Holi', noun: 'Holi' },
  { test: /\b(christmas|xmas)\b/i, greeting: 'Merry Christmas', noun: 'Christmas' },
  { test: /\bnew year\b/i, greeting: 'Happy New Year', noun: 'New Year' },
  { test: /\beid\b/i, greeting: 'Eid Mubarak', noun: 'Eid' },
  { test: /\bpongal\b/i, greeting: 'Happy Pongal', noun: 'Pongal' },
  { test: /\b(makar\s+)?sankranti\b/i, greeting: 'Happy Sankranti', noun: 'Sankranti' },
  { test: /\b(dussehra|dasara|vijayadashami)\b/i, greeting: 'Happy Dussehra', noun: 'Dussehra' },
  { test: /\b(ganesh chaturthi|vinayaka chavithi|vinayaka)\b/i, greeting: 'Happy Ganesh Chaturthi', noun: 'Ganesh Chaturthi' },
  { test: /\bugadi\b/i, greeting: 'Happy Ugadi', noun: 'Ugadi' },
  { test: /\bnavratri\b/i, greeting: 'Happy Navratri', noun: 'Navratri' },
  { test: /\bonam\b/i, greeting: 'Happy Onam', noun: 'Onam' },
  { test: /\b(raksha bandhan|rakhi)\b/i, greeting: 'Happy Raksha Bandhan', noun: 'Raksha Bandhan' },
  { test: /\b(ramadan|ramzan)\b/i, greeting: 'Ramadan Kareem', noun: 'Ramadan' },
  { test: /\beaster\b/i, greeting: 'Happy Easter', noun: 'Easter' },
  { test: /\bvalentine/i, greeting: "Happy Valentine's Day", noun: "Valentine's Day" },
  { test: /\bindependence day\b/i, greeting: 'Happy Independence Day', noun: 'Independence Day' },
  { test: /\brepublic day\b/i, greeting: 'Happy Republic Day', noun: 'Republic Day' },
  { test: /\banniversary\b/i, greeting: 'Happy Anniversary', noun: 'Anniversary' },
  { test: /\bbirthday\b/i, greeting: 'Happy Birthday', noun: 'Birthday' },
];

const FILLER_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'from', 'with', 'by', 'our', 'your', 'their', 'us', 'we',
  'wishes', 'wish', 'wishing', 'greetings', 'greeting', 'poster', 'posters', 'create', 'make', 'design', 'designed',
  'need', 'want', 'give', 'please', 'warm', 'premium', 'festive', 'festival', 'look', 'looks', 'style', 'styled',
  'modern', 'minimal', 'clean', 'elegant', 'luxury', 'luxurious', 'vibrant', 'colorful', 'colourful', 'high', 'contrast',
  'conceptual', 'message', 'brand', 'safe', 'beautiful', 'nice', 'good', 'simple', 'professional', 'best', 'image',
  'picture', 'graphic', 'social', 'media', 'post', 'ad', 'advertisement', 'creative', 'flyer',
]);

// Pull a likely brand name out of the brief ("... from AD96", "by Acme Labs").
function extractBrandFromBrief(brief: string) {
  const match = brief.match(/\b(?:from|by|for)\s+([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]+){0,2})/);
  return match ? match[1].trim() : '';
}

function detectFestival(brief: string) {
  return FESTIVALS.find((festival) => festival.test.test(brief)) ?? null;
}

// A short, clean, title-cased subject with brief filler/style words removed.
function cleanSubject(brief: string) {
  const words = brief
    .replace(/[^A-Za-z0-9&\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !FILLER_WORDS.has(word.toLowerCase()));
  const trimmed = words.slice(0, 6);
  if (trimmed.length === 0) return '';
  return trimmed
    .map((word) => (word === word.toUpperCase() ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

function analyzeBrief(brief: string, brandName: string): BriefFacts {
  const festival = detectFestival(brief);
  const brand = extractBrandFromBrief(brief) || (brandName.trim() || 'us');
  return {
    greeting: festival?.greeting ?? '',
    festivalNoun: festival?.noun ?? '',
    brand,
    subject: cleanSubject(brief),
  };
}

// Three visually distinct, on-brand concepts from one brief. The theme (palette)
// is applied by the caller and locked across the whole set. Copy is written from
// the parsed occasion/brand/subject - never echoed verbatim from the raw brief.
function buildConceptSet(brief: string, objective: string, brandName: string): PosterConcept[] {
  const facts = analyzeBrief(brief, brandName);
  const lower = objective.toLowerCase();

  if (facts.greeting) {
    const { greeting, festivalNoun: noun, brand } = facts;
    return [
      {
        id: 'concept-benefit',
        angle: 'Warm greeting',
        template: 'spotlight',
        content: { headline: greeting, subheadline: `Warm wishes from ${brand} for a bright and joyful ${noun}.`, offer: '', callToAction: '' },
      },
      {
        id: 'concept-direct',
        angle: 'Celebration',
        template: 'bold',
        content: { headline: greeting, subheadline: `May your ${noun} sparkle with joy, prosperity, and togetherness.`, offer: "Season's greetings", callToAction: '' },
      },
      {
        id: 'concept-premium',
        angle: 'Premium wishes',
        template: 'premium',
        content: { headline: greeting, subheadline: `${brand} wishes you and your family a warm and prosperous ${noun}.`, offer: '', callToAction: '' },
      },
    ];
  }

  const headline = facts.subject || defaultHeadline(objective);
  const cta = ctaForObjective(lower);
  const eyebrow = eyebrowForObjective(objective, lower);
  const educational = isEducational(lower);

  return [
    {
      id: 'concept-benefit',
      angle: 'Benefit spotlight',
      template: 'spotlight',
      content: { headline, subheadline: 'A clear, benefit-led message with strong hierarchy and one confident action.', offer: '', callToAction: cta },
    },
    {
      id: 'concept-direct',
      angle: 'Direct response',
      template: 'bold',
      content: { headline, subheadline: 'One strong message, one clear action - designed to get a response.', offer: eyebrow, callToAction: cta },
    },
    {
      id: 'concept-premium',
      angle: educational ? 'Educational' : 'Premium editorial',
      template: educational ? 'educational' : 'premium',
      content: { headline, subheadline: educational ? 'A structured, easy-to-follow layout that builds trust and understanding.' : 'A refined, premium layout with generous space and a controlled accent.', offer: educational ? 'Useful guide' : '', callToAction: cta },
    },
  ];
}

function isEducational(lower: string) {
  return lower.includes('educat') || lower.includes('guide') || lower.includes('how') || lower.includes('awareness');
}

function defaultHeadline(objective: string) {
  const lower = objective.toLowerCase();
  if (lower.includes('donation')) return 'Give a little, change a lot';
  if (lower.includes('ngo') || lower.includes('awareness')) return 'Together we can do more';
  if (lower.includes('demo')) return 'See it in action';
  if (lower.includes('lead')) return 'Grow with us';
  if (lower.includes('offer')) return 'A better deal, today';
  if (lower.includes('education')) return 'Learn something useful';
  return objective && objective !== 'Generic poster' ? objective : 'Your campaign';
}

function eyebrowForObjective(objective: string, lower: string) {
  if (lower.includes('donation')) return 'Donation drive';
  if (lower.includes('ngo') || lower.includes('awareness')) return 'Awareness';
  if (lower.includes('hackathon')) return 'Hackathon';
  if (lower.includes('runathon')) return 'Runathon';
  if (lower.includes('cycling')) return 'Club ride';
  if (lower.includes('event') || lower.includes('community') || lower.includes('invitation')) return 'You are invited';
  if (lower.includes('demo')) return 'Book a demo';
  if (lower.includes('offer')) return 'Featured';
  return objective === 'Generic poster' ? 'Featured' : objective;
}

function ctaForObjective(lower: string) {
  if (lower.includes('donation')) return 'Donate now';
  if (lower.includes('ngo') || lower.includes('awareness')) return 'Support the cause';
  if (lower.includes('hackathon')) return 'Register now';
  if (lower.includes('runathon')) return 'Join the run';
  if (lower.includes('cycling')) return 'Join the ride';
  if (lower.includes('event') || lower.includes('community') || lower.includes('invitation')) return 'Join us';
  if (lower.includes('demo')) return 'Book a demo';
  if (lower.includes('education')) return 'Learn more';
  if (lower.includes('offer')) return 'Claim offer';
  return 'Get started';
}

function parseBrandColors(dna: BusinessDnaRow | ClientBusinessDnaRow | null): BrandColor[] {
  const raw = dna?.brand_colors as Json | undefined;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const label = typeof record.label === 'string' ? record.label : '';
      const value = typeof record.value === 'string' ? record.value : '';
      if (!value) return null;
      return { label: label || 'Brand', value } satisfies BrandColor;
    })
    .filter((item): item is BrandColor => Boolean(item));
}

function buildBusinessDnaPayload(dna: BusinessDnaRow | ClientBusinessDnaRow | null) {
  if (!dna) return null;
  return {
    websiteUrl: dna.website_url,
    contactPhone: dna.contact_phone,
    contactEmail: dna.contact_email,
    mission: dna.mission,
    positioning: dna.positioning,
    audience: dna.audience,
    brandColors: dna.brand_colors,
    logoStorageBucket: dna.logo_storage_bucket,
    logoStoragePath: dna.logo_storage_path,
  };
}

async function createStorageSignedUrl(bucket: string, path: string) {
  if (!supabase || !bucket || !path) return '';
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 7);
  return data?.signedUrl ?? '';
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function releaseProductImage(image: ProductImageInput | null) {
  if (!image) return;
  const urls = new Set([image.src, image.originalSrc]);
  urls.forEach((url) => {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  });
}

const POSTER_MEMORY_LIMIT = 12;

type PosterMemoryEntry = {
  at: string;
  kind: 'request' | 'choice';
  brief?: string;
  objective?: string;
  offerType?: string;
  ctaInput?: string;
  language?: PosterLanguage;
  format?: PosterFormat;
  posterCount?: number;
  titles?: string[];
  action?: string;
  pickedTitle?: string;
  pickedAngle?: string;
  pickedHeadline?: string;
};

type PosterLearningContext = {
  summary: string;
  previousHeadlines: string[];
  forbiddenHeadlines: string[];
  pickedHeadlines: string[];
  recentHeadlines: string[];
  titles: string[];
};

function posterMemoryStorageKey(scope: string) {
  return 'time2grow.posterStudio.memory.' + (scope || 'local');
}

function readPosterMemory(scope: string): PosterMemoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(posterMemoryStorageKey(scope)) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, POSTER_MEMORY_LIMIT) : [];
  } catch {
    return [];
  }
}

function writePosterMemory(scope: string, entries: PosterMemoryEntry[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(posterMemoryStorageKey(scope), JSON.stringify(entries.slice(0, POSTER_MEMORY_LIMIT)));
}

function rememberPosterRequest(scope: string, input: Omit<PosterMemoryEntry, 'at' | 'kind'>) {
  const entry: PosterMemoryEntry = { at: new Date().toISOString(), kind: 'request', ...input };
  writePosterMemory(scope, [entry, ...readPosterMemory(scope)]);
}

function rememberPosterChoice(scope: string, poster: AiPoster, action: string) {
  const entry: PosterMemoryEntry = {
    at: new Date().toISOString(),
    kind: 'choice',
    action,
    pickedTitle: poster.title,
    pickedAngle: poster.angle,
    pickedHeadline: poster.copy.headline,
  };
  writePosterMemory(scope, [entry, ...readPosterMemory(scope)]);
}

function uniquePosterTexts(values: Array<string | undefined>) {
  const seen = new Set<string>();
  return values.map((value) => stringValue(value)).filter((value) => {
    const key = normalizePosterHeadline(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readPosterLearningContext(scope: string): PosterLearningContext {
  const entries = readPosterMemory(scope);
  const pickedHeadlines = uniquePosterTexts(entries.filter((entry) => entry.kind === 'choice').flatMap((entry) => [entry.pickedHeadline, entry.pickedTitle]));
  const titles = uniquePosterTexts(entries.filter((entry) => entry.kind === 'request').flatMap((entry) => entry.titles ?? []));
  const previousHeadlines = uniquePosterTexts([...pickedHeadlines, ...titles]).slice(0, 24);
  const summary = entries.map((entry) => {
    if (entry.kind === 'choice') return 'Preferred poster: ' + [entry.pickedHeadline, entry.pickedAngle, entry.action].filter(Boolean).join(' | ');
    return 'Recent request: ' + [entry.brief, entry.objective, entry.offerType, entry.ctaInput, entry.language, entry.format, entry.titles?.join(', ')].filter(Boolean).join(' | ');
  }).join('\n').slice(0, 2000);
  return {
    summary,
    previousHeadlines,
    forbiddenHeadlines: previousHeadlines,
    pickedHeadlines,
    recentHeadlines: titles,
    titles,
  };
}

function waitForPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function fileName(title: string, exportLabel: string) {
  const slug = (title || 'poster').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'poster';
  return slug + '-' + exportLabel + '.png';
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
