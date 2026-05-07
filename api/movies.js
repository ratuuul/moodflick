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
  if (!tmdbKey) return res.status(500).json({ error: 'TMDB API key not configured' });

  // Merge genres from all moods, preserving priority order, deduplicated
  const moodsArr = Array.isArray(moods) ? moods : [moods];
  const seen = new Set();
  const mergedGenres = [];
  for (const mood of moodsArr) {
    const genres = MOOD_GENRE_MAP[mood] || MOOD_GENRE_MAP['bored'];
    for (const g of genres) {
      if (!seen.has(g)) { seen.add(g); mergedGenres.push(g); }
    }
  }

  // Try primary mood genres first, fall back to broader if no results
  const tryGenres = async (genreIds) => {
    const genreStr = genreIds.slice(0, 3).join(',');
    const url = `https://api.themoviedb.org/3/discover/${mode}?api_key=${tmdbKey}&sort_by=vote_average.desc&vote_count.gte=300&with_genres=${genreStr}&page=1`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('TMDB API error');
    const d = await r.json();
    return d.results || [];
  };

  try {
    let results = await tryGenres(mergedGenres);

    // If fewer than 5 results, retry with just primary mood genres
    if (results.length < 5) {
      const primaryGenres = MOOD_GENRE_MAP[moodsArr[0]] || mergedGenres;
      results = await tryGenres(primaryGenres);
    }

    const mapped = results.slice(0, 5).map(item => ({
      title: item.title || item.name || 'Untitled',
      year: (item.release_date || item.first_air_date || '').slice(0, 4),
      rating: item.vote_average ? item.vote_average.toFixed(1) : '?',
      poster: item.poster_path ? `https://image.tmdb.org/t/p/w300${item.poster_path}` : null,
      id: item.id
    }));

    return res.status(200).json({ results: mapped });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
