// Minimal n8n Code-node runtime: executes n8n/src/*.js exactly as the workflow embeds them,
// with mocked $input, $('Node'), $env, $vars, $getWorkflowStaticData and this.helpers.
import { createRequire } from 'node:module';
import { loadCode } from '../n8n/build.mjs';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const nodeRequire = createRequire(import.meta.url);

export async function runNode(file, { input = [{ json: {} }], nodes = {}, env = {}, vars = {}, staticData = {} } = {}) {
  const body = loadCode(file);
  const wrap = items => ({
    first: () => items[0] || { json: {} },
    all: () => items,
  });
  const $ = name => {
    if (!(name in nodes)) throw new Error(`Node '${name}' hasn't been executed`);
    return wrap(nodes[name]);
  };
  const ctx = {
    helpers: {
      getBinaryDataBuffer: async (i, prop) => {
        const b = input[i] && input[i].binary && input[i].binary[prop];
        if (!b) throw new Error('no binary');
        return Buffer.from(b.data, 'base64');
      },
    },
  };
  const fn = new AsyncFunction('$', '$input', '$env', '$vars', '$getWorkflowStaticData', 'require', body);
  return fn.call(ctx, $, wrap(input), env, vars, () => staticData, nodeRequire);
}

export function webhookItem(payload, secret, { tamper = false } = {}) {
  const crypto = nodeRequire('crypto');
  const raw = Buffer.from(JSON.stringify(payload));
  let sig = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  if (tamper) sig = sig.slice(0, -2) + (sig.endsWith('00') ? '11' : '00');
  return {
    json: { headers: { 'x-hub-signature-256': sig, 'content-type': 'application/json' }, body: payload },
    binary: { data: { data: raw.toString('base64'), mimeType: 'application/json' } },
  };
}

export function igEvent({ sender = '900001', recipient = '178400000', mid = 'm_1', text = 'Bonjour', ts = Date.now(), echo = false, attachments } = {}) {
  const message = { mid, text };
  if (echo) message.is_echo = true;
  if (attachments) { delete message.text; message.attachments = attachments; }
  return { sender: { id: sender }, recipient: { id: recipient }, timestamp: ts, message };
}

export function payload(events, ownId = '178400000') {
  return { object: 'instagram', entry: [{ id: ownId, time: Date.now(), messaging: events }] };
}
