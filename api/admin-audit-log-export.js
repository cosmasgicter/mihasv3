// Admin Audit Log Export Function - Netlify Function Entry Point
const { handler } = require('./admin/audit-log/export.js');

exports.handler = handler;