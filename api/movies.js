export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { genres, mode } = req.body || {};
  if (!genres || !mode) return res.status(400).json({ error: 'Missing genres or mode' });
  if (!['movie', 'tv'].includes(mode)) return res.status(400).json({ error: 'Invalid mode' });

  const tmdbKey = process.env.TMDB_API_KEY;
  if (!tmdbKey) return res.status(500).json({ error: 'TMDB API key not configured' });

  try {
    const url = `https://api.themoviedb.org/3/discover/${mode}?api_key=${tmdbKey}&sort_by=vote_average.desc&vote_count.gte=500&with_genres=${genres}&page=1`;
    const response = await fetch(url);

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.status_message || 'TMDB API error' });
    }

    const data = await response.json();
    const results = (data.results || []).slice(0, 5).map(item => ({
      title: item.title || item.name || 'Untitled',
      year: (item.release_date || item.first_air_date || '').slice(0, 4),
      rating: item.vote_average ? item.vote_average.toFixed(1) : '?',
      poster: item.poster_path ? `https://image.tmdb.org/t/p/w300${item.poster_path}` : null,
      id: item.id
    }));

    return res.status(200).json({ results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
