// Validates the Meta webhook POST, drops events we must not answer,
// de-duplicates retries, and decides whether a reply may be sent (controlled mode).
const cfg = $('Config').first().json;
const input = $input.first();
const headers = input.json.headers || {};

function readSecret(name) {
  try { const v = $env[name]; if (v) return String(v); } catch (e) {}
  try { const v = $vars[name]; if (v) return String(v); } catch (e) {}
  return '';
}
// Use ONLY if your n8n cannot use environment variables or Variables (see docs/01-setup-guide.md).
// Never share or export the workflow after filling this in.
const APP_SECRET_FALLBACK = '';

// 1. Raw body: the signature is computed over the exact bytes Meta sent.
let raw = null;
try {
  if (input.binary && input.binary.data) raw = await this.helpers.getBinaryDataBuffer(0, 'data');
} catch (e) {
  raw = null;
}
let body = input.json.body;
if ((!body || typeof body !== 'object' || !Object.keys(body).length) && raw) {
  try { body = JSON.parse(raw.toString('utf8')); } catch (e) { body = {}; }
}
body = body || {};

// 2. Signature check (X-Hub-Signature-256 = HMAC-SHA256 of the raw body with the App Secret).
if (cfg.verifySignature) {
  const secret = readSecret('META_APP_SECRET') || APP_SECRET_FALLBACK;
  if (!secret) throw new Error('META_APP_SECRET is not configured (see docs/01-setup-guide.md).');
  if (!raw) throw new Error('Raw body missing: enable the "Raw Body" option on the "Instagram Webhook (POST)" node.');
  const crypto = require('crypto');
  const received = Buffer.from(String(headers['x-hub-signature-256'] || ''));
  const expected = Buffer.from('sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex'));
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return []; // not from Meta (or wrong secret): ignore silently
  }
}

if (body.object !== 'instagram') return [];

// 3. Duplicate protection: remember message IDs (only persists while the workflow is active).
const store = $getWorkflowStaticData('global');
store.seenMids = store.seenMids || {};
const now = Date.now();
const ttl = (cfg.dedupTtlHours || 48) * 3600 * 1000;
for (const [mid, seenAt] of Object.entries(store.seenMids)) {
  if (now - seenAt > ttl) delete store.seenMids[mid];
}

// 4. Collect answerable messages, merged per sender so one burst gets one reply.
const bySender = new Map();
for (const entry of body.entry || []) {
  for (const ev of entry.messaging || []) {
    const m = ev.message;
    if (!m || !ev.sender || !ev.sender.id) continue;      // read receipts, reactions, postbacks...
    if (m.is_echo) continue;                              // our own outgoing messages
    if (m.is_deleted || m.is_unsupported) continue;
    const ownId = String(cfg.igAccountId || entry.id || '');
    const senderId = String(ev.sender.id);
    if (senderId === ownId || senderId === String(entry.id)) continue;

    const mid = m.mid ? String(m.mid) : '';
    if (mid && store.seenMids[mid]) continue;            // Meta retry / duplicate delivery

    let text = typeof m.text === 'string' ? m.text.trim() : '';
    if (!text && Array.isArray(m.attachments) && m.attachments.length) {
      const kinds = m.attachments.map(a => (a && a.type) || 'attachment').join(', ');
      text = `[The prospect sent: ${kinds}, without text]`;
    }
    if (!text) continue;
    if (mid) store.seenMids[mid] = now;

    let ts = Number(ev.timestamp) || now;
    if (ts < 1e12) ts *= 1000; // seconds -> milliseconds

    const group = bySender.get(senderId) || {
      igsid: senderId,
      igAccountId: String(cfg.igAccountId || (ev.recipient && ev.recipient.id) || entry.id || ''),
      mids: [],
      texts: [],
      timestamp: 0,
    };
    if (mid) group.mids.push(mid);
    group.texts.push(text);
    group.timestamp = Math.max(group.timestamp, ts);
    bySender.set(senderId, group);
  }
}

// 5. Controlled mode gate.
const allow = (cfg.allowlist || []).map(String);
const out = [];
for (const g of bySender.values()) {
  const canSend = cfg.mode === 'live' || (cfg.mode === 'allowlist' && allow.includes(g.igsid));
  out.push({
    json: {
      igsid: g.igsid,
      igAccountId: g.igAccountId,
      mid: g.mids.join(','),
      text: g.texts.join('\n'),
      timestamp: g.timestamp,
      receivedAt: new Date(now).toISOString(),
      canSend,
      cfg,
    },
  });
}
return out;
