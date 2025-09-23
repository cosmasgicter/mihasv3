const { createAuthHandler } = require('../_lib/createAuthHandler')
const { createPasswordAuthHandler } = require('./_passwordAuthHandler')
const { withNetlifyHandler } = require('../_lib/netlifyHandler')

const handler = createAuthHandler(
  createPasswordAuthHandler({ auditEventBase: 'auth.login' })
)

const netlifyHandler = withNetlifyHandler(handler)

exports.handler = netlifyHandler
module.exports = netlifyHandler
