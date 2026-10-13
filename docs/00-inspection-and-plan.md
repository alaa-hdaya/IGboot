# GostProcess Instagram DM Assistant — Step 0: Inspection & Plan

Status: **planning only** — nothing has been connected, activated, or sent.

## 1. Inspection results (2026-10-13)

| Item | Finding |
|---|---|
| Repository `IGboot` | Empty (no commits, no files). Starting from scratch. |
| n8n instance | None found in the repo. I have **no access** to any n8n instance. |
| Existing Instagram workflows | None found. |
| Instagram / Meta access | I have **no access** to your Instagram account or Meta Developer dashboard (and should not). |
| Meta docs | `developers.facebook.com` is blocked from this sandbox, so docs were checked via search results. Every item marked *(verify)* is something we confirm on screen in your Meta dashboard during setup. |

## 2. Which Meta API to use

There are two official ways to automate Instagram DMs:

1. **Instagram API with Instagram Login** — host `graph.instagram.com`. **No Facebook Page needed.** ← **Recommended (simplest)**
2. Instagram API with Facebook Login — host `graph.facebook.com`. Requires a Facebook Page linked to the Instagram account.

### Requirements for option 1
- **Account type:** Instagram **Professional** account (Business or Creator). Personal accounts cannot use the Messaging API. Business is recommended for an agency.
- **Meta Developer account** + a Meta app of type *Business* with the **Instagram** product added.
- **Permissions (scopes):**
  - `instagram_business_basic` — read the account's ID and username
  - `instagram_business_manage_messages` — receive and send DMs
- **Access level:** while the app is in development, it works for accounts that have a role on the app (you, plus testers). To answer **real public prospects**, the app will most likely need **Advanced Access** through **App Review** and **Business Verification**. *(verify in the App Dashboard → App Review)*
- **Token:** an Instagram User access token for the GostProcess account. Long-lived tokens expire after about 60 days and must be refreshed. *(verify the refresh endpoint)* The token goes into **n8n Credentials only**, never into the workflow JSON or this chat.
- **App Secret:** used to verify that webhooks really come from Meta (`X-Hub-Signature-256` header, HMAC-SHA256 of the raw body). It is stored in n8n only.

### Webhooks
- **Verification (GET):** Meta sends `hub.mode`, `hub.verify_token`, and `hub.challenge`. n8n returns `hub.challenge` if the token matches.
- **Events (POST):** subscribe to the `messages` field. Each event has `sender.id`, `recipient.id`, `timestamp`, `message.mid`, and `message.text`. Messages the account sends itself arrive as echoes (`message.is_echo = true`), which we must ignore to avoid reply loops.
- The account must also be subscribed to the app (done during the Instagram Login authorization in the dashboard). *(verify)*

### Sending
`POST https://graph.instagram.com/<API_VERSION>/<IG_ID>/messages`
with header `Authorization: Bearer <token>` and body
`{"recipient":{"id":"<IGSID>"},"message":{"text":"..."}}`.
The API version is set as one config value (current docs show `v26.0`, *(verify)*).

### Messaging rules we must respect
- We can only reply **after the person has messaged us**. We never send cold DMs.
- Automated replies are allowed only **within 24 hours** of the person's last message.
- The `HUMAN_AGENT` tag (7-day window) is **only for a real human's manual replies**, never for bot replies, and it needs approval. The bot will never use it.
- The workflow checks the 24h window before sending. An expired window means the bot does not send and flags the conversation for a human.

## 3. Proposed architecture (MVP)

```
Instagram DM
  → Meta webhook (POST)
  → n8n Webhook node (raw body)            ← also answers GET verification
      ├─ respond 200 immediately
      ├─ verify X-Hub-Signature-256
      ├─ filter: is_echo / non-text / own account / unsupported → stop
      ├─ dedup on message.mid  (n8n workflow static data, TTL 48h)
      ├─ CONTROLLED MODE gate: DRY_RUN + allowlist of test sender IDs
      ├─ load lead row + last 10 messages        (Google Sheets)
      ├─ if lead.bot_paused = TRUE → log only, stop
      ├─ AI call (system prompt + knowledge base + history)
      │     → strict JSON: {reply, language, intent, escalate, lead_updates, summary}
      ├─ if escalate → handover message + notify team + set bot_paused
      ├─ 24h window check → send reply via Graph API   (skipped in DRY_RUN)
      ├─ upsert lead (key = Instagram-scoped ID) + append message log
      └─ Error Trigger workflow → notify team on any failure
```

**Why this is the simplest reliable option**
- One main workflow plus one small error workflow, using only native n8n nodes (Webhook, Code, HTTP Request, Google Sheets, AI model, notification).
- Google Sheets acts as the CRM, the conversation memory, and the handover switch, so your team can see and edit everything.
- The knowledge base is a separate file or Sheet tab, so you can update it without touching the workflow.
- Reusable for clients: all account-specific values (IG ID, sheet ID, brand name, KB) sit in one **Config** node and in credentials.

**Retention:** message log rows older than 90 days are purged (configurable). Lead rows are kept. No phone numbers, emails, or payment data are stored unless the prospect volunteers them for follow-up.

**Resume after handover:** a team member sets `bot_paused` back to `FALSE` in the Leads sheet.

## 4. Shortest path to the first end-to-end reply

| Step | What | Who | Live? |
|---|---|---|---|
| 1 | Repo skeleton: KB file, system prompt, Sheets template (CSV) | me | no |
| 2 | n8n workflow JSON in **DRY_RUN** mode + offline test script using simulated webhook payloads | me | no |
| 3 | Import into your n8n, add credentials (you do this, guided) | you | no |
| 4 | Meta app + Instagram Login + webhook verification (guided, screen by screen) | you | no |
| 5 | Real test: a **tester account** DMs GostProcess; workflow runs in DRY_RUN (logs the reply, sends nothing) | you + me | receive only |
| 6 | With your approval: turn off DRY_RUN for allowlisted tester IDs only | you | tester only |
| 7 | Full test checklist (FR/EN/Tunisian, unknown price, human request, duplicates, errors) | both | tester only |
| 8 | App Review / Advanced Access, then live activation **only with your explicit approval** | you | yes |

Deliverables 6–10 (setup guide, test checklist, troubleshooting, costs, deployment) are written alongside steps 3–8, based on what we actually see in your dashboard.

## 5. Information needed from you

See the open questions in the chat. Never paste tokens, passwords, or secrets.
