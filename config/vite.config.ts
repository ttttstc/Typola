import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { perfStub } from './vite-plugin-perf-stub'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const nodeModule = String.raw`node_modules[\\/]`

// https://vite.dev/config/
export default defineConfig({
  root: projectRoot,
  base: './',
  plugins: [react(), perfStub()],
  // 实验候选仓库包含独立 demo HTML 与未安装依赖；开发服务器只扫描应用入口。
  optimizeDeps: {
    entries: ['index.html'],
  },
  server: {
    watch: {
      ignored: ['**/src-tauri/target/**'],
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'react-vendor',
              test: new RegExp(`${nodeModule}(react|react-dom)[\\/]`),
              priority: 50,
            },
            {
              name: 'editor-core-vendor',
              test: new RegExp(`${nodeModule}(@codemirror[\\/](state|view)|style-mod|w3c-keyname|crelt)[\\/]`),
              priority: 47,
            },
            {
              name: 'editor-language-vendor',
              test: new RegExp(`${nodeModule}(@codemirror[\\/](language|lang-markdown)|@lezer)[\\/]`),
              priority: 46,
            },
            {
              name: 'editor-ui-vendor',
              test: new RegExp(`${nodeModule}(@codemirror[\\/](autocomplete|commands|lint|search|theme-one-dark)|@uiw)[\\/]`),
              priority: 45,
            },
            {
              name: 'tauri-vendor',
              test: new RegExp(`${nodeModule}@tauri-apps[\\/]`),
              priority: 40,
            },
            {
              name: 'docx-vendor',
              test: new RegExp(`${nodeModule}(docx|mammoth|jszip|pako|saxes|xmlbuilder2|@xmldom)[\\/]`),
              priority: 35,
              maxSize: 450_000,
            },
            {
              name: 'vditor-vendor',
              test: new RegExp(`${nodeModule}vditor[\\/]`),
              priority: 30,
              maxSize: 450_000,
            },
            {
              name: 'ui-vendor',
              test: new RegExp(`${nodeModule}lucide-react[\\/]`),
              priority: 25,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['src/experimental/cm6-editor-spike/candidates/**'],
    setupFiles: ['./src/test/setupVitest.ts'],
    server: {
      deps: {
        inline: ['@atomic-editor/editor'],
      },
    },
    deps: {
      optimizer: {
        client: {
          include: ['@atomic-editor/editor'],
        },
      },
    },
  },
})
