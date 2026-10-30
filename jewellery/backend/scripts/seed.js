// Demo data for a fresh database: store settings, the 12 categories and sample products.
// Products normally come from the admin app; this only fills an empty catalogue so the
// customer app has something to show. Images are generated SVG artwork, replace with photos.
import { mkdir, writeFile } from 'node:fs/promises';
import { pool } from '../src/db.js';
import { migrate } from './migrate.js';
import { UPLOAD_DIR } from '../src/app.js';

const CATEGORIES = [
  ['earrings', 'Earrings', 'drops', 'Drop Earrings'], ['necklace-sets', 'Necklace Sets', 'necklace', 'Necklace Set'], ['rings', 'Rings', 'ring', 'Cocktail Ring'],
  ['bangles', 'Bangles', 'bangle', 'Bangle Pair'], ['bracelets', 'Bracelets', 'bracelet', 'Bracelet'], ['mangalsutra', 'Mangalsutra', 'mangalsutra', 'Mangalsutra'],
  ['pendant-sets', 'Pendant Sets', 'pendant', 'Pendant Set'], ['anklets', 'Anklets', 'anklet', 'Anklet Pair'], ['bridal-jewellery', 'Bridal Jewellery', 'necklace', 'Bridal Choker Set'],
  ['party-wear', 'Party Wear', 'drops', 'Statement Earrings'], ['daily-wear', 'Daily Wear', 'ring', 'Stackable Ring'], ['accessories', 'Accessories', 'pendant', 'Saree Brooch'],
];

const GEMS = { ruby: '#9b1b30', emerald: '#1f6b4f', sapphire: '#1d3d7a', pearl: '#efe8da', kundan: '#f4f0e6', onyx: '#1b1b1b', rose: '#c98a8f' };

function art(shape, gem, variant) {
  const g = GEMS[gem];
  const gold = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3dfae"/><stop offset=".5" stop-color="#c9a45c"/><stop offset="1" stop-color="#8f6a2a"/></linearGradient>
    <radialGradient id="s" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".25" stop-color="${g}"/><stop offset="1" stop-color="${g}" stop-opacity=".85"/></radialGradient>
    <radialGradient id="bg" cx=".5" cy=".4" r=".75"><stop offset="0" stop-color="#fffdf8"/><stop offset="1" stop-color="#efe6d4"/></radialGradient>`;
  const stone = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#s)" stroke="url(#g)" stroke-width="${r / 3}"/>`;
  const beads = (n, cx, cy, rx, ry, from, to, r) => Array.from({ length: n }, (_, i) => {
    const a = from + ((to - from) * i) / (n - 1);
    return `<circle cx="${cx + rx * Math.cos(a)}" cy="${cy + ry * Math.sin(a)}" r="${r}" fill="url(#g)"/>`;
  }).join('');
  const shapes = {
    ring: `<ellipse cx="400" cy="470" rx="150" ry="150" fill="none" stroke="url(#g)" stroke-width="34"/>${stone(400, 300, 62)}${stone(330, 330, 22)}${stone(470, 330, 22)}`,
    drops: [300, 500].map((x) => `<circle cx="${x}" cy="230" r="22" fill="url(#g)"/><path d="M${x} 260 C ${x - 80} 400, ${x - 70} 520, ${x} 560 C ${x + 70} 520, ${x + 80} 400, ${x} 260Z" fill="none" stroke="url(#g)" stroke-width="16"/>${stone(x, 470, 46 - variant * 6)}`).join(''),
    necklace: `<path d="M180 200 Q400 640 620 200" fill="none" stroke="url(#g)" stroke-width="10"/>${beads(13, 400, 230, 205, 300, 0.45, Math.PI - 0.45, 15)}${stone(400, 540, 52)}${stone(310, 500, 26)}${stone(490, 500, 26)}`,
    bangle: `<ellipse cx="400" cy="400" rx="230" ry="230" fill="none" stroke="url(#g)" stroke-width="44"/><ellipse cx="400" cy="400" rx="230" ry="230" fill="none" stroke="#fff8e5" stroke-width="4" stroke-dasharray="6 26"/>${beads(10, 400, 400, 230, 230, 0, Math.PI * 1.8, 13 + variant * 2)}`,
    bracelet: `${beads(16, 400, 410, 220, 160, 0, Math.PI * 2 - 0.39, 22)}${stone(400, 250, 34)}`,
    mangalsutra: `<path d="M190 180 Q400 650 610 180" fill="none" stroke="#1b1b1b" stroke-width="8" stroke-dasharray="2 12" stroke-linecap="round"/>${beads(9, 400, 210, 200, 290, 0.5, Math.PI - 0.5, 10)}<path d="M360 470 h80 l-40 120z" fill="url(#g)"/>${stone(400, 500, 26)}`,
    pendant: `<path d="M220 160 Q400 520 580 160" fill="none" stroke="url(#g)" stroke-width="7"/><path d="M400 400 l70 90 l-70 110 l-70 -110z" fill="url(#s)" stroke="url(#g)" stroke-width="14"/>${stone(400, 378, 18)}`,
    anklet: `<path d="M150 360 Q400 560 650 360" fill="none" stroke="url(#g)" stroke-width="8"/>${beads(11, 400, 300, 250, 220, 0.4, Math.PI - 0.4, 12)}${[260, 340, 400, 460, 540].map((x) => `<circle cx="${x}" cy="${x === 400 ? 560 : 535}" r="14" fill="url(#g)"/>`).join('')}`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><defs>${gold}</defs><rect width="800" height="800" fill="url(#bg)"/>${shapes[shape]}</svg>`;
}

const STYLES = [
  ['Rani', 'ruby', 'Hand-set ruby-tone stones on an antique gold finish, inspired by heirloom temple craft.'],
  ['Meher', 'emerald', 'Deep emerald-tone stones framed in champagne gold, made for festive evenings.'],
  ['Noor', 'pearl', 'Lustrous faux pearls and a soft gold polish for understated, everyday elegance.'],
  ['Aarohi', 'kundan', 'Kundan-style polki stones with fine meenakari detailing on the reverse.'],
  ['Zoya', 'sapphire', 'Midnight sapphire-tone crystals in a modern geometric setting.'],
  ['Ira', 'rose', 'Rose quartz tones and a delicate silhouette that pairs with western and ethnic looks.'],
];

async function seed() {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    throw new Error('Refusing to load demo data in production. Pass --force if you really want demo products.');
  }
  await migrate();
  const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM products');
  if (n > 0) return console.log('catalogue already has products, seed skipped');

  // demo identity: the owner replaces all of this from the admin app (Settings)
  await pool.query(
    `UPDATE store_settings SET shop_name = $1, tagline = $2, upi_id = $3, upi_payee_name = 'Demo Jewellery Store', upi_discount_percent = 3,
       delivery_charge_paise = 4900, free_delivery_min_paise = 99900, whatsapp_number = $4, support_phone = right($4, 10)`,
    [process.env.SHOP_NAME || 'Aabha Jewels', 'Artificial jewellery, crafted to be cherished', process.env.SHOP_UPI_ID || 'aabhajewels@upi',
      process.env.SHOP_WHATSAPP || '919999999999'],
  );
  await pool.query(
    `INSERT INTO offers (kind, title, subtitle, cta, link, sort_order) VALUES
       ('festival', 'The Festive Edit', 'Kundan, polki & temple classics', 'Shop Bridal', '/category/bridal-jewellery', 1),
       ('new_collection', 'New Season Drops', 'Fresh earrings for every evening', 'Explore', '/category/earrings', 2)`,
  );

  await mkdir(`${UPLOAD_DIR}/products`, { recursive: true });
  let sku = 100;
  for (const [i, [slug, name, shape, noun]] of CATEGORIES.entries()) {
    const catImg = `/uploads/products/cat-${slug}.svg`;
    await writeFile(`${UPLOAD_DIR}/products/cat-${slug}.svg`, art(shape, STYLES[i % STYLES.length][1], 0));
    const { rows: [cat] } = await pool.query('INSERT INTO categories (slug, name, image_url, sort_order) VALUES ($1,$2,$3,$4) RETURNING id', [slug, name, catImg, i]);
    for (let k = 0; k < 3; k++) {
      const [style, gem, desc] = STYLES[(i + k) % STYLES.length];
      const pname = `${style} ${noun}`;
      const pslug = `${style.toLowerCase()}-${slug}-${k + 1}`;
      const images = [];
      for (let v = 0; v < 3; v++) {
        const file = `products/${pslug}-${v}.svg`;
        await writeFile(`${UPLOAD_DIR}/${file}`, art(shape, v === 1 ? 'pearl' : gem, v));
        images.push(`/uploads/${file}`);
      }
      const original = (899 + ((i * 7 + k * 13) % 12) * 250) * 100;
      const selling = Math.round((original * (0.55 + ((i + k) % 4) * 0.1)) / 1000) * 1000 - 100;
      const tags = [['new_arrival', 'featured'], ['trending', 'offer'], ['best_seller']][k];
      await pool.query(
        `INSERT INTO products (sku, slug, name, category_id, description, original_price_paise, selling_price_paise, stock, images, specifications, tags, sold_count, created_at, is_demo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now() - make_interval(days => $13), true)`,
        [`AJ-${sku++}`, pslug, pname, cat.id, desc, original, selling, k === 2 && i % 5 === 0 ? 0 : 5 + ((i * 3 + k) % 20), images,
          { Material: 'Brass alloy', Plating: 'Micro gold plated', Stones: `${gem[0].toUpperCase()}${gem.slice(1)}-tone AD stones`, Weight: `${12 + i * 3 + k} g`, Care: 'Keep away from water and perfume; store in a zip pouch' },
          tags, (i * 11 + k * 17) % 60, i + k * 12],
      );
    }
  }
  await pool.query(`INSERT INTO notifications (customer_id, type, title, body, link) VALUES (NULL, 'promo', 'Save 3% with UPI', 'Pay online at checkout and get an instant 3% off.', '/')`);
  console.log('seeded demo catalogue');
}

await seed();
await pool.end();
