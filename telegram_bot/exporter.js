/**
 * Module 4: Municipality dashboard exporter (JSON + master TXT).
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPORTS_DIR = path.join(__dirname, 'exports');
const MASTER_TXT = path.join(EXPORTS_DIR, 'verzameling.txt');

export function buildExportPayload(userProfile, assignedPersona, bestMatches, mcpEvents = null) {
  const timestamp = Date.now();

  return {
    meta: {
      exportedAt: new Date(timestamp).toISOString(),
      source: 'vonk-rotterdam',
      version: '3.0.0',
      bot: 'Vonk',
    },
    user: {
      chatId: userProfile.chatId,
      postcode: userProfile.postcode,
      mobility: userProfile.mobility,
      socialGroupSize: userProfile.socialGroupSize,
      timePreference: userProfile.timePreference,
      physicalActivity: userProfile.physicalActivity,
      cultureRaw: userProfile.cultureRaw,
      cultureFollowUp: userProfile.cultureFollowUp,
      cultureSummary: userProfile.cultureSummary,
      cultureTags: userProfile.cultureTags,
      indoorActivity: userProfile.indoorActivity,
      groupRole: userProfile.groupRole,
      lifeExperience: userProfile.lifeExperience,
      contactPreference: userProfile.contactPreference,
      sharedInterests: userProfile.sharedInterests,
      interestKeywords: userProfile.interestKeywords,
      aiSummary: userProfile.aiSummary,
      registeredAt: userProfile.registeredAt,
      completedAt: userProfile.completedAt,
    },
    persona: assignedPersona,
    matches: bestMatches.map((m, index) => ({
      rank: index + 1,
      chatId: m.chatId,
      compatibilityScore: m.score,
      persona: m.persona,
      groupRole: m.groupRole,
      timePreference: m.timePreference,
    })),
    mcpEvents: mcpEvents ?? [],
    matchCount: bestMatches.length,
  };
}

export function formatExportAsText(payload) {
  const { meta, user, persona, matches, mcpEvents, matchCount } = payload;
  const lines = [
    '══════════════════════════════════════════════════════════',
    '  VONK — PROFIEL & MATCHES (Gemeente Rotterdam)',
    '══════════════════════════════════════════════════════════',
    '',
    `Geëxporteerd: ${meta.exportedAt}`,
    `Chat-ID:      ${user.chatId}`,
    '',
    '── 10 CRITERIA ───────────────────────────────────────────',
    `Postcode:         ${user.postcode}`,
    `Mobiliteit:       ${user.mobility}`,
    `Groep:            ${user.socialGroupSize}`,
    `Tijd:             ${user.timePreference}`,
    `Beweging:         ${user.physicalActivity}`,
    `Cultuur:          ${user.cultureSummary ?? user.cultureRaw}`,
    `Binnen:           ${user.indoorActivity}`,
    `Rol:              ${user.groupRole}`,
    `Levenservaring:   ${user.lifeExperience}`,
    `Contact:          ${user.contactPreference}`,
    '',
    '── INTERESSES ────────────────────────────────────────────',
    (user.sharedInterests ?? []).join(', ') || '—',
    '',
    '── PERSONA ──────────────────────────────────────────────',
    persona,
    '',
    `── MATCHES (${matchCount}) ─────────────────────────────────`,
  ];

  if (!matches.length) lines.push('  (geen)');
  else {
    for (const m of matches) {
      lines.push(`  #${m.rank} score ${m.compatibilityScore} — ${m.persona}`);
    }
  }

  lines.push('', '── MCP ACTIVITEITEN ──────────────────────────────────────');
  if (!mcpEvents?.length) lines.push('  (geen)');
  else {
    for (const ev of mcpEvents) {
      lines.push(`  • ${ev.title} @ ${ev.location}`);
    }
  }

  lines.push('', '══════════════════════════════════════════════════════════', '');
  return lines.join('\n');
}

export async function exportToDashboard(
  userProfile,
  assignedPersona,
  bestMatches,
  mcpEvents = null
) {
  const timestamp = Date.now();
  const chatId = userProfile.chatId;
  const payload = buildExportPayload(
    userProfile,
    assignedPersona,
    bestMatches,
    mcpEvents
  );
  const textContent = formatExportAsText(payload);

  await fs.mkdir(EXPORTS_DIR, { recursive: true });

  const baseName = `export_${chatId}_${timestamp}`;
  const jsonPath = path.join(EXPORTS_DIR, `${baseName}.json`);
  const txtPath = path.join(EXPORTS_DIR, `${baseName}.txt`);

  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2), 'utf-8');
  await fs.writeFile(txtPath, textContent, 'utf-8');

  const masterHeader = (await fileExists(MASTER_TXT))
    ? ''
    : 'VERZAMELING — Vonk Rotterdam\n══════════════════════════════════════════════════════════\n\n';

  await fs.appendFile(MASTER_TXT, masterHeader + textContent, 'utf-8');

  return { jsonPath, txtPath, masterPath: MASTER_TXT, payload };
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
