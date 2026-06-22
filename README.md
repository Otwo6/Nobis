# <p align="center">NOBIS</p>

<p align="center"><i>"Government of the people, by the people, for the people, shall not perish from the earth."</i></p>
<p align="center">— Abraham Lincoln</p>

When a constituent calls or emails a representative's office, the message usually ends with an intern, a full inbox, and silence. **Nobis** is infrastructure built to close that gap.
It listens through Discord, email, Instagram, using AI to read, sort, and surface every concern automatically. No message disappears into a black hole and no neighbor wonders if their representative was listening.
Nobis is built for representatives, candidates, and campaign staff who believe every constituent's voice should be visible and answered.

---

<p align="center">
<img src="public/CockadeNobis.png" width="100" alt="Nobis Logo" />
</p>

---

## What is Nobis?

**Nobis** is a constituent-engagement platform that turns an endless amount of constituent messages into a public record of what a district actually cares about.

Constituents reach out the same way they'd message a friend, no app, no account, no hoops. Nobis reads each message with AI, decides whether it's an **Issue** (something that needs fixing) or a **Question** (something that needs answering), tags it with a category, and posts it to a live, public dashboard. Staff get a private admin view to respond, and the moment an issue is marked resolved, the person who raised it gets notified automatically.

The result: constituents can see their concern was heard and acted on, staff stop drowning in manual triage, and the office has a running, public record of what it has and hasn't addressed.

---

## How It Works

1. A constituent sends a message via Discord DM, email, or Instagram, whatever channel they prefer and already use.
2. The message is checked for spam before anything else happens.
3. An AI model reads the message and decides whether it's a new **Issue**, a **Question**, or a reply tied to something already logged.
4. New issues are filed under one of seven categories: Infrastructure, Public Safety, Education, Taxes, Healthcare, Environment, or Economy.
5. The issue or question appears instantly on the public dashboard, where anyone in the district can browse, search, and filter by category.
6. Staff log into a password-protected admin panel to answer open questions or mark issues resolved.
7. The moment an issue is resolved, Nobis sends an automatic reply back to the constituent on whichever platform they originally used.

---

## Tech Stack

| Layer            | Technology                                  | Purpose                                      |
|-------------------|----------------------------------------------|-----------------------------------------------|
| Frontend          | React, React Router, Tailwind CSS            | Landing page and public/admin dashboard       |
| Backend           | Node.js, Express                              | API server and message-ingestion logic        |
| AI Classification | OpenAI (`gpt-4o-mini`) with schema validation via `zod` | Categorizes and routes incoming messages |
| Database          | MySQL (`mysql2`)                              | Stores issues, questions, and statuses         |
| Auth              | JWT + `bcrypt`                                | Protects the staff admin panel                 |
| Notifications     | `nodemailer`, Discord bot, Instagram Graph API | Sends resolution updates back to constituents |
| Rate Limiting     | `express-rate-limit`                          | Throttles login attempts and spam             |

---

## Installation & Setup

### Prerequisites

- Node.js and npm
- A MySQL database
- An OpenAI API key
- (Optional, per channel) a Discord bot token, an email account with IMAP/SMTP access, and/or an Instagram Graph API access token

### Environment Variables

Create a `.env` file in the project root (it's already excluded via `.gitignore`) with:

```
JWT_SECRET=               # random string, 32+ characters
ENCRYPTION_KEY=            # 64-character hex string
OPENAI_KEY=                 # your OpenAI API key
DISCORD_BOT_TOKEN=          # optional — enables the Discord channel
INSTAGRAM_USER_ACCESS_TOKEN=  # optional — enables the Instagram channel
EMAIL_USER=                 # optional — enables the email channel
EMAIL_PASS=
EMAIL_HOST=                 # IMAP host
EMAIL_SMTP_HOST=            # SMTP host for outgoing replies
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=nobis_db
FRONTEND_URL=http://localhost:3000
```

### Backend Setup

1. Install dependencies:
   ```
   npm install
   ```
2. Set up a MySQL database matching `DB_NAME` above, with tables for issues and questions.
3. Start the server:
   ```
   node server/server.js
   ```

### Frontend Setup

1. From the project root, start the React app:
   ```
   npm start
   ```
2. The public dashboard and admin login are served from the same app — the admin panel sits behind the `/api/login` route and a JWT-protected session.

---

## Privacy & Data Handling

- Messages are processed through OpenAI's API for classification; review OpenAI's own data-use policies if this matters for your office.
- Sensitive configuration (API keys, database credentials, the encryption key) is kept in a local `.env` file, which is excluded from version control.
- The admin panel is gated behind password authentication (hashed with `bcrypt`) and JSON Web Tokens, with rate limiting on login attempts to reduce brute-force risk.
- The public dashboard is designed to show categorized issues and questions, not constituents' raw personal messages or contact details.

---

## Legal & Ethical Disclaimer

Nobis uses an AI model to classify and categorize constituent messages. AI classification is probabilistic, it can mis-categorize a message, misjudge whether something is an issue versus a question, or miss context a human staffer would catch. **Nobis is a triage and transparency tool, not a replacement for human judgment** on constituent casework.

### Stay Vigilant

> A public dashboard is only as trustworthy as the moderation behind it. Offices using Nobis should periodically review categorization accuracy and the public-facing feed, not assume the AI got it right by default.

#### Additional Notes

- **No Guarantee of Accuracy:** Categorization and issue/question detection are AI-generated and may not always reflect the constituent's actual intent.
- **No Liability for Misuse:** Decisions made based on Nobis's categorization or dashboard data are the responsibility of the office using it.
- **Third-Party APIs:** Using the Discord, Instagram, or OpenAI integrations means you're also agreeing to those providers' respective Terms of Service and Privacy Policies.

---

## License

This repository does not currently include a license file. Until one is added, no reuse, modification, or distribution rights are granted beyond viewing the source.

---

<p align="center"><i>"The will of the people is the only legitimate foundation of any government, and to protect its free expression should be our first object."</i></p>
<p align="center">— Thomas Jefferson</p>
