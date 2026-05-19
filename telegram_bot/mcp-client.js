/**
 * Module 2: MCP client for vonkmcp.armandilas.com (Streamable HTTP + SSE).
 */

const DEFAULT_URL = 'https://vonkmcp.armandilas.com/mcp';
const TIMEOUT_MS = 25_000;

/**
 * JSON-RPC over HTTP/SSE (MCP 2024-11-05).
 */
export class VonkMcpClient {
  constructor(serverUrl = process.env.MCP_SERVER_URL || DEFAULT_URL) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.sessionId = null;
    this.requestId = 0;
  }

  async _request(method, params = {}, { isNotification = false } = {}) {
    const id = isNotification ? undefined : ++this.requestId;
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;

    const payload = { jsonrpc: '2.0', method, params };
    if (!isNotification) payload.id = id;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(this.serverUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const newSession = response.headers.get('mcp-session-id');
      if (newSession) this.sessionId = newSession;

      const text = await response.text();
      if (!response.ok) {
        throw new Error(`MCP HTTP ${response.status}: ${text.slice(0, 200)}`);
      }

      if (isNotification || !text.trim()) return null;

      const parsed = parseSseOrJson(text);
      if (parsed.error) {
        throw new Error(parsed.error.message || JSON.stringify(parsed.error));
      }
      return parsed.result;
    } finally {
      clearTimeout(timer);
    }
  }

  async connect() {
    await this._request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'vonk-telegram-bot', version: '3.0.0' },
    });
    await this._request('notifications/initialized', {}, { isNotification: true });
    return this;
  }

  async listTools() {
    const result = await this._request('tools/list', {});
    return result?.tools ?? [];
  }

  async callTool(name, args = {}) {
    const result = await this._request('tools/call', { name, arguments: args });
    const textBlock = result?.content?.find((c) => c.type === 'text');
    if (!textBlock?.text) return result;
    try {
      return JSON.parse(textBlock.text);
    } catch {
      return textBlock.text;
    }
  }
}

function parseSseOrJson(body) {
  const dataLine = body.split('\n').find((l) => l.startsWith('data: '));
  const jsonStr = dataLine ? dataLine.slice(6) : body.trim();
  return JSON.parse(jsonStr);
}

/** Maps profile + persona to MCP discover_vonken category. */
export function mapProfileToMcpCategory(profile, persona) {
  const interests = [
    ...(profile.sharedInterests ?? []),
    ...(profile.interestKeywords ?? []),
    profile.cultureSummary,
    profile.indoorActivity,
    profile.physicalActivity,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/sport|beweg|wandelen|fiets/i.test(interests) || profile.physicalActivity === 'Actief sporten') {
    return 'active';
  }
  if (/muziek|kunst|creatief|zang|theater/i.test(interests) || profile.indoorActivity === 'Creatief') {
    return 'creative';
  }
  if (/schaken|denksport|spel|leren/i.test(interests) || profile.indoorActivity === 'Denksport') {
    return 'learning';
  }
  if (persona === 'Rustzoeker' || profile.physicalActivity === 'Samen kijken') {
    return 'quiet';
  }
  if (/eten|koffie|borrel|food/i.test(interests)) {
    return 'food';
  }
  return 'social';
}

/**
 * Fetches 1–2 local events via discover_vonken.
 */
export async function getEventsByInterest(profile, persona, options = {}) {
  const client = new VonkMcpClient(options.serverUrl);
  const category = mapProfileToMcpCategory(profile, persona);

  try {
    await client.connect();
    const events = await client.callTool('discover_vonken', {
      latitude: options.latitude ?? 51.9225,
      longitude: options.longitude ?? 4.4792,
      radius_km: options.radiusKm ?? 8,
      category,
    });

    const list = Array.isArray(events) ? events : [];
    return {
      success: true,
      category,
      events: list.slice(0, 2),
    };
  } catch (err) {
    console.error('MCP getEventsByInterest:', err.message);
    return {
      success: false,
      category,
      events: [],
      error: err.message,
    };
  }
}

export function formatEventsForTelegram(result) {
  if (!result.success || !result.events.length) {
    return (
      '📅 Op dit moment kon ik geen activiteiten ophalen uit de buurt.\n' +
      'U hoort toch van ons zodra er een passende *vonk* (kleine ontmoeting) is!'
    );
  }

  const lines = [
    '📅 *Activiteiten bij u in de buurt* (via Vonk):',
    '',
  ];

  for (const ev of result.events) {
    const when = ev.time
      ? new Date(ev.time).toLocaleString('nl-NL', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'binnenkort';
    lines.push(
      `✨ *${ev.title}*`,
      `📍 ${ev.location ?? 'Rotterdam'}`,
      `🕐 ${when}`,
      ev.spots_left != null ? `👥 nog ${ev.spots_left} plek(ken)` : '',
      ''
    );
  }

  lines.push('_Tip: vraag gerust meer — typ /start om opnieuw te beginnen._');
  return lines.filter(Boolean).join('\n');
}
