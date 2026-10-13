// Works out what happened, merges lead data, prepares log rows and the team alert.
const built = $('Build AI Request').first().json;
const ctx = built.ctx;
const cfg = ctx.cfg;
const msg = ctx.msg;
const prep = $('Prepare Send').first().json;
const input = $input.first().json || {};

let status = prep.status;
let sendError = '';
if (prep.send) {
  if (input.error) {
    status = 'failed';
    const e = input.error;
    sendError = String(e.message || e.description || JSON.stringify(e)).slice(0, 300);
  } else {
    status = 'sent';
  }
}

const d = prep.decision;
const old = ctx.lead || {};
const nowIso = new Date().toISOString();
function isTrue(v) {
  return v === true || ['true', 'yes', '1', 'oui'].includes(String(v || '').trim().toLowerCase());
}
function pick(newVal, oldVal) {
  const v = String(newVal || '').trim();
  return v && v.toLowerCase() !== 'unknown' ? v : (oldVal || '');
}

const wasPaused = isTrue(old.bot_paused);
const escalateNow = !!(d && d.escalate) && !wasPaused;
const consultationNow = !!(d && d.lead && d.lead.wants_consultation === 'yes') && old.wants_consultation !== 'yes';

let leadStatus = old.lead_status || 'New';
if (d && d.lead_status && old.lead_status !== 'Converted') leadStatus = d.lead_status;

const lead = {
  ig_user_id: msg.igsid,
  username: ctx.username || old.username || '',
  first_contact_at: old.first_contact_at || new Date(msg.timestamp).toISOString(),
  last_interaction_at: nowIso,
  language: d && d.language !== 'other' ? d.language : (old.language || ''),
  business_type: pick(d && d.lead.business_type, old.business_type),
  main_need: pick(d && d.lead.main_need, old.main_need),
  current_tools: pick(d && d.lead.current_tools, old.current_tools),
  services_interest: pick(d && d.lead.services_interest, old.services_interest),
  wants_consultation: pick(d && d.lead.wants_consultation, old.wants_consultation),
  lead_status: leadStatus,
  bot_paused: wasPaused || escalateNow ? 'TRUE' : 'FALSE',
  handover_reason: escalateNow ? d.escalation_reason : (old.handover_reason || ''),
  summary: pick(d && d.summary, old.summary),
  next_action: escalateNow ? 'Human follow-up: ' + (d.next_action || d.escalation_reason)
    : pick(d && d.next_action, old.next_action),
  message_count: String((parseInt(old.message_count, 10) || 0) + 1),
};

const logRows = [{
  timestamp: new Date(msg.timestamp).toISOString(),
  ig_user_id: msg.igsid,
  direction: 'in',
  message_id: msg.mid,
  text: msg.text,
  intent: d ? d.intent : '',
  status: 'received',
  mode: cfg.mode,
  error: '',
}];
if (prep.reply) {
  logRows.push({
    timestamp: nowIso,
    ig_user_id: msg.igsid,
    direction: 'out',
    message_id: input.message_id ? String(input.message_id) : '',
    text: prep.reply,
    intent: d ? d.intent : '',
    status,
    mode: cfg.mode,
    error: sendError,
  });
}

// Team alert: only for events that need a person.
let reason = '';
if (status === 'failed') reason = 'Instagram send failed: ' + sendError;
else if (status === 'window_expired') reason = 'Message outside the 24h window: reply manually in Instagram';
else if (escalateNow) reason = 'Handover requested: ' + d.escalation_reason;
else if (consultationNow) reason = 'Prospect wants a consultation';

const who = lead.username ? '@' + lead.username : 'IG user ' + msg.igsid;
const email = {
  to: cfg.teamEmail,
  subject: `[${cfg.brandName} IG]${cfg.mode === 'dry_run' ? ' [DRY RUN]' : ''} ${reason.split(':')[0]}: ${who}`,
  body: [
    reason,
    '',
    `Prospect: ${who} (id ${msg.igsid})`,
    `Status: ${lead.lead_status}   Bot paused: ${lead.bot_paused}`,
    `Business: ${lead.business_type || '-'}`,
    `Need: ${lead.main_need || '-'}`,
    `Summary: ${lead.summary || '-'}`,
    `Next action: ${lead.next_action || '-'}`,
    '',
    `Last message: ${msg.text}`,
    prep.reply ? `Assistant reply (${status}): ${prep.reply}` : 'No automated reply.',
    '',
    lead.bot_paused === 'TRUE'
      ? 'The bot is paused for this prospect. Reply from the Instagram app, then set bot_paused to FALSE in the Leads sheet to resume automation.'
      : '',
    cfg.sheetUrl ? `CRM: ${cfg.sheetUrl}` : '',
  ].filter(l => l !== null).join('\n'),
};

const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(cfg.teamEmail || ''));
return [{ json: { status, lead, logRows, notify: !!reason && validEmail, email } }];
