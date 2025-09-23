import { withNetlifyHandler } from './_lib/netlifyHandler.js'

function handler(req, res) {
  res.json({
    message: 'API is working!',
    method: req.method,
    timestamp: new Date().toISOString(),
    url: req.url
  })
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler
