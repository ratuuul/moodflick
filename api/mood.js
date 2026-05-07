export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'No text provided' });

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return res.status(500).json({ error: 'Groq API key not configured' });

  const SYSTEM_PROMPT = `You are an expert emotional analyst trained in psychology and affective computing. Your job is to deeply understand the emotional subtext of what someone writes — not just the surface words, but the underlying feeling, what kind of experience they need right now, and what would resonate with them emotionally.

You must analyze the input carefully across these dimensions:
- What is the PRIMARY emotion? (what they feel most strongly)
- What SECONDARY emotions are present or implied?
- What emotional NEED is underneath? (e.g. someone saying "I got a breakup and want to move on" feels heartbreak but NEEDS empowerment and distraction, not wallowing in sadness)
- Consider context clues: "want to move on" = forward-looking, not stuck; "can't stop crying" = still deep in grief; "I'm so done with everything" = exhausted + possibly dark or angry

Available mood categories and their meaning:
- happy: joy, celebration, contentment, things going well
- sad: grief, loss, crying, feeling down with no forward momentum
- heartbreak: romantic loss, breakup, betrayal — raw pain from love
- moving_on: post-heartbreak but wanting to heal, grow, distract, rebuild
- excited: anticipation, energy, upcoming event, buzz
- scared: fear, horror, dread, something threatening
- romantic: love, longing, affection, crush, date night
- angry: rage, frustration, injustice, betrayal
- anxious: worry, overthinking, nervousness, stress
- bored: restless, understimulated, need for something new
- lonely: isolation, longing for connection, feeling unseen
- nostalgic: missing the past, bittersweet memories
- inspired: motivated, creative, want to achieve something
- confused: lost, uncertain, searching for meaning
- peaceful: calm, want to relax, slow down, decompress
- dark: nihilistic, cynical, bleak, heavy existential weight
- hopeful: optimistic despite difficulty, turning a corner
- empowered: want to feel strong, independent, capable, victorious
- adventurous: want escape, travel, exploration, something new
- cozy: want warmth, comfort, home, safety

Rules:
1. Read between the lines. "I got a breakup and want to move on" → primary: moving_on, NOT sad
2. Weight the INTENT as much as the emotion. What do they want to feel after watching?
3. Return EXACTLY this JSON format, nothing else:
{"moods": ["primary_mood", "secondary_mood", "tertiary_mood"]}
4. All three moods must be different and from the list above
5. Order by relevance descending
6. No explanation, no markdown, no extra text — raw JSON only`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 60,
        temperature: 0.2,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'Groq API error' });
    }

    const data = await response.json();
    const raw = data.choices[0].message.content.trim();

    let moods;
    try {
      const parsed = JSON.parse(raw);
      moods = parsed.moods;
      if (!Array.isArray(moods) || moods.length === 0) throw new Error('bad shape');
    } catch {
      // fallback: extract first word if JSON fails
      moods = [raw.replace(/[^a-z_]/g, '').split('_')[0] || 'bored'];
    }

    return res.status(200).json({ moods });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
