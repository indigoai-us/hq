# Linear Integration

**Workspace:** indigo-ai
**API endpoint:** `https://api.linear.app/graphql`
**API key env var:** `LINEAR_API_KEY` (stored in `C:\hq\.env`)
**Config:** `C:\hq\config\hiamp.yaml`

## Teams

| Key | Name | ID |
|-----|------|-----|
| DEV | Development | f0a1daf3-4382-4bb8-860b-8a86eb372630 |
| DES | Design | 20e4c56b-b92f-4829-9472-529ad3c6874b |
| OPS | Ops | 365773d2-584a-4aa4-9a3f-8e63ab24d401 |
| PRO | Product | 4b15a005-b6ac-4fd0-82b9-97c1e7fffe1e |
| GTM | GTM | a26ef468-7472-4e71-87ac-bbdd59424d9e |

## Key Users

| Name | ID | Display Name | Profile URL |
|------|-----|-------------|-------------|
| Stefan Johnson | 0f41fe7e-9ad7-4de3-8e70-10aa7b42d001 | therealstefan | https://linear.app/indigo-ai/profiles/therealstefan |
| Corey Epstein | be96bce2-6da6-42cf-a834-21f2fa687662 | corey1 | https://linear.app/indigo-ai/profiles/corey1 |
| Yousuf Kalim | 308407ca-7a92-4017-8e80-9a220dd66cc5 | — | — |

## Creating Issues

```graphql
mutation CreateIssue($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue { id identifier url title }
  }
}
```

Variables:
```json
{
  "input": {
    "teamId": "TEAM_ID",
    "title": "Issue title",
    "description": "Markdown description",
    "assigneeId": "USER_ID",
    "priority": 2
  }
}
```

## Updating Issues

```graphql
mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) { success }
}
```

## Adding Comments with @mentions

To mention users in comments, you MUST use `bodyData` (ProseMirror JSON), not `body` (markdown). The `body` field does not resolve mentions -- even bare profile URLs render as plain text in the UI.

### Mention node format

```json
{
  "type": "suggestion_userMentions",
  "attrs": {
    "id": "USER_UUID",
    "label": "Display Name"
  }
}
```

### Full comment with mention example

```json
{
  "input": {
    "issueId": "ISSUE_ID",
    "bodyData": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Hey \"},{\"type\":\"suggestion_userMentions\",\"attrs\":{\"id\":\"USER_UUID\",\"label\":\"Display Name\"}},{\"type\":\"text\",\"text\":\" - what do you think?\"}]}]}"
  }
}
```

### IMPORTANT: Encoding rules for bodyData

- **Never use em dashes** (`--` or unicode `\u2014`) in bodyData text. They render as `�` (replacement character) in the Linear UI.
- Use a regular hyphen `-` or double hyphen `--` instead.
- Avoid other non-ASCII punctuation (curly quotes, ellipsis character, etc.) -- stick to plain ASCII in bodyData strings.
- The `bodyData` value is a JSON string inside JSON, so it requires double-escaping of quotes.

### GraphQL mutation

```graphql
mutation CreateComment($input: CommentCreateInput!) {
  commentCreate(input: $input) {
    success
    comment { id body bodyData }
  }
}
```

## Fetching Comments

```graphql
{ comments(first: 10) { nodes { id body bodyData user { name } } } }
```

## Auth

API key passed as header: `Authorization: lin_api_...`

The key is stored in `C:\hq\.env` as `LINEAR_API_KEY`.
