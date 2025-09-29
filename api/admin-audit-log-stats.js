import { withNetlifyHandler } from './_lib/netlifyHandler.js';

async function baseHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  return res.status(200).json({ stats: { total: 0, recent: 0 } });
}

const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler