const MOOD_QUERIES = {
  happy:       ['feel good movies recommendations', 'movies to watch when happy cheerful'],
  sad:         ['movies to watch when sad crying', 'emotional cathartic movie recommendations'],
  heartbreak:  ['movies after breakup heartbreak', 'what to watch after breakup reddit'],
  moving_on:   ['movies about moving on healing', 'empowering movies after breakup moving forward'],
  excited:     ['hyped exciting movies adrenaline', 'most exciting action adventure movies'],
  scared:      ['scariest horror movies recommendations', 'best horror thriller movies reddit'],
  romantic:    ['romantic movies date night', 'best romance movies recommendations'],
  angry:       ['movies when angry frustrated', 'cathartic revenge justice movies'],
  anxious:     ['calming movies anxiety', 'movies to watch when anxious overthinking'],
  bored:       ['most entertaining movies bored', 'movies that keep you hooked reddit'],
  lonely:      ['movies about loneliness connection', 'movies to watch alone lonely'],
  nostalgic:   ['nostalgic movies childhood classics', 'feel nostalgic movie recommendations'],
  inspired:    ['inspiring motivational movies', 'movies that changed my life reddit'],
  confused:    ['mind bending movies recommendations', 'movies that make you think reddit'],
  peaceful:    ['calm relaxing movies recommendations', 'cozy peaceful movies to watch'],
  dark:        ['dark nihilistic movies recommendations', 'best dark psychological movies'],
  hopeful:     ['uplifting hopeful movies recommendations', 'movies with hopeful endings reddit'],
  empowered:   ['empowering movies strong protagonist', 'movies that make you feel powerful'],
  adventurous: ['adventure movies travel exploration', 'epic adventure movies reddit'],
  cozy:        ['cozy comfort movies recommendations', 'movies to watch on rainy day reddit']
};

const SUBREDDITS = ['movies', 'MovieSuggestions', 'netflix', 'film', 'flicks'];

export async function fetchRedditPosts(moods, mode) {
  const moodsArr = Array.isArray(moods) ? moods : [moods];
  const primaryMood = moodsArr[0] || 'bored';
  const queries = MOOD_QUERIES[primaryMood] || MOOD_QUERIES['bored'];

  // pick 2 queries — primary mood + second mood if exists
  const selectedQueries = [queries[0]];
  if (moodsArr[1] && MOOD_QUERIES[moodsArr[1]]) {
    selectedQueries.push(MOOD_QUERIES[moodsArr[1]][0]);
  } else {
    selectedQueries.push(queries[1]);
  }

  // add mode context
  const modeWord = mode === 'tv' ? 'series tv show' : 'movie film';
  const finalQueries = selectedQueries.map(q => `${q} ${modeWord}`);

  const headers = {
    'User-Agent': 'MoodFlick/1.0 (movie recommendation app)',
    'Accept': 'application/json'
  };

  const allPosts = [];

  await Promise.allSettled(
    finalQueries.map(async (query) => {
      // search across all reddit
      const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=top&limit=10&type=link&t=year`;
      try {
        const r = await fetch(url, { headers });
        if (!r.ok) return;
        const data = await r.json();
        const posts = data?.data?.children || [];
        for (const post of posts) {
          const p = post.data;
          // only include movie/suggestion subreddits or highly upvoted
          if (p.score < 10) continue;
          allPosts.push({
            title: p.title || '',
            selftext: (p.selftext || '').slice(0, 800),
            score: p.score,
            subreddit: p.subreddit,
            url: p.url
          });
        }
      } catch { /* silent fail per query */ }
    })
  );

  // also search specific subreddits for richer results
  await Promise.allSettled(
    SUBREDDITS.slice(0, 2).map(async (sub) => {
      const query = finalQueries[0];
      const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(query)}&sort=top&limit=8&restrict_sr=1&t=year`;
      try {
        const r = await fetch(url, { headers });
        if (!r.ok) return;
        const data = await r.json();
        const posts = data?.data?.children || [];
        for (const post of posts) {
          const p = post.data;
          if (p.score < 5) continue;
          allPosts.push({
            title: p.title || '',
            selftext: (p.selftext || '').slice(0, 800),
            score: p.score,
            subreddit: p.subreddit,
            url: p.url
          });
        }
      } catch { /* silent fail per subreddit */ }
    })
  );

  // dedupe by title, sort by score
  const seen = new Set();
  const unique = allPosts
    .filter(p => { if (seen.has(p.title)) return false; seen.add(p.title); return true; })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return unique;
}
