# HQ Tools

Auto-generated index of `companies/hq/tools/`.

## Scripts

| Tool | Description |
|------|-------------|
| [agent-stream.sh](agent-stream.sh) | Parse and display an agent run's stream.jsonl |
| [ask-claude.sh](ask-claude.sh) | Run Claude Code CLI non-interactively with a prompt |
| [index-tools.sh](index-tools.sh) | Generate INDEX.md for companies/hq/tools/ |
| [pre-commit](pre-commit) | Block commits that contain secrets or sensitive files |
| [queue-curiosity.ts](queue-curiosity.ts) | Appends a curiosity item to companies/{slug}/knowledge/.queue.jsonl |
| [read-queue.ts](read-queue.ts) | Reads and displays items from companies/{slug}/knowledge/.queue.jsonl |
| [reindex.ts](reindex.ts) | Scan knowledge/ and generate INDEX.md files. |
| [report_issue.sh](report_issue.sh) | Create a bd issue with duplicate detection |
| [reviewable-runs.sh](reviewable-runs.sh) | List agent runs eligible for review |
| [setup.sh](setup.sh) | Bootstrap HQ on a fresh machine |
| [tag-inventory.sh](tag-inventory.sh) | Show frequency-ranked tag vocabulary from the knowledge base |
| [tool-usage-report.sh](tool-usage-report.sh) | Analyze tool call usage across .agents/runs |

## Tool Groups (subdirectories)

| Directory | Contents |
|-----------|----------|
| [aws/](aws/) | [aws-helper.sh](aws/aws-helper.sh) — AWS CLI wrapper with ergonomic defaults |
| [bd/](bd/) | [bd-helper.sh](bd/bd-helper.sh) — Beads issue tracker wrapper |
| [file/](file/) | [edit-file.sh](file/edit-file.sh) — Exact string replacement in files (replaces built-in Edit tool), [write-file.sh](file/write-file.sh) — Write content to a file (replaces built-in Write tool) |
| [git/](git/) | [gh-helper.sh](git/gh-helper.sh) — GitHub CLI wrapper with bd integration, [git-helper.sh](git/git-helper.sh) — Git workflow wrapper enforcing HQ conventions |
| [http/](http/) | [http-request.sh](http/http-request.sh) — HTTP request wrapper with JSON defaults |
| [indigo/](indigo/) | [indigo-helper.sh](indigo/indigo-helper.sh) — Indigo CLI wrapper with ergonomic defaults |
| [node/](node/) | [node-runner.sh](node/node-runner.sh) — Node/npm/bun runner wrapper |
| [python/](python/) | [python-runner.sh](python/python-runner.sh) — Python runner wrapper with venv awareness |
| [qmd/](qmd/) | [qmd-search.sh](qmd/qmd-search.sh) — Knowledge search wrapper for qmd |
