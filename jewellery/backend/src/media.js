import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { httpError } from './pricing.js';

// Staff uploads: real photos are re-encoded (EXIF rotation applied, metadata stripped, resized
// for the web) so a bad or huge file never reaches customers as-is.
const KINDS = {
  product: { max: 1600, quality: 86 },
  category: { max: 900, quality: 84 },
  offer: { max: 1600, quality: 84 },
  logo: { max: 800, quality: 90 },
  splash: { max: 1024, quality: 90 },
  icon: { icon: true },
  video: { video: true },
};

function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image';
  if (buf.subarray(4, 8).toString() === 'ftyp') return buf.subarray(8, 10).toString() === 'qt' ? 'mov' : 'mp4';
  if (buf.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'webm';
  return null;
}

export async function saveUpload(uploadDir, kind, buf) {
  const spec = KINDS[kind];
  if (!spec) throw httpError(400, 'Unknown upload kind');
  if (!Buffer.isBuffer(buf) || buf.length === 0) throw httpError(400, 'Empty upload');
  const type = sniff(buf);
  const name = `${Date.now()}-${randomBytes(6).toString('hex')}`;
  await mkdir(`${uploadDir}/${kind}`, { recursive: true });
  const save = async (file, data) => (await writeFile(`${uploadDir}/${kind}/${file}`, data), `/uploads/${kind}/${file}`);

  if (spec.video) {
    if (!['mp4', 'mov', 'webm'].includes(type)) throw httpError(400, 'Video must be MP4, MOV or WebM');
    if (buf.length > 50 * 1024 * 1024) throw httpError(400, 'Video must be under 50 MB');
    return { url: await save(`${name}.${type}`, buf) };
  }
  if (type !== 'image') throw httpError(400, 'Image must be JPG, JPEG, PNG or WebP');
  if (buf.length > 20 * 1024 * 1024) throw httpError(400, 'Image must be under 20 MB');
  let img;
  try {
    img = sharp(buf, { limitInputPixels: 80e6 }).rotate();
    const meta = await img.metadata();
    if (spec.icon) {
      if (Math.abs(meta.width - meta.height) > Math.min(meta.width, meta.height) * 0.1) throw httpError(400, 'App icon must be square');
      if (Math.min(meta.width, meta.height) < 192) throw httpError(400, 'App icon must be at least 192×192 pixels (512×512 recommended)');
      const [i192, i512] = await Promise.all([192, 512].map((s) => img.clone().resize(s, s, { fit: 'cover' }).png().toBuffer()));
      await save(`${name}-192.png`, i192);
      return { url: await save(`${name}-512.png`, i512) };
    }
    const out = await img.resize({ width: spec.max, height: spec.max, fit: 'inside', withoutEnlargement: true }).webp({ quality: spec.quality }).toBuffer();
    return { url: await save(`${name}.webp`, out) };
  } catch (err) {
    if (err.status) throw err;
    throw httpError(400, 'Could not read this image. Please upload a JPG, PNG or WebP photo.');
  }
}

// /uploads/icon/x-512.png -> /uploads/icon/x-192.png
export const iconVariant = (url, size) => url?.replace(/-512\.png$/, `-${size}.png`);
