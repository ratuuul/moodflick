import { fetchRedditPosts } from './reddit.js';

const MOOD_GENRE_MAP = {
  happy:       [35, 16, 10751],
  sad:         [18, 10749],
  heartbreak:  [18, 10749, 10402],
  moving_on:   [35, 28, 12, 18],
  excited:     [28, 12, 878],
  scared:      [27, 53],
  romantic:    [10749, 18, 10402],
  angry:       [53, 80, 28],
  anxious:     [9648, 53, 18],
  bored:       [28, 12, 35, 16],
  lonely:      [18, 10751, 10749],
  nostalgic:   [10402, 16, 35, 18],
  inspired:    [18, 99, 36],
  confused:    [9648, 878, 18],
  peaceful:    [10751, 10402, 99],
  dark:        [80, 27, 53, 18],
  hopeful:     [18, 12, 35],
  empowered:   [28, 18, 12, 36],
  adventurous: [12, 28, 878, 37],
  cozy:        [10751, 35, 10402, 16]
};

// ── TMDB FALLBACK ─────────────────────────────────────────────
async function tmdbFallback(moods, mode, tmdbKey) {
  const moodsArr = Array.isArray(moods) ? moods : [moods];
  const seen = new Set();
  const mergedGenres = [];
  for (const mood of moodsArr) {
    for (const g of (MOOD_GENRE_MAP[mood] || MOOD_GENRE_MAP['bored'])) {
      if (!seen.has(g)) { seen.add(g); mergedGenres.push(g); }
    }
  }
  const genreStr = mergedGenres.slice(0, 3).join(',');
  const url = `https://api.themoviedb.org/3/discover/${mode}?api_key=${tmdbKey}&sort_by=vote_average.desc&vote_count.gte=300&with_genres=${genreStr}&page=1`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('TMDB fallback failed');
  const d = await r.json();
  return (d.results || []).slice(0, 5).map(item => ({
    title: item.title || item.name || 'Untitled',
    year: (item.release_date || item.first_air_date || '').slice(0, 4),
    rating: item.vote_average ? item.vote_average.toFixed(1) : '?',
    poster: item.poster_path ? `https://image.tmdb.org/t/p/w300${item.poster_path}` : null,
    source: 'tmdb'
  }));
}

// ── GROQ ANALYSIS ─────────────────────────────────────────────
async function analyzeWithGroq(posts, moods, mode, groqKey) {
  const moodStr = Array.isArray(moods) ? moods.join(', ') : moods;
  const modeWord = mode === 'tv' ? 'TV series / shows' : 'movies / films';

  const redditText = posts.map((p, i) =>
    `[${i + 1}] r/${p.subreddit} (${p.score} upvotes)\nTitle: ${p.title}\n${p.selftext ? 'Body: ' + p.selftext : ''}`
  ).join('\n\n');

  const prompt = `You are an expert movie curator and emotional intelligence analyst.

USER EMOTIONAL STATE: ${moodStr}

Your task: analyze the Reddit discussions below and extract the best ${modeWord} recommendations that genuinely match the user's emotional state.

STRICT RULES:
1. Only extract ${modeWord} — no books, music, games, podcasts
2. Score each recommendation 1-10 on how well it fits the emotional state (10 = perfect match)
3. EXCLUDE anything mentioned negatively (e.g. "don't watch X when sad", "X made me feel worse")
4. EXCLUDE if the mention is off-topic or unrelated to the mood
5. If the same title appears multiple times, boost its score slightly
6. Consider what the user NEEDS emotionally, not just what matches literally
7. Extract real, specific titles only — no vague descriptions

Return ONLY this exact JSON, nothing else:
{
  "recommendations": [
    {"title": "Exact Movie Title", "year": "YYYY or empty string", "score": 8},
    ...
  ]
}

Maximum 12 recommendations. If fewer than 3 confident matches exist, return what you have.

REDDIT DISCUSSIONS:
${redditText}`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${groqKey}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 600,
      temperature: 0.1,
      messages: [
        { role: 'system', content: 'You are a JSON-only response bot. Output raw JSON with no markdown, no backticks, no explanation.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) throw new Error('Groq analysis failed');
  const data = await response.json();
  const raw = data.choices[0].message.content.trim();
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(cleaned);
  return parsed.recommendations || [];
}

// ── TMDB ENRICHMENT ───────────────────────────────────────────
async function enrichWithTMDB(recommendations, mode, tmdbKey) {
  const enriched = await Promise.allSettled(
    recommendations.map(async (rec) => {
      const query = rec.year ? `${rec.title} ${rec.year}` : rec.title;
      const url = `https://api.themoviedb.org/3/search/${mode}?api_key=${tmdbKey}&query=${encodeURIComponent(query)}&page=1`;
      const r = await fetch(url);
      if (!r.ok) return null;
      const d = await r.json();
      const match = (d.results || [])[0];
      if (!match) return null;
      return {
        title: match.title || match.name || rec.title,
        year: (match.release_date || match.first_air_date || '').slice(0, 4),
        rating: match.vote_average ? match.vote_average.toFixed(1) : '?',
        poster: match.poster_path ? `https://image.tmdb.org/t/p/w300${match.poster_path}` : null,
        tmdbScore: match.vote_average || 0,
        relevanceScore: rec.score,
        source: 'reddit'
      };
    })
  );

  return enriched
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value)
    .filter(m => m.tmdbScore > 0);
}

// blend relevance score + tmdb rating, sort, take top 5
function blendSort(items) {
  return items
    .map(m => ({ ...m, blendScore: (m.relevanceScore * 0.6) + (m.tmdbScore * 0.4) }))
    .sort((a, b) => b.blendScore - a.blendScore)
    .slice(0, 5);
}

// ── MAIN HANDLER ──────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { moods, mode } = req.body || {};
  if (!moods || !mode) return res.status(400).json({ error: 'Missing moods or mode' });
  if (!['movie', 'tv'].includes(mode)) return res.status(400).json({ error: 'Invalid mode' });

  const tmdbKey = process.env.TMDB_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  if (!tmdbKey) return res.status(500).json({ error: 'TMDB API key not configured' });
  if (!groqKey) return res.status(500).json({ error: 'Groq API key not configured' });

  try {
    // 1. fetch reddit posts
    let posts = [];
    try { posts = await fetchRedditPosts(moods, mode); }
    catch (e) { console.log('Reddit failed:', e.message); }

    // 2. not enough posts → TMDB fallback
    if (!posts || posts.length < 3) {
      console.log('Reddit insufficient → TMDB fallback');
      const fallback = await tmdbFallback(moods, mode, tmdbKey);
      return res.status(200).json({ results: fallback, source: 'tmdb_fallback' });
    }

    // 3. groq analyzes reddit content
    let recommendations = [];
    try { recommendations = await analyzeWithGroq(posts, moods, mode, groqKey); }
    catch (e) {
      console.log('Groq failed:', e.message);
      const fallback = await tmdbFallback(moods, mode, tmdbKey);
      return res.status(200).json({ results: fallback, source: 'tmdb_fallback' });
    }

    // 4. too few groq results → TMDB fallback
    if (!recommendations || recommendations.length < 2) {
      console.log('Groq too few results → TMDB fallback');
      const fallback = await tmdbFallback(moods, mode, tmdbKey);
      return res.status(200).json({ results: fallback, source: 'tmdb_fallback' });
    }

    // 5. enrich with TMDB ratings + posters
    let enriched = [];
    try { enriched = await enrichWithTMDB(recommendations, mode, tmdbKey); }
    catch (e) { console.log('Enrichment failed:', e.message); }

    // 6. too few enriched → TMDB fallback
    if (enriched.length < 2) {
      const fallback = await tmdbFallback(moods, mode, tmdbKey);
      return res.status(200).json({ results: fallback, source: 'tmdb_fallback' });
    }

    // 7. blend sort → return top 5
    const final = blendSort(enriched);
    return res.status(200).json({ results: final, source: 'reddit' });

  } catch (e) {
    console.log('Unexpected error → TMDB fallback:', e.message);
    try {
      const fallback = await tmdbFallback(moods, mode, tmdbKey);
      return res.status(200).json({ results: fallback, source: 'tmdb_fallback' });
    } catch {
      return res.status(500).json({ error: 'All sources failed' });
    }
  }
}
