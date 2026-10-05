// 사진 → 외국어 표현과 한국어 뜻 (Cloudflare Worker)
// 앱이 Firebase 로그인 토큰과 함께 사진을 보내면, 토큰을 확인하고 하루 사용량을 센 뒤 Claude에게 물어봄.
// Claude API 키는 여기(Worker 비밀값)에만 있고 앱에는 없음.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-5';
const DAILY_LIMIT = 10;                      // 1인당 하루 사진 수 (한국 시간 기준 자정에 초기화)
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;     // Claude 이미지 한 장 한도
const MAX_IMAGES = 5;
const VOICE_LIMIT = 10;                      // 1인당 하루 말해서 넣기 횟수
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;     // 녹음 한 번 (앱은 30초에서 멈춤)
const WHISPER = '@cf/openai/whisper-large-v3-turbo';   // Cloudflare Workers AI 음성 인식                        // 한 번에 보낼 수 있는 사진 수 (하루 사용량에서 장수만큼 빠짐)
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// 앱의 언어 모드에 쓰는 언어 (코드 → 영어 이름)
const LANG_NAMES = { ko: 'Korean', en: 'English', ja: 'Japanese', zh: 'Chinese', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ru: 'Russian', vi: 'Vietnamese', th: 'Thai' };

/** 지시문. target: 배울 언어(없으면 한국어가 아닌 모든 외국어), native: 뜻을 쓸 언어 */
function systemPrompt(target, native) {
  const learn = target ? LANG_NAMES[target] : 'foreign-language (any language that is not Korean)';
  const meaningLang = LANG_NAMES[native] || 'Korean';
  return `You help a Korean learner turn screenshots into flashcards. The screenshots are usually videos with subtitles, but can be any image with text.
The learner is studying ${target ? LANG_NAMES[target] : 'foreign languages'}${meaningLang !== 'Korean' ? ` and wants the meanings in ${meaningLang}` : ''}.

There may be one or several screenshots. Go through each one and list ${learn} expressions for flashcards, in the order of the screenshots:
- If the user marked anything in a screenshot (underline, highlight, circle, box, arrow, handwriting), list ONLY the marked expressions from that screenshot and set their "marked" to true.
- For a screenshot with no marks, list the expressions worth learning that are shown, such as the subtitle line or idioms and phrases in it, with "marked" false. Prefer the full phrase as it is used over single easy words.
- Only list ${learn} text. Use text in other languages (for example ${meaningLang} subtitles) only as a hint for what it means.
- The screenshots are in order and are often consecutive frames or a scrolled page. If a sentence or expression is cut off at the edge of one screenshot or split across subtitle frames and continues in the next, join it into ONE complete item instead of listing the pieces.
- At most 5 items per screenshot, and don't list the same expression twice. "expression": keep it in the original language and script, exactly as it appears; only fix obvious recognition errors and drop speaker labels or timestamps.
- "meaning": a natural ${meaningLang} translation that fits the context, the way a native ${meaningLang} speaker would actually say it, not a word-for-word gloss. Keep it short.
- "note": 1-2 short Korean sentences in friendly 해요체 that help the learner remember it: the nuance, when people use it, or what a tricky word or idiom literally means. Don't repeat the meaning.
- If there is no ${learn} text at all, return an empty list.`;
}

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          expression: { type: 'string' },
          meaning: { type: 'string' },
          note: { type: 'string' },
          marked: { type: 'boolean' },
        },
        required: ['expression', 'meaning', 'note', 'marked'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

export default {
  fetch: (request, env) => handle(request, env),
};

export async function handle(request, env, deps = {}) {
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const reply = (status, body) => Response.json(body, { status, headers: cors });
  const path = new URL(request.url).pathname;
  const isUsage = request.method === 'GET' && path === '/usage';
  const isVoice = request.method === 'POST' && path === '/voice';
  const isFeedback = request.method === 'POST' && path === '/feedback';
  if (!isUsage && !isVoice && !isFeedback && (request.method !== 'POST' || path !== '/scan')) return reply(404, { error: 'not_found' });
  if (!cors['Access-Control-Allow-Origin']) return reply(403, { error: 'origin' });
  if (isFeedback) return handleFeedback(request, env, reply, deps);

  // 1. 로그인 확인
  let user;
  try {
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
    user = await verifyIdToken(token, env.FIREBASE_PROJECT_ID, deps);
  } catch {
    return reply(401, { error: 'auth' });
  }
  const day = koreaDay(deps.now?.() ?? Date.now());
  const key = `use:${user.sub}:${day}`;
  const voiceKey = `voice:${user.sub}:${day}`;

  // 오늘 사용량만 알려 주기 (설정 화면). 사진은 예전 앱을 위해 맨 위에 그대로
  if (isUsage) {
    const used = Number(await env.USAGE.get(key)) || 0;
    const vUsed = Number(await env.USAGE.get(voiceKey)) || 0;
    return reply(200, {
      used, remaining: Math.max(0, DAILY_LIMIT - used), limit: DAILY_LIMIT,
      voice: { used: vUsed, remaining: Math.max(0, VOICE_LIMIT - vUsed), limit: VOICE_LIMIT },
    });
  }
  if (isVoice) return handleVoice(request, env, reply, voiceKey);

  // 2. 사진 확인: { images: [{ data, mediaType }] } (예전 앱은 { image, mediaType } 한 장)
  let body;
  try { body = await request.json(); } catch { body = null; }
  const images = Array.isArray(body?.images) ? body.images : body?.image ? [{ data: body.image, mediaType: body.mediaType }] : [];
  if (!images.length || images.length > MAX_IMAGES) return reply(400, { error: 'image' });
  for (const img of images) {
    if (typeof img?.data !== 'string' || !MEDIA_TYPES.includes(img.mediaType) || !/^[A-Za-z0-9+/]+=*$/.test(img.data)) return reply(400, { error: 'image' });
    if (img.data.length * 0.75 > MAX_IMAGE_BYTES) return reply(413, { error: 'too_large' });
  }

  // 3. 하루 사용량: 먼저 장수만큼 쓰고, Claude가 실패하면 돌려줌
  const n = images.length;
  const used = Number(await env.USAGE.get(key)) || 0;
  if (used + n > DAILY_LIMIT) return reply(429, { error: 'limit', remaining: Math.max(0, DAILY_LIMIT - used), limit: DAILY_LIMIT });
  await env.USAGE.put(key, String(used + n), { expirationTtl: 2 * 86400 });

  // 4. Claude에게 묻기
  try {
    const target = LANG_NAMES[body.target] ? body.target : null;   // 예전 앱은 언어를 보내지 않음
    const native = LANG_NAMES[body.native] ? body.native : 'ko';
    const result = await askClaude(env, images, target, native);
    return reply(200, { ...result, remaining: DAILY_LIMIT - used - n, limit: DAILY_LIMIT });
  } catch (err) {
    await env.USAGE.put(key, String(used), { expirationTtl: 2 * 86400 });
    if (err instanceof Refusal) return reply(422, { error: 'refused' });
    if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) return reply(503, { error: 'busy' });
    console.error('scan failed', err);
    return reply(502, { error: 'upstream' });
  }
}

class Refusal extends Error {}
class NoSpeech extends Error {}

// ----- 의견 보내기: 로그인 없이도 가능, 메일(Resend)로 만든 사람에게 전달 -----
// 받는 주소(FEEDBACK_TO)와 Resend 키(RESEND_API_KEY)는 Worker 비밀값에만 있음
const FEEDBACK_KINDS = { bug: '🐛 버그', idea: '💡 제안', question: '❓ 문의', etc: '💬 기타' };
const FEEDBACK_PER_DAY = 10;   // 같은 곳(IP)에서 하루에 보낼 수 있는 수
async function handleFeedback(request, env, reply, deps) {
  if (!env.RESEND_API_KEY || !env.FEEDBACK_TO) return reply(503, { error: 'not_configured' });
  let body;
  try { body = await request.json(); } catch { body = null; }
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const text = str(body?.text, 3000);
  if (!text) return reply(400, { error: 'text' });
  const kind = FEEDBACK_KINDS[body?.kind] ? body.kind : 'etc';
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(body?.email, 200)) ? str(body.email, 200) : '';
  // 로그인했으면 누가 보냈는지 (토큰이 틀려도 의견은 받음)
  let who = '로그인 안 함';
  try {
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
    if (token) { const u = await verifyIdToken(token, env.FIREBASE_PROJECT_ID, deps); who = `${u.email || '이메일 없음'} (${u.sub})`; }
  } catch {}
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = `fb:${ip}:${koreaDay(deps.now?.() ?? Date.now())}`;
  const sent = Number(await env.USAGE.get(key)) || 0;
  if (sent >= FEEDBACK_PER_DAY) return reply(429, { error: 'limit' });

  const firstLine = text.split('\n')[0].slice(0, 40);
  const res = await (deps.fetch ?? fetch)('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'mooni의 단어장 <onboarding@resend.dev>',
      to: [env.FEEDBACK_TO],
      subject: `[mooni의 단어장 문의] ${FEEDBACK_KINDS[kind]} · ${firstLine}`,
      text: [
        `종류: ${FEEDBACK_KINDS[kind]}`,
        `답장 받을 이메일: ${email || '(없음)'}`,
        `보낸 사람: ${who}`,
        `앱 버전: ${str(body?.app, 20) || '?'} · 언어 모드: ${str(body?.mode, 20) || '?'}`,
        `기기: ${str(body?.ua, 300) || '?'}`,
        '',
        text,
      ].join('\n'),
      ...(email ? { reply_to: email } : {}),
    }),
  });
  if (!res.ok) {
    console.error('feedback mail failed', res.status, await res.text().catch(() => ''));
    return reply(502, { error: 'mail' });
  }
  await env.USAGE.put(key, String(sent + 1), { expirationTtl: 2 * 86400 });
  return reply(200, { ok: true });
}

// ----- 말해서 넣기: 녹음 → Whisper(글자, 언어) → Claude(표현·뜻·설명) -----
async function handleVoice(request, env, reply, key) {
  let body;
  try { body = await request.json(); } catch { body = null; }
  const audio = typeof body?.audio === 'string' ? body.audio : '';
  if (!audio || !/^[A-Za-z0-9+/]+=*$/.test(audio)) return reply(400, { error: 'audio' });
  if (audio.length * 0.75 > MAX_AUDIO_BYTES) return reply(413, { error: 'too_large' });
  const target = LANG_NAMES[body.target] ? body.target : 'en';
  const native = LANG_NAMES[body.native] ? body.native : 'ko';

  const used = Number(await env.USAGE.get(key)) || 0;
  if (used >= VOICE_LIMIT) return reply(429, { error: 'limit', remaining: 0, limit: VOICE_LIMIT });
  await env.USAGE.put(key, String(used + 1), { expirationTtl: 2 * 86400 });
  try {
    const heard = await env.AI.run(WHISPER, { audio, vad_filter: true });
    const transcript = (heard?.text || '').trim();
    if (!transcript) throw new NoSpeech();
    const language = heard?.transcription_info?.language || '';
    const result = await askClaudeVoice(env, transcript, language, target, native);
    return reply(200, { ...result, transcript, language, remaining: VOICE_LIMIT - used - 1, limit: VOICE_LIMIT });
  } catch (err) {
    await env.USAGE.put(key, String(used), { expirationTtl: 2 * 86400 });
    if (err instanceof NoSpeech) return reply(422, { error: 'no_speech' });
    if (err instanceof Refusal) return reply(422, { error: 'refused' });
    if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) return reply(503, { error: 'busy' });
    console.error('voice failed', err);
    return reply(502, { error: 'upstream' });
  }
}

const VOICE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          expression: { type: 'string' },
          meaning: { type: 'string' },
          note: { type: 'string' },
          spoken: { type: 'string', enum: ['expression', 'meaning'] },
        },
        required: ['expression', 'meaning', 'note', 'spoken'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

async function askClaudeVoice(env, transcript, language, target, native) {
  const learn = LANG_NAMES[target], know = LANG_NAMES[native];
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}) });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: `You help a Korean learner make flashcards from something they said out loud. They are studying ${learn}, and card meanings are written in ${know}.
You get a speech-recognition transcript (it may contain small recognition errors) and the language the recognizer detected.
- If they spoke ${learn}: "expression" is what they said, cleaned up (fix obvious recognition errors and punctuation, keep their wording), "meaning" is a natural ${know} translation that a native ${know} speaker would actually say, and "spoken" is "expression".
- If they spoke ${know} (or any other language): "meaning" is what they said, cleaned up, "expression" is the most natural way a native ${learn} speaker would say it in everyday conversation (not a stiff literal translation), and "spoken" is "meaning".
- "note": 1-2 short Korean sentences in friendly 해요체 that help them remember the expression: nuance, when people use it, or a tricky word. Don't repeat the meaning.
- Usually return one item. Only if they clearly said several separate sentences or phrases, return one item for each (at most 3).`,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: VOICE_SCHEMA } },
    messages: [{ role: 'user', content: `Detected language: ${language || 'unknown'}\nTranscript: ${transcript}` }],
  });
  if (response.stop_reason === 'refusal') throw new Refusal();
  if (response.stop_reason === 'max_tokens') throw new Error('max_tokens');
  const out = JSON.parse(response.content.find((b) => b.type === 'text')?.text);
  const items = out.items
    .map((it) => ({ expression: it.expression.trim(), meaning: it.meaning.trim(), note: (it.note || '').trim(), spoken: it.spoken }))
    .filter((it) => it.expression && it.meaning)
    .slice(0, 3);
  return { items };
}

async function askClaude(env, images, target, native) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}) });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: systemPrompt(target, native),
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        ...images.flatMap((img, i) => [
          ...(images.length > 1 ? [{ type: 'text', text: `사진 ${i + 1}` }] : []),
          { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
        ]),
        { type: 'text', text: `${images.length > 1 ? `이 사진 ${images.length}장` : '이 사진'}의 ${target ? `${LANG_NAMES[target]} ` : '외국어 '}표현을 카드로 만들어 주세요.` },
      ],
    }],
  });
  if (response.stop_reason === 'refusal') throw new Refusal();
  if (response.stop_reason === 'max_tokens') throw new Error('max_tokens');
  const text = response.content.find((b) => b.type === 'text')?.text;
  const out = JSON.parse(text);
  const items = out.items
    .map((it) => ({ expression: it.expression.trim(), meaning: it.meaning.trim(), note: (it.note || '').trim(), marked: !!it.marked }))
    .filter((it) => it.expression)
    .slice(0, 5 * images.length);
  // marked: 예전 앱용 (하나라도 표시가 있었는지)
  return { marked: items.some((it) => it.marked), items };
}

// ----- Firebase 로그인 토큰(ID 토큰) 확인 -----
const KEYS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let keyCache = { keys: null, until: 0 };

async function googleKeys() {
  if (keyCache.keys && Date.now() < keyCache.until) return keyCache.keys;
  const res = await fetch(KEYS_URL);
  if (!res.ok) throw new Error('keys');
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('Cache-Control') || '')?.[1]) || 3600;
  keyCache = { keys: (await res.json()).keys, until: Date.now() + maxAge * 1000 };
  return keyCache.keys;
}

const b64urlBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const b64urlJSON = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

export async function verifyIdToken(token, projectId, { keys = googleKeys, now = Date.now } = {}) {
  const parts = token.split('.');
  if (parts.length !== 3 || !projectId) throw new Error('format');
  const header = b64urlJSON(parts[0]);
  const payload = b64urlJSON(parts[1]);
  if (header.alg !== 'RS256') throw new Error('alg');
  const jwk = (await keys()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('kid');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error('signature');
  const t = now() / 1000;
  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('audience');
  if (!(payload.exp > t) || !(payload.iat <= t + 300) || !(payload.auth_time <= t + 300)) throw new Error('time');
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('subject');
  return payload;
}

// ----- 도우미 -----
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const headers = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
  if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

/** 한국 시간 기준 날짜 (예: 2026-10-05) */
const koreaDay = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
