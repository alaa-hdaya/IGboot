# Operations: troubleshooting, costs, deployment, reuse

## Daily use (team)
- **Leads sheet** is the CRM. Update `lead_status` yourself (e.g. `Converted`). The bot never overwrites `Converted`.
- **Handover:** when an alert email says the bot is paused, reply to the prospect **from the Instagram app**. When done, set **`bot_paused` = FALSE** in that prospect's Leads row to give the conversation back to the bot.
- **Knowledge tab:** edit `content`, or set `enabled` to FALSE to hide a row. Changes apply to the next message, with no workflow change needed. Never write prices or promises you don't want the bot to repeat.

## Troubleshooting
| Symptom | Likely cause | Fix |
|---|---|---|
| Meta says "callback URL could not be validated" | Workflow not active, wrong URL (Test vs Production), or verify token mismatch | Activate (in `dry_run`), use the **Production URL**, compare `META_VERIFY_TOKEN` |
| Tester DMs, but no execution appears in n8n | `messages` field not subscribed; account webhook toggle off; tester invite not accepted; "Allow access to messages" off | Re-check Setup Part D and A.6 |
| Executions appear but stop at *Parse & Filter Events* with nothing output | Signature rejected | Check `META_APP_SECRET`. Try the other secret (Instagram app secret vs main App secret). Make sure the POST Webhook node option **Raw Body** is ON |
| Error "META_APP_SECRET is not configured" | Env variable or n8n Variable missing, or env access blocked | Setup Part C3 (`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, restart) |
| Error "Cannot find module 'crypto'" or "not allowed" | Self-hosted n8n blocks built-in modules | Set `NODE_FUNCTION_ALLOW_BUILTIN=crypto` and restart |
| Same message answered twice | Workflow was run manually (dedup memory only persists for the active workflow), or two n8n instances share the webhook | Test through the active workflow only; one instance per webhook |
| Messages sheet shows `failed` with "Invalid OAuth access token" / code 190 | Instagram token expired or revoked | Generate a new token (Setup D.3.1) and update the **Instagram GostProcess** credential |
| `failed` with a permission error (code 10 / 200) | App lacks Advanced Access, or the recipient has no app role while in development | Test only with app-role testers until App Review is approved |
| `window_expired` rows | Prospect's last message is older than 24h | Reply manually in Instagram. Bots may not reply after 24h |
| Holding message sent + `ai_error` email | Anthropic key wrong, out of credit, or an outage | Check console.anthropic.com (key, billing, limits); then set `bot_paused` FALSE |
| `ai_refusal` / `ai_invalid_output` | Unusual message the AI declined or could not structure | Read the conversation; reply manually |
| Lead IDs look like `1.78E+16` | ig_user_id column not formatted as text | Format the column as Plain text (Setup B.4) |
| Google Sheets "sheet not found" | Tab names differ | Tabs must be exactly `Leads`, `Messages`, `Knowledge` |

Every unexpected workflow error also triggers an email from the **Error Notifier** workflow.

## Recurring costs (estimates; check current prices)
| Item | Cost |
|---|---|
| Meta / Instagram Messaging API | Free |
| Google Sheets, Gmail | Free (within Google account limits) |
| n8n | Your existing plan or server. Each DM uses about 2 executions (main + per-message) |
| AI: Claude Opus 5.5 (default, $4 / $20 per million input/output tokens) | about **$0.01–0.03 per reply**, so roughly $10–30 per 1,000 messages |
| AI: Claude Haiku 5.5 (option, $0.10 / $0.50 per million tokens) | about **$0.001 per reply**, so roughly $1 per 1,000 messages |

To switch models, change `aiModel` in Config, for example to `'claude-haiku-5-5'`. Run `npm run ai-preview` first to compare quality. Always set a spend limit in the Anthropic console.

## Data retention and privacy
- Stored: Instagram-scoped ID, username (from the API), message text, lead fields, and an English summary. The bot is instructed not to ask for phone numbers, emails or payment data.
- **Messages older than 90 days** are ignored by the bot. Once a month, delete those rows (Messages tab: sort by timestamp, delete older rows). Automatic purge is planned for after the MVP.
- n8n also stores execution data, which includes message text. Set execution pruning (self-hosted: `EXECUTIONS_DATA_PRUNE=true`, `EXECUTIONS_DATA_MAX_AGE=336` hours; n8n Cloud: plan default).
- If a prospect asks to delete their data: delete their Leads row and Messages rows.

## Deployment phases
1. **Offline** (done): `npm test` passes.
2. **AI preview:** you review the tone (`npm run ai-preview`).
3. **REAL-DRY:** workflow active in `dry_run` with your OK. Tester only, nothing sent.
4. **REAL-TEST:** `allowlist` mode with the tester ID, with your OK.
5. **App Review + Business Verification** (Meta). Typically requires a screencast of the flow and a privacy policy URL.
6. **Live:** `mode: 'live'`, only with your explicit approval. Watch the first 20 conversations closely.

**Rollback at any moment:** set `mode: 'dry_run'` (bot keeps logging but stops sending) or deactivate the workflow.

## Reusing this for a client
1. Copy the Google Sheet, then edit the client's **Knowledge** tab.
2. Import the workflow again (as a new copy), and change the **path** in both Webhook nodes (e.g. `client-acme-instagram-dm`). Each copy needs a unique path.
3. Edit Config: `brandName`, `sheetId`, `teamEmail`, `igAccountId`, `mode: 'dry_run'`.
4. Create credentials for the client's Instagram token and select them in the two Instagram nodes.
5. Add the client's Instagram account in the Meta app (or the client's own Meta app) and point its webhook to the new URL.
6. Each client app needs its own App Secret / Verify Token. Use separate n8n Variables or env names, and change the names read in the two Code nodes.

## Changing the workflow code
The workflow's Code nodes are generated from `n8n/src/*.js`, and the prompt comes from `prompts/system-prompt.md`. After editing either, run `npm test`, which rebuilds `n8n/*.json` and runs the tests, then re-import. Small changes made directly in n8n should be copied back here.
