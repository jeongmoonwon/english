// 사진 → 외국어 표현과 한국어 뜻 (Cloudflare Worker)
// 앱이 Firebase 로그인 토큰과 함께 사진을 보내면, 토큰을 확인하고 하루 사용량을 센 뒤 Claude에게 물어봄.
// Claude API 키는 여기(Worker 비밀값)에만 있고 앱에는 없음.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-5';
const DAILY_LIMIT = 10;                      // 1인당 하루 사진 수 (한국 시간 기준 자정에 초기화)
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;     // Claude 이미지 한 장 한도
const MAX_IMAGES = 5;                        // 한 번에 보낼 수 있는 사진 수 (하루 사용량에서 장수만큼 빠짐)
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
  if (!isUsage && (request.method !== 'POST' || path !== '/scan')) return reply(404, { error: 'not_found' });
  if (!cors['Access-Control-Allow-Origin']) return reply(403, { error: 'origin' });

  // 1. 로그인 확인
  let user;
  try {
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
    user = await verifyIdToken(token, env.FIREBASE_PROJECT_ID, deps);
  } catch {
    return reply(401, { error: 'auth' });
  }
  const key = `use:${user.sub}:${koreaDay(deps.now?.() ?? Date.now())}`;

  // 오늘 사용량만 알려 주기 (설정 화면)
  if (isUsage) {
    const used = Number(await env.USAGE.get(key)) || 0;
    return reply(200, { used, remaining: Math.max(0, DAILY_LIMIT - used), limit: DAILY_LIMIT });
  }

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
