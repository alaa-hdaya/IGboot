// Gathers lead, history and knowledge base, decides whether the AI should run,
// and builds the Claude API request body.
const SYSTEM_PROMPT = __SYSTEM_PROMPT__;

const msg = $('When Called (per message)').first().json;
const cfg = msg.cfg;

function isTrue(v) {
  return v === true || ['true', 'yes', '1', 'oui'].includes(String(v || '').trim().toLowerCase());
}
function isDisabled(v) {
  return v === false || ['false', 'no', '0', 'non'].includes(String(v || '').trim().toLowerCase());
}

const leadRow = $('Get Lead').first().json || {};
const lead = leadRow.ig_user_id ? leadRow : null;

let username = (lead && lead.username) || '';
try {
  const p = $('Get Profile').first().json;
  if (p && !p.error && p.username) username = String(p.username);
} catch (e) { /* profile lookup not executed (existing lead) */ }

const cutoff = Date.now() - cfg.historyRetentionDays * 86400 * 1000;
const history = $('Get History').all()
  .map(i => i.json)
  .filter(r => r.ig_user_id && r.text && ['sent', 'dry_run', 'received'].includes(String(r.status)))
  .filter(r => (Date.parse(r.timestamp) || 0) >= cutoff)
  .sort((a, b) => (Date.parse(a.timestamp) || 0) - (Date.parse(b.timestamp) || 0))
  .slice(-cfg.historyLimit);

const kb = $('Get Knowledge').all()
  .map(i => i.json)
  .filter(r => r.section && r.content && !isDisabled(r.enabled));

const ctx = { msg, cfg, lead, username };

// Handover active: humans are handling this conversation.
if (lead && isTrue(lead.bot_paused)) {
  return [{ json: { route: 'skip', skipReason: 'paused', ctx } }];
}
// Outside Instagram's 24h window: an automated reply is not allowed.
if (Date.now() - msg.timestamp > cfg.replyWindowHours * 3600 * 1000) {
  return [{ json: { route: 'skip', skipReason: 'window_expired', ctx } }];
}

// Conversation turns (must start with the user and alternate).
const turns = [];
for (const r of history) {
  const role = r.direction === 'out' ? 'assistant' : 'user';
  const last = turns[turns.length - 1];
  if (last && last.role === role) last.content += '\n' + r.text;
  else turns.push({ role, content: String(r.text) });
}
const lastTurn = turns[turns.length - 1];
if (lastTurn && lastTurn.role === 'user') lastTurn.content += '\n' + msg.text;
else turns.push({ role: 'user', content: msg.text });
while (turns.length && turns[0].role !== 'user') turns.shift();

const kbText = kb.map(r => `## ${r.section}\n${r.content}`).join('\n\n');
const systemText = SYSTEM_PROMPT.split('{{BRAND_NAME}}').join(cfg.brandName) +
  '\n\n# Knowledge base (the ONLY source of facts about ' + cfg.brandName + ')\n\n' + kbText;

const known = lead ? {
  business_type: lead.business_type || '',
  main_need: lead.main_need || '',
  current_tools: lead.current_tools || '',
  services_interest: lead.services_interest || '',
  wants_consultation: lead.wants_consultation || '',
  lead_status: lead.lead_status || '',
  summary: lead.summary || '',
} : null;
const contextText = known
  ? 'Returning prospect. Already known (do not ask again):\n' + JSON.stringify(known, null, 2)
  : 'First contact with this prospect: nothing is known yet.';

const SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    language: { type: 'string', enum: ['fr', 'en', 'ar_tn', 'ar', 'other'] },
    intent: {
      type: 'string',
      enum: ['greeting', 'service_question', 'pricing', 'qualification', 'consultation_request',
        'human_request', 'complaint', 'out_of_scope', 'other'],
    },
    escalate: { type: 'boolean' },
    escalation_reason: { type: 'string' },
    lead: {
      type: 'object',
      properties: {
        business_type: { type: 'string' },
        main_need: { type: 'string' },
        current_tools: { type: 'string' },
        services_interest: { type: 'string' },
        wants_consultation: { type: 'string', enum: ['yes', 'no', 'unknown'] },
      },
      required: ['business_type', 'main_need', 'current_tools', 'services_interest', 'wants_consultation'],
      additionalProperties: false,
    },
    lead_status: { type: 'string', enum: ['New', 'Qualified', 'Follow-up', 'Not Interested'] },
    summary: { type: 'string' },
    next_action: { type: 'string' },
  },
  required: ['reply', 'language', 'intent', 'escalate', 'escalation_reason', 'lead', 'lead_status',
    'summary', 'next_action'],
  additionalProperties: false,
};

// Server-side refusal fallback is supported on these models only.
const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1'];

const llmBody = {
  model: cfg.aiModel,
  max_tokens: cfg.aiMaxTokens,
  output_config: { effort: cfg.aiEffort, format: { type: 'json_schema', schema: SCHEMA } },
  system: [
    { type: 'text', text: systemText, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: contextText },
  ],
  messages: turns,
};
if (FALLBACK_MODELS.includes(cfg.aiModel)) llmBody.fallbacks = 'default';

return [{ json: { route: 'ai', llmBody, ctx } }];
