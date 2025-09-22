const dns = require('dns')

// Configure DNS to use Google's public DNS as fallback
dns.setServers(['127.0.0.53', '8.8.8.8', '1.1.1.1'])

module.exports = { dns }