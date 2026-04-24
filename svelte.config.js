import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // precompress: serve gzip/brotli copies of static assets so LHCI
    // (and prod) get `uses-text-compression` for free.
    adapter: adapter({ precompress: true }),
  },
};

export default config;
