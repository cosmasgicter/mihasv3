async function baseHandler(req, res) {
  

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  
  return new Response(JSON.stringify({ application: { id, status: 'draft' } }), { headers })
}


const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler