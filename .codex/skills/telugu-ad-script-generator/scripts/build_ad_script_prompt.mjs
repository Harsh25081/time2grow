#!/usr/bin/env node
import fs from "node:fs";

const input = process.argv[2] ? fs.readFileSync(process.argv[2], "utf8") : fs.readFileSync(0, "utf8");
const payload = JSON.parse(input || "{}");
const brief = payload.brief || payload.topic || "";
const language = payload.language || "Telugu";
const accent = payload.accent || payload.accentPrompt || "natural Telugu";
const count = payload.count || payload.variationCount || 3;

console.log(`Generate ${count} scene-based ad scripts.\nBrief: ${brief}\nLanguage: ${language}\nAccent/style: ${accent}\n\nUse scenes, visual directions, character dialogues, voice-over, screen text, caption, shot notes, and why it works. Do not write generic creator tips.`);