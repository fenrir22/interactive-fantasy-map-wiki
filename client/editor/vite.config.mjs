import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: __dirname,
    base: '/editor-assets/',
    plugins: [react()],
    build: {
        outDir: path.join(__dirname, '..', '..', 'public', 'editor-assets'),
        emptyOutDir: true,
        sourcemap: false,
    },
    server: {
        port: 5173,
        proxy: {
            '/wiki': 'http://localhost:3000',
            '/api': 'http://localhost:3000',
            '/login': 'http://localhost:3000',
            '/logout': 'http://localhost:3000',
            '/map': 'http://localhost:3000',
        },
    },
});
