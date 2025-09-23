import { createAuthHandler } from '../_lib/createAuthHandler.js'
import { createPasswordAuthHandler } from './_passwordAuthHandler.js'

const handler = createAuthHandler(
  createPasswordAuthHandler({ auditEventBase: 'auth.login' })
)

export { handler }
export default handler
