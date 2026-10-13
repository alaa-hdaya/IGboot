// SIMULATED tests: no network, no Instagram, no AI calls.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runNode, webhookItem, igEvent, payload } from './harness.mjs';
import { mainWorkflow, errorWorkflow } from '../n8n/build.mjs';

const SECRET = 'test-app-secret';
const ENV = { META_APP_SECRET: SECRET, META_VERIFY_TOKEN: 'verify-me' };

async function config(overrides = {}) {
  const [item] = await runNode('config');
  return { json: { ...item.json, sheetId: 'sheet', teamEmail: 'team@example.com', ...overrides } };
}

async function parse(events, { cfg = {}, staticData = {}, tamper = false, env = ENV } = {}) {
  return runNode('parse-events', {
    input: [webhookItem(payload(events), SECRET, { tamper })],
    nodes: { Config: [await config(cfg)] },
    env, staticData,
  });
}

const KB = [
  { section: 'about', content: 'GostProcess is an AI automation agency.', enabled: 'TRUE' },
  { section: 'pricing', content: 'Custom pricing; offer a consultation.', enabled: 'TRUE' },
  { section: 'draft', content: 'DRAFT text', enabled: 'FALSE' },
];

function aiResponse(decision, extra = {}) {
  return { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(decision) }], ...extra };
}

function decision(overrides = {}) {
  return {
    reply: 'Bonjour ! Quel type d’activité avez-vous ?',
    language: 'fr', intent: 'greeting', escalate: false, escalation_reason: '',
    lead: { business_type: '', main_need: '', current_tools: '', services_interest: '', wants_consultation: 'unknown' },
    lead_status: 'New', summary: 'Prospect said hello.', next_action: 'Continue qualification',
    ...overrides,
  };
}

// Runs the per-message part of the workflow the way n8n wires it.
async function simulate(msgItem, { lead = {}, history = [], ai, aiError, sendResult, sendError } = {}) {
  const nodes = {
    'When Called (per message)': [msgItem],
    'Get Lead': [{ json: lead }],
    'Get History': history.length ? history.map(json => ({ json })) : [{ json: {} }],
    'Get Knowledge': KB.map(json => ({ json })),
  };
  const [built] = await runNode('build-ai-request', { nodes });
  nodes['Build AI Request'] = [built];
  let toPrepare = built;
  if (built.json.route === 'ai') {
    if (aiError) {
      [toPrepare] = await runNode('ai-failure', { input: [{ json: { error: aiError } }], nodes });
    } else {
      [toPrepare] = await runNode('parse-ai-reply', { input: [{ json: ai }], nodes });
    }
  }
  const [prep] = await runNode('prepare-send', { input: [toPrepare], nodes });
  nodes['Prepare Send'] = [prep];
  let afterSend = prep;
  if (prep.json.send) {
    afterSend = sendError ? { json: { error: sendError } } : { json: sendResult || { recipient_id: msgItem.json.igsid, message_id: 'out_1' } };
  }
  const [rec] = await runNode('record-result', { input: [afterSend], nodes });
  nodes['Record Result'] = [rec];
  const leadRow = await runNode('lead-row', { nodes });
  const logRows = await runNode('log-rows', { nodes });
  const email = await runNode('email-payload', { nodes });
  return { built: built.json, prep: prep.json, rec: rec.json, leadRow, logRows, email };
}

// ---------------- webhook verification ----------------
test('GET verification echoes the challenge only with the right token', async () => {
  const ok = await runNode('verify-handshake', { input: [{ json: { query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': '123' } } }], env: ENV });
  assert.deepEqual(ok[0].json, { status: 200, body: '123' });
  const bad = await runNode('verify-handshake', { input: [{ json: { query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '123' } } }], env: ENV });
  assert.equal(bad[0].json.status, 403);
  const noSecret = await runNode('verify-handshake', { input: [{ json: { query: { 'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': '1' } } }] });
  assert.equal(noSecret[0].json.status, 403);
});

// ---------------- event filtering ----------------
test('valid signed message is accepted; tampered signature is dropped', async () => {
  const good = await parse([igEvent()]);
  assert.equal(good.length, 1);
  assert.equal(good[0].json.text, 'Bonjour');
  const bad = await parse([igEvent()], { tamper: true });
  assert.equal(bad.length, 0);
});

test('missing app secret fails loudly (misconfiguration)', async () => {
  await assert.rejects(() => parse([igEvent()], { env: {} }), /META_APP_SECRET/);
});

test('echoes, own messages, reads and empty events are ignored (no reply loops)', async () => {
  const out = await parse([
    igEvent({ echo: true, mid: 'e1' }),
    igEvent({ sender: '178400000', mid: 'e2' }),
    { sender: { id: '900001' }, recipient: { id: '178400000' }, timestamp: Date.now(), read: { mid: 'x' } },
    { sender: { id: '900001' }, recipient: { id: '178400000' }, timestamp: Date.now(), message: { mid: 'e3', is_deleted: true } },
  ]);
  assert.equal(out.length, 0);
});

test('repeated webhook delivery does not produce a second reply', async () => {
  const staticData = {};
  const first = await parse([igEvent({ mid: 'dup' })], { staticData });
  const second = await parse([igEvent({ mid: 'dup' })], { staticData });
  assert.equal(first.length, 1);
  assert.equal(second.length, 0);
});

test('several messages from one sender in one delivery are merged into one reply', async () => {
  const out = await parse([igEvent({ mid: 'a', text: 'Salut' }), igEvent({ mid: 'b', text: "j'ai une agence de voyage" })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].json.text, "Salut\nj'ai une agence de voyage");
  assert.equal(out[0].json.mid, 'a,b');
});

test('attachment-only messages become a readable placeholder', async () => {
  const out = await parse([igEvent({ attachments: [{ type: 'image', payload: {} }] })]);
  assert.match(out[0].json.text, /image/);
});

test('controlled mode: dry_run never sends, allowlist only sends to listed IDs', async () => {
  assert.equal((await parse([igEvent()]))[0].json.canSend, false);
  const allow = await parse([igEvent({ sender: '111' }), igEvent({ sender: '222', mid: 'm2' })], { cfg: { mode: 'allowlist', allowlist: ['111'] } });
  assert.deepEqual(allow.map(i => [i.json.igsid, i.json.canSend]), [['111', true], ['222', false]]);
  assert.equal((await parse([igEvent()], { cfg: { mode: 'live' } }))[0].json.canSend, true);
});

// ---------------- conversation handling ----------------
test('first-time prospect in dry_run: AI runs, nothing sent, lead + log rows created', async () => {
  const [msg] = await parse([igEvent({ text: 'Bonjour, vous faites quoi ?' })]);
  const r = await simulate(msg, { ai: aiResponse(decision()) });
  assert.equal(r.built.route, 'ai');
  assert.equal(r.built.llmBody.messages.length, 1);
  assert.equal(r.built.llmBody.fallbacks, 'default');
  assert.match(r.built.llmBody.system[0].text, /GostProcess is an AI automation agency/);
  assert.doesNotMatch(r.built.llmBody.system[0].text, /DRAFT text/);
  assert.match(r.built.llmBody.system[1].text, /First contact/);
  assert.equal(r.prep.send, false);
  assert.equal(r.rec.status, 'dry_run');
  assert.equal(r.leadRow[0].json.ig_user_id, msg.json.igsid);
  assert.equal(r.leadRow[0].json.lead_status, 'New');
  assert.equal(r.leadRow[0].json.message_count, '1');
  assert.deepEqual(r.logRows.map(x => x.json.direction), ['in', 'out']);
  assert.equal(r.email.length, 0);
});

test('returning prospect: history and known facts go to the AI, data is not overwritten by blanks', async () => {
  const [msg] = await parse([igEvent({ text: 'Et pour WhatsApp ?' })], { cfg: { mode: 'live' } });
  const lead = { ig_user_id: msg.json.igsid, first_contact_at: '2026-10-12T10:00:00.000Z', business_type: 'travel agency', main_need: 'automated customer support', lead_status: 'Qualified', bot_paused: 'FALSE', message_count: '3' };
  const now = Date.now();
  const history = [
    { timestamp: new Date(now - 60000).toISOString(), ig_user_id: msg.json.igsid, direction: 'in', text: "J'ai une agence de voyage", status: 'received' },
    { timestamp: new Date(now - 50000).toISOString(), ig_user_id: msg.json.igsid, direction: 'out', text: 'Super, quel est votre besoin ?', status: 'sent' },
    { timestamp: new Date(now - 40000).toISOString(), ig_user_id: msg.json.igsid, direction: 'out', text: 'failed one', status: 'failed' },
  ];
  const r = await simulate(msg, { lead, history, ai: aiResponse(decision({ lead_status: 'Qualified', lead: { business_type: '', main_need: '', current_tools: '', services_interest: 'WhatsApp automation', wants_consultation: 'unknown' } })) });
  assert.deepEqual(r.built.llmBody.messages.map(m => m.role), ['user', 'assistant', 'user']);
  assert.ok(!JSON.stringify(r.built.llmBody.messages).includes('failed one'));
  assert.match(r.built.llmBody.system[1].text, /travel agency/);
  assert.equal(r.rec.status, 'sent');
  assert.equal(r.leadRow[0].json.business_type, 'travel agency');
  assert.equal(r.leadRow[0].json.services_interest, 'WhatsApp automation');
  assert.equal(r.leadRow[0].json.first_contact_at, '2026-10-12T10:00:00.000Z');
  assert.equal(r.leadRow[0].json.message_count, '4');
});

test('human request: bot pauses, team is emailed, prospect is told the team will follow up', async () => {
  const [msg] = await parse([igEvent({ text: 'Je veux parler à quelqu’un' })], { cfg: { mode: 'live' } });
  const r = await simulate(msg, { ai: aiResponse(decision({ intent: 'human_request', escalate: true, escalation_reason: 'asked for a human', reply: "Bien sûr, un membre de l'équipe va vous répondre ici.", lead_status: 'Follow-up' })) });
  assert.equal(r.rec.status, 'sent');
  assert.equal(r.leadRow[0].json.bot_paused, 'TRUE');
  assert.equal(r.email.length, 1);
  assert.match(r.email[0].json.subject, /Handover requested/);
  assert.match(r.email[0].json.body, /set bot_paused to FALSE/);
});

test('paused conversation: no AI call, no reply, message still logged', async () => {
  const [msg] = await parse([igEvent({ text: 'Merci' })], { cfg: { mode: 'live' } });
  const r = await simulate(msg, { lead: { ig_user_id: msg.json.igsid, bot_paused: 'TRUE', lead_status: 'Follow-up' } });
  assert.equal(r.built.route, 'skip');
  assert.equal(r.prep.send, false);
  assert.equal(r.rec.status, 'paused');
  assert.deepEqual(r.logRows.map(x => x.json.direction), ['in']);
  assert.equal(r.leadRow[0].json.bot_paused, 'TRUE');
});

test('message outside the 24h window: no automated reply, team alerted', async () => {
  const [msg] = await parse([igEvent({ ts: Date.now() - 25 * 3600 * 1000 })], { cfg: { mode: 'live' } });
  const r = await simulate(msg);
  assert.equal(r.rec.status, 'window_expired');
  assert.equal(r.prep.send, false);
  assert.match(r.email[0].json.subject, /24h window/);
});

test('consultation request alerts the team without pausing the bot', async () => {
  const [msg] = await parse([igEvent({ text: 'Oui je veux une consultation' })], { cfg: { mode: 'live' } });
  const r = await simulate(msg, { ai: aiResponse(decision({ intent: 'consultation_request', lead_status: 'Follow-up', lead: { business_type: 'restaurant', main_need: 'booking', current_tools: '', services_interest: 'booking workflows', wants_consultation: 'yes' } })) });
  assert.equal(r.leadRow[0].json.bot_paused, 'FALSE');
  assert.match(r.email[0].json.subject, /consultation/);
});

test('AI provider failure: one holding message, bot paused, team alerted', async () => {
  const [msg] = await parse([igEvent()], { cfg: { mode: 'live' } });
  const r = await simulate(msg, { aiError: { message: '529 overloaded' } });
  assert.equal(r.rec.status, 'sent');
  assert.match(r.prep.reply, /team/);
  assert.equal(r.leadRow[0].json.bot_paused, 'TRUE');
  assert.match(r.email[0].json.body, /ai_error: 529 overloaded/);
});

test('AI refusal or invalid output is handled like a handover', async () => {
  const [msg] = await parse([igEvent()], { cfg: { mode: 'live' } });
  const refused = await simulate(msg, { ai: { stop_reason: 'refusal', content: [] } });
  assert.equal(refused.leadRow[0].json.handover_reason, 'ai_refusal');
  const garbage = await simulate(msg, { ai: aiResponse({}, { content: [{ type: 'text', text: 'not json' }] }) });
  assert.equal(garbage.leadRow[0].json.handover_reason, 'ai_invalid_output');
});

test('Instagram API auth error: status failed, error logged, team alerted', async () => {
  const [msg] = await parse([igEvent()], { cfg: { mode: 'live' } });
  const r = await simulate(msg, { ai: aiResponse(decision()), sendError: { message: '401 - Invalid OAuth access token' } });
  assert.equal(r.rec.status, 'failed');
  assert.match(r.logRows[1].json.error, /Invalid OAuth/);
  assert.match(r.email[0].json.subject, /Instagram send failed/);
});

test('non-allowlisted sender in allowlist mode is not sent', async () => {
  const [msg] = await parse([igEvent({ sender: '333' })], { cfg: { mode: 'allowlist', allowlist: ['111'] } });
  const r = await simulate(msg, { ai: aiResponse(decision()) });
  assert.equal(r.rec.status, 'not_allowlisted');
});

test('long replies are truncated to the configured limit', async () => {
  const [msg] = await parse([igEvent()], { cfg: { mode: 'live' } });
  const r = await simulate(msg, { ai: aiResponse(decision({ reply: 'x'.repeat(2000) })) });
  assert.ok(r.prep.reply.length <= 900);
});

test('a lead marked Converted by the team keeps that status', async () => {
  const [msg] = await parse([igEvent()], { cfg: { mode: 'live' } });
  const r = await simulate(msg, { lead: { ig_user_id: msg.json.igsid, lead_status: 'Converted', bot_paused: 'FALSE' }, ai: aiResponse(decision({ lead_status: 'Qualified' })) });
  assert.equal(r.leadRow[0].json.lead_status, 'Converted');
});

// ---------------- workflow JSON integrity ----------------
test('workflow JSON: connections valid, no credentials or secrets embedded, starts inactive in dry_run', () => {
  for (const wf of [mainWorkflow, errorWorkflow]) {
    const names = new Set(wf.nodes.map(n => n.name));
    assert.equal(names.size, wf.nodes.length, 'node names must be unique');
    for (const [from, conn] of Object.entries(wf.connections)) {
      assert.ok(names.has(from), `unknown source ${from}`);
      for (const branch of conn.main) for (const t of branch) assert.ok(names.has(t.node), `unknown target ${t.node}`);
    }
    for (const n of wf.nodes) assert.equal(n.credentials, undefined, `${n.name} must not embed credentials`);
    assert.equal(wf.active, false);
    const text = JSON.stringify(wf);
    assert.ok(!/sk-ant-|EAA[A-Za-z0-9]{20}|IGQ[A-Za-z0-9]{20}/.test(text), 'no tokens in workflow');
  }
  const cfgNode = mainWorkflow.nodes.find(n => n.name === 'Config');
  assert.match(cfgNode.parameters.jsCode, /mode: 'dry_run'/);
  const built = JSON.parse(readFileSync(new URL('../n8n/gostprocess-ig-dm-assistant.json', import.meta.url)));
  assert.deepEqual(built, JSON.parse(JSON.stringify(mainWorkflow)), 'run `npm run build` to refresh the exported JSON');
});
