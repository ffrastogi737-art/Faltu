// Copies the pinned wllama (llama.cpp → WebAssembly) runtime into vendor/ so the app needs no bundler or CDN.
import { copyFileSync, mkdirSync } from 'node:fs';

const from = new URL('../node_modules/@wllama/wllama/esm/', import.meta.url);
const to = new URL('../vendor/wllama/', import.meta.url);
mkdirSync(to, { recursive: true });
copyFileSync(new URL('index.js', from), new URL('index.js', to));
copyFileSync(new URL('wasm/wllama.wasm', from), new URL('wllama.wasm', to));
copyFileSync(new URL('../LICENCE', from), new URL('LICENSE', to));
console.log('vendor/wllama updated');
