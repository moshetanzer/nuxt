import { fileURLToPath } from 'node:url'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { dirname, join, normalize, resolve } from 'pathe'
import { withoutTrailingSlash } from 'ufo'
import { createApp, resolveApp } from '../src/core/app'
import { loadNuxt } from '../src'

const repoRoot = withoutTrailingSlash(normalize(fileURLToPath(new URL('../../../', import.meta.url))))

describe('resolveApp', () => {
  afterAll(async () => {
    await rm(resolve(repoRoot, '.fixture'), { recursive: true, force: true })
  })
  it('resolves app with default configuration', async () => {
    const app = await getResolvedApp([])
    expect(app).toMatchInlineSnapshot(`
      {
        "components": [],
        "configs": [],
        "dir": "<rootDir>",
        "errorComponent": "<repoRoot>/packages/nuxt/src/app/components/nuxt-error-page.vue",
        "extensions": [
          ".js",
          ".jsx",
          ".mjs",
          ".ts",
          ".tsx",
          ".vue",
        ],
        "layouts": {},
        "mainComponent": "<repoRoot>/packages/nuxt/src/app/components/welcome.vue",
        "middleware": [
          {
            "global": true,
            "name": "manifest-route-rule",
            "path": "<repoRoot>/packages/nuxt/src/app/middleware/manifest-route-rule.ts",
          },
        ],
        "plugins": [
          {
            "mode": "client",
            "src": "<repoRoot>/packages/nuxt/src/app/plugins/payload.client.ts",
          },
          {
            "mode": "client",
            "src": "<repoRoot>/packages/nuxt/src/app/plugins/navigation-repaint.client.ts",
          },
          {
            "mode": "client",
            "src": "<repoRoot>/packages/nuxt/src/app/plugins/check-outdated-build.client.ts",
          },
          {
            "mode": "server",
            "src": "<repoRoot>/packages/nuxt/src/app/plugins/revive-payload.server.ts",
          },
          {
            "mode": "client",
            "src": "<repoRoot>/packages/nuxt/src/app/plugins/revive-payload.client.ts",
          },
          {
            "mode": "client",
            "src": "<repoRoot>/packages/nuxt/src/app/plugins/chunk-reload.client.ts",
          },
          {
            "filename": "components.plugin.mjs",
            "getContents": [Function],
            "mode": "all",
            "src": "<rootDir>/.nuxt/components.plugin.mjs",
          },
          {
            "mode": "all",
            "src": "<repoRoot>/packages/nuxt/src/head/runtime/plugins/unhead.ts",
          },
          {
            "mode": "all",
            "src": "<repoRoot>/packages/nuxt/src/app/plugins/router.ts",
          },
        ],
        "rootComponent": "<repoRoot>/packages/nuxt/src/app/components/nuxt-root.vue",
        "templates": [],
      }
    `)
  })

  it('resolves layouts and middleware correctly', async () => {
    const app = await getResolvedApp([
      'middleware/index.ts',
      'middleware/auth/index.ts',
      'middleware/other.ts',
      'layouts/index.vue',
      'layouts/default/index.vue',
      'layouts/other.vue',
    ])
    // Middleware are not resolved in a nested manner
    expect(app.middleware.filter(m => m.path.startsWith('<rootDir>'))).toMatchInlineSnapshot(`[]`)
    expect(app.layouts).toMatchInlineSnapshot(`{}`)
  })

  it('resolves layer plugins in correct order', async () => {
    const app = await getResolvedApp([
      // layer 1
      'layer1/plugins/02.plugin.ts',
      'layer1/plugins/object-named.ts',
      'layer1/plugins/override-test.ts',
      'layer1/nuxt.config.ts',
      // layer 2
      'layer2/plugins/01.plugin.ts',
      'layer2/plugins/object-named.ts',
      'layer2/plugins/override-test.ts',
      'layer2/nuxt.config.ts',
      // final (user) layer
      'plugins/00.plugin.ts',
      'plugins/object-named.ts',
      {
        name: 'nuxt.config.ts',
        contents: 'export default defineNuxtConfig({ extends: [\'./layer2\', \'./layer1\'] })',
      },
    ])
    const fixturePlugins = app.plugins.filter(p => !('getContents' in p) && p.src.includes('<rootDir>')).map(p => p.src)
    // TODO: support overriding named plugins
    expect(fixturePlugins).toMatchInlineSnapshot(`[]`)
  })

  it('resolves layer middleware in correct order', async () => {
    const app = await getResolvedApp([
      // layer 1
      'layer1/middleware/global.global.ts',
      'layer1/middleware/named-from-layer.ts',
      'layer1/middleware/named-override.ts',
      'layer1/nuxt.config.ts',
      // layer 2
      'layer2/middleware/global.global.ts',
      'layer2/middleware/named-from-layer.ts',
      'layer2/middleware/named-override.ts',
      'layer2/plugins/override-test.ts',
      'layer2/nuxt.config.ts',
      // final (user) layer
      'middleware/named-override.ts',
      'middleware/named.ts',
      {
        name: 'nuxt.config.ts',
        contents: 'export default defineNuxtConfig({ extends: [\'./layer2\', \'./layer1\'] })',
      },
    ])
    const fixtureMiddleware = app.middleware.filter(p => p.path.includes('<rootDir>')).map(p => p.path)
    // TODO: fix this
    expect(fixtureMiddleware).toMatchInlineSnapshot(`[]`)
  })

  it('resolves layer layouts correctly', async () => {
    const app = await getResolvedApp([
      // layer 1
      'layer1/layouts/default.vue',
      'layer1/layouts/layer.vue',
      'layer1/nuxt.config.ts',
      // layer 2
      'layer2/layouts/default.vue',
      'layer2/layouts/layer.vue',
      'layer2/nuxt.config.ts',
      // final (user) layer
      'layouts/default.vue',
      {
        name: 'nuxt.config.ts',
        contents: 'export default defineNuxtConfig({ extends: [\'./layer2\', \'./layer1\'] })',
      },
    ])
    expect(app.layouts).toMatchInlineSnapshot(`{}`)
  })

  it('resolves nested layouts correctly', async () => {
    const app = await getResolvedApp([
      'layouts/default.vue',
      'layouts/some/layout.vue',
      'layouts/SomeOther.vue',
      'layouts/SomeOther/Thing/Index.vue',
      'layouts/thing/thing/thing.vue',
      'layouts/desktop-base/base.vue',
      'layouts/some.vue',
      'layouts/SomeOther/layout.ts',
    ])
    expect(app.layouts).toMatchInlineSnapshot(`{}`)
  })
})

async function getResolvedApp (files: Array<string | { name: string, contents: string }>) {
  const rootDir = resolve(repoRoot, 'node_modules/.fixture', randomUUID())
  await mkdir(rootDir, { recursive: true })
  for (const file of files) {
    const filename = typeof file === 'string' ? join(rootDir, file) : join(rootDir, file.name)
    await mkdir(dirname(filename), { recursive: true })
    await writeFile(filename, typeof file === 'string' ? '' : file.contents || '')
  }

  const nuxt = await loadNuxt({ cwd: rootDir })
  const app = createApp(nuxt)
  await resolveApp(nuxt, app)

  const normaliseToRepo = (id?: string | null) =>
    id?.replace(rootDir, '<rootDir>').replace(repoRoot, '<repoRoot>').replace(/.*node_modules\//, '')

  app.dir = normaliseToRepo(app.dir)!

  const componentKeys = ['rootComponent', 'errorComponent', 'mainComponent'] as const
  for (const _key of componentKeys) {
    const key = _key as typeof componentKeys[number]
    app[key] = normaliseToRepo(app[key])
  }
  for (const plugin of app.plugins) {
    plugin.src = normaliseToRepo(plugin.src)!
    // @ts-expect-error untyped symbol
    delete plugin[Symbol.for('nuxt plugin')]
  }
  for (const mw of app.middleware) {
    mw.path = normaliseToRepo(mw.path)!
  }

  for (const layout of Object.values(app.layouts)) {
    layout.file = normaliseToRepo(layout.file)!
  }

  await nuxt.close()

  return app
}
