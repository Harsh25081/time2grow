#!/usr/bin/env node

import fs from "node:fs";

function readInput() {
  const filePath = process.argv[2];
  if (filePath) return fs.readFileSync(filePath, "utf8");
  return fs.readFileSync(0, "utf8");
}

function list(items, fallback = "None") {
  if (!Array.isArray(items) || items.length === 0) return fallback;
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function competitorList(items) {
  if (!Array.isArray(items) || items.length === 0) return "No competitors provided.";
  return items
    .map((item, index) => {
      const label = item.label || item.handle || item.url || `Competitor ${index + 1}`;
      const platform = item.platform || "Unknown";
      const gap = item.gap || "Find a clearer Telugu creator angle.";
      return `${index + 1}. ${label} (${platform}) - ${gap}`;
    })
    .join("\n");
}

const payload = JSON.parse(readInput());
const creative = payload.creative || {};
const profile = payload.profile || {};
const metrics = payload.metrics || {};
const variationCount = Number(creative.variationCount || payload.variationCount || 3);

const prompt = `You are optimizing output for a Telugu creator virality MVP.

Product rules:
- Link-only analysis. Do not ask for manual metrics.
- Default to Telugu-English romanized writing unless Telugu script is explicitly requested.
- Treat accent/style as open user instruction, not a dropdown category.
- Generate distinct script variations, not shallow rewrites.
- If Instagram metrics are unavailable, state that Meta API or an approved provider is needed.

Creator:
- Platform: ${profile.platform || "Unknown"}
- Handle/name: ${profile.handle || profile.name || "Unknown"}
- Virality score: ${payload.score ?? "Unknown"}
- Profile strength: ${metrics.profileStrength ?? "Unknown"}
- Hook clarity: ${metrics.hookClarity ?? "Unknown"}
- Competitor gap: ${metrics.competitorGap ?? "Unknown"}

Creative direction:
- Language: ${creative.language || "Telugu-English"}
- Accent/style: ${creative.accentPrompt || "Natural Telugu-English, friendly creator style"}
- Tone: ${creative.tone || "Friendly Telugu creator"}
- Format: ${creative.format || "Instagram Reel"}
- Topic/goal: ${creative.topic || "Improve creator virality"}
- Variations: ${variationCount}

Insights:
${list(payload.insights)}

Competitors:
${competitorList(payload.competitors)}

Return:
1. A concise score explanation.
2. Competitor gaps and target angles.
3. ${variationCount} script variations. Each variation must include hook, setup, body, payoff, CTA, caption, hashtags, shot list, and why it may work.
4. Keep the accent/style direction visible in every variation.`;

process.stdout.write(prompt);
