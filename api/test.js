module.exports = (req, res) => {
  res.json({ 
    message: 'API is working!', 
    method: req.method,
    timestamp: new Date().toISOString(),
    url: req.url
  })
}