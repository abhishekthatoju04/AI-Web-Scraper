# AI Web Scraper

Paste a link to a web page and get a short AI summary of it: a two or three sentence overview plus the key points.

**Live demo:** _add your Vercel link here after deploying_

## Tech stack

- **Next.js 15 (App Router)** for both the frontend and the backend. The UI is a React page and the backend is an API route in the same project, so one command runs everything and one deploy ships everything.
- **Cheerio** to parse the HTML and pull out the readable text.
- **Google Gemini API** (free tier) for the summary. **Groq** (also free) is supported as an alternative.
- **TADS (Tek Avinya Design System)** for the UI: colors, type scale, text field, buttons, badge, alert, spinner and progress bar all come from its tokens.
- **Inter**, self-hosted through `@fontsource/inter`, so it loads without calling Google Fonts.
- Plain CSS built on the **TADS** design system tokens (colors, buttons, text field, alert, badges, spinner and progress bar), with the **Inter** font. No UI framework.

## Project structure

```
ai-web-scraper/
├── app/
│   ├── page.js                  # Frontend: URL input, Summarize button, loading state, result
│   ├── layout.js                # HTML shell, Inter font, page metadata
│   ├── globals.css              # TADS design tokens and all app styles
│   └── api/summarize/route.js   # Backend: POST /api/summarize
├── lib/
│   ├── scrape.js                # Fetches the page and extracts the main text
│   └── summarize.js             # Sends the text to Gemini or Groq and parses the reply
├── .env.example                 # Template for your API key
└── package.json
```

**Frontend** = everything in `app/` except `app/api/`.
**Backend** = `app/api/summarize/route.js` plus the two files in `lib/`.

## Running it locally

### 1. Requirements

- Node.js 18.18 or newer (check with `node -v`)
- A free API key from one of these:
  - Gemini: https://aistudio.google.com/apikey (sign in with Google, click "Create API key")
  - Groq: https://console.groq.com/keys

### 2. Install

```bash
git clone https://github.com/<your-username>/ai-web-scraper.git
cd ai-web-scraper
npm install
```

### 3. Add your API key (the .env file)

Create a file named **`.env.local`** in the **project root**, the same folder that contains `package.json`:

```
ai-web-scraper/
├── .env.local      <-- here
├── package.json
├── app/
└── lib/
```

The quickest way is to copy the template:

```bash
cp .env.example .env.local
```

Then open `.env.local` and paste your key:

```
GEMINI_API_KEY=your_key_here
```

Or, if you're using Groq:

```
GROQ_API_KEY=your_key_here
```

You only need one. `.env.local` is in `.gitignore`, so your key never gets committed.

### 4. Start the app (frontend and backend together)

```bash
npm run dev
```

Open http://localhost:3000. The page and the API both run on that port:

- Frontend: http://localhost:3000
- Backend: http://localhost:3000/api/summarize

If you change `.env.local`, stop the server (Ctrl+C) and run `npm run dev` again.

### Production build (optional)

```bash
npm run build
npm start
```

### Testing the backend on its own

```bash
curl -X POST http://localhost:3000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{"url": "https://en.wikipedia.org/wiki/Coffee"}'
```

Response:

```json
{
  "url": "https://en.wikipedia.org/wiki/Coffee",
  "host": "en.wikipedia.org",
  "title": "Coffee - Wikipedia",
  "wordCount": 11840,
  "truncated": true,
  "tldr": "Coffee is a brewed drink made from...",
  "points": ["...", "..."],
  "model": "gemini-2.5-flash"
}
```

On failure it returns `{ "error": "..." }` with a matching status code (400 for a bad URL, 422 for a page with no readable text, 429 for AI rate limits, and so on).

## Environment variables

| Variable         | Required        | Default                   | Notes                                              |
| ---------------- | --------------- | ------------------------- | -------------------------------------------------- |
| `GEMINI_API_KEY` | one of the two  |                           | Used by default when set                           |
| `GROQ_API_KEY`   | one of the two  |                           | Used if no Gemini key is set                       |
| `AI_PROVIDER`    | no              | auto                      | Force `gemini` or `groq` when both keys are set    |
| `GEMINI_MODEL`   | no              | `gemini-2.5-flash`        | Change if Google renames or retires the model      |
| `GROQ_MODEL`     | no              | `openai/gpt-oss-120b`     | If this model is retired, the app finds another available Groq model on its own |

## Deploying to Vercel

1. Push the project to a public GitHub repo:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/ai-web-scraper.git
   git push -u origin main
   ```
2. Go to https://vercel.com/new and import the repo. Vercel detects Next.js, so leave the build settings as they are.
3. Before clicking Deploy, open **Environment Variables** and add `GEMINI_API_KEY` (or `GROQ_API_KEY`) with your key.
4. Click **Deploy**. You'll get a link like `https://ai-web-scraper-yourname.vercel.app`.

If you add or change a key later, redeploy from the Vercel dashboard (Deployments, then the menu on the latest one, then Redeploy) so it picks up the new value.

### Deploying to Render instead

Create a new **Web Service** from the repo with:

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment variable: `GEMINI_API_KEY`

## Design system

The UI uses the TADS design system. The `:root` block at the top of `app/globals.css` holds the TADS tokens (colors, radii, sizes), and the rest of the file builds the components from them:

| Element | TADS component |
| --- | --- |
| URL input | Text field, large (48px), with label, leading icon and helper text |
| Summarize | Primary button, large, with the loading spinner |
| Copy summary | Secondary button, medium |
| Example links, Open original, Summarize another | Tertiary button |
| Site name, word count, reading time | Purple and gray badges |
| Loading state | Indeterminate progress bar plus small spinner |
| Errors | Error alert |

Type is Inter throughout, with this weight scale: 700 for the main heading, 600 for section headings and buttons, 500 for labels and important information, and 400 for body text.

To change a color or size, edit its token in the `:root` block of `app/globals.css` and everything that uses it updates.

## How it works

1. The user pastes a URL and clicks **Summarize**. The page shows a loading state while it waits.
2. The frontend sends `POST /api/summarize` with `{ url }`.
3. The backend checks the URL (only public `http`/`https` addresses), then downloads the page with a 12 second timeout.
4. Cheerio removes scripts, styles, navigation, headers, footers and sidebars, looks for the main content (`<article>`, `<main>` and similar), and collects headings, paragraphs and list items. Text is capped at 15,000 characters.
5. That text goes to Gemini (or Groq) with a prompt asking for JSON: a short overview and 3 to 5 key points.
6. The backend sends the result back and the frontend displays it, with buttons to copy the summary or open the original page.

## Limitations

- Pages that build their content with JavaScript (many single-page apps) return little or no text, because the scraper reads the raw HTML and doesn't run a browser.
- Some sites block automated requests and will return an error.
- Very long pages are summarized from their first 15,000 characters. The UI says when this happens.
- Free API tiers have rate limits. If you hit one, wait a minute and try again.
