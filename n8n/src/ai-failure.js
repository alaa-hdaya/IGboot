// The Claude API call failed (network, auth, rate limit, outage).
// Send one polite holding message, pause the bot and alert the team.
const ctx = $('Build AI Request').first().json.ctx;
const err = $input.first().json.error || {};
const detail = String(err.message || err.description || JSON.stringify(err)).slice(0, 300);

const decision = {
  reply: `Merci pour votre message ! Un membre de l'équipe ${ctx.cfg.brandName} va vous répondre. / ` +
    `Thanks for your message! A member of the ${ctx.cfg.brandName} team will get back to you.`,
  language: 'other',
  intent: 'other',
  escalate: true,
  escalation_reason: 'ai_error: ' + detail,
  lead: { business_type: '', main_need: '', current_tools: '', services_interest: '', wants_consultation: 'unknown' },
  lead_status: 'Follow-up',
  summary: '',
  next_action: 'Human review: the AI provider failed.',
  source: 'fallback',
};
return [{ json: { decision } }];
