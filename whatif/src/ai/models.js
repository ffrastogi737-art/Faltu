// Model files live in the Origin Private File System (OPFS): private to this app, never bundled in the APK.

import { parseGGUFHeader } from './gguf.js';

export const CATALOG = [
  {
    id: 'qwen2.5-0.5b-q4km',
    name: 'Qwen2.5 0.5B Instruct (Q4_K_M)',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    size: 491400032,
    license: 'Apache-2.0',
    note: 'Recommended. Small enough for most phones with 4 GB RAM; reliable at filling the scenario schema.',
  },
  {
    id: 'qwen2.5-1.5b-q4km',
    name: 'Qwen2.5 1.5B Instruct (Q4_K_M)',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    size: 1117320736,
    license: 'Apache-2.0',
    note: 'Better explanations, slower. Use on phones with 6 GB RAM or more.',
  },
];

const DIR = 'models';
const HEADER_BYTES = 8 * 1024 * 1024;

export const opfsAvailable = () => typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory;

async function dir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR, { create: true });
}

export async function readModelHeader(blob) {
  return parseGGUFHeader(await blob.slice(0, Math.min(blob.size, HEADER_BYTES)).arrayBuffer());
}

/** Streams a ReadableStream into OPFS. Partial files are removed on failure or cancel. */
async function writeStream(fileName, stream, total, onProgress, signal) {
  const d = await dir();
  const handle = await d.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  const reader = stream.getReader();
  let loaded = 0;
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      loaded += value.byteLength;
      onProgress?.(loaded, total);
    }
    await writable.close();
    return loaded;
  } catch (e) {
    try { await writable.abort(); } catch { /* ignore */ }
    try { await d.removeEntry(fileName); } catch { /* ignore */ }
    try { reader.cancel(); } catch { /* ignore */ }
    throw e;
  }
}

/** Import a GGUF the user already has (e.g. downloaded by another app into Downloads), via the system file picker. */
export async function importModelFile(file, id, onProgress, signal) {
  const meta = await readModelHeader(file);
  const bytes = await writeStream(`${id}.gguf`, file.stream(), file.size, onProgress, signal);
  return { meta, bytes };
}

export async function downloadModel(entry, id, onProgress, signal) {
  const res = await fetch(entry.url, { signal });
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || entry.size;
  const bytes = await writeStream(`${id}.gguf`, res.body, total, onProgress, signal);
  if (entry.size && bytes !== entry.size) {
    await deleteModelFile(id);
    throw new Error(`Downloaded ${bytes} bytes but expected ${entry.size}. Try again.`);
  }
  const meta = await readModelHeader(await getModelFile(id));
  return { meta, bytes };
}

export async function getModelFile(id) {
  const d = await dir();
  return (await d.getFileHandle(`${id}.gguf`)).getFile();
}

export async function deleteModelFile(id) {
  const d = await dir();
  try { await d.removeEntry(`${id}.gguf`); } catch (e) { if (e.name !== 'NotFoundError') throw e; }
}

export async function storageEstimate() {
  try { return await navigator.storage.estimate(); } catch { return null; }
}
