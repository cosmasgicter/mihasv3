import { existsSync } from 'fs'
import { resolve } from 'path'

type ResolveLocalApiModulePathOptions = {
  rootDir?: string
  exists?: (candidate: string) => boolean
}

export function resolveLocalApiModulePath(
  name: string,
  options: ResolveLocalApiModulePathOptions = {}
): string {
  const rootDir = options.rootDir || process.cwd()
  const exists = options.exists || existsSync

  const candidates = [
    { absolute: resolve(rootDir, 'api', `${name}.js`), relative: `./api/${name}.js` },
    { absolute: resolve(rootDir, 'api-src', `${name}.ts`), relative: `./api-src/${name}.ts` },
  ]

  const match = candidates.find(candidate => exists(candidate.absolute))
  if (!match) {
    throw new Error(`No local API module found for "${name}"`)
  }

  return match.relative
}
