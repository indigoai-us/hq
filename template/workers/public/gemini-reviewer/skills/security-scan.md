# security-scan

Security-focused code review targeting OWASP top 10 and common vulnerabilities.

## Arguments

`$ARGUMENTS` = `--files <paths>` (required, space-separated or glob)

Optional:
- `--cwd <path>` - Working directory

## Process

1. **Collect Files**
   - Resolve file paths/globs
   - Prioritize: auth, API routes, input handling, database queries

2. **Pipe to Gemini for Security Audit**
   ```bash
   KEY=$(grep GEMINI_API_KEY /Users/{your-name}/Documents/HQ/settings/gemini/credentials.env | cut -d= -f2)
   cd {cwd} && cat {files} | GEMINI_API_KEY=$KEY \
     gemini -p "Security audit this code. Check for: SQL injection, XSS, SSRF, auth bypass, secret exposure, insecure deserialization, path traversal, command injection, CSRF, open redirects. Group by severity: critical, high, medium, low. For each: file, line, vulnerability type, description, remediation." \
     --model flash --sandbox --output-format text 2>&1
   ```

3. **Format Security Report**
   - Group by severity (critical first)
   - Tag each finding with OWASP category
   - Provide remediation priority

## Output

- Severity-grouped security findings
- OWASP category tags per finding
- Remediation steps for each vulnerability
- Risk summary

## Human Checkpoints

- Review all critical/high findings immediately
- Approve remediation approach before fixing
