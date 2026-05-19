/**
 * Anthropic Claude integration: warm conversation, follow-ups, structured extraction.
 */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-3-5-sonnet-20241022';

let client = null;

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

const SYSTEM_WARM =
  'Je bent een warme, geduldige Nederlandse gesprekspartner voor ouderen in Rotterdam ' +
  'die mensen willen ontmoeten. Spreek altijd in het Nederlands. ' +
  'Wees empathisch, respectvol en licht speels bij typefouten — nooit belachelijk makend. ' +
  'Houd antwoorden kort (max 3 zinnen). Geen Engels tenzij de gebruiker dat zelf doet.';

/**
 * Reacts to culture/music input and asks exactly ONE follow-up question.
 */
export async function cultureFollowUp(userMessage) {
  const anthropic = getClient();
  if (!anthropic) {
    return {
      reply:
        'Wat mooi dat u dat deelt! 🎵 Mag ik vragen: heeft u een favoriete artiest of voorkeur (bijv. jazz, klassiek)?',
      usedAi: false,
    };
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 280,
    system: SYSTEM_WARM,
    messages: [
      {
        role: 'user',
        content:
          `De gebruiker vertelde over cultuur/muziek:\n"${userMessage}"\n\n` +
          'Reageer warm op hun interesse. Als er een kleine typefout in zit, ' +
          'mag je die vriendelijk en met humor opmerken (bijv. "Ik vermoed dat u … bedoelde 😊"). ' +
          'Stel daarna precies ÉÉN korte vervolgvraag over hun voorkeur (bijv. favoriete artiest of genre).',
      },
    ],
  });

  const reply = response.content.find((b) => b.type === 'text')?.text?.trim();
  return { reply: reply || fallbackCultureReply(), usedAi: true };
}

/**
 * Extracts structured interest tags from culture conversation (both turns).
 */
export async function extractCultureTags(initialMessage, followUpAnswer) {
  const anthropic = getClient();
  const fallback = parseKeywordTags(`${initialMessage} ${followUpAnswer}`);

  if (!anthropic) return { cultureTags: fallback, summary: initialMessage };

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system:
      'Je structureert antwoorden van ouderen over cultuur en muziek. Antwoord ALLEEN met geldige JSON, geen markdown.',
    messages: [
      {
        role: 'user',
        content:
          `Eerste bericht: "${initialMessage}"\nVervolgantwoord: "${followUpAnswer}"\n\n` +
          'Geef JSON: {"cultureTags":["tag1","tag2"],"summary":"korte Nederlandse samenvatting in 1 zin"}' +
          '\nTags: korte Nederlandse woorden, kleine letters, max 8 tags.',
      },
    ],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';
  try {
    const json = JSON.parse(text.replace(/```json?\s*|\s*```/g, '').trim());
    return {
      cultureTags: Array.isArray(json.cultureTags) ? json.cultureTags : fallback,
      summary: json.summary || initialMessage,
    };
  } catch {
    return { cultureTags: fallback, summary: initialMessage };
  }
}

/**
 * Final structured extraction of the complete profile for the match engine.
 */
export async function extractFullProfile(profileDraft) {
  const anthropic = getClient();
  const baseTags = buildInterestKeywords(profileDraft);

  if (!anthropic) {
    return { interestKeywords: baseTags, aiSummary: null };
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: 'Structureer gebruikersdata voor een matchmaking-systeem. Antwoord ALLEEN met geldige JSON.',
    messages: [
      {
        role: 'user',
        content:
          `Profiel:\n${JSON.stringify(profileDraft, null, 2)}\n\n` +
          'Geef JSON: {"interestKeywords":["..."],"aiSummary":"2 zinnen empathische NL samenvatting"}' +
          '\ninterestKeywords: combineer cultuur, hobby\'s en activiteiten; max 15 korte tags, kleine letters.',
      },
    ],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';
  try {
    const json = JSON.parse(text.replace(/```json?\s*|\s*```/g, '').trim());
    const keywords = Array.isArray(json.interestKeywords)
      ? [...new Set([...baseTags, ...json.interestKeywords.map((k) => String(k).toLowerCase())])]
      : baseTags;
    return { interestKeywords: keywords.slice(0, 20), aiSummary: json.aiSummary ?? null };
  } catch {
    return { interestKeywords: baseTags, aiSummary: null };
  }
}

export function buildInterestKeywords(profile) {
  const parts = [
    profile.cultureSummary,
    profile.cultureRaw,
    profile.cultureFollowUp,
    profile.indoorActivity,
    profile.physicalActivity,
    profile.lifeExperience,
    ...(profile.cultureTags ?? []),
  ].filter(Boolean);

  return parseKeywordTags(parts.join(' '));
}

function parseKeywordTags(text) {
  if (!text) return [];
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[,;.\n]+|\s+en\s+|\s+&\s+|\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 2 && s.length < 30)
    ),
  ].slice(0, 15);
}

function fallbackCultureReply() {
  return 'Wat fijn om te horen! 🎶 Welk genre of welke artiest raakt u het meest?';
}

export function isClaudeAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
