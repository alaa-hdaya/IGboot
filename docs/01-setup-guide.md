# Setup Guide (step by step, for beginners)

Follow the parts in order. Each part ends with a **✅ Check** so you know it worked.
Items marked *(verify)* may have slightly different wording in Meta's current screens. Tell me what you see and I'll adapt.

> 🔒 **Golden rule:** never paste tokens, passwords, API keys or the App Secret into chat, email, or GitHub.
> They go **only** into n8n Credentials or environment variables.

---

## Part A: Switch the Instagram account to Professional (you, ~5 min)

Your GostProcess account is currently **personal**. Meta's Messaging API **does not work with personal accounts**, so this switch is required. It is free and can be undone later.

1. Open Instagram on your phone, then go to **your profile → ☰ menu → Settings and activity**.
2. Tap **Account type and tools → Switch to professional account**.
3. Pick a category (e.g. *Business service* or *Software company*).
4. Choose **Business**, not Creator.
5. Skip "connect a Facebook Page" if you want. This setup does not need a Page.
6. Allow API tools to read DMs: **Settings and activity → Messages and story replies → Message controls → Connected tools → "Allow access to messages" = ON** *(verify)*.

✅ **Check:** your profile now shows "Professional dashboard".

You will also need **a second Instagram account** (any personal account, e.g. your own) to play the role of a test prospect.

---

## Part B: Create the Google Sheet CRM (you, ~10 min)

1. Create a new Google Sheet named **GostProcess IG CRM**.
2. Create 3 tabs with exactly these names: **Leads**, **Messages**, **Knowledge**.
3. Import the templates from this repo:
   - `crm/Leads.csv` into the **Leads** tab
   - `crm/Messages.csv` into the **Messages** tab
   - `knowledge-base/knowledge.csv` into the **Knowledge** tab

   To import each one: open the tab, then **File → Import → Upload** the file and choose **"Replace current sheet"**.
4. In **Leads** and **Messages**, select column **ig_user_id** and set **Format → Number → Plain text**. Instagram IDs are long numbers, and Sheets would otherwise round them.
5. In **Leads**, select column **bot_paused** and set **Insert → Checkbox** (optional, but makes resuming easy).
6. Copy the **Sheet ID** from the URL: `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`.

✅ **Check:** three tabs exist, and the first row of each holds the column names.

---

## Part C: Import and configure the n8n workflow (you, guided, ~20 min)

### C1. Import
1. In n8n, go to **Workflows → Add → Import from File** and choose `n8n/gostprocess-ig-error-notifier.json`. Save it.
2. Import `n8n/gostprocess-ig-dm-assistant.json` the same way. Save it.
3. **Do not activate either workflow yet.**

### C2. Credentials (n8n → Credentials → Add)
| Credential | Type | What to enter | Used by nodes |
|---|---|---|---|
| Google Sheets | *Google Sheets OAuth2* | Sign in with the Google account that owns the sheet | Get Lead, Get History, Get Knowledge, Upsert Lead, Append Messages |
| Gmail | *Gmail OAuth2* | Sign in with the account that sends alerts | Email Team (both workflows) |
| **Anthropic API** | *Header Auth* | Name: `x-api-key`, Value: your Anthropic API key | Call Claude |
| **Instagram GostProcess** | *Header Auth* | Name: `Authorization`, Value: `Bearer ` + the token from Part D | Get Profile, Send Instagram Reply |

Open each node listed above and select its credential.

**Anthropic API key:** create it at console.anthropic.com → *API Keys*, and set a monthly spend limit under *Billing / Limits* (e.g. $20 to start).

### C3. Secrets for Meta (App Secret and Verify Token)
The workflow reads two values: **`META_APP_SECRET`** (from Part D) and **`META_VERIFY_TOKEN`** (a random phrase you invent, e.g. `gp-verify-7Hq2xL9`).

- **Self-hosted n8n (Docker, VPS…):** add these environment variables to n8n and restart it:
  ```
  META_APP_SECRET=...
  META_VERIFY_TOKEN=...
  NODE_FUNCTION_ALLOW_BUILTIN=crypto
  N8N_BLOCK_ENV_ACCESS_IN_NODE=false
  ```
- **n8n Cloud:** if your plan has **Variables** (Overview → Variables), create `META_APP_SECRET` and `META_VERIFY_TOKEN` there. If it doesn't, tell me and we'll use the fallback constants inside the *Verify Handshake* and *Parse & Filter Events* nodes. That works, but the workflow must then never be exported or shared.

### C4. Config node
Open the **Config** node and set:
- `sheetId`: from Part B
- `sheetUrl`: the full sheet link (shown in alert emails)
- `teamEmail`: where alerts go
- Leave `mode: 'dry_run'` as it is.

Also set `TEAM_EMAIL` in the **Format Error** node of the Error Notifier workflow.
Then in the main workflow, open **⋯ → Settings → Error workflow** and choose **GostProcess IG: Error Notifier**.

✅ **Check:** no node shows a red "credentials missing" warning, except the two Instagram nodes (they get their credential in Part D).

---

## Part D: Meta Developer app and Instagram authorization (you, guided, ~30 min)

1. Go to **developers.facebook.com** and log in with your Facebook account. Register as a developer if asked.
2. Go to **My Apps → Create App**.
   - Use case: **"Manage messaging & content on Instagram"** *(verify)*.
   - App type: **Business** (if asked). Name it e.g. *GostProcess DM Assistant*.
3. In the app, open **Instagram → API setup with Instagram login** *(verify)*. This page has numbered steps:
   1. **Generate access tokens:** click **Add account** and log in as the **GostProcess** Instagram account. Approve the permissions `instagram_business_basic` and `instagram_business_manage_messages`. Click **Generate token**, then paste it **directly** into the n8n credential **Instagram GostProcess** as `Bearer <token>`. Note the **Instagram account ID** shown next to the account and put it in Config → `igAccountId`.
   2. **Configure webhooks:**
      - Callback URL: in n8n, open the **Instagram Webhook (verify GET)** node and copy the **Production URL** (looks like `https://YOUR-N8N/webhook/gostprocess-instagram-dm`).
      - Verify token: the same `META_VERIFY_TOKEN` phrase.
      - ⚠️ Meta checks the URL immediately, so the workflow must be **active** at this moment. Activating in `dry_run` mode **cannot send any message** (the Config gate blocks all sends). I will still ask for your OK before this step.
      - After **Verify and save**, subscribe to the **`messages`** field.
      - Turn on the webhook subscription toggle for the GostProcess account *(verify)*.
   3. **App Secret:** on the same page (or *App settings → Basic*), copy the **Instagram app secret** into `META_APP_SECRET` (Part C3). If signatures are rejected later, try the main **App secret** instead (see Troubleshooting).
4. **Add the test prospect:** go to **App roles → Roles → Add people → Instagram Tester** and enter your second Instagram account. On that account, accept the invite: **Settings → Website permissions → Apps and websites → Tester invites** *(verify)*.

> **Development vs. Live:** while the app is in development, Meta only delivers messages from accounts that have a role on the app (like your tester). That is perfect for safe testing.
> To answer **real prospects**, the app needs **Advanced Access** for `instagram_business_manage_messages` via **App Review**, plus **Business Verification**. We prepare that together after testing (screencast + use-case description).

> **Token lifetime:** Instagram tokens expire (long-lived tokens last about 60 days *(verify on the token screen)*). Put a reminder in your calendar 50 days from today. Automatic refresh is a later improvement.

✅ **Check:** Meta shows the webhook as verified, and the n8n execution list shows a successful run of *Instagram Webhook (verify GET)*.

---

## Part E: First real test (dry run, nothing is sent)

1. From the **tester** account, send a DM to GostProcess: "Bonjour, vous faites quoi ?"
2. In n8n → **Executions**, you should see the workflow run.
3. In the sheet:
   - **Messages** should have an `in` row and an `out` row with status **`dry_run`**. The `out` text is what the bot *would* have said.
   - **Leads** should have one row.
4. The tester receives **nothing**. That's expected.

Then copy the tester's `ig_user_id` from the Messages sheet. With your approval, we switch to `mode: 'allowlist'` and `allowlist: ['<that id>']` for real replies to the tester only.
