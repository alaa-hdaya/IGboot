# Test Checklist

Three kinds of tests. They are always labelled:

| Label | Meaning | Touches real Instagram? | Costs |
|---|---|---|---|
| **SIM** | Automated simulated tests (`npm test`): fake webhooks, fake AI answers | No | Free |
| **AI** | Real AI replies to scripted conversations (`npm run ai-preview`) | No | a few cents |
| **REAL-DRY** | Tester DMs the real account, workflow in `dry_run` | Receives only, sends nothing | ~$0.02/msg |
| **REAL-TEST** | Tester DMs the account, `allowlist` mode, tester only | Sends to tester only | ~$0.02/msg |

## SIM (already passing: 21/21)

Run `npm test`. These scenarios are covered:

- [x] Webhook verification: right token accepted, wrong or missing token refused
- [x] Signature check: valid accepted, tampered dropped, missing secret = loud error
- [x] Echoes, own messages, read receipts, deleted messages ignored (no reply loops)
- [x] **Repeated webhook delivery** produces no second reply
- [x] Several messages in one delivery are merged into one reply
- [x] Attachment-only message is handled
- [x] Controlled mode: `dry_run` never sends; `allowlist` sends to listed IDs only
- [x] **First-time prospect**: lead created, dry-run reply logged
- [x] Returning prospect: history and known facts given to the AI; no blank overwrites
- [x] **Prospect requests a human**: bot paused, email to team, prospect informed
- [x] Paused conversation: no AI call, no reply, message still logged
- [x] **Message outside the 24h window**: no automated reply, team alerted
- [x] Consultation request: team alerted, bot keeps going
- [x] **AI provider failure**: one holding message, bot paused, team alerted
- [x] AI refusal / invalid AI output treated as handover
- [x] **Instagram API auth error**: logged as failed, team alerted
- [x] Long replies truncated; a lead marked `Converted` by the team is never downgraded
- [x] Workflow JSON: valid connections, no credentials or tokens inside, inactive, `dry_run`

## AI: tone and correctness review (you read the answers)

Run `ANTHROPIC_API_KEY=... npm run ai-preview` on your computer. Check each answer:

- [ ] **French** first contact: natural, short, one question at most
- [ ] **English** prospect: answers in English
- [ ] **Tunisian Arabic** (Latin script and Arabic script): answers in Derja, same script
- [ ] **Unknown price**: no number invented, offers a consultation
- [ ] **Unknown service** (mobile apps/websites): does not claim it, offers to check with the team
- [ ] **Specific automation**, multi-turn: doesn't re-ask known facts, proposes a consultation
- [ ] **Requests a human**: `escalate=true`, polite handover, no time promised
- [ ] "Are you a bot?": honest answer
- [ ] Prompt injection: refuses to reveal instructions

## REAL-DRY (after Parts A–D of the setup guide)

- [ ] Tester sends a French message → Messages sheet shows `in` + `out (dry_run)`; tester receives nothing
- [ ] Tester sends an English message, then a Tunisian message
- [ ] Tester sends a long conversation about a specific automation → Leads row fills in
- [ ] Tester asks for a human → `bot_paused = TRUE`, alert email received (subject shows `[DRY RUN]`)
- [ ] Set `bot_paused` back to FALSE → next message gets a (dry-run) reply again
- [ ] GostProcess replies manually from the Instagram app → no bot reaction (echo ignored)
- [ ] Temporarily break the Anthropic credential (wrong key) → holding reply logged, alert email
- [ ] Revert the credential

## REAL-TEST (only after your explicit approval)

- [ ] Config: `mode: 'allowlist'`, `allowlist: ['<tester id>']`
- [ ] Tester receives exactly **one** reply per message
- [ ] Repeat the REAL-DRY scenarios and read the replies in the Instagram app
- [ ] Temporarily set a wrong Instagram token → status `failed`, alert email; then restore

## Go-live gate (all required)

- [ ] You approved the reply quality
- [ ] Knowledge base reviewed: every enabled row is true, and `implementation_process` confirmed or left disabled
- [ ] Meta App Review approved (Advanced Access) and Business Verification done
- [ ] Token expiry reminder set
- [ ] **Your explicit "go"** → `mode: 'live'`
