import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const inputPath = path.join(appRoot, 'src/index.css');
const configPath = path.join(appRoot, 'tailwind.config.js');

// Tailwind resolves content globs relative to the process working directory.
// Pin it so this command remains accurate when invoked from the monorepo root.
process.chdir(appRoot);

const input = await readFile(inputPath, 'utf8');
const result = await postcss([tailwindcss(configPath)]).process(input, {
  from: inputPath,
  map: false,
});

const warnings = result.warnings();
if (warnings.length > 0) {
  for (const warning of warnings) console.error(warning.toString());
  throw new Error(`Tailwind emitted ${warnings.length} warning(s)`);
}

if (result.css.includes('@tailwind')) {
  throw new Error('Tailwind directives remain in the compiled stylesheet');
}

const requiredSelectors = [
  '.bg-primary',
  '.text-foreground',
  '.animate-fade-in-up',
];
const missingSelectors = requiredSelectors.filter((selector) => !result.css.includes(selector));

if (missingSelectors.length > 0) {
  throw new Error(`Tailwind content scan did not emit: ${missingSelectors.join(', ')}`);
}

console.log(
  `Tailwind validation passed: config loaded, source content scanned, and ${(result.css.length / 1024).toFixed(1)} KiB of CSS compiled.`,
);
