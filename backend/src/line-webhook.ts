type Env = {
  DB: any;
  LINE_CHANNEL_SECRET?: string;
};

type LineSource = {
  type: 'user' | 'group' | 'room';
  userId?: string;
  groupId?: string;
  roomId?: string;
};

type LineWebhookEvent = {
  type: string;
  source?: LineSource;
};

type LineWebhookBody = {
  events?: LineWebhookEvent[];
};

const textEncoder = new TextEncoder();

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

export const verifyLineSignature = async (
  body: string,
  signature: string | null,
  channelSecret?: string
): Promise<boolean> => {
  if (!channelSecret) return true;
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, textEncoder.encode(body));
  const expected = btoa(String.fromCharCode(...new Uint8Array(digest)));

  return timingSafeEqual(expected, signature);
};

const lineIdFromSource = (source?: LineSource): string | null => {
  if (!source) return null;
  if (source.type === 'user') return source.userId ?? null;
  if (source.type === 'group') return source.groupId ?? null;
  if (source.type === 'room') return source.roomId ?? null;
  return null;
};

const subscribe = async (env: Env, source: LineSource) => {
  const lineId = lineIdFromSource(source);
  if (!lineId) return;

  await env.DB.prepare(`
    INSERT INTO line_subscribers (
      lineId,
      sourceType,
      active,
      followedAt,
      unfollowedAt,
      updatedAt
    ) VALUES (?, ?, 1, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)
    ON CONFLICT(lineId) DO UPDATE SET
      sourceType = excluded.sourceType,
      active = 1,
      unfollowedAt = NULL,
      updatedAt = CURRENT_TIMESTAMP
  `).bind(lineId, source.type).run();
};

const unsubscribe = async (env: Env, source: LineSource) => {
  const lineId = lineIdFromSource(source);
  if (!lineId) return;

  await env.DB.prepare(`
    UPDATE line_subscribers
    SET active = 0,
        unfollowedAt = CURRENT_TIMESTAMP,
        updatedAt = CURRENT_TIMESTAMP
    WHERE lineId = ?
  `).bind(lineId).run();
};

export const handleLineWebhook = async (
  env: Env,
  body: LineWebhookBody
): Promise<number> => {
  const events = body.events ?? [];

  await Promise.all(events.map(async (event) => {
    if (!event.source) return;

    if (event.type === 'follow' || event.type === 'join' || event.type === 'message') {
      await subscribe(env, event.source);
      return;
    }

    if (event.type === 'unfollow' || event.type === 'leave') {
      await unsubscribe(env, event.source);
    }
  }));

  return events.length;
};
