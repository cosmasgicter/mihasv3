import { createAuthHandler } from '../_lib/createAuthHandler.js'
import { createPasswordAuthHandler } from './_passwordAuthHandler.js'
import { withNetlifyHandler } from '../../../api/_lib/netlifyHandler.js'

const handler = createAuthHandler(
  createPasswordAuthHandler({ auditEventBase: 'auth.login' })
)

const netlifyHandler = withNetlifyHandler(handler)

export { netlifyHandler as handler }
export default netlifyHandler
