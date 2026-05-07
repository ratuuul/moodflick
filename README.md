# MoodFlick 🎬

AI-powered mood-based movie & series suggestion engine. Built with neo-brutalist design.

## How it works

1. User types anything in natural language about their mood
2. Groq (Llama 3.3 70B) extracts the core emotion
3. Emotion maps to TMDB genre IDs
4. Top 5 movies OR series shown with posters
5. Toggle between movies and series anytime

**API keys stay server-side** — users never see them.

---

## Deploy to Vercel

### 1. Get free API keys

- **Groq** → https://console.groq.com (free, fast)
- **TMDB** → https://www.themoviedb.org/settings/api (free, get v3 key)

### 2. Push to GitHub

```bash
git init
git add .
git commit -m "init moodflick"
git remote add origin https://github.com/YOUR_USERNAME/moodflick.git
git push -u origin main
```

### 3. Deploy on Vercel

1. Go to https://vercel.com and import your GitHub repo
2. In project settings → **Environment Variables**, add:

| Name | Value |
|------|-------|
| `GROQ_API_KEY` | `gsk_...` |
| `TMDB_API_KEY` | `your tmdb v3 key` |

3. Deploy. Done.

---

## Project structure

```
moodflick/
├── api/
│   ├── mood.js      → Groq proxy (extracts mood word)
│   └── movies.js    → TMDB proxy (fetches results)
├── public/
│   └── index.html   → Full frontend (no keys here)
├── vercel.json
└── package.json
```

## Local dev

```bash
npm i -g vercel
vercel dev
```

Add keys to `.env.local`:
```
GROQ_API_KEY=gsk_...
TMDB_API_KEY=...
```
