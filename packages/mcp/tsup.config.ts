import { defineConfig } from 'tsup'

// Bundle everything into one self-contained file so the app can ship it and point .mcp.json at it.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  noExternal: [/.*/],
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  clean: true,
})
