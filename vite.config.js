import { cpSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

function preserveStaticPages() {
  return {
    name: 'preserve-static-portfolio-pages',
    closeBundle() {
      const root = process.cwd();
      const output = resolve(root, 'dist');
      const directories = new Set(['assets', 'images', 'images_3d']);
      const excludedFiles = new Set(['index.html', 'sphere-cover.js', 'vite.config.js']);

      for (const entry of readdirSync(root, { withFileTypes: true })) {
        const staticFile = entry.isFile() && (/\.(?:html|css|js)$/.test(entry.name) || entry.name === 'favicon.ico');
        if (excludedFiles.has(entry.name) || (!staticFile && !directories.has(entry.name))) continue;
        cpSync(resolve(root, entry.name), resolve(output, entry.name), {
          recursive: true,
          force: false,
          errorOnExist: false,
        });
      }
    },
  };
}

export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist' },
  plugins: [preserveStaticPages()],
});
