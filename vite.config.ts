import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Caminhos relativos: o mesmo build serve no GitHub Pages (/.batide/), em qualquer
// subpasta e, depois, dentro do app Tauri.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      // Versão nova só entra quando a pessoa pede (aviso na barra de status): recarregar
      // sozinho no meio do uso perderia o que não foi salvo.
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Batide',
        short_name: 'Batide',
        description: 'IDE leve e rápida, no navegador e no desktop',
        theme_color: '#050506',
        background_color: '#050506',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ttf,woff2}'],
        // O Monaco tem arquivos grandes; precisam caber no cache para funcionar offline.
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        // São ~1250 ícones de arquivo: entram no cache conforme aparecem, não todos na instalação.
        globIgnores: ['file-icons/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/file-icons/'),
            handler: 'CacheFirst',
            options: { cacheName: 'file-icons', expiration: { maxEntries: 2000 } },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 8000,
    // Ícones sempre como arquivos (cacheados sob demanda), nunca embutidos no JS.
    assetsInlineLimit: (file) => (file.includes('material-icon-theme') ? false : undefined),
    rollupOptions: {
      output: {
        assetFileNames: (asset) =>
          asset.originalFileNames?.some((f) => f.includes('material-icon-theme/icons/'))
            ? 'file-icons/[name]-[hash][extname]'
            : 'assets/[name]-[hash][extname]',
      },
    },
  },
})
