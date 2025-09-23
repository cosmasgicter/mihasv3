const { withNetlifyHandler } = require('./_lib/netlifyHandler')

function handler(req, res) {
  res.json({
    message: 'API is working!',
    method: req.method,
    timestamp: new Date().toISOString(),
    url: req.url
  })
}

const netlifyHandler = withNetlifyHandler(handler)

exports.handler = netlifyHandler
module.exports = netlifyHandler