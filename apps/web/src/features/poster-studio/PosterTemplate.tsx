import { forwardRef, useRef } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

export type PosterFormat = 'square' | 'portrait' | 'landscape' | 'story' | 'youtube';
export type PosterTemplateId = 'signature' | 'spotlight' | 'premium' | 'editorial' | 'bold' | 'educational';
export type PosterTextAlign = 'left' | 'center' | 'right';
export type PosterGradientMode = 'auto' | 'none' | 'soft' | 'diagonal' | 'radial';

export type PosterLayer =
  | {
      id: string;
      kind: 'text';
      text: string;
      x: number;
      y: number;
      width: number;
      fontSize: number;
      color: string;
      opacity: number;
      align: PosterTextAlign;
      fontWeight: number;
      rotation: number;
    }
  | {
      id: string;
      kind: 'image';
      src: string;
      alt: string;
      x: number;
      y: number;
      width: number;
      height: number;
      opacity: number;
      rotation: number;
      borderRadius: number;
      objectFit: 'cover' | 'contain';
    }
  | {
      id: string;
      kind: 'shape';
      shape: 'rectangle' | 'circle';
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
      opacity: number;
      rotation: number;
      borderRadius: number;
    };

export type PosterContent = {
  headline: string;
  subheadline: string;
  offer: string;
  callToAction: string;
};

export type BrandColor = { label: string; value: string };

export type Palette = {
  primary: string;
  primaryDark: string;
  accent: string;
  onPrimary: string;
  onAccent: string;
  bg: string;
  panel: string;
  text: string;
  muted: string;
};

// Design-space dimensions; export captures these at EXPORT_PIXEL_RATIO.
export const posterDimensions: Record<PosterFormat, { width: number; height: number; exportLabel: string }> = {
  portrait: { width: 540, height: 675, exportLabel: '1080x1350' },
  square: { width: 540, height: 540, exportLabel: '1080x1080' },
  story: { width: 540, height: 960, exportLabel: '1080x1920' },
  landscape: { width: 600, height: 314, exportLabel: '1200x628' },
  youtube: { width: 640, height: 360, exportLabel: '1280x720' },
};

export const EXPORT_PIXEL_RATIO = 2;

const FONT_STACK = '"Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif';
const SERIF_STACK = 'Georgia, "Times New Roman", serif';

function clampHex(value: string): string | null {
  const m = value.trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return '#' + hex.toUpperCase();
}

function rgb(hex: string) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function luminance(hex: string) {
  const { r, g, b } = rgb(hex);
  const a = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function readableOn(hex: string) {
  return luminance(hex) > 0.52 ? '#111827' : '#FFFFFF';
}

function shade(hex: string, pct: number) {
  const { r, g, b } = rgb(hex);
  const t = pct < 0 ? 0 : 255;
  const p = Math.abs(pct);
  const mix = (c: number) => Math.round((t - c) * p + c);
  const to2 = (c: number) => c.toString(16).padStart(2, '0');
  return ('#' + to2(mix(r)) + to2(mix(g)) + to2(mix(b))).toUpperCase();
}

function alpha(hex: string, opacity: number) {
  const { r, g, b } = rgb(hex);
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + opacity + ')';
}

export function hexToRgbString(hex: string) {
  const value = clampHex(hex || '');
  if (!value) return 'rgb(0, 0, 0)';
  const { r, g, b } = rgb(value);
  return 'rgb(' + r + ', ' + g + ', ' + b + ')';
}

export function buildPalette(brandColors: BrandColor[]): Palette {
  const hexes = brandColors.map((c) => clampHex(c.value || '')).filter((v): v is string => Boolean(v));
  const primary = hexes[0] ?? '#0C1A2E';
  const accent = hexes[1] ?? '#C8A24C';
  return {
    primary,
    primaryDark: shade(primary, -0.38),
    accent,
    onPrimary: readableOn(primary),
    onAccent: readableOn(accent),
    bg: '#F7F8FA',
    panel: '#FFFFFF',
    text: '#111827',
    muted: '#667085',
  };
}

type TemplateProps = {
  template: PosterTemplateId;
  format: PosterFormat;
  content: PosterContent;
  palette: Palette;
  brandName: string;
  logoUrl?: string;
  logoAlt?: string;
  textScale?: number;
  textAlign?: PosterTextAlign;
  showLogo?: boolean;
  logoScale?: number;
  logoCutout?: boolean;
  backgroundColor?: string;
  gradientMode?: PosterGradientMode;
  backgroundOpacity?: number;
  backgroundImageUrl?: string;
  textOffsetX?: number;
  textOffsetY?: number;
  textOpacity?: number;
  layers?: PosterLayer[];
  selectedLayerId?: string;
  editableLayers?: boolean;
  onSelectLayer?: (id: string) => void;
  onChangeLayer?: (id: string, patch: Partial<PosterLayer>) => void;
};

type BrandLockupProps = {
  brandName: string;
  logoUrl?: string;
  logoAlt?: string;
  tone: 'dark' | 'light';
  u: number;
  logoScale: number;
  logoCutout: boolean;
};

// Rendered at design size; the parent scales it visually. Export captures this node at EXPORT_PIXEL_RATIO.
export const PosterTemplate = forwardRef<HTMLDivElement, TemplateProps>(function PosterTemplate(
  {
    template,
    format,
    content,
    palette,
    brandName,
    logoUrl,
    logoAlt,
    textScale = 1,
    textAlign = 'left',
    showLogo = true,
    logoScale = 1,
    logoCutout = false,
    backgroundColor = '',
    gradientMode = 'auto',
    backgroundOpacity = 0.72,
    backgroundImageUrl = '',
    textOffsetX = 0,
    textOffsetY = 0,
    textOpacity = 1,
    layers = [],
    selectedLayerId = '',
    editableLayers = false,
    onSelectLayer,
    onChangeLayer,
  },
  ref,
) {
  const dim = posterDimensions[format];
  const u = dim.width / 540;
  const compact = format === 'landscape' || format === 'youtube';
  const backgroundBase = clampHex(backgroundColor || '') ?? defaultBackgroundColor(template, palette);
  const rootInk = readableOn(backgroundBase);
  const rootMuted = alpha(rootInk, rootInk === '#FFFFFF' ? 0.84 : 0.72);
  const inverseInk = rootInk === '#FFFFFF' ? palette.primaryDark : '#FFFFFF';
  const root = { ...rootStyle(dim.width, dim.height), textAlign, background: posterBackground(template, palette, backgroundColor, gradientMode) };
  const h1Size = headlineSize(content.headline, compact ? 40 : 58, compact ? 28 : 36, u) * textScale;
  const subSize = (compact ? 17 * u : 22 * u) * textScale;
  const safeX = compact ? 34 * u : 44 * u;
  const blockAlign = alignBlock(textAlign);
  const stackAlign = alignStack(textAlign);
  const textMove: CSSProperties = { transform: 'translate(' + textOffsetX + 'px, ' + textOffsetY + 'px)', opacity: textOpacity };
  const bgLayer = <BackgroundLayer imageUrl={backgroundImageUrl} opacity={backgroundOpacity} />;
  const editorLayers = (
    <PosterLayerOverlay
      layers={layers}
      selectedLayerId={selectedLayerId}
      editable={editableLayers}
      onSelectLayer={onSelectLayer}
      onChangeLayer={onChangeLayer}
    />
  );
  const brand = showLogo ? <BrandLockup brandName={brandName} logoUrl={logoUrl} logoAlt={logoAlt} tone="light" u={u} logoScale={logoScale} logoCutout={logoCutout} /> : null;
  const darkBrand = showLogo ? <BrandLockup brandName={brandName} logoUrl={logoUrl} logoAlt={logoAlt} tone="dark" u={u} logoScale={logoScale} logoCutout={logoCutout} /> : null;

  if (template === 'premium') {
    return (
      <div ref={ref} style={{ ...root, color: rootInk, padding: safeX }}>
        {bgLayer}
        <SubtleGrid color={alpha(rootInk, 0.08)} />
        <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
          {brand}
          <div style={{ margin: 'auto 0', maxWidth: compact ? 440 * u : 420 * u, ...blockAlign, textAlign, ...textMove }}>
            {content.offer ? <Pill text={content.offer} bg={alpha(palette.accent, 0.16)} color={palette.accent} u={u} /> : null}
            <h1 style={{ margin: (18 * u) + 'px 0 0', fontFamily: SERIF_STACK, fontSize: h1Size, lineHeight: 1.02, fontWeight: 700, letterSpacing: 0 }}>{content.headline}</h1>
            <div style={{ width: 76 * u, height: 3 * u, background: palette.accent, margin: (22 * u) + 'px 0' }} />
            <p style={{ margin: 0, maxWidth: 420 * u, fontSize: subSize, lineHeight: 1.4, color: rootMuted }}>{content.subheadline}</p>
          </div>
          <FooterCta text={content.callToAction} bg={palette.accent} color={palette.onAccent} alignSelf={stackAlign} u={u} />
        </div>
        {editorLayers}
      </div>
    );
  }

  if (template === 'editorial') {
    return (
      <div ref={ref} style={{ ...root, color: palette.text }}>
        {bgLayer}
        <div style={{ position: 'absolute', zIndex: 2, inset: 18 * u, border: '1px solid ' + alpha(palette.primary, 0.16) }} />
        <div style={{ position: 'absolute', zIndex: 2, top: 0, left: 0, right: 0, height: compact ? 68 * u : 82 * u, background: palette.primary, display: 'flex', alignItems: 'center', padding: '0 ' + safeX + 'px' }}>
          {brand}
        </div>
        <div style={{ position: 'absolute', zIndex: 2, top: compact ? 108 * u : 136 * u, left: safeX, right: safeX, bottom: safeX, display: 'flex', flexDirection: 'column', alignItems: stackAlign, textAlign, ...textMove }}>
          {content.offer ? <Pill text={content.offer} bg={palette.accent} color={palette.onAccent} u={u} /> : null}
          <h1 style={{ margin: (content.offer ? 20 * u : 0) + 'px 0 0', fontSize: h1Size, lineHeight: 1.05, fontWeight: 850, letterSpacing: 0, color: palette.text }}>{content.headline}</h1>
          <p style={{ margin: (20 * u) + 'px 0 0', fontSize: subSize, lineHeight: 1.42, color: palette.muted, maxWidth: 430 * u }}>{content.subheadline}</p>
          <div style={{ marginTop: 'auto' }}>
            <FooterCta text={content.callToAction} bg="transparent" color={palette.text} border={palette.text} alignSelf={stackAlign} u={u} />
          </div>
        </div>
        {editorLayers}
      </div>
    );
  }

  if (template === 'bold') {
    return (
      <div ref={ref} style={{ ...root, color: rootInk }}>
        {bgLayer}
        <div style={{ position: 'absolute', zIndex: 2, top: 0, left: 0, right: 0, height: dim.height * (compact ? 0.46 : 0.4), background: 'linear-gradient(135deg, ' + palette.primary + ', ' + shade(palette.primary, 0.12) + ')', padding: (30 * u) + 'px ' + safeX + 'px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {brand}
          {content.offer ? <div style={{ color: palette.onPrimary, fontSize: headlineSize(content.offer, compact ? 46 : 64, compact ? 32 : 42, u), fontWeight: 900, lineHeight: 1, letterSpacing: 0 }}>{content.offer}</div> : null}
        </div>
        <div style={{ position: 'absolute', zIndex: 2, top: dim.height * (compact ? 0.46 : 0.4), left: 0, right: 0, bottom: 0, padding: (compact ? 24 * u : 36 * u) + 'px ' + safeX + 'px', display: 'flex', flexDirection: 'column', alignItems: stackAlign, textAlign, ...textMove }}>
          <h1 style={{ margin: 0, fontSize: h1Size, lineHeight: 1.05, fontWeight: 900, letterSpacing: 0 }}>{content.headline}</h1>
          <p style={{ margin: (14 * u) + 'px 0 0', fontSize: subSize, lineHeight: 1.4, color: rootMuted, maxWidth: 440 * u }}>{content.subheadline}</p>
          <FooterCta text={content.callToAction} bg={palette.accent} color={palette.onAccent} alignSelf={stackAlign} u={u} />
        </div>
        {editorLayers}
      </div>
    );
  }

  if (template === 'educational') {
    return (
      <div ref={ref} style={{ ...root, color: palette.text, padding: safeX }}>
        {bgLayer}
        <SubtleGrid color={alpha(palette.primary, 0.08)} />
        <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
          {darkBrand}
          <div style={{ marginTop: compact ? 24 * u : 44 * u, ...blockAlign, textAlign, ...textMove }}>
            <Pill text={content.offer || 'Useful guide'} bg={alpha(palette.primary, 0.1)} color={palette.primaryDark} u={u} />
            <h1 style={{ margin: (18 * u) + 'px 0 0', fontSize: h1Size, lineHeight: 1.05, fontWeight: 850, letterSpacing: 0 }}>{content.headline}</h1>
            <p style={{ margin: (18 * u) + 'px 0 0', fontSize: subSize, lineHeight: 1.42, color: palette.muted, maxWidth: 430 * u }}>{content.subheadline}</p>
          </div>
          <div style={{ marginTop: 'auto', display: 'grid', gridTemplateColumns: compact ? 'repeat(3, 1fr)' : '1fr', gap: 10 * u }}>
            {['Clear message', 'Brand colors', 'Ready to publish'].map((item, index) => (
              <div key={item} style={{ border: '1px solid ' + alpha(palette.primary, 0.16), background: '#FFFFFF', borderRadius: 8 * u, padding: (12 * u) + 'px ' + (14 * u) + 'px', display: 'flex', gap: 10 * u, alignItems: 'center' }}>
                <strong style={{ color: palette.accent, fontSize: 18 * u }}>{index + 1}</strong>
                <span style={{ color: palette.text, fontSize: 13 * u, fontWeight: 750 }}>{item}</span>
              </div>
            ))}
          </div>
          <FooterCta text={content.callToAction} bg={palette.primary} color={palette.onPrimary} alignSelf={stackAlign} u={u} />
        </div>
        {editorLayers}
      </div>
    );
  }

  if (template === 'spotlight') {
    return (
      <div ref={ref} style={{ ...root, color: rootInk, padding: safeX }}>
        {bgLayer}
        <DiagonalBars color={alpha(palette.accent, 0.22)} />
        <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 * u }}>
            {brand}
            {content.offer ? <Pill text={content.offer} bg={alpha(rootInk, 0.14)} color={rootInk} u={u} /> : null}
          </div>
          <div style={{ marginTop: 'auto', maxWidth: compact ? 440 * u : 430 * u, ...blockAlign, textAlign, ...textMove }}>
            <h1 style={{ margin: 0, fontSize: h1Size, lineHeight: 1.02, fontWeight: 900, letterSpacing: 0 }}>{content.headline}</h1>
            <p style={{ margin: (20 * u) + 'px 0 0', fontSize: subSize, lineHeight: 1.42, color: rootMuted }}>{content.subheadline}</p>
            <FooterCta text={content.callToAction} bg={rootInk} color={inverseInk} alignSelf={stackAlign} u={u} />
          </div>
        </div>
        {editorLayers}
      </div>
    );
  }

  return (
    <div ref={ref} style={{ ...root, color: rootInk, padding: safeX }}>
      {bgLayer}
      <SubtleGrid color={alpha(rootInk, 0.09)} />
      <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {brand}
        <div style={{ margin: 'auto 0', maxWidth: compact ? 460 * u : 430 * u, ...blockAlign, textAlign, ...textMove }}>
          <Pill text={content.offer || 'AI marketing'} bg={alpha(palette.accent, 0.18)} color={palette.accent} u={u} />
          <h1 style={{ margin: (20 * u) + 'px 0 0', fontSize: h1Size, lineHeight: 1.02, fontWeight: 900, letterSpacing: 0 }}>{content.headline}</h1>
          <p style={{ margin: (18 * u) + 'px 0 0', fontSize: subSize, lineHeight: 1.42, color: rootMuted }}>{content.subheadline}</p>
        </div>
        <FooterCta text={content.callToAction} bg={palette.accent} color={palette.onAccent} alignSelf={stackAlign} u={u} />
      </div>
      {editorLayers}
    </div>
  );
});

function posterBackground(template: PosterTemplateId, palette: Palette, backgroundColor: string, gradientMode: PosterGradientMode) {
  const chosen = clampHex(backgroundColor || '');
  const base = chosen ?? defaultBackgroundColor(template, palette);
  if (gradientMode === 'none') return base;
  if (gradientMode === 'soft') return 'linear-gradient(145deg, ' + shade(base, -0.18) + ', ' + base + ' 58%, ' + shade(palette.accent, 0.22) + ')';
  if (gradientMode === 'diagonal') return 'linear-gradient(135deg, ' + shade(base, -0.38) + ', ' + base + ' 56%, ' + shade(palette.accent, -0.08) + ')';
  if (gradientMode === 'radial') return 'radial-gradient(circle at 26% 18%, ' + shade(palette.accent, 0.22) + ', transparent 34%), linear-gradient(150deg, ' + shade(base, -0.28) + ', ' + base + ')';
  if (chosen) return base;
  return 'linear-gradient(145deg, ' + base + ', ' + shade(base, -0.04) + ')';
}

function defaultBackgroundColor(_template: PosterTemplateId, palette: Palette) {
  return palette.bg;
}

function BackgroundLayer({ imageUrl, opacity }: { imageUrl: string; opacity: number }) {
  if (!imageUrl) return null;
  return (
    <img
      aria-hidden="true"
      src={imageUrl}
      alt=""
      crossOrigin="anonymous"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        opacity,
        zIndex: 1,
        pointerEvents: 'none',
      }}
    />
  );
}

function PosterLayerOverlay({
  layers,
  selectedLayerId,
  editable,
  onSelectLayer,
  onChangeLayer,
}: {
  layers: PosterLayer[];
  selectedLayerId: string;
  editable: boolean;
  onSelectLayer?: (id: string) => void;
  onChangeLayer?: (id: string, patch: Partial<PosterLayer>) => void;
}) {
  const dragRef = useRef<{ id: string; x: number; y: number; startX: number; startY: number } | null>(null);

  function startDrag(event: ReactPointerEvent<HTMLDivElement>, layer: PosterLayer) {
    if (!editable || !onChangeLayer) return;
    event.stopPropagation();
    onSelectLayer?.(layer.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: layer.id, x: layer.x, y: layer.y, startX: event.clientX, startY: event.clientY };
  }

  function moveLayer(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !onChangeLayer) return;
    const root = event.currentTarget.parentElement;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const dx = ((event.clientX - dragRef.current.startX) / rect.width) * 100;
    const dy = ((event.clientY - dragRef.current.startY) / rect.height) * 100;
    onChangeLayer(dragRef.current.id, {
      x: clamp(dragRef.current.x + dx, -10, 110),
      y: clamp(dragRef.current.y + dy, -10, 110),
    });
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current && event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  }

  return (
    <div aria-hidden={!editable} style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: editable ? 'auto' : 'none' }}>
      {layers.map((layer) => {
        const selected = editable && selectedLayerId === layer.id;
        const common: CSSProperties = {
          position: 'absolute',
          left: layer.x + '%',
          top: layer.y + '%',
          width: layer.width + '%',
          opacity: layer.opacity,
          transform: 'rotate(' + layer.rotation + 'deg)',
          transformOrigin: 'center center',
          cursor: editable ? 'move' : 'default',
          outline: selected ? '2px solid rgba(225,28,107,0.9)' : 'none',
          outlineOffset: selected ? 3 : 0,
          userSelect: 'none',
        };

        if (layer.kind === 'text') {
          return (
            <div
              key={layer.id}
              role={editable ? 'button' : undefined}
              tabIndex={editable ? 0 : undefined}
              onPointerDown={(event) => startDrag(event, layer)}
              onPointerMove={moveLayer}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              style={{
                ...common,
                color: layer.color,
                fontSize: layer.fontSize,
                lineHeight: 1.1,
                fontWeight: layer.fontWeight,
                textAlign: layer.align,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
              }}
            >
              {layer.text}
            </div>
          );
        }

        if (layer.kind === 'image') {
          return (
            <div
              key={layer.id}
              role={editable ? 'button' : undefined}
              tabIndex={editable ? 0 : undefined}
              onPointerDown={(event) => startDrag(event, layer)}
              onPointerMove={moveLayer}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              style={{ ...common, height: layer.height + '%', borderRadius: layer.borderRadius, overflow: 'hidden' }}
            >
              <img src={layer.src} alt={layer.alt} style={{ width: '100%', height: '100%', objectFit: layer.objectFit, display: 'block' }} />
            </div>
          );
        }

        return (
          <div
            key={layer.id}
            role={editable ? 'button' : undefined}
            tabIndex={editable ? 0 : undefined}
            onPointerDown={(event) => startDrag(event, layer)}
            onPointerMove={moveLayer}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{
              ...common,
              height: layer.height + '%',
              background: layer.color,
              borderRadius: layer.shape === 'circle' ? '999px' : layer.borderRadius,
            }}
          />
        );
      })}
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function alignBlock(textAlign: PosterTextAlign): CSSProperties {
  if (textAlign === 'center') return { marginLeft: 'auto', marginRight: 'auto' };
  if (textAlign === 'right') return { marginLeft: 'auto', marginRight: 0 };
  return { marginLeft: 0, marginRight: 'auto' };
}

function alignStack(textAlign: PosterTextAlign): CSSProperties['alignItems'] {
  if (textAlign === 'center') return 'center';
  if (textAlign === 'right') return 'flex-end';
  return 'flex-start';
}

function rootStyle(width: number, height: number): CSSProperties {
  return {
    width,
    height,
    position: 'relative',
    overflow: 'hidden',
    fontFamily: FONT_STACK,
    boxSizing: 'border-box',
  };
}

function BrandLockup({ brandName, logoUrl, logoAlt, tone, u, logoScale, logoCutout }: BrandLockupProps) {
  const transparentLogo = logoCutout && Boolean(logoUrl);
  const plateBg = transparentLogo ? 'transparent' : tone === 'light' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.82)';
  const textColor = '#111827';

  if (logoUrl) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: transparentLogo ? 0 : 92 * u * logoScale, maxWidth: 176 * u * logoScale, height: 44 * u * logoScale, borderRadius: 8 * u, background: plateBg, padding: transparentLogo ? 0 : (8 * u) + 'px ' + (12 * u) + 'px', boxShadow: transparentLogo ? '0 8px 18px rgba(15,23,42,0.12)' : '0 10px 28px rgba(15,23,42,0.12)' }}>
        <img src={logoUrl} alt={logoAlt || brandName + ' logo'} crossOrigin="anonymous" style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 36 * u * logoScale, color: textColor, background: plateBg, borderRadius: 8 * u, padding: (8 * u) + 'px ' + (12 * u) + 'px', fontSize: 14 * u * logoScale, fontWeight: 850, letterSpacing: 0, textTransform: 'uppercase', boxShadow: '0 10px 28px rgba(15,23,42,0.12)' }}>
      {brandName}
    </span>
  );
}

function Pill({ text, bg, color, u }: { text: string; bg: string; color: string; u: number }) {
  if (!text) return null;
  return (
    <span style={{ display: 'inline-flex', alignSelf: 'flex-start', background: bg, color, fontSize: 13 * u, lineHeight: 1.1, fontWeight: 850, padding: (8 * u) + 'px ' + (13 * u) + 'px', borderRadius: 999 }}>
      {text}
    </span>
  );
}

function FooterCta({ text, bg, color, border, alignSelf = 'flex-start', u }: { text: string; bg: string; color: string; border?: string; alignSelf?: CSSProperties['alignSelf']; u: number }) {
  if (!text) return <span />;
  return (
    <span style={{ alignSelf, display: 'inline-flex', marginTop: 'auto', background: bg, color, border: border ? (2 * u) + 'px solid ' + border : 'none', fontSize: 16 * u, fontWeight: 850, lineHeight: 1, padding: (12 * u) + 'px ' + (20 * u) + 'px', borderRadius: 8 * u }}>
      {text}
    </span>
  );
}

function SubtleGrid({ color }: { color: string }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        pointerEvents: 'none',
        backgroundImage: 'linear-gradient(' + color + ' 1px, transparent 1px), linear-gradient(90deg, ' + color + ' 1px, transparent 1px)',
        backgroundSize: '42px 42px',
        opacity: 0.5,
      }}
    />
  );
}

function DiagonalBars({ color }: { color: string }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        pointerEvents: 'none',
        background: 'repeating-linear-gradient(135deg, transparent 0, transparent 34px, ' + color + ' 34px, ' + color + ' 36px)',
      }}
    />
  );
}

function headlineSize(text: string, base: number, min: number, u: number) {
  const length = text.trim().length;
  const factor = length > 66 ? 0.68 : length > 48 ? 0.76 : length > 32 ? 0.88 : 1;
  return Math.max(min * u, base * factor * u);
}
