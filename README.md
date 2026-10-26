# dsh-claude-usage

Remaining **five-hour** and **weekly** Claude usage in the DeepDive sidebar, for
accounts signed in through [dsh-claude-provider](https://github.com/ObnubiladO/dsh-claude-provider).
The Claude counterpart of `dsh-codex-usage`.

## What it shows

A sidebar panel with the account-wide allowances, as **remaining** percentages:
the rolling five-hour window and the weekly window, each with a meter, a
severity colour below 25% / 10%, and a relative reset time. It appears next to
the Codex usage panel, and its height is adjustable by dragging the grip (or
arrow keys / Home / End) and is remembered.

When a plan reports model-specific weekly windows (Opus, Sonnet), the panel
follows the model selected in the composer when one applies, and falls back to
the account-wide window otherwise. Windows Anthropic does not report are
hidden rather than shown as zero.

## How it reads

`GET https://api.anthropic.com/api/oauth/usage` with the stored OAuth access
token — the same endpoint Claude Code uses. The response reports utilisation
per window, which is inverted to "remaining" here.

The credential is the `llm-pi-ai/anthropic` grant record that the harness
adapter owns and refreshes; this plugin never writes it and never exposes the
token. Requests are coalesced, cached for 30 seconds, and discarded when the
stored token changes, so signing in as someone else never mixes their numbers
in. Only quota figures cross the RPC boundary — no account id, no token, no
upstream error body.

States shown instead of numbers: `signed-out`, `sign-in-required`,
`rate-limited`, `unavailable`.

## Install

```bash
dsh plugin --profile web add github:ObnubiladO/dsh-claude-usage
```

Restart DeepDive. The panel appears in the sidebar footer; its height setting
is stored under the `claude-usage` settings namespace.

## Requirements

- DeepSeek Harness / DeepDive with `@deepseek-ai/dsh-credentials` and `@deepseek-ai/dsh-settings`
- A Claude sign-in from `dsh-claude-provider`
- Verified against `dsh 0.2.1-rc.3` (DeepDive 0.2.7)

## Files

| File | Role |
| --- | --- |
| `lib/usage.js` | fetch + normalise the usage document into renderable windows |
| `lib/index.js` | host plugin: `claudeUsage` Remote service, credential record lookup, cache |
| `lib/client.js` | client plugin: sidebar panel and the height-setting section |

## License

MIT.
