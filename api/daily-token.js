module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { room_name, user_name } = req.body || {};
  if (!room_name) {
    return res.status(400).json({ error: 'room_name required' });
  }

  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const r = await fetch('https://api.daily.co/v1/meeting-tokens', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify({
      properties: {
        room_name,
        user_name:          user_name || 'Participante',
        enable_screenshare: true,
        start_audio_off:    false,
        start_video_off:    true,
        exp:                Math.floor(Date.now() / 1000) + 7200
      }
    })
  });

  const data = await r.json();
  if (!r.ok) {
    return res.status(r.status).json({ error: data });
  }

  return res.status(200).json({ token: data.token });
};
