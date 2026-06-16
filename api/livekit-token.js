const { AccessToken } = require('livekit-server-sdk');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { room_name, participant_name } = req.body || {};
  if (!room_name) {
    return res.status(400).json({ error: 'room_name required' });
  }

  const apiKey    = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participant_name || ('user-' + Math.random().toString(36).slice(2, 7)),
    ttl: '2h',
  });

  at.addGrant({
    roomJoin:       true,
    room:           room_name,
    canPublish:     true,
    canSubscribe:   true,
    canPublishData: true,
  });

  const token = await at.toJwt();
  return res.status(200).json({ token });
};
