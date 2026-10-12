# li-yuque-skills

[中文](README.md) | English

An agent skill that lets Claude Code, Codex and Cursor **read, search and download** [Yuque](https://www.yuque.com) documents, and **create** new Yuque documents from Markdown. Works with personal, team and enterprise-space knowledge bases. Read and create only — it never modifies or deletes existing content.

> ⚠️ For learning and personal use only. Please read the [Disclaimer](#disclaimer) first.

## Install

Requires Node.js 18+. Installed globally, once:

```bash
npx skills add xiaoli1999/li-yuque-skills -g -a claude-code -y   # use -a codex for Codex, -a cursor for Cursor
```

Or just tell your agent: "Install the li-yuque-skills skill globally from the GitHub repo xiaoli1999/li-yuque-skills."

As a Claude Code plugin: `claude plugin marketplace add xiaoli1999/li-yuque-skills`, then `claude plugin install li-yuque-skills@li-yuque-skills`.

## Usage

Talk to your agent:

| Goal | Say |
|---|---|
| First time / not sure how | How do I use the Yuque skill? |
| Log in | Log in to Yuque, the cookie is copied |
| **Read a link** | What is https://www.yuque.com/xxx/yyy/zzz about? |
| Search | Find Yuque docs with "weekly report" in the title |
| Download | Download folder "A" of knowledge base "X" to my desktop |
| Create | Publish D:\docs\report.md to the Yuque knowledge base "X" |
| Update | Update the Yuque skill / Update the Yuque cookie, it's copied |

- **Log in**: open Yuque in your browser, press F12 → Application → Cookies → `https://www.yuque.com`, and copy the value of `_yuque_session`. **Do not paste it into the chat** — the agent reads it from the clipboard.
- **Read a link**: paste one or more document links; the agent reads them and answers directly without saving files.
- **Create**: the agent shows a preview (knowledge base, folder, title) and publishes only after you confirm.

## Notes

- The cookie is stored only on your machine in `~/.li-yuque-skills/` and is sent only to yuque.com.
- Requests are throttled to about one per second with automatic back-off; don't loop, schedule or repeatedly re-download whole knowledge bases.
- This tool uses Yuque's web endpoints, not the official Open API, and may break when Yuque changes.
- See [CHANGELOG.md](CHANGELOG.md) for release history (in Chinese).

## Disclaimer

This project is for learning and technical exchange only. It is not affiliated with or endorsed by Yuque or its operator. Only access content you are authorized to access, and comply with applicable laws and the [Yuque Terms of Service](https://www.yuque.com/terms). Do not use it for unauthorized access, bulk scraping, or infringing on privacy or intellectual property. You bear all risks, including account restrictions or data loss, arising from its use.

## License

[MIT](LICENSE)
