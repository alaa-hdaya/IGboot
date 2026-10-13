// Builds the importable n8n workflow JSON files from n8n/src/*.js and prompts/system-prompt.md.
// Usage: node n8n/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

export function loadCode(name) {
  let code = readFileSync(join(here, 'src', name + '.js'), 'utf8');
  if (code.includes('__SYSTEM_PROMPT__')) {
    const prompt = readFileSync(join(root, 'prompts', 'system-prompt.md'), 'utf8').trim();
    code = code.replace('__SYSTEM_PROMPT__', JSON.stringify(prompt));
  }
  return code;
}

// Stable UUID-like ids so re-imports stay consistent.
function id(seed) {
  const h = createHash('sha1').update('gostprocess:' + seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const WEBHOOK_PATH = 'gostprocess-instagram-dm';

function code(name, file, position, extra = {}) {
  return {
    id: id(name), name, type: 'n8n-nodes-base.code', typeVersion: 2, position,
    parameters: { jsCode: loadCode(file) }, ...extra,
  };
}

function sheet(name, position, sheetName, operation, extraParams = {}, extra = {}) {
  return {
    id: id(name), name, type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5, position,
    parameters: {
      operation,
      documentId: { __rl: true, mode: 'id', value: "={{ $('When Called (per message)').first().json.cfg.sheetId }}" },
      sheetName: { __rl: true, mode: 'name', value: sheetName },
      ...extraParams,
    },
    ...extra,
  };
}

function ifNode(name, position, leftValue) {
  return {
    id: id(name), name, type: 'n8n-nodes-base.if', typeVersion: 2, position,
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{
          id: id(name + ':cond'),
          leftValue,
          rightValue: '',
          operator: { type: 'boolean', operation: 'true', singleValue: true },
        }],
        combinator: 'and',
      },
      looseTypeValidation: true,
      options: {},
    },
  };
}

const IG_AUTH_NOTE = 'Credential: Header Auth "Instagram GostProcess" (Name: Authorization, Value: Bearer <token>)';

const mainNodes = [
  {
    id: id('webhook-get'), name: 'Instagram Webhook (verify GET)', type: 'n8n-nodes-base.webhook', typeVersion: 2,
    position: [0, 0], webhookId: id('webhookId-get'),
    parameters: { httpMethod: 'GET', path: WEBHOOK_PATH, responseMode: 'responseNode', options: {} },
  },
  code('Verify Handshake', 'verify-handshake', [220, 0]),
  {
    id: id('respond-verify'), name: 'Respond to Meta', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1,
    position: [440, 0],
    parameters: { respondWith: 'text', responseBody: '={{ $json.body }}', options: { responseCode: '={{ $json.status }}' } },
  },
  {
    id: id('webhook-post'), name: 'Instagram Webhook (POST)', type: 'n8n-nodes-base.webhook', typeVersion: 2,
    position: [0, 260], webhookId: id('webhookId-post'),
    parameters: { httpMethod: 'POST', path: WEBHOOK_PATH, responseMode: 'onReceived', options: { rawBody: true } },
  },
  code('Config', 'config', [220, 260]),
  code('Parse & Filter Events', 'parse-events', [440, 260]),
  {
    id: id('exec-self'), name: 'Process Each Message', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2,
    position: [660, 260],
    parameters: {
      workflowId: { __rl: true, mode: 'id', value: '={{ $workflow.id }}' },
      mode: 'each',
      options: { waitForSubWorkflow: false },
    },
  },

  // ---------- per-message processing (runs as a sub-execution of this same workflow) ----------
  {
    id: id('trigger-sub'), name: 'When Called (per message)', type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1.1,
    position: [0, 600], parameters: { inputSource: 'passthrough' },
  },
  sheet('Get Lead', [220, 600], 'Leads', 'read', {
    filtersUI: { values: [{ lookupColumn: 'ig_user_id', lookupValue: '={{ $json.igsid }}' }] },
    options: {},
  }, { alwaysOutputData: true }),
  ifNode('New Lead?', [440, 600], '={{ !$json.ig_user_id }}'),
  {
    id: id('get-profile'), name: 'Get Profile', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    position: [660, 520], notes: IG_AUTH_NOTE, onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: "={{ 'https://graph.instagram.com/' + $('When Called (per message)').first().json.cfg.graphApiVersion + '/' + $('When Called (per message)').first().json.igsid }}",
      authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
      sendQuery: true, queryParameters: { parameters: [{ name: 'fields', value: 'username,name' }] },
      options: { timeout: 10000 },
    },
  },
  sheet('Get History', [880, 600], 'Messages', 'read', {
    filtersUI: { values: [{ lookupColumn: 'ig_user_id', lookupValue: "={{ $('When Called (per message)').first().json.igsid }}" }] },
    options: {},
  }, { alwaysOutputData: true, executeOnce: true }),
  sheet('Get Knowledge', [1100, 600], 'Knowledge', 'read', { options: {} }, { alwaysOutputData: true, executeOnce: true }),
  code('Build AI Request', 'build-ai-request', [1320, 600], { executeOnce: true }),
  ifNode('Call AI?', [1540, 600], "={{ $json.route === 'ai' }}"),
  {
    id: id('call-claude'), name: 'Call Claude', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    position: [1760, 520], notes: 'Credential: Header Auth "Anthropic API" (Name: x-api-key, Value: your API key)',
    onError: 'continueErrorOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 3000,
    parameters: {
      method: 'POST', url: 'https://api.anthropic.com/v1/messages',
      authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'anthropic-version', value: '2023-06-01' },
        { name: 'anthropic-beta', value: 'server-side-fallback-2026-07-01' },
      ] },
      sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.llmBody) }}',
      options: { timeout: 90000 },
    },
  },
  code('Parse AI Reply', 'parse-ai-reply', [1980, 440]),
  code('AI Failure Fallback', 'ai-failure', [1980, 620]),
  code('Prepare Send', 'prepare-send', [2200, 600]),
  ifNode('Send to Instagram?', [2420, 600], '={{ $json.send }}'),
  {
    id: id('send-ig'), name: 'Send Instagram Reply', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    position: [2640, 520], notes: IG_AUTH_NOTE + '. No retries on purpose: a retry could send the reply twice.',
    onError: 'continueErrorOutput',
    parameters: {
      method: 'POST', url: '={{ $json.sendUrl }}',
      authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
      sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.sendBody) }}',
      options: { timeout: 20000 },
    },
  },
  code('Record Result', 'record-result', [2860, 600]),
  code('Lead Row', 'lead-row', [3080, 600]),
  sheet('Upsert Lead', [3300, 600], 'Leads', 'appendOrUpdate', {
    columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: ['ig_user_id'], schema: [] },
    options: { cellFormat: 'RAW' },
  }),
  code('Log Rows', 'log-rows', [3520, 600], { executeOnce: true }),
  sheet('Append Messages', [3740, 600], 'Messages', 'append', {
    columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [], schema: [] },
    options: { cellFormat: 'RAW' },
  }),
  code('Email Payload', 'email-payload', [3960, 600], { executeOnce: true }),
  {
    id: id('gmail'), name: 'Email Team', type: 'n8n-nodes-base.gmail', typeVersion: 2.1,
    position: [4180, 600],
    parameters: {
      sendTo: '={{ $json.to }}', subject: '={{ $json.subject }}', emailType: 'text',
      message: '={{ $json.body }}', options: { appendAttribution: false },
    },
  },
  {
    id: id('sticky'), name: 'Read me', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [0, -260],
    parameters: {
      width: 900, height: 220,
      content: '## GostProcess Instagram DM assistant\n' +
        '1. Edit the **Config** node (mode stays `dry_run` until approved).\n' +
        '2. Select credentials on: Get Lead, Get History, Get Knowledge, Upsert Lead, Append Messages (Google Sheets), ' +
        'Get Profile + Send Instagram Reply (Header Auth Instagram), Call Claude (Header Auth Anthropic), Email Team (Gmail).\n' +
        '3. Set META_APP_SECRET and META_VERIFY_TOKEN (see docs/01-setup-guide.md).\n' +
        '4. Settings > Error workflow: "GostProcess IG: Error Notifier".',
    },
  },
];

const c = (node, index = 0) => ({ node, type: 'main', index });
const mainConnections = {
  'Instagram Webhook (verify GET)': { main: [[c('Verify Handshake')]] },
  'Verify Handshake': { main: [[c('Respond to Meta')]] },
  'Instagram Webhook (POST)': { main: [[c('Config')]] },
  'Config': { main: [[c('Parse & Filter Events')]] },
  'Parse & Filter Events': { main: [[c('Process Each Message')]] },
  'When Called (per message)': { main: [[c('Get Lead')]] },
  'Get Lead': { main: [[c('New Lead?')]] },
  'New Lead?': { main: [[c('Get Profile')], [c('Get History')]] },
  'Get Profile': { main: [[c('Get History')]] },
  'Get History': { main: [[c('Get Knowledge')]] },
  'Get Knowledge': { main: [[c('Build AI Request')]] },
  'Build AI Request': { main: [[c('Call AI?')]] },
  'Call AI?': { main: [[c('Call Claude')], [c('Prepare Send')]] },
  'Call Claude': { main: [[c('Parse AI Reply')], [c('AI Failure Fallback')]] },
  'Parse AI Reply': { main: [[c('Prepare Send')]] },
  'AI Failure Fallback': { main: [[c('Prepare Send')]] },
  'Prepare Send': { main: [[c('Send to Instagram?')]] },
  'Send to Instagram?': { main: [[c('Send Instagram Reply')], [c('Record Result')]] },
  'Send Instagram Reply': { main: [[c('Record Result')], [c('Record Result')]] },
  'Record Result': { main: [[c('Lead Row')]] },
  'Lead Row': { main: [[c('Upsert Lead')]] },
  'Upsert Lead': { main: [[c('Log Rows')]] },
  'Log Rows': { main: [[c('Append Messages')]] },
  'Append Messages': { main: [[c('Email Payload')]] },
  'Email Payload': { main: [[c('Email Team')]] },
};

export const mainWorkflow = {
  name: 'GostProcess IG: DM Assistant',
  nodes: mainNodes,
  connections: mainConnections,
  settings: { executionOrder: 'v1' },
  pinData: {},
  active: false,
};

export const errorWorkflow = {
  name: 'GostProcess IG: Error Notifier',
  nodes: [
    { id: id('err-trigger'), name: 'Error Trigger', type: 'n8n-nodes-base.errorTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
    code('Format Error', 'error-notifier', [220, 0]),
    {
      id: id('err-gmail'), name: 'Email Team', type: 'n8n-nodes-base.gmail', typeVersion: 2.1, position: [440, 0],
      parameters: { sendTo: '={{ $json.to }}', subject: '={{ $json.subject }}', emailType: 'text', message: '={{ $json.body }}', options: { appendAttribution: false } },
    },
  ],
  connections: {
    'Error Trigger': { main: [[c('Format Error')]] },
    'Format Error': { main: [[c('Email Team')]] },
  },
  settings: { executionOrder: 'v1' },
  pinData: {},
  active: false,
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(join(here, 'gostprocess-ig-dm-assistant.json'), JSON.stringify(mainWorkflow, null, 2) + '\n');
  writeFileSync(join(here, 'gostprocess-ig-error-notifier.json'), JSON.stringify(errorWorkflow, null, 2) + '\n');
  console.log('Built n8n/gostprocess-ig-dm-assistant.json and n8n/gostprocess-ig-error-notifier.json');
}
