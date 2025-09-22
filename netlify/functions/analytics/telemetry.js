export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Simple telemetry endpoint - just acknowledge the data
    const { event, data } = req.body;

    // In production, you would log this to your analytics service
    console.log('Telemetry event:', event, data);

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Telemetry error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}