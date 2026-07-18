from __future__ import annotations

import base64
import io
import json
import os
import re
import textwrap
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parent
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
TEXT_MODEL = os.getenv("POSTER_TEXT_MODEL", "gpt-4o-mini")
IMAGE_MODEL = os.getenv("POSTER_IMAGE_MODEL", "gpt-image-2")
IMAGE_QUALITY = os.getenv("POSTER_IMAGE_QUALITY", "high")
REQUIRE_AUTH = os.getenv("POSTER_REQUIRE_AUTH", "true").lower() not in {"0", "false", "no"}
MAX_CONCEPTS = max(1, min(int(os.getenv("POSTER_MAX_CONCEPTS", "4")), 6))

EXPORT_SIZES: dict[str, tuple[int, int]] = {
    "square": (1080, 1080),
    "1080x1080": (1080, 1080),
    "portrait": (1080, 1350),
    "1080x1350": (1080, 1350),
    "story": (1080, 1920),
    "1080x1920": (1080, 1920),
    "landscape": (1200, 628),
    "1200x628": (1200, 628),
    "youtube": (1280, 720),
    "1280x720": (1280, 720),
}

MODEL_SIZES: dict[str, str] = {
    "square": "1024x1024",
    "portrait": "1024x1536",
    "story": "1024x1536",
    "landscape": "1536x1024",
    "youtube": "1536x1024",
}

DEFAULT_PALETTES = {
    "signature": {"bg": "#0C1A2E", "ink": "#F1ECE0", "muted": "#9FB0C4", "accent": "#C8A24C"},
    "value": {"bg": "#F4F7FA", "ink": "#18202B", "muted": "#667085", "accent": "#246BCE"},
    "premium": {"bg": "#151515", "ink": "#F7F0E5", "muted": "#C9BDAA", "accent": "#C7A05A"},
    "bold": {"bg": "#101114", "ink": "#FFFFFF", "muted": "#C9CDD5", "accent": "#FF5A36"},
    "edu": {"bg": "#F2FAF8", "ink": "#17312D", "muted": "#60706D", "accent": "#16877A"},
    "direct": {"bg": "#15171C", "ink": "#FFFFFF", "muted": "#D4D7DD", "accent": "#FFB703"},
}


class PosterRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    mode: Literal["health", "concepts", "poster", "poster_set"] = "poster_set"
    action: str | None = None
    orgId: str = ""
    userId: str = ""
    context: str = ""
    brief: str = ""
    rawBrief: str = ""
    userIdea: str = ""
    topic: str = ""
    objective: str = "awareness"
    format: str = "portrait"
    language: str = "en"
    offerType: str = "none"
    cta: str = ""
    callToAction: str = ""
    contactDetails: dict[str, str] = Field(default_factory=dict)
    qr: dict[str, Any] = Field(default_factory=dict)
    theme: str = "signature"
    colors: dict[str, str] = Field(default_factory=dict)
    palette: dict[str, Any] = Field(default_factory=dict)
    sizes: list[str] = Field(default_factory=list)
    count: int = 1
    conceptCount: int | None = None
    previewCount: int | None = None
    brandName: str = ""
    brandword: str = ""
    businessDna: dict[str, Any] | None = None
    logo: dict[str, Any] = Field(default_factory=dict)
    productMarketingMode: bool = False
    productImage: dict[str, Any] = Field(default_factory=dict)
    learningContext: dict[str, Any] = Field(default_factory=dict)

    def prompt_brief(self) -> str:
        return next((v.strip() for v in (self.brief, self.rawBrief, self.userIdea, self.context, self.topic) if v.strip()), "")


class PosterCopy(BaseModel):
    eyebrow: str = ""
    headline: str
    subheadline: str = ""
    callToAction: str = ""
    contactText: str = ""


class ConceptPlan(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str
    angle: str
    layout: Literal["bottom", "centered", "band", "facts"] = "bottom"
    visual_prompt: str
    poster_copy: PosterCopy = Field(alias="copy")
    logo_placement: str = "top-left"
    logo_treatment: str = "plain"
    product_placement: str = "right"
    product_treatment: str = "plain"


@dataclass(frozen=True)
class UserContext:
    user_id: str
    access_token: str


def _allowed_origins() -> list[str]:
    configured = os.getenv("POSTER_ALLOWED_ORIGINS", "")
    defaults = "http://localhost:5173,http://127.0.0.1:5173,https://time2grow.vercel.app"
    return [value.strip().rstrip("/") for value in (configured or defaults).split(",") if value.strip()]


app = FastAPI(title="time2grow Python Poster Agent", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


def _env(name: str, fallback: str = "") -> str:
    return os.getenv(name, fallback).strip()


def _supabase_config() -> tuple[str, str]:
    url = _env("SUPABASE_URL", _env("VITE_SUPABASE_URL")).rstrip("/")
    anon = _env("SUPABASE_ANON_KEY", _env("VITE_SUPABASE_ANON_KEY"))
    return url, anon


async def _authenticate(authorization: str | None, org_id: str) -> UserContext:
    if not REQUIRE_AUTH:
        return UserContext(user_id="local-development", access_token="")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Sign in before generating a poster.")
    token = authorization.split(" ", 1)[1].strip()
    supabase_url, anon_key = _supabase_config()
    if not supabase_url or not anon_key:
        raise HTTPException(status_code=503, detail="Poster authentication is not configured on the server.")

    headers = {"apikey": anon_key, "Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=20) as client:
        user_response = await client.get(f"{supabase_url}/auth/v1/user", headers=headers)
        if user_response.status_code != 200:
            raise HTTPException(status_code=401, detail="Your session expired. Sign in again.")
        user_id = str(user_response.json().get("id") or "")
        if not user_id:
            raise HTTPException(status_code=401, detail="Could not verify your user account.")
        if org_id:
            membership = await client.get(
                f"{supabase_url}/rest/v1/organization_memberships",
                headers={**headers, "Accept": "application/json"},
                params={"select": "id", "org_id": f"eq.{org_id}", "user_id": f"eq.{user_id}", "limit": "1"},
            )
            if membership.status_code != 200 or not membership.json():
                raise HTTPException(status_code=403, detail="You do not have access to this workspace.")
    return UserContext(user_id=user_id, access_token=token)


def _brand_name(request: PosterRequest) -> str:
    dna = request.businessDna or {}
    return (request.brandName or request.brandword or str(request.logo.get("brandName") or "") or str(dna.get("brandName") or "")).strip()


def _palette(request: PosterRequest) -> dict[str, str]:
    source = request.colors or request.palette
    base = DEFAULT_PALETTES.get(request.theme, DEFAULT_PALETTES["signature"]).copy()
    aliases = {"text": "ink", "primary": "accent", "background": "bg", "secondary": "muted"}
    for key, value in source.items():
        target = aliases.get(key, key)
        if target in base and isinstance(value, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", value.strip()):
            base[target] = value.strip().upper()
    return base


def _format_key(request: PosterRequest) -> str:
    raw = (request.format or (request.sizes[0] if request.sizes else "portrait")).lower().replace(" ", "")
    if raw in {"1080x1080", "square"}: return "square"
    if raw in {"1080x1920", "story", "reel", "status"}: return "story"
    if raw in {"1200x628", "landscape"}: return "landscape"
    if raw in {"1280x720", "youtube", "thumbnail"}: return "youtube"
    return "portrait"


def _contact_text(request: PosterRequest) -> str:
    values = [str(request.contactDetails.get(key) or "").strip() for key in ("website", "phone", "email")]
    return "  •  ".join(value for value in values if value)


def _planner_prompt(request: PosterRequest, count: int, palette: dict[str, str]) -> str:
    dna = request.businessDna or {}
    forbidden = request.learningContext.get("forbiddenHeadlines") or request.learningContext.get("recentHeadlines") or []
    facts = {
        "brief": request.prompt_brief(),
        "objective": request.objective,
        "language": request.language,
        "offer_type": request.offerType,
        "requested_cta": request.callToAction or request.cta,
        "contact_text": _contact_text(request),
        "brand": _brand_name(request),
        "audience": dna.get("audience"),
        "positioning": dna.get("positioning"),
        "mission": dna.get("mission"),
        "palette": palette,
        "format": _format_key(request),
        "product_photo_available": bool(request.productMarketingMode and request.productImage.get("available")),
        "avoid_headlines": forbidden[:20] if isinstance(forbidden, list) else [],
    }
    return f"""Create {count} genuinely different premium advertising poster concept plan(s).
Return JSON only as {{\"concepts\":[...]}}. Each concept must contain:
title, angle, layout (bottom|centered|band|facts), visual_prompt, copy, logo_placement,
logo_treatment, product_placement, product_treatment. copy must contain eyebrow,
headline, subheadline, callToAction, contactText.

Rules:
- Respect the requested language. Telugu must use Telugu script; Hindi must use Devanagari.
- Headline: ideally 3-6 words, never more than 9. Subheadline: one short line under 18 words.
- CTA: 2-5 words. Do not invent discounts, prices, dates, guarantees, phone numbers, URLs, awards, or urgency.
- Every angle and composition must be clearly different. Avoid generic AI purple gradients and tired stock-ad language.
- visual_prompt describes a text-free, logo-free background only, with one clear focal point and safe negative space.
- Do not ask the image model to draw letters, numbers, logos, QR codes, UI, or watermarks.
- Keep exact requested CTA/contact facts unchanged. If absent, leave them empty.
- Product placement must leave room for a real browser-side product-photo overlay when one is available.

Verified input:
{json.dumps(facts, ensure_ascii=False)}"""


def _fallback_plan(request: PosterRequest, index: int) -> ConceptPlan:
    brief = request.prompt_brief().strip()
    words = [word for word in re.split(r"\s+", brief) if word]
    headline = " ".join(words[:8]) or "A Better Way Forward"
    angles = ["Clear benefit", "Emotional outcome", "Direct action", "Authority", "Local relevance", "Educational"]
    layouts = ["bottom", "centered", "band", "facts"]
    return ConceptPlan(
        title=f"{angles[index % len(angles)]} concept",
        angle=angles[index % len(angles)],
        layout=layouts[index % len(layouts)],
        visual_prompt=f"Premium commercial background representing {brief}; clear focal object, generous negative space, editorial lighting",
        copy=PosterCopy(
            headline=headline,
            subheadline=str(request.objective or "").strip(),
            callToAction=(request.callToAction or request.cta).strip(),
            contactText=_contact_text(request),
        ),
        logo_placement="top-left" if index % 2 == 0 else "top-right",
        product_placement="right" if index % 2 == 0 else "left",
    )


async def _plan_concepts(request: PosterRequest, count: int, palette: dict[str, str]) -> list[ConceptPlan]:
    key = _env("OPENAI_API_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured for the Python poster service.")
    body = {
        "model": TEXT_MODEL,
        "messages": [
            {"role": "system", "content": "You are a senior art director and multilingual advertising copywriter. Return valid JSON only."},
            {"role": "user", "content": _planner_prompt(request, count, palette)},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.95,
    }
    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.post(
            f"{OPENAI_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=body,
        )
    if response.status_code >= 400:
        detail = response.json().get("error", {}).get("message") if "application/json" in response.headers.get("content-type", "") else response.text
        raise HTTPException(status_code=502, detail=f"Poster planning failed: {str(detail)[:300]}")
    try:
        content = response.json()["choices"][0]["message"]["content"]
        payload = json.loads(content)
        raw_concepts = payload.get("concepts") if isinstance(payload, dict) else []
        plans = [ConceptPlan.model_validate(item) for item in raw_concepts[:count]]
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        plans = []
    while len(plans) < count:
        plans.append(_fallback_plan(request, len(plans)))
    return plans


def _background_prompt(request: PosterRequest, plan: ConceptPlan, palette: dict[str, str]) -> str:
    brand_context = (request.businessDna or {}).get("positioning") or request.objective
    product_note = "Reserve a clean open area for a real product cutout." if request.productMarketingMode else ""
    return f"""Create a premium advertising poster BACKGROUND ONLY for: {request.prompt_brief()}.
Art direction: {plan.visual_prompt}. Brand context: {brand_context}.
Palette: background {palette['bg']}, accent {palette['accent']}, supporting tones {palette['muted']}.
Composition: {plan.layout}; reserve generous clean negative space for later typography; 8-10% safe margins. {product_note}
Absolutely no text, letters, numbers, prices, logos, brands, QR codes, watermarks, fake app interfaces, or decorative gibberish.
No celebrity likenesses and no copyrighted characters. Polished, original, campaign-ready commercial art."""


async def _generate_background(request: PosterRequest, plan: ConceptPlan, palette: dict[str, str]) -> Image.Image:
    key = _env("OPENAI_API_KEY")
    fmt = _format_key(request)
    body: dict[str, Any] = {
        "model": IMAGE_MODEL,
        "prompt": _background_prompt(request, plan, palette),
        "size": MODEL_SIZES[fmt],
        "quality": IMAGE_QUALITY,
        "output_format": "png",
    }
    async with httpx.AsyncClient(timeout=230) as client:
        response = await client.post(
            f"{OPENAI_BASE_URL}/images/generations",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=body,
        )
        if response.status_code == 400 and "output_format" in response.text:
            body.pop("output_format", None)
            response = await client.post(
                f"{OPENAI_BASE_URL}/images/generations",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=body,
            )
    if response.status_code >= 400:
        try:
            detail = response.json().get("error", {}).get("message")
        except ValueError:
            detail = response.text
        raise HTTPException(status_code=502, detail=f"Poster image generation failed: {str(detail)[:300]}")
    item = response.json().get("data", [{}])[0]
    if item.get("b64_json"):
        raw = base64.b64decode(item["b64_json"])
    elif item.get("url"):
        async with httpx.AsyncClient(timeout=90) as client:
            image_response = await client.get(item["url"])
            image_response.raise_for_status()
            raw = image_response.content
    else:
        raise HTTPException(status_code=502, detail="The image provider returned no poster background.")
    return Image.open(io.BytesIO(raw)).convert("RGB")


def _font_path(language: str, bold: bool) -> Path | None:
    family = "NotoSansTelugu" if language == "te" else "NotoSansDevanagari" if language == "hi" else "NotoSans"
    candidates = [
        ROOT / "fonts" / f"{family}-Bold.ttf" if bold else ROOT / "fonts" / f"{family}-Regular.ttf",
        ROOT / "fonts" / f"{family}-Variable.ttf",
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    return next((path for path in candidates if path.exists()), None)


def _font(language: str, size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = _font_path(language, bold)
    if not path:
        return ImageFont.load_default(size=size)
    font = ImageFont.truetype(str(path), size=size)
    if bold:
        try:
            font.set_variation_by_name("Bold")
        except (AttributeError, OSError):
            pass
    return font


def _cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    target_w, target_h = size
    scale = max(target_w / image.width, target_h / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def _hex(value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = value.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha)


def _wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width: int, max_lines: int) -> list[str]:
    if not text: return []
    words = text.split()
    if not words: return []
    lines: list[str] = []
    line = words[0]
    for word in words[1:]:
        candidate = f"{line} {word}"
        if draw.textbbox((0, 0), candidate, font=font)[2] <= max_width:
            line = candidate
        else:
            lines.append(line)
            line = word
    lines.append(line)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        while lines[-1] and draw.textbbox((0, 0), lines[-1] + "…", font=font)[2] > max_width:
            lines[-1] = lines[-1][:-1]
        lines[-1] = lines[-1].rstrip() + "…"
    return lines


def _render_final(background: Image.Image, request: PosterRequest, plan: ConceptPlan, palette: dict[str, str]) -> str:
    size = EXPORT_SIZES[_format_key(request)]
    base = _cover(background, size).convert("RGBA")
    base = ImageEnhance.Contrast(base).enhance(0.94)
    width, height = size
    overlay = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    margin = round(width * 0.085)
    box_width = width - (margin * 2)
    language = request.language if request.language in {"te", "hi"} else "en"

    if plan.layout in {"bottom", "band"}:
        top = round(height * (0.50 if height / width > 1.45 else 0.39))
        draw.rectangle((0, top, width, height), fill=_hex(palette["bg"], 230))
        y = top + round(height * 0.05)
    elif plan.layout == "facts":
        top = round(height * 0.24)
        draw.rounded_rectangle((margin * 0.65, top, width - margin * 0.65, height - margin), radius=32, fill=_hex(palette["bg"], 226))
        y = top + round(height * 0.055)
    else:
        draw.rectangle((0, 0, width, height), fill=_hex(palette["bg"], 145))
        y = round(height * 0.30)

    headline_size = max(48, round(width * (0.072 if height / width > 1.5 else 0.064)))
    sub_size = max(26, round(width * 0.030))
    meta_size = max(22, round(width * 0.023))
    eyebrow_font = _font(language, meta_size, True)
    headline_font = _font(language, headline_size, True)
    sub_font = _font(language, sub_size)
    cta_font = _font(language, meta_size + 4, True)

    if plan.poster_copy.eyebrow:
        eyebrow = plan.poster_copy.eyebrow.upper() if language == "en" else plan.poster_copy.eyebrow
        draw.text((margin, y), eyebrow, font=eyebrow_font, fill=_hex(palette["accent"]), stroke_width=0)
        y += round(meta_size * 1.9)

    headline_lines = _wrap(draw, plan.poster_copy.headline, headline_font, box_width, 3)
    for line in headline_lines:
        draw.text((margin, y), line, font=headline_font, fill=_hex(palette["ink"]), stroke_width=0)
        y += round(headline_size * 1.12)
    y += round(height * 0.012)

    for line in _wrap(draw, plan.poster_copy.subheadline, sub_font, box_width, 2):
        draw.text((margin, y), line, font=sub_font, fill=_hex(palette["muted"]), stroke_width=0)
        y += round(sub_size * 1.42)

    cta = plan.poster_copy.callToAction.strip()
    if cta:
        y += round(height * 0.025)
        text_box = draw.textbbox((0, 0), cta, font=cta_font)
        cta_width = min(box_width, text_box[2] + round(width * 0.075))
        cta_height = round(meta_size * 2.55)
        draw.rounded_rectangle((margin, y, margin + cta_width, y + cta_height), radius=cta_height // 2, fill=_hex(palette["accent"]))
        accent_rgb = _hex(palette["accent"])
        luminance = (0.299 * accent_rgb[0]) + (0.587 * accent_rgb[1]) + (0.114 * accent_rgb[2])
        cta_ink = (15, 20, 28, 255) if luminance > 145 else (255, 255, 255, 255)
        draw.text((margin + round(width * 0.035), y + round(meta_size * 0.62)), cta, font=cta_font, fill=cta_ink)

    footer = plan.poster_copy.contactText.strip()
    brand = _brand_name(request)
    if footer or brand:
        footer_text = "  •  ".join(value for value in (brand, footer) if value)
        footer_y = height - margin - round(meta_size * 1.2)
        draw.text((margin, footer_y), footer_text, font=_font(language, meta_size), fill=_hex(palette["ink"], 235))

    final = Image.alpha_composite(base, overlay).convert("RGB")
    output = io.BytesIO()
    final.save(output, format="WEBP", quality=88, method=6)
    encoded = base64.b64encode(output.getvalue()).decode("ascii")
    return f"data:image/webp;base64,{encoded}"


def _concept_payload(plan: ConceptPlan, index: int, image_data_url: str | None, request: PosterRequest) -> dict[str, Any]:
    product_available = bool(request.productMarketingMode and request.productImage.get("available"))
    payload: dict[str, Any] = {
        "id": f"python-{uuid.uuid4().hex[:12]}",
        "title": plan.title,
        "angle": plan.angle,
        "copy": plan.poster_copy.model_dump(),
        "logo": {"placement": plan.logo_placement, "treatment": plan.logo_treatment},
        "qr": {"placement": "bottom-right" if plan.logo_placement != "bottom-right" else "bottom-left"},
        "productImage": {
            "placement": plan.product_placement,
            "treatment": plan.product_treatment,
            "reason": "Reserved for the uploaded product image." if product_available else "No product image supplied.",
        },
        "exportSize": "x".join(map(str, EXPORT_SIZES[_format_key(request)])),
        "provider": "python-openai",
    }
    if image_data_url:
        payload["imageDataUrl"] = image_data_url
    return payload


@app.get("/api/poster")
@app.get("/")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "mode": "health",
        "service": "time2grow-python-poster-agent",
        "ready": bool(_env("OPENAI_API_KEY")),
        "textModel": TEXT_MODEL,
        "imageModel": IMAGE_MODEL,
    }


@app.post("/api/poster")
@app.post("/")
async def create_poster(
    payload: PosterRequest,
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    if payload.mode == "health":
        return await health()
    if not payload.prompt_brief():
        raise HTTPException(status_code=422, detail="Enter a poster brief first.")
    if not payload.orgId and REQUIRE_AUTH:
        raise HTTPException(status_code=422, detail="Choose a workspace before generating a poster.")
    user = await _authenticate(authorization, payload.orgId)
    if payload.userId and payload.userId != user.user_id and REQUIRE_AUTH:
        raise HTTPException(status_code=403, detail="The request user does not match the signed-in account.")

    count = 1 if payload.mode == "poster" else max(1, min(payload.count or payload.conceptCount or 1, MAX_CONCEPTS))
    palette = _palette(payload)
    plans = await _plan_concepts(payload, count, palette)
    if payload.mode == "concepts":
        return {"ok": True, "mode": "concepts", "concepts": [_concept_payload(plan, i, None, payload) for i, plan in enumerate(plans)]}

    concepts: list[dict[str, Any]] = []
    for index, plan in enumerate(plans):
        background = await _generate_background(payload, plan, palette)
        final_image = _render_final(background, payload, plan, palette)
        concepts.append(_concept_payload(plan, index, final_image, payload))
    return {
        "ok": True,
        "mode": "poster_set" if payload.mode == "poster_set" else "poster",
        "concepts": concepts,
        "count": len(concepts),
        "requestId": uuid.uuid4().hex,
    }
