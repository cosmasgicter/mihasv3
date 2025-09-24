// Admin Users Permissions Function - Netlify Function Entry Point  
const { handler } = require('./admin/users/[id].js');

exports.handler = handler;