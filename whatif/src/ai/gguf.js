// Minimal GGUF header reader (v2/v3) for compatibility checks before loading a model.
// Reads only the metadata at the start of the file; tensors are never touched.

const TYPES = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 }; // fixed-size value types → bytes

export const FILE_TYPES = {
  0: 'F32', 1: 'F16', 2: 'Q4_0', 3: 'Q4_1', 7: 'Q8_0', 8: 'Q5_0', 9: 'Q5_1', 10: 'Q2_K', 11: 'Q3_K_S', 12: 'Q3_K_M', 13: 'Q3_K_L',
  14: 'Q4_K_S', 15: 'Q4_K_M', 16: 'Q5_K_S', 17: 'Q5_K_M', 18: 'Q6_K', 19: 'IQ2_XXS', 20: 'IQ2_XS', 21: 'Q2_K_S', 22: 'IQ3_XS', 23: 'IQ3_XXS',
  24: 'IQ1_S', 25: 'IQ4_NL', 26: 'IQ3_S', 27: 'IQ3_M', 28: 'IQ2_S', 29: 'IQ2_M', 30: 'IQ4_XS', 31: 'IQ1_M', 32: 'BF16',
};

// Architectures llama.cpp (and therefore wllama) runs that are sensible for this app.
export const KNOWN_ARCHS = ['llama', 'qwen2', 'qwen3', 'qwen2moe', 'qwen3moe', 'gemma', 'gemma2', 'gemma3', 'phi2', 'phi3', 'mistral', 'granite', 'olmo', 'olmo2', 'stablelm', 'smollm3', 'exaone', 'deepseek2', 'minicpm', 'internlm2', 'cohere2', 'falcon'];

class Reader {
  constructor(buf) { this.v = new DataView(buf); this.o = 0; this.dec = new TextDecoder(); }
  need(n) { if (this.o + n > this.v.byteLength) throw new RangeError('truncated'); }
  u32() { this.need(4); const x = this.v.getUint32(this.o, true); this.o += 4; return x; }
  u64() { this.need(8); const x = this.v.getBigUint64(this.o, true); this.o += 8; return Number(x); }
  str() { const n = this.u64(); this.need(n); const s = this.dec.decode(new Uint8Array(this.v.buffer, this.o, n)); this.o += n; return s; }
  scalar(t) {
    this.need(TYPES[t] ?? 0);
    const v = this.v; const o = this.o;
    const x = [() => v.getUint8(o), () => v.getInt8(o), () => v.getUint16(o, true), () => v.getInt16(o, true), () => v.getUint32(o, true), () => v.getInt32(o, true), () => v.getFloat32(o, true), () => v.getUint8(o) !== 0, null, null, () => Number(v.getBigUint64(o, true)), () => Number(v.getBigInt64(o, true)), () => v.getFloat64(o, true)][t]();
    this.o += TYPES[t];
    return x;
  }
  value(t) {
    if (t === 8) return this.str();
    if (t === 9) {
      const it = this.u32(); const n = this.u64();
      if (it === 8) { for (let i = 0; i < n; i++) this.str(); return { array: n }; } // skip big string arrays (vocab)
      if (TYPES[it] === undefined) throw new Error('bad array type');
      this.need(TYPES[it] * n); this.o += TYPES[it] * n; return { array: n };
    }
    if (TYPES[t] === undefined) throw new Error(`bad value type ${t}`);
    return this.scalar(t);
  }
}

/** buf: ArrayBuffer with the first few MB of the file. Returns parsed metadata (possibly partial). */
export function parseGGUFHeader(buf) {
  const r = new Reader(buf);
  if (r.u32() !== 0x46554747) throw new Error('Not a GGUF file (bad magic number)');
  const version = r.u32();
  if (version < 2 || version > 3) throw new Error(`Unsupported GGUF version ${version}`);
  const tensorCount = r.u64();
  const kvCount = r.u64();
  const kv = {};
  let complete = true;
  try {
    for (let i = 0; i < kvCount; i++) {
      const key = r.str();
      const t = r.u32();
      kv[key] = r.value(t);
    }
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    complete = false; // metadata continues past the slice we read; what we have is still valid
  }
  const arch = kv['general.architecture'] ?? null;
  const a = (k) => (arch ? kv[`${arch}.${k}`] ?? null : null);
  return {
    version, tensorCount, complete,
    architecture: arch,
    name: kv['general.name'] ?? null,
    license: kv['general.license'] ?? null,
    fileType: kv['general.file_type'] ?? null,
    quantization: FILE_TYPES[kv['general.file_type']] ?? null,
    contextLength: a('context_length'),
    blockCount: a('block_count'),
    embeddingLength: a('embedding_length'),
    headCount: a('attention.head_count'),
    headCountKv: a('attention.head_count_kv') ?? a('attention.head_count'),
    hasChatTemplate: typeof kv['tokenizer.chat_template'] === 'string' || !complete,
  };
}

const MAX_SINGLE_FILE = 2 * 1024 ** 3; // wllama/ArrayBuffer limit for one file

/** Compatibility verdict + rough memory estimate (weights + f16 KV cache + runtime overhead). */
export function assessModel(meta, fileSize, nCtx, deviceMemoryGB) {
  const problems = [];
  const notes = [];
  if (fileSize > MAX_SINGLE_FILE) problems.push('Single files over 2 GB cannot be loaded by the in-app runtime. Use a smaller quantization or a split GGUF.');
  if (!meta.architecture) problems.push('The file does not declare a model architecture.');
  else if (!KNOWN_ARCHS.includes(meta.architecture)) notes.push(`Architecture “${meta.architecture}” is not on the tested list; loading may fail.`);
  if (meta.quantization && /^(F32|F16|BF16)$/.test(meta.quantization)) notes.push('Unquantized weights are large and slow on phones; a Q4_K_M or Q5_K_M file is recommended.');
  if (meta.quantization && /^IQ/.test(meta.quantization)) notes.push('IQ quantizations run slowly in the WebAssembly runtime.');
  let kvBytes = null;
  if (meta.blockCount && meta.embeddingLength && meta.headCount) {
    const kvDim = meta.embeddingLength * ((meta.headCountKv || meta.headCount) / meta.headCount);
    kvBytes = 2 * meta.blockCount * nCtx * kvDim * 2;
  }
  const estimate = fileSize + (kvBytes ?? 0) + 150 * 1024 ** 2;
  if (deviceMemoryGB && estimate > deviceMemoryGB * 1024 ** 3 * 0.5) notes.push(`Needs about ${(estimate / 1024 ** 3).toFixed(1)} GB of memory, which is more than half of this device's reported ${deviceMemoryGB} GB.`);
  if (meta.contextLength && nCtx > meta.contextLength) problems.push(`Context length ${nCtx} exceeds the model's trained length ${meta.contextLength}.`);
  return { compatible: !problems.length, problems, notes, estimatedBytes: estimate, kvBytes };
}
