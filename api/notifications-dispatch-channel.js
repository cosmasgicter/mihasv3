// Notifications Dispatch Channel Function - Netlify Function Entry Point
const { handler } = require('./notifications/dispatch-channel.js');

exports.handler = handler;