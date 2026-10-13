// Answers Meta's webhook verification request (GET).
// Meta sends hub.mode, hub.verify_token and hub.challenge; we echo the
// challenge only when the token matches the one you entered in the Meta dashboard.
function readSecret(name) {
  try { const v = $env[name]; if (v) return String(v); } catch (e) {}
  try { const v = $vars[name]; if (v) return String(v); } catch (e) {}
  return '';
}
// Use ONLY if your n8n cannot use environment variables or Variables (see docs/01-setup-guide.md).
const VERIFY_TOKEN_FALLBACK = '';

const expected = readSecret('META_VERIFY_TOKEN') || VERIFY_TOKEN_FALLBACK;
const q = $input.first().json.query || {};
const hub = q.hub || {};
const mode = q['hub.mode'] || hub.mode;
const token = q['hub.verify_token'] || hub.verify_token;
const challenge = q['hub.challenge'] || hub.challenge;

if (expected && mode === 'subscribe' && token === expected && challenge) {
  return [{ json: { status: 200, body: String(challenge) } }];
}
return [{ json: { status: 403, body: 'Forbidden' } }];
