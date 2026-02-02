// api-src/ping.ts
function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  return res.status(200).json({
    success: true,
    message: "pong",
    timestamp: new Date().toISOString(),
    nodeVersion: process.version
  });
}
export {
  handler as default
};
