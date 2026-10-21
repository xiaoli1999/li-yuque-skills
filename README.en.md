# li-yuque-skills

[中文](README.md) | English

An agent skill that lets Claude Code, Codex and Cursor **read, search and download** [Yuque](https://www.yuque.com) documents, **create** new Yuque documents from Markdown, **edit** documents you have edit access to, and **delete** documents you created. Works with personal, team and enterprise-space knowledge bases. Every create, edit and delete is previewed first and runs only after you confirm.

> ⚠️ For learning and personal use only. Please read the [Disclaimer](#disclaimer) first.

## Install

Requires Node.js 18+. Installed globally, once:

```bash
npx skills add xiaoli1999/li-yuque-skills -g -a claude-code -y   # use -a codex for Codex, -a cursor for Cursor
```

Or just tell your agent: "Install the li-yuque-skills skill globally from the GitHub repo xiaoli1999/li-yuque-skills, then walk me through it." After installing, the agent runs the built-in guide and helps you log in step by step.

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
| Edit | In https://www.yuque.com/xxx/yyy/zzz, change "old wording" to "new wording" |
| Delete | Delete my doc https://www.yuque.com/xxx/yyy/zzz |
| Update | Update the Yuque skill / Update the Yuque cookie, it's copied |

- **Log in**: open Yuque in your browser, press F12 → Application → Cookies → `https://www.yuque.com`, and copy the value of `_yuque_session`. **Do not paste it into the chat** — the agent reads it from the clipboard.
- **Read a link**: paste one or more document or spreadsheet links; the agent reads them and answers directly, and can open the images and attachments (HTML prototypes, PDFs, etc.) too.
- **Download**: spreadsheets become Markdown tables, images go to `img/` and attachments to `files/`; attachments over 50 MB are skipped by default, and the agent can raise the limit.
- **Create**: the agent shows a preview (knowledge base, folder, title) and publishes only after you confirm.
- **Edit**: works on any document you can edit (yours or your teammates'). The agent reads the latest version first and replaces the whole body; styles Markdown can't express (font colors, cards, etc.) are lost. Yuque keeps version history, so mistakes can be rolled back.
- **Delete**: only documents you created and that have no child documents. Deleted documents go to the knowledge base's recycle bin and can be restored.

## Notes

- The cookie is stored only on your machine in `~/.li-yuque-skills/` and is sent only to yuque.com. Yuque sessions last 30 days and renew on use, so you rarely need to log in again.
- The skill checks for updates on first use each day, updates itself, and summarizes what changed.
- Requests are throttled to about one per second with automatic back-off; don't loop, schedule or repeatedly re-download whole knowledge bases.
- This tool uses Yuque's web endpoints, not the official Open API, and may break when Yuque changes.
- See [CHANGELOG.md](CHANGELOG.md) for release history (in Chinese).

## Disclaimer

This project is for learning and technical exchange only. It is not affiliated with or endorsed by Yuque or its operator. Only access content you are authorized to access, and comply with applicable laws and the [Yuque Terms of Service](https://www.yuque.com/terms). Do not use it for unauthorized access, bulk scraping, or infringing on privacy or intellectual property. You bear all risks, including account restrictions or data loss, arising from its use.

## License

[MIT](LICENSE)
