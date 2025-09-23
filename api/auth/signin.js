import { createAuthHandler } from '../_lib/createAuthHandler.js'
import { createPasswordAuthHandler } from './_passwordAuthHandler.js'
import { withNetlifyHandler } from '../_lib/netlifyHandler.js'

const handler = createAuthHandler(createPasswordAuthHandler())

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler
