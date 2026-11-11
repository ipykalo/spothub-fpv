#!/usr/bin/env node
/**
 * Downloads DB-IP's free "IP to Country Lite" database — which country an IP
 * address belongs to — and writes it, unzipped, where the API reads it.
 *
 *   node scripts/download-geoip.mjs [output path]
 *
 * The output defaults to GEOIP_COUNTRY_DB, else data/geoip/dbip-country-lite.mmdb.
 * DB-IP publishes a new file each month; early in a month it may not be out
 * yet, so last month's is taken instead. Licensed CC BY 4.0: the site credits
 * DB-IP on its About page.
 *
 * Nothing about any visitor is ever sent anywhere: the lookup is in this file.
 */
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

const output = resolve(
  process.argv[2] ?? process.env.GEOIP_COUNTRY_DB ?? 'data/geoip/dbip-country-lite.mmdb',
);

function month(offset) {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function download(stamp) {
  const url = `https://download.db-ip.com/free/dbip-country-lite-${stamp}.mmdb.gz`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });

  if (!response.ok) {
    return null;
  }

  return gunzipSync(Buffer.from(await response.arrayBuffer()));
}

for (const stamp of [month(0), month(-1)]) {
  const file = await download(stamp);

  if (file === null) {
    console.log(`geoip: no file for ${stamp} yet`);
    continue;
  }

  // Written beside and renamed over, so a reader never sees half a file.
  await mkdir(dirname(output), { recursive: true });
  await writeFile(`${output}.part`, file);
  await rename(`${output}.part`, output);
  console.log(`geoip: ${stamp}, ${String(file.byteLength)} bytes -> ${output}`);
  process.exit(0);
}

console.error('geoip: could not download the country database');
process.exit(1);
