import { withNetlifyHandler } from './_lib/netlifyHandler.js';

async function baseHandler(req, res) {
  return res.status(200).json({
    message: 'API is working!',
    method: req.method,
    timestamp: new Date().toISOString(),
    url: req.url
  });
}


const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler