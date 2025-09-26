async function baseHandler(req, res) {
  

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  return new Response(JSON.stringify({ role: 'user' }), { headers })
}

const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler