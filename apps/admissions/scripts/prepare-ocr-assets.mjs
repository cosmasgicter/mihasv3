import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const publicDir = new URL('../public/ocr/tesseract/', import.meta.url)
const coreDir = new URL('../public/ocr/tesseract/core/', import.meta.url)

mkdirSync(publicDir, { recursive: true })
mkdirSync(coreDir, { recursive: true })

const workerPath = require.resolve('tesseract.js/dist/worker.min.js')
copyFileSync(workerPath, new URL('worker.min.js', publicDir))

const corePackagePath = require.resolve('tesseract.js-core/package.json')
const corePackageDir = dirname(corePackagePath)
const coreFiles = [
  'tesseract-core.wasm.js',
  'tesseract-core.wasm',
  'tesseract-core-simd.wasm.js',
  'tesseract-core-simd.wasm',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-lstm.wasm',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm',
]

for (const file of coreFiles) {
  copyFileSync(join(corePackageDir, file), new URL(file, coreDir))
}
