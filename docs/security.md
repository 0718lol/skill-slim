# Security self-assessment

skill-slim is a **local, zero-dependency CLI** that reads agent configuration
files and conversation transcripts, plus a **loopback-only dashboard server**.
It makes no outbound network requests and ships no telemetry. This document is
an honest threat-model walkthrough mapped to the OWASP Top 10 (2021), with the
enforcing tests named — run `npm test` and every control below is exercised.

## Threat model

| Actor | Vector |
|---|---|
| Hostile skill pack (cloned repo, shared `.mdc`/prompt file) | SKILL.md frontmatter fields, directory names, even transcript contents are attacker-controlled strings that flow into the terminal report, the HTML reports and the dashboard |
| Hostile web page | While the dashboard runs, it can attempt cross-site POSTs (CSRF) or DNS-rebinding reads against `127.0.0.1:7466` |
| Oversized / pathological input | Giant files, multi-megabyte frontmatter values, adversarial regex inputs, oversized HTTP bodies |
| Local malware | Already runs as the user — out of scope (it can read everything skill-slim reads, directly) |

## Controls by OWASP category

### A01 Broken Access Control — dashboard hardening

- The server binds `127.0.0.1` only — never a routable interface.
- **DNS-rebinding defense:** every request must present a `Host` header whose
  hostname is exactly `127.0.0.1`, `localhost` or `[::1]`; anything else gets
  `403` before routing (`src/server.ts`).
- **CSRF defense:** state-changing POSTs require same-origin browser metadata.
  A present-but-foreign `Origin` (including the sandboxed `null` origin), a
  `Content-Type`-sniffing JSON body sent as `text/plain`, or a cross-site
  `Sec-Fetch-Site` value are all rejected with `403`. Header-less clients
  (curl, CI scripts) keep working because browsers are the only clients that
  can be tricked into sending these headers.
- Tests: `tests/security.test.ts` — "rejects requests with a non-loopback
  Host header", "POST with a cross-site Origin is rejected", "text/plain JSON
  smuggling…", "same-origin and header-less POSTs still work".

### A03 Injection

- **No SQL, no shell.** The codebase contains exactly one `child_process` call
  — `openBrowser` — and its interpolated URL is built from a port number the
  arg parser already constrained to an integer in `[0, 65535]`
  (`--port` rejects `7466; rm -rf /` and friends; tested).
- **XSS:** attacker-controlled names/descriptions/dir-names reach three HTML
  renderers (health report, wrapped bill, dashboard). All interpolate through
  one `esc()` per renderer; tests feed `<script>…`, `<img onerror=…>` payloads
  through a real scan and assert the raw markup never appears while the
  escaped form does. The dashboard API returns `application/json` — data, not
  markup.

### A04 Insecure Design — resource limits

| Limit | Value |
|---|---|
| Single file read (skills/instructions) | 2 MB, larger files are skipped |
| Session transcripts | 10 MB each, 2,000 files, 500 MB total |
| SQLite databases | 500 files, 50,000 rows/query, 20 MB/blob |
| Dashboard request body | 1 MB → explicit `413`, connection closed gracefully |
| Directory walks | depth-limited BFS with hit caps |

- Regexes are linear (`SKILL_PATH_RE` verified against a 200 KB adversarial
  string; frontmatter parsing verified against a 1.9 MB single-line value).
- The frontmatter parser is a flat `key: value` regex, not a YAML engine —
  there is no alias/billion-laughs surface.

### A08 Software & Data Integrity failures

- `fix` is **dry-run by default**; `--apply` only ever moves directories the
  user owns into `~/.skill-slim/quarantine/`. Nothing is deleted, ever.
- Quarantine destinations are resolved and **must stay inside the quarantine
  root**; a crafted `Move` with `../..` is refused and reported as failed.
- `restore` **never overwrites**: an occupied original path is skipped and the
  quarantined copy is kept for manual recovery.
- Tests: "quarantine destinations can never escape the quarantine root",
  "restore skips entries whose original path is occupied".

### A05 Security Misconfiguration

- SQLite databases are opened `readOnly`; any parse failure degrades coverage
  instead of crashing the scan.
- Symlinked directories are never followed (`Dirent.isDirectory()` is false
  for symlinks), so a symlink inside a skills folder cannot pull outside
  content into the scan. (Symlinked *files* like a dotfiles-managed `CLAUDE.md`
  are read — they are the user's own files; there is no privilege boundary
  being crossed.)

### Prototype pollution

- Frontmatter keys are plain strings assigned onto a fresh object; assigning
  `__proto__: <string>` is inert (a primitive cannot become a prototype) and
  `constructor` is a harmless own-property shadow. Tested.

### A02 / A07 / A09 / A10 — not applicable, by construction

- **A02 Cryptographic Failures:** no authentication, no crypto, no transport —
  the entire attack surface is loopback-only by bind and by Host check.
- **A07 Auth Failures:** single-user local tool; nothing to authenticate.
- **A09 Security Logging:** no logs are collected, stored or shipped.
- **A10 SSRF:** the scanner makes zero outbound requests; the dashboard
  serves one static page and JSON.

### Privacy (data minimization)

Reports aggregate — token counts, paths and finding titles. SKILL.md and
instruction file **bodies never leave the scan layer** into any report or API
response (tested: body markers planted in fixtures must not appear in the
JSON report).

## Residual risks, accepted

- A malicious skill description can inflate its own token count or poison the
  duplicate score to manipulate the health score. Worst case: a bad
  *suggestion*. `fix` never deletes anything and `restore` always works.
- `~/.skill-slim/quarantine/manifest.json` is trusted local state; anything
  able to rewrite it already runs as the user.
- `500` error bodies include `String(err)` (may contain local paths). They are
  reachable only from loopback with a valid Host header.
- The dashboard's request-body cap stops buffering at 1 MB but the client may
  finish uploading; the connection closes right after the `413`.

## Verification

```
npm test          # 78 tests, incl. tests/security.test.ts (21 security cases)
```

Static analysis runs on every push via the CodeQL workflow
(`.github/workflows/codeql.yml`, `javascript-typescript`), with results in the
repository's **Security** tab.
