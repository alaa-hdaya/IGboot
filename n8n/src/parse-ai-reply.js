// Reads Claude's structured JSON answer. Anything unexpected becomes a safe
// handover decision instead of a strange message to the prospect.
const ctx = $('Build AI Request').first().json.ctx;
const res = $input.first().json || {};

function fallback(reason) {
  return {
    reply: `Merci pour votre message ! Un membre de l'équipe ${ctx.cfg.brandName} va vous répondre. / ` +
      `Thanks for your message! A member of the ${ctx.cfg.brandName} team will get back to you.`,
    language: 'other',
    intent: 'other',
    escalate: true,
    escalation_reason: reason,
    lead: { business_type: '', main_need: '', current_tools: '', services_interest: '', wants_consultation: 'unknown' },
    lead_status: 'Follow-up',
    summary: '',
    next_action: 'Human review: the AI could not answer automatically.',
    source: 'fallback',
  };
}

let decision;
if (res.stop_reason === 'refusal') {
  decision = fallback('ai_refusal');
} else if (res.stop_reason === 'max_tokens') {
  decision = fallback('ai_truncated');
} else {
  const block = (res.content || []).find(b => b.type === 'text');
  try {
    const d = JSON.parse(block ? block.text : '');
    if (typeof d.reply !== 'string' || typeof d.escalate !== 'boolean' || !d.lead) throw new Error('bad shape');
    decision = { ...d, source: 'ai' };
  } catch (e) {
    decision = fallback('ai_invalid_output');
  }
}
return [{ json: { decision } }];
