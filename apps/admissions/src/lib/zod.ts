import { z as zod } from 'zod'

let configured = false

function ensureZodConfiguration() {
  if (configured) {
    return
  }

  // Disable Zod v4 JIT compilation so the app does not require
  // `unsafe-eval` and so lightweight public routes do not pull
  // Zod into the startup path unless they actually use a schema.
  zod.config({ jitless: true })
  configured = true
}

ensureZodConfiguration()

export { z } from 'zod'
export * from 'zod'
