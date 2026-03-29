---
description: Send an iMessage to a saved contact
allowed-tools: Bash, Read, Glob, Grep
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

Example: /imessage jane "Just shipped the daily check-in UI!"
```

### 2. Resolve Contact

Search `contacts/*.yaml` files (skip `_example.yaml`) — match against `name`, `slug`, or `tags`. Case-insensitive partial match.

If found → check for `handles.phone`. If no phone number:
```
Found {name} but no phone number on file. Add one with:
  /contact edit {name} phone: +1XXXXXXXXXX
```

If not found:
```
Contact "{contact}" not found. Use /contact add {name} to create one.
Available contacts with phone numbers:
- {name} (+1XXXXXXXXXX)
...
```

### 3. Send Message

```bash
~/scripts/imessage.sh "{handles.phone}" "{message}"
```

Report result:
```
Sent to {name}: "{message}"
```

## Rules

- Never send without explicit message content from the user
- Escape quotes in message text before passing to script
- If Messages.app throws an error, report it clearly (likely needs accessibility permissions or Messages.app not signed in)
