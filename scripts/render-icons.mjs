#!/usr/bin/env node
/**
 * Renders the raster icons from the one source of the mark,
 * `apps/client/public/favicon.svg`:
 *
 * - `favicon.ico`: 48 px, for whatever asks for /favicon.ico by name. An ICO
 *   holding a PNG, which every browser in use reads.
 * - `apple-touch-icon.png`: 180 px, what iOS puts on a home screen.
 * - `logo.png`: 512 px, the publisher logo in a post's structured data.
 *
 * Run after changing the SVG: `node scripts/render-icons.mjs`. The link
 * preview, `share.jpg`, is a photo with the mark composited in once, by hand.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const publicDir = fileURLToPath(new URL('../apps/client/public/', import.meta.url));
const svg = readFileSync(join(publicDir, 'favicon.svg'));

/** The mark as a PNG of `size` pixels, drawn from the SVG at that size rather than scaled. */
const png = (size) =>
  sharp(svg, { density: (72 * size) / 64 })
    .resize(size, size)
    .png()
    .toBuffer();

/** A one-image ICO: a 6-byte header, one 16-byte entry, then the PNG itself. */
function icoOf(image, size) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(size, 6); // width
  header.writeUInt8(size, 7); // height
  header.writeUInt8(0, 8); // no palette
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(image.byteLength, 14);
  header.writeUInt32LE(22, 18); // where the image starts
  return Buffer.concat([header, image]);
}

writeFileSync(join(publicDir, 'favicon.ico'), icoOf(await png(48), 48));
writeFileSync(join(publicDir, 'apple-touch-icon.png'), await png(180));
writeFileSync(join(publicDir, 'logo.png'), await png(512));

console.log('favicon.ico, apple-touch-icon.png and logo.png rendered from favicon.svg');
