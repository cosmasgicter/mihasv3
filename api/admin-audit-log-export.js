async function baseHandler(req, res) {
  

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  return res.status(501).json({ message: 'Audit log export not implemented' })
}

const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler