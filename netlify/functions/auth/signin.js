import { createAuthHandler } from '../_lib/createAuthHandler.js'
import { createPasswordAuthHandler } from './_passwordAuthHandler.js'

const handler = createAuthHandler(createPasswordAuthHandler())

export { handler }
export default handler
