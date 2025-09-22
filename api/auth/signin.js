const { createAuthHandler } = require('../_lib/createAuthHandler')
const { createPasswordAuthHandler } = require('./_passwordAuthHandler')

module.exports = createAuthHandler(createPasswordAuthHandler())
