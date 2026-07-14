// Unit tests for the deterministic content-generation logic. Run with:
//   deno test supabase/functions/ai-handler/prompts_test.ts
// These cover the cost/quality-critical invariants that must not silently drift.

import {
  postMaxTokens,
  postSystemPrompt,
  postVisualSystemPrompt,
  postWordRange,
  scriptMaxTokens,
  videoSystemPrompt,
  viralitySystemPrompt,
  VIRALITY_THRESHOLD,
} from './prompts.ts';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}
function assertEquals(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) throw new Error(`${msg} — expected ${expected}, got ${actual}`);
}

Deno.test('post word ranges match the documented bands', () => {
  assertEquals(postWordRange('linkedin', 'long').max, 320, 'linkedin/long max');
  assertEquals(postWordRange('blog', 'long').min, 1000, 'blog/long min');
  assertEquals(postWordRange('community', 'short').max, 80, 'community/short max');
});

Deno.test('post token budget scales with language and floors at 900', () => {
  assertEquals(postMaxTokens('linkedin', 'short', 'en'), 900, 'english short floors at 900');
  // Telugu tokenises heavier, so the same words need a bigger budget than English.
  assert(
    postMaxTokens('blog', 'long', 'te') > postMaxTokens('blog', 'long', 'en'),
    'telugu blog budget must exceed english',
  );
  // Every band must clear its worst-case density so responses never truncate mid-JSON.
  for (const target of ['linkedin', 'blog', 'community'] as const) {
    for (const length of ['short', 'standard', 'long'] as const) {
      for (const lang of ['en', 'te', 'hi', 'kn', 'te-en', 'hi-en', 'kn-en'] as const) {
        const need = postWordRange(target, length).max * (lang === 'en' ? 2 : 4);
        assert(
          postMaxTokens(target, length, lang) >= need,
          `budget under worst-case density for ${target}/${length}/${lang}`,
        );
      }
    }
  }
});

Deno.test('script token budget grows with duration and non-english', () => {
  assert(scriptMaxTokens('90', 'en') > scriptMaxTokens('30', 'en'), '90s must exceed 30s');
  assert(scriptMaxTokens('90', 'te') > scriptMaxTokens('90', 'en'), 'telugu 90s must exceed english');
  assert(scriptMaxTokens('90', 'te') < 16_000, '90s telugu must stay under a sane output cap');
});

Deno.test('the three post prompts are genuinely different per platform', () => {
  const li = postSystemPrompt('linkedin');
  const bl = postSystemPrompt('blog');
  const co = postSystemPrompt('community');
  assert(li !== bl && bl !== co && li !== co, 'per-platform prompts must diverge');
  assert(li.includes('hook'), 'linkedin prompt mentions hook');
  assert(bl.includes('SEO title'), 'blog prompt mentions SEO title');
  assert(co.toLowerCase().includes('group'), 'community prompt mentions group');
});

Deno.test('every post prompt carries the grounding, research, and no-invent guardrails', () => {
  for (const target of ['linkedin', 'blog', 'community'] as const) {
    const p = postSystemPrompt(target);
    assert(p.includes('Ground every sentence'), `${target} has grounding rule`);
    assert(p.includes('fetchedSources'), `${target} has research/citation rule`);
    assert(p.includes('Do not invent statistics'), `${target} has no-invent rule`);
    assert(p.includes('attribute it in-line'), `${target} requires inline attribution`);
  }
});

Deno.test('video prompt keeps the scene schema, tiling rule, and grounding', () => {
  const v = videoSystemPrompt('Create an original four-line mini-jingle.');
  assert(v.includes('"scenes"'), 'has scenes schema');
  assert(v.includes('no gaps'), 'requires gap-free scene timing');
  assert(v.includes('Ground every sentence'), 'has grounding rule');
  assert(v.includes('pattern-interrupt'), 'requires a modern opening device');
  assert(v.includes('4 to 6 short ORIGINAL lyric lines'), 'requires original mini-jingle lyrics');
  assert(v.includes('Never quote or closely paraphrase a famous movie line'), 'protects movie dialogue while allowing homage');
  assert(v.includes('Create an original four-line mini-jingle.'), 'injects the selected creative direction');
});

Deno.test('virality prompt gates on the threshold and can revise', () => {
  assertEquals(VIRALITY_THRESHOLD, 75, 'default threshold is 75');
  const s = viralitySystemPrompt('post', VIRALITY_THRESHOLD);
  assert(s.includes('"score"'), 'returns a score');
  assert(s.includes('"revised"'), 'asks for a revised rewrite when below the bar');
  assert(s.includes('75'), 'states the threshold in the instructions');
  assert(s.includes('cap the overall score at 60'), 'keeps the fabrication/off-context cap');
  // The video variant must carry the scene schema in its revised shape so a revised script re-parses.
  assert(viralitySystemPrompt('video', 75).includes('"scenes"'), 'video revise shape has scenes');
  assert(viralitySystemPrompt('video', 75).includes('Do not flatten'), 'video revision preserves its creative device');
});

Deno.test('visual prompt prefers Visual Value and forbids baked-in text', () => {
  const p = postVisualSystemPrompt();
  assert(p.includes('Visual Value'), 'offers the Visual Value conceptual style');
  assert(p.includes('No text, no letters'), 'forbids text in the image');
});
