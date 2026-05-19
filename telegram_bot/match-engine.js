/**
 * Module 2: Deterministic Core Match Engine (no AI).
 * pools[postcode][persona] + weighted scoring.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, 'data', 'users.json');

/** @type {Record<string, Record<string, object[]>>} */
let pools = {};

const HIGH_ACTIVITY = new Set(['Actief sporten', 'Rustig bewegen']);
const LOW_ACTIVITY = new Set(['Samen kijken']);
const HIGH_SOCIAL = new Set(['Grote groep', 'Klein clubje']);
const LOW_SOCIAL = new Set(['Gezellig 1-op-1']);

const INITIATOR = 'Ik neem initiatief';
const JOINER = 'Ik sluit me aan';
const LOW_MOBILITY = 'Met rollator/rolstoel';

/**
 * Persona from physical activity + social group size.
 */
export function assignPersona({ physicalActivity, socialGroupSize }) {
  const highActivity = HIGH_ACTIVITY.has(physicalActivity);
  const lowActivity = LOW_ACTIVITY.has(physicalActivity);
  const highSocial = HIGH_SOCIAL.has(socialGroupSize);
  const lowSocial = LOW_SOCIAL.has(socialGroupSize);

  if (highActivity && highSocial) return 'Actieve Organisator';
  if (highActivity && lowSocial) return 'Natuurliefhebber';
  if (lowActivity && highSocial) return 'Gezelligheidsdier';
  return 'Rustzoeker';
}

export function parseInterestKeywords(profile) {
  if (Array.isArray(profile.interestKeywords) && profile.interestKeywords.length) {
    return profile.interestKeywords.map((k) => String(k).toLowerCase());
  }
  if (Array.isArray(profile.sharedInterests) && profile.sharedInterests.length) {
    return profile.sharedInterests.map((k) => String(k).toLowerCase());
  }
  const raw = [
    profile.cultureSummary,
    profile.cultureRaw,
    profile.indoorActivity,
    profile.physicalActivity,
    ...(profile.cultureTags ?? []),
  ]
    .filter(Boolean)
    .join(' ');
  return raw
    .toLowerCase()
    .split(/[,;]+|\s+en\s+|\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

function countKeywordOverlap(a, b) {
  const setB = new Set(b);
  return a.filter((k) => setB.has(k) || [...setB].some((b2) => b2.includes(k) || k.includes(b2)))
    .length;
}

/** +15 when initiator meets joiner (complementary roles). */
function socialRoleSynergy(roleA, roleB) {
  const pair = [roleA, roleB].sort().join('|');
  if (pair === [INITIATOR, JOINER].sort().join('|')) return 15;
  if (roleA === roleB && roleA === INITIATOR) return 5;
  return 0;
}

/**
 * Weighted score: postcode (bucket), mobility penalty, time, role, interests.
 */
export function scoreMatch(newUser, candidate) {
  let score = 0;

  if (newUser.mobility === LOW_MOBILITY && candidate.mobility === LOW_MOBILITY) {
    score -= 20;
  }

  if (newUser.timePreference === candidate.timePreference) {
    score += 20;
  }

  score += socialRoleSynergy(newUser.groupRole, candidate.groupRole);

  if (newUser.socialGroupSize === candidate.socialGroupSize) {
    score += 8;
  }

  if (newUser.physicalActivity === candidate.physicalActivity) {
    score += 5;
  }

  if (newUser.indoorActivity === candidate.indoorActivity) {
    score += 5;
  }

  const kwA = parseInterestKeywords(newUser);
  const kwB = parseInterestKeywords(candidate);
  score += countKeywordOverlap(kwA, kwB) * 10;

  return score;
}

async function loadPools() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    pools = JSON.parse(raw);
  } catch {
    pools = {};
  }
}

async function savePools() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(pools, null, 2), 'utf-8');
}

function ensureBucket(postcode, persona) {
  if (!pools[postcode]) pools[postcode] = {};
  if (!pools[postcode][persona]) pools[postcode][persona] = [];
}

export async function processUser(rawProfile) {
  await loadPools();

  const interestKeywords = parseInterestKeywords(rawProfile);
  const persona = assignPersona(rawProfile);

  const userProfile = {
    ...rawProfile,
    interestKeywords,
    persona,
    registeredAt: new Date().toISOString(),
  };

  const { postcode, chatId } = userProfile;
  ensureBucket(postcode, persona);

  const bucket = pools[postcode][persona];
  const candidates = bucket.filter((u) => String(u.chatId) !== String(chatId));

  const bestMatches = candidates
    .map((candidate) => ({
      user: candidate,
      score: scoreMatch(userProfile, candidate),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ user, score }) => ({
      chatId: user.chatId,
      score,
      persona: user.persona,
      postcode: user.postcode,
      mobility: user.mobility,
      socialGroupSize: user.socialGroupSize,
      timePreference: user.timePreference,
      physicalActivity: user.physicalActivity,
      groupRole: user.groupRole,
      cultureSummary: user.cultureSummary,
      indoorActivity: user.indoorActivity,
    }));

  const idx = bucket.findIndex((u) => String(u.chatId) === String(chatId));
  if (idx >= 0) bucket[idx] = userProfile;
  else bucket.push(userProfile);

  await savePools();

  return {
    userProfile,
    assignedPersona: persona,
    bestMatches,
  };
}

export function getPoolsSnapshot() {
  return structuredClone(pools);
}
