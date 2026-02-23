---
description: Send an iMessage to a saved contact
allowed-tools: Bash, Read
argument-hint: <contact> <message>
visibility: public
---

# /imessage - Send iMessage

Send an iMessage to a saved contact via Messages.app.

**Arguments:** $ARGUMENTS

## Process

### 1. Parse Arguments

Extract `<contact>` and `<message>` from arguments.

If no arguments:
```
Usage: /imessage <contact> <message>

Example: /imessage {contact} "Just shipped the daily check-in UI!"
```

### 2. Resolve Contact

Read `settings/contacts.yaml`. Find the contact by key (case-insensitive).

If not found:
```
Contact "{contact}" not found. Available contacts:
- {contact} (+1XXXXXXXXXX)
```

### 3. Send Message

```bash
~/scripts/imessage.sh "{contact.imessage}" "{message}"
```

Report result:
```
Sent to {contact.name}: "{message}"
```

## Rules

- Never send without explicit message content from the user
- Escape quotes in message text before passing to script
- If Messages.app throws an error, report it clearly (likely needs accessibility permissions or Messages.app not signed in)
