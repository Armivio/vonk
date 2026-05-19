/**
 * Module 1: Vonk — AI-driven Telegram bot (Dutch UI, 10 criteria, MCP events).
 */

import TelegramBot from 'node-telegram-bot-api';
import {
  createUserSession,
  getCurrentCriterion,
  processUserMessage,
  processButtonChoice,
  buildChoiceKeyboard,
  buildGreeting,
  extractFullProfileWithAi,
  CRITERIA,
  isClaudeAvailable,
} from './vonk-ai.js';
import { getEventsByInterest, formatEventsForTelegram } from './mcp-client.js';

/**
 * @param {string} token
 * @param {(profile: object) => Promise<{ assignedPersona: string, bestMatches: object[] }>} onProfileComplete
 */
export function createVonkTelegramBot(token, onProfileComplete) {
  const bot = new TelegramBot(token, { polling: true });
  /** @type {Map<number, object>} */
  const sessions = new Map();

  function getSession(chatId) {
    if (!sessions.has(chatId)) {
      sessions.set(chatId, createUserSession(chatId));
    }
    return sessions.get(chatId);
  }

  function resetSession(chatId) {
    const s = createUserSession(chatId);
    sessions.set(chatId, s);
    return s;
  }

  async function sendStep(chatId, session) {
    const criterion = getCurrentCriterion(session);
    if (!criterion) return;

    const stepNum = session.stepIndex + 1;
    const msg = `*Stap ${stepNum} van 10:*\n${criterion.question}`;
    const opts = { parse_mode: 'Markdown' };
    if (criterion.type === 'choice') {
      Object.assign(opts, buildChoiceKeyboard(criterion, session.stepIndex));
    }
    await bot.sendMessage(chatId, msg, opts);
  }

  async function handleTurnResult(chatId, session, result) {
    if (result.reply) {
      const opts = { parse_mode: 'Markdown' };
      if (result.keyboard) Object.assign(opts, result.keyboard);
      await bot.sendMessage(chatId, result.reply, opts);
    }

    if (result.complete) {
      await finalize(chatId, session);
      return;
    }

    const criterion = getCurrentCriterion(session);
    if (criterion?.type === 'choice' && !result.keyboard) {
      await bot.sendMessage(
        chatId,
        'Of kies een knop:',
        buildChoiceKeyboard(criterion, session.stepIndex)
      );
    }
  }

  async function finalize(chatId, session) {
    if (session._finalizing) return;
    session._finalizing = true;

    try {
      await bot.sendMessage(
        chatId,
        '⏳ Even geduld — ik zoek matches en activiteiten in Rotterdam…',
        { parse_mode: 'Markdown' }
      );

      const { profile, aiSummary } = await extractFullProfileWithAi({
        ...session.profile,
      });
      if (aiSummary) profile.aiSummary = aiSummary;

      const { assignedPersona, bestMatches, eventsResult } =
        await onProfileComplete(profile);

      let matchText = '';
      if (bestMatches.length) {
        matchText =
          '\n\n👥 *Mogelijke ontmoetingen* (zelfde buurt & persona):\n' +
          bestMatches
            .map(
              (m, i) =>
                `${i + 1}. Compatibiliteit ${m.score} — ${m.persona}`
            )
            .join('\n');
      } else {
        matchText =
          '\n\n👥 U bent voor nu de eerste in uw categorie in deze buurt — we laten het u weten zodra er een match is.';
      }

      await bot.sendMessage(
        chatId,
        `✅ *Bedankt!* Uw persona: *${assignedPersona}*${matchText}`,
        { parse_mode: 'Markdown' }
      );

      await bot.sendMessage(
        chatId,
        formatEventsForTelegram(eventsResult),
        { parse_mode: 'Markdown' }
      );

      await bot.sendMessage(
        chatId,
        '🔥 Dank u wel voor uw vertrouwen in Vonk!\n\nTyp /start om opnieuw te beginnen.'
      );

      sessions.delete(chatId);
    } catch (err) {
      console.error('Finalize error:', err);
      await bot.sendMessage(
        chatId,
        'Er ging iets mis. Probeer later opnieuw of typ /start.'
      );
      session._finalizing = false;
    }
  }

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    resetSession(chatId);
    const greeting = await buildGreeting();
    await bot.sendMessage(chatId, greeting, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: 'Starten', callback_data: 'vonk:start' }]],
      },
    });
  });

  bot.onText(/\/versie/, async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      `🔥 *Vonk* v3.0\nClaude: ${isClaudeAvailable() ? '✅' : '❌'}\nMCP: ${process.env.MCP_SERVER_URL || 'https://vonkmcp.armandilas.com/mcp'}`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    await bot.answerCallbackQuery(query.id);

    if (data === 'vonk:start') {
      const session = resetSession(chatId);
      await bot.sendMessage(chatId, 'Fijn dat u meedoet! 😊');
      await sendStep(chatId, session);
      return;
    }

    if (data === 'vonk:profiel') {
      const session = getSession(chatId);
      const p = session.profile;
      await bot.sendMessage(
        chatId,
        `📋 *Profiel*\nPostcode: ${p.postcode ?? '—'}\nMobiliteit: ${p.mobility ?? '—'}\nGroep: ${p.socialGroupSize ?? '—'}\nTijd: ${p.timePreference ?? '—'}\nBeweging: ${p.physicalActivity ?? '—'}\nCultuur: ${p.cultureSummary ?? p.cultureRaw ?? '—'}`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (data.startsWith('vonk:btn:')) {
      const parts = data.split(':');
      const stepIdx = parseInt(parts[2], 10);
      const optIdx = parseInt(parts[3], 10);
      const session = getSession(chatId);
      const criterion = CRITERIA[stepIdx];
      const value = criterion?.options?.[optIdx];

      if (!value || session.stepIndex !== stepIdx) {
        await bot.sendMessage(chatId, 'Deze knop is verlopen. Typ /start.');
        return;
      }

      await bot.sendChatAction(chatId, 'typing');
      const result = await processButtonChoice(session, value);
      await handleTurnResult(chatId, session, result);
    }
  });

  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;
    const session = getSession(chatId);

    if (!session.history.length && session.stepIndex === 0) {
      await bot.sendMessage(chatId, 'Druk op *Starten* om met Vonk te praten.', {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: 'Starten', callback_data: 'vonk:start' }]],
        },
      });
      return;
    }

    if (session.complete || session._finalizing) {
      await bot.sendMessage(chatId, 'Typ /start voor een nieuw gesprek.');
      return;
    }

    await bot.sendChatAction(chatId, 'typing');
    const result = await processUserMessage(session, msg.text.trim());
    await handleTurnResult(chatId, session, result);
  });

  bot.on('polling_error', (err) => {
    if (err.message?.includes('409')) {
      console.error('409: npm run stop && npm start');
    } else {
      console.error('Polling:', err.message);
    }
  });

  console.log(`🔥 Vonk actief | Claude: ${isClaudeAvailable() ? '✅' : '❌'}`);
  return bot;
}
