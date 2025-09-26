async function baseHandler(req, res) {
  return new Response(JSON.stringify({
    message: 'API is working!',
    method: req.method,
    timestamp: new Date().toISOString(),
    url: request.url
  }), {
    headers: { 'Content-Type': 'application/json' }
  })
}


const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler