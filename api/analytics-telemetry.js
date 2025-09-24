// Analytics Telemetry Function - Netlify Function Entry Point
const { handler } = require('./analytics/telemetry.js');

exports.handler = handler;