/**
 * Vonk — Entry point (Telegram + Claude + MCP + Match Engine + Export).
 * Start: npm start
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createVonkTelegramBot } from './telegram-vonk-bot.js';
import { processUser } from './match-engine.js';
import { exportToDashboard } from './exporter.js';
import { getEventsByInterest } from './mcp-client.js';
import { isClaudeAvailable } from './vonk-ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PID_FILE = path.join(__dirname, '.bot.pid');
const VERSION = '3.0.0-vonk';

const token =
  process.env.TELEGRAM_TOKEN ??
  process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('Fout: TELEGRAM_TOKEN ontbreekt in .env');
  process.exit(1);
}

function cleanup() {
  try {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  } catch {
    /* ignore */
  }
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', cleanup);

fs.writeFileSync(PID_FILE, String(process.pid));

console.log('');
console.log('══════════════════════════════════════════════════');
console.log(`  🔥 Vonk v${VERSION}`);
console.log('  telegram-vonk-bot.js | vonk-ai.js | mcp-client.js');
console.log(`  Claude:  ${isClaudeAvailable() ? '✅' : '❌ ANTHROPIC_API_KEY'}`);
console.log(`  MCP:     ${process.env.MCP_SERVER_URL || 'https://vonkmcp.armandilas.com/mcp'}`);
console.log('══════════════════════════════════════════════════');
console.log('');

async function handleProfileComplete(profile) {
  const { userProfile, assignedPersona, bestMatches } =
    await processUser(profile);

  const eventsResult = await getEventsByInterest(userProfile, assignedPersona);

  const { jsonPath, masterPath } = await exportToDashboard(
    userProfile,
    assignedPersona,
    bestMatches,
    eventsResult.events
  );

  console.log(`Persona: ${assignedPersona} | Matches: ${bestMatches.length}`);
  console.log(`MCP events: ${eventsResult.events.length}`);
  console.log(`Export: ${jsonPath}`);
  console.log(`Master: ${masterPath}`);

  return { assignedPersona, bestMatches, eventsResult };
}

createVonkTelegramBot(token, handleProfileComplete);
