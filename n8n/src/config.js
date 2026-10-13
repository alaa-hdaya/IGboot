// ============================================================
// GostProcess Instagram DM assistant: CONFIGURATION
// Edit these values after importing the workflow into n8n.
// NO SECRETS here: tokens and API keys live in n8n Credentials,
// META_APP_SECRET / META_VERIFY_TOKEN in environment variables.
// ============================================================
const config = {
  // 'dry_run'   = the AI runs and everything is logged, but NOTHING is sent to Instagram.
  // 'allowlist' = replies are sent ONLY to the Instagram-scoped IDs listed in `allowlist`.
  // 'live'      = replies are sent to everyone. Only after your approval + Meta App Review.
  mode: 'dry_run',
  allowlist: [], // e.g. ['1234567890123456'], copied from the Messages sheet

  // Instagram professional account ID (shown in the Meta App Dashboard).
  // If empty, the ID is taken from each webhook event.
  igAccountId: '',
  graphApiVersion: 'v26.0',

  // Google Sheet that holds the Leads, Messages and Knowledge tabs.
  sheetId: 'PASTE_YOUR_GOOGLE_SHEET_ID',
  sheetUrl: '',

  // Where handover / new-consultation alerts are emailed.
  teamEmail: 'PASTE_TEAM_EMAIL',

  brandName: 'GostProcess',

  // AI settings (Anthropic Claude).
  aiModel: 'claude-opus-5-5',
  aiEffort: 'low',
  aiMaxTokens: 4000,

  historyLimit: 12,          // previous messages given to the AI
  historyRetentionDays: 90,  // older messages are ignored (and should be purged)
  replyWindowHours: 23.5,    // Instagram allows automated replies within 24h only
  maxReplyChars: 900,

  verifySignature: true,     // keep true in production
  dedupTtlHours: 48,
};

return [{ json: config }];
