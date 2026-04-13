---
id: email-send-safety
title: Email Send Safety — Never Send From Wrong Account
scope: global
trigger: Any email send operation (send_email, draft_email, reply_email)
enforcement: hard
created: 2026-03-04
---

## Rule

1. **NEVER send an email without explicit user confirmation of the sending account.** If the user says "send from Indigo" and that account fails, STOP. Do not fall back to another account.
2. **NEVER fall back to a different email account.** If the requested account's auth is broken, report the error and wait. Do not silently switch to personal or any other account.
3. **If auth fails, the ONLY options are:** (a) fix the auth, (b) draft the email text for the user to send manually, or (c) ask the user what to do. Never send from a different account.
4. **Verify the account alias matches the intended sender before every send.** Double-check `account` parameter matches what the user requested.
5. **Test subject line encoding.** Avoid special characters (×, —, etc.) in subject lines when using MCP tools. Use ASCII equivalents (x, -) to prevent UTF-8 encoding issues.

## Rationale

On 2026-03-04, a kickoff email to a $10k/mo client (Amass Brands Group) was sent from the wrong Gmail account (personal instead of {your-name}@get{company}.ai) with a garbled subject line. The Indigo account auth was broken, and Claude fell back to personal without asking. This sent a broken, unprofessional email to the client the day before their kickoff meeting. This must never happen again.
