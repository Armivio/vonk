/**
 * Vonk AI core: Claude 3.5 Sonnet, chat history, 10 criteria extraction.
 */

import Anthropic from '@anthropic-ai/sdk';

export const MODEL = 'claude-3-5-sonnet-20241022';

export const CRITERIA = [
  {
    key: 'postcode',
    field: 'postcode',
    type: 'text',
    dutchLabel: 'postcode (4 cijfers)',
    question: 'Wat is uw postcode? (4 cijfers, bijvoorbeeld 3012)',
    validate: (v) => /^\d{4}$/.test(v),
  },
  {
    key: 'mobility',
    field: 'mobility',
    type: 'choice',
    dutchLabel: 'mobiliteitsniveau',
    question: 'Hoe ver kunt u lopen of zich verplaatsen?',
    options: ['Lopend (ver)', 'Lopend (kort)', 'Met rollator/rolstoel'],
  },
  {
    key: 'socialGroupSize',
    field: 'socialGroupSize',
    type: 'choice',
    dutchLabel: 'sociale groepsgrootte',
    question: 'Wat voelt voor u het prettigst bij ontmoetingen?',
    options: ['Gezellig 1-op-1', 'Klein clubje', 'Grote groep'],
  },
  {
    key: 'timePreference',
    field: 'timePreference',
    type: 'choice',
    dutchLabel: 'voorkeurstijd',
    question: 'Wanneer komt een ontmoeting u het beste uit?',
    options: ['De ochtend', 'De middag', 'De avond'],
  },
  {
    key: 'physicalActivity',
    field: 'physicalActivity',
    type: 'choice',
    dutchLabel: 'fysieke activiteit',
    question: 'Wat past het beste bij u qua beweging?',
    options: ['Actief sporten', 'Rustig bewegen', 'Samen kijken'],
  },
  {
    key: 'culture',
    field: 'cultureRaw',
    type: 'culture',
    dutchLabel: 'cultuur en muziek',
    question:
      'Vertel eens — waar houdt u van als het om cultuur of muziek gaat? Typ gerust in uw eigen woorden.',
    minTurns: 2,
  },
  {
    key: 'indoorActivity',
    field: 'indoorActivity',
    type: 'choice',
    dutchLabel: 'binnenactiviteiten',
    question: 'Wat doet u graag binnenshuis?',
    options: ['Denksport', 'Creatief', 'Samen lezen'],
  },
  {
    key: 'groupRole',
    field: 'groupRole',
    type: 'choice',
    dutchLabel: 'rol in de groep',
    question: 'Hoe bent u meestal in een groep?',
    options: ['Ik neem initiatief', 'Ik sluit me aan', 'Ik laat me verrassen'],
  },
  {
    key: 'lifeExperience',
    field: 'lifeExperience',
    type: 'choice',
    dutchLabel: 'levenservaring delen',
    question: 'Wilt u uw levenservaring delen met anderen?',
    options: ['Ja, ik geef advies', 'Nee, gewoon gezelligheid', 'Ik wil leren'],
  },
  {
    key: 'contactPreference',
    field: 'contactPreference',
    type: 'choice',
    dutchLabel: 'digitaal vs fysiek contact',
    question: 'Hoe wilt u het liefst eerste contact leggen?',
    options: ['Eerst bellen/appen', 'Meteen afspreken'],
  },
];

const VONK_PERSONA =
  'Je bent Vonk — een warme, empathische, licht humorvolle Nederlandse assistent ' +
  'voor ouderen in Rotterdam die eenzaamheid willen doorbreken. ' +
  'Je helpt mensen ontmoeten en activiteiten vinden. ' +
  'Wees geduldig bij typefouten en extra verhalen; reageer altijd respectvol. ' +
  'Houd antwoorden kort (2–4 zinnen). Gebruik eenvoudige taal.';

let client = null;

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export function createUserSession(chatId) {
  return {
    chatId,
    stepIndex: 0,
    profile: { chatId },
    history: [],
    cultureTurns: 0,
    awaitingCultureFollowUp: false,
    complete: false,
    started: false,
  };
}

export function getCurrentCriterion(session) {
  return CRITERIA[session.stepIndex] ?? null;
}

export function isClaudeAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function parseAiJson(text) {
  const cleaned = text.replace(/```json?\s*|\s*```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(cleaned.slice(start, end + 1));
  }
  return JSON.parse(cleaned);
}

/**
 * Main AI turn: every free-text message goes through Claude.
 */
export async function processUserMessage(session, userText) {
  const criterion = getCurrentCriterion(session);
  if (!criterion || session.complete) {
    return { reply: 'Uw profiel is al compleet. Typ /start om opnieuw te beginnen.' };
  }

  session.history.push({ role: 'user', content: userText });

  const anthropic = getClient();
  if (!anthropic) {
    return fallbackProcess(session, userText, criterion);
  }

  const system = buildSystemPrompt(session, criterion);
  const messages = session.history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      system,
      messages,
    });

    const raw = response.content.find((b) => b.type === 'text')?.text?.trim() ?? '';
    let parsed;
    try {
      parsed = parseAiJson(raw);
    } catch {
      parsed = { reply: raw, extractedValue: null, advance: false };
    }

    const reply = parsed.reply || raw;
    session.history.push({ role: 'assistant', content: reply });

    if (criterion.type === 'culture') {
      return handleCultureStep(session, userText, parsed, reply, criterion);
    }

    if (parsed.extractedValue != null && parsed.extractedValue !== '') {
      const value = String(parsed.extractedValue).trim();
      if (criterion.type === 'text' && criterion.validate && !criterion.validate(value)) {
        return {
          reply:
            parsed.reply ||
            'Dat lijkt geen geldige postcode. Kunt u 4 cijfers invoeren? (bijv. 3012)',
          keyboard: null,
        };
      }
      if (criterion.type === 'choice') {
        const matched = matchOption(value, criterion.options);
        if (!matched) {
          return {
            reply:
              parsed.reply ||
              `Kunt u een van deze opties kiezen?\n${criterion.options.join(' · ')}`,
            keyboard: buildChoiceKeyboard(criterion, session.stepIndex),
          };
        }
        return advanceSession(session, matched, reply);
      }
      return advanceSession(session, value, reply);
    }

    if (parsed.advance && criterion.type === 'text') {
      return advanceSession(session, userText.trim(), reply);
    }

    return {
      reply,
      keyboard: criterion.type === 'choice' ? buildChoiceKeyboard(criterion, session.stepIndex) : null,
    };
  } catch (err) {
    console.error('Vonk AI error:', err.message);
    return fallbackProcess(session, userText, criterion);
  }
}

function handleCultureStep(session, userText, parsed, reply, criterion) {
  if (!session.cultureTurns) {
    session.profile.cultureRaw = userText;
    session.cultureTurns = 1;
    session.awaitingCultureFollowUp = true;
    return { reply, keyboard: null, cultureActive: true };
  }

  if (session.awaitingCultureFollowUp) {
    session.profile.cultureFollowUp = userText;
    session.cultureTurns = 2;
    session.awaitingCultureFollowUp = false;
    const tags = extractTagsLocally(`${session.profile.cultureRaw} ${userText}`);
    session.profile.cultureTags = tags;
    session.profile.cultureSummary = parsed.cultureSummary || session.profile.cultureRaw;
    return advanceSession(session, session.profile.cultureRaw, reply);
  }

  return { reply, keyboard: null, cultureActive: true };
}

export async function processButtonChoice(session, value) {
  const criterion = getCurrentCriterion(session);
  if (!criterion) return { reply: 'Geen actieve stap.' };

  session.history.push({ role: 'user', content: `[knop] ${value}` });

  const anthropic = getClient();
  let transition =
    `Dank u wel! U koos: *${value}*.`;

  if (anthropic) {
    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 200,
        system: VONK_PERSONA,
        messages: [
          {
            role: 'user',
            content:
              `De gebruiker koos zojuist voor "${value}" bij de vraag over ${criterion.dutchLabel}. ` +
              'Geef één warme korte Nederlandse zin als bevestiging (geen vraag).',
          },
        ],
      });
      transition =
        response.content.find((b) => b.type === 'text')?.text?.trim() || transition;
    } catch {
      /* keep default */
    }
  }

  return advanceSession(session, value, transition);
}

function advanceSession(session, value, warmReply) {
  const criterion = getCurrentCriterion(session);
  if (!criterion) return { reply: warmReply };

  session.profile[criterion.field] = value;
  session.stepIndex += 1;

  if (session.stepIndex >= CRITERIA.length) {
    session.complete = true;
    finalizeProfileTags(session.profile);
    return {
      reply: warmReply,
      complete: true,
      profile: { ...session.profile },
      keyboard: null,
    };
  }

  const next = CRITERIA[session.stepIndex];
  const nextPrompt = buildNextQuestion(session, next);

  return {
    reply: `${warmReply}\n\n${nextPrompt}`,
    keyboard: next.type === 'choice' ? buildChoiceKeyboard(next, session.stepIndex) : null,
    complete: false,
  };
}

function buildNextQuestion(session, criterion) {
  const n = session.stepIndex + 1;
  return `*Stap ${n} van 10:* ${criterion.question}`;
}

function buildSystemPrompt(session, criterion) {
  const collected = JSON.stringify(session.profile, null, 2);
  const optionsLine =
    criterion.options?.length
      ? `Geldige knopopties (exact overnemen bij extractie): ${JSON.stringify(criterion.options)}`
      : '';

  return (
    `${VONK_PERSONA}\n\n` +
    `STAP ${session.stepIndex + 1}/10: verzamel "${criterion.dutchLabel}".\n` +
    `Vraag: ${criterion.question}\n` +
    `${optionsLine}\n` +
    `Reeds verzameld:\n${collected}\n\n` +
    'Antwoord ALLEEN met JSON (geen markdown):\n' +
    '{\n' +
    '  "reply": "warm Nederlands antwoord dat erkenning geeft + eventueel de volgende vraag",\n' +
    '  "extractedValue": "exacte waarde of null als nog onduidelijk",\n' +
    '  "advance": true/false,\n' +
    '  "cultureSummary": "alleen bij cultuur-stap: korte samenvatting"\n' +
    '}\n' +
    'Regels:\n' +
    '- Bij cultuur/muziek: chat minstens 2 berichten; bij 1e bericht extractedValue=null en stel 1 vervolgvraag.\n' +
    '- Map vrije tekst elegant naar de dichtstbijzijnde knopoptie.\n' +
    '- Bij postcode: alleen advance=true als 4 cijfers.\n' +
    '- Wees warm over typefouten, nooit belachelijk.'
  );
}

function matchOption(text, options) {
  const t = text.toLowerCase().trim();
  return (
    options.find((o) => o.toLowerCase() === t) ||
    options.find((o) => t.includes(o.toLowerCase().slice(0, 8))) ||
    options.find((o) => {
      const words = o.toLowerCase().split(/\s+/);
      return words.some((w) => w.length > 4 && t.includes(w));
    }) ||
    null
  );
}

export function buildChoiceKeyboard(criterion, stepIndex) {
  return {
    reply_markup: {
      inline_keyboard: [
        criterion.options.map((opt, optIdx) => ({
          text: opt,
          callback_data: `vonk:btn:${stepIndex}:${optIdx}`,
        })),
      ],
    },
  };
}

function fallbackProcess(session, userText, criterion) {
  if (criterion.type === 'text' && criterion.validate?.(userText.trim())) {
    return advanceSession(session, userText.trim(), 'Dank u wel! 👍');
  }
  if (criterion.type === 'choice') {
    const matched = matchOption(userText, criterion.options);
    if (matched) return advanceSession(session, matched, `Prima, ${matched}!`);
  }
  if (criterion.type === 'culture') {
    if (!session.cultureTurns) {
      session.profile.cultureRaw = userText;
      session.cultureTurns = 1;
      return {
        reply:
          'Wat mooi! 🎵 Mag ik vragen: heeft u een favoriete artiest of genre?',
        keyboard: null,
      };
    }
    session.profile.cultureFollowUp = userText;
    session.profile.cultureTags = extractTagsLocally(userText);
    session.profile.cultureSummary = userText;
    return advanceSession(session, userText, 'Dank u voor het delen! 🌷');
  }
  return {
    reply: criterion.question,
    keyboard: criterion.type === 'choice' ? buildChoiceKeyboard(criterion, session.stepIndex) : null,
  };
}

function extractTagsLocally(text) {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[,;]+|\s+en\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 2)
    ),
  ].slice(0, 10);
}

function finalizeProfileTags(profile) {
  profile.sharedInterests = [
    ...new Set([
      ...(profile.cultureTags ?? []),
      profile.cultureSummary,
      profile.cultureRaw,
      profile.indoorActivity,
      profile.physicalActivity,
      profile.lifeExperience,
    ].filter(Boolean)),
  ];
  profile.interestKeywords = profile.sharedInterests.map((s) =>
    String(s).toLowerCase()
  );
}

export async function buildGreeting() {
  const base =
    'Hallo, ik ben *Vonk*! 🔥\n\n' +
    'Ik ben hier om u te helpen leuke mensen en activiteiten in de buurt te vinden. ' +
    'Samen kijken we wat bij u past — rustig en in uw eigen tempo.\n\n' +
    'Zullen we beginnen?';

  return base;
}

export async function extractFullProfileWithAi(profile) {
  const anthropic = getClient();
  finalizeProfileTags(profile);
  if (!anthropic) return { profile, aiSummary: null };

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: 'Structureer profieldata. Antwoord ALLEEN met JSON.',
      messages: [
        {
          role: 'user',
          content:
            `Profiel:\n${JSON.stringify(profile)}\n\n` +
            'JSON: {"sharedInterests":["..."],"aiSummary":"2 zinnen NL"}',
        },
      ],
    });
    const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';
    const json = parseAiJson(text);
    if (Array.isArray(json.sharedInterests)) {
      profile.sharedInterests = json.sharedInterests;
      profile.interestKeywords = json.sharedInterests.map((s) =>
        String(s).toLowerCase()
      );
    }
    return { profile, aiSummary: json.aiSummary ?? null };
  } catch {
    return { profile, aiSummary: null };
  }
}
