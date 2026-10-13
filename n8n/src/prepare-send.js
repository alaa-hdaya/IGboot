// Final safety gate before anything reaches Instagram.
const built = $('Build AI Request').first().json;
const ctx = built.ctx;
const cfg = ctx.cfg;
const msg = ctx.msg;
const input = $input.first().json;

const decision = input.decision || null;
let reply = decision && typeof decision.reply === 'string' ? decision.reply.trim() : '';
if (reply.length > cfg.maxReplyChars) reply = reply.slice(0, cfg.maxReplyChars - 1).trimEnd() + '…';

let status;
if (built.route !== 'ai') status = built.skipReason;                       // paused / window_expired
else if (!reply) status = 'no_reply';
else if (Date.now() - msg.timestamp > cfg.replyWindowHours * 3600 * 1000) status = 'window_expired';
else if (cfg.mode === 'dry_run') status = 'dry_run';
else if (!msg.canSend) status = 'not_allowlisted';
else status = 'pending';

const send = status === 'pending';
return [{
  json: {
    send,
    status,
    reply,
    decision,
    sendUrl: `https://graph.instagram.com/${cfg.graphApiVersion}/${msg.igAccountId}/messages`,
    sendBody: { recipient: { id: msg.igsid }, message: { text: reply } },
  },
}];
