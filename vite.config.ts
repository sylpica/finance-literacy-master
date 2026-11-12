import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages のサブパス配信を前提に相対パス（base: './'）を使う。
// これにより リポジトリ名が変わってもアセットパスとSWスコープが壊れない。
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      // 更新は自動適用する（prompt 方式の更新受付UIは持たないため、方式と実装を一致させる）
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '資産形成・金融教養マスター',
        short_name: '金融教養マスター',
        description: '株式・暗号資産を中心に、基礎から大学レベルまで学ぶ日本語の総合金融教養アプリ',
        lang: 'ja',
        display: 'standalone',
        background_color: '#0b1220',
        theme_color: '#0b1220',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,webmanifest,b64}'],
        // 要点まとめPDF（pdf64）の同梱分 2.31MB を precache 対象に含めるため上限を引き上げる
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
