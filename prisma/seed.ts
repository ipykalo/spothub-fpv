/**
 * Demo inventory — one real part in every category.
 *
 * Deliberately NOT a migration. Migrations run at container startup on every
 * deploy, so demo stock in `prisma/migrations` would appear in production the
 * first time the app is deployed. Seed data is not a schema change; this runs
 * on purpose, by hand:
 *
 *   npm run db:seed          add anything missing
 *   npm run db:seed:undo     take it back out again
 *
 * Three rules it keeps, because the local database holds real builds and real
 * parts already:
 *
 * 1. **Additive.** It never truncates anything.
 * 2. **Idempotent.** A part is matched on owner + manufacturer + model, so a
 *    second run adds nothing.
 * 3. **Reversible, but careful.** `--undo` removes only the manufacturer/model
 *    pairs listed below, and refuses any part with a unit currently fitted to
 *    a build — deleting that would take the install history with it.
 *
 * It creates inventory only. Fitting a part to a build is left alone: those
 * are real builds, and fitting is worth testing by hand.
 *
 * On the data: these are real products with their real manufacturers, models,
 * specifications and street prices. They are not scraped. The project's
 * decision log rules out marketplace integration — there is no AliExpress API
 * without affiliate approval, and community scrapers are fragile and against
 * its terms — and inventing listing IDs would produce links that open the
 * wrong item. Each part carries an AliExpress *search* link, which resolves to
 * the real product and keeps working when a seller's listing goes away.
 */

import { PartCategory, PartCondition, PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

config();

const prisma = new PrismaClient();

/** AliExpress search, which survives a listing being pulled. */
function search(terms: string): string {
  return `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(terms)}`;
}

interface SeedPart {
  readonly category: PartCategory;
  readonly manufacturer: string;
  readonly model: string;
  /** How many physical units to create. */
  readonly quantity: number;
  readonly spec: Record<string, string | number | boolean>;
  /** Street price per unit, in USD — what AliExpress quotes. */
  readonly price: number;
  readonly notes?: string;
}

const PARTS: readonly SeedPart[] = [
  {
    category: PartCategory.FRAME,
    manufacturer: 'iFlight',
    model: 'Nazgul5 V3 Frame Kit 5 inch',
    quantity: 1,
    spec: {
      size_inch: 5,
      arm_mm: 5,
      material: 'T700 carbon fibre',
      weight_g: 118,
      mount: '30x30',
    },
    price: 42.99,
    notes:
      'Spare arms are sold separately and worth having before the first crash, not after.',
  },
  {
    category: PartCategory.MOTOR,
    manufacturer: 'T-Motor',
    model: 'Velox V2306 V3 2550KV',
    quantity: 4,
    spec: {
      kv: 2550,
      stator_size: '2306',
      shaft_mm: 5,
      weight_g: 33,
      cells: '4S-6S',
    },
    price: 21.9,
  },
  {
    category: PartCategory.ESC,
    manufacturer: 'HGLRC',
    model: 'Zeus 60A 4-in-1 BLHeli_32',
    quantity: 1,
    spec: {
      current_a: 60,
      protocol: '4-in-1',
      firmware: 'BLHeli_32',
      size: '30x30',
      cells: '3S-6S',
    },
    price: 45.99,
  },
  {
    category: PartCategory.FC,
    manufacturer: 'Matek Systems',
    model: 'F405-CTR',
    quantity: 1,
    spec: {
      mcu: 'STM32F405',
      gyro: 'MPU6000',
      uarts: 5,
      size: '30x30',
      osd: 'AT7456E',
    },
    price: 39.99,
  },
  {
    category: PartCategory.STACK,
    manufacturer: 'Diatone',
    model: 'Mamba Basic F405 MK4 + F50 50A Stack',
    quantity: 1,
    spec: {
      mcu: 'STM32F405',
      current_a: 50,
      firmware: 'BLHeli_S',
      size: '30x30',
      cells: '3S-6S',
    },
    price: 68.5,
    notes:
      'Flight controller and ESC as one unit — replacing half of it means replacing the stack.',
  },
  {
    category: PartCategory.VTX,
    manufacturer: 'RushFPV',
    model: 'Tank Ultimate Plus 5.8G 800mW',
    quantity: 1,
    spec: {
      power_mw: 800,
      band: '5.8GHz',
      protocol: 'SmartAudio 2.1',
      size: '20x20',
      connector: 'MMCX',
    },
    price: 39.99,
  },
  {
    category: PartCategory.CAMERA,
    manufacturer: 'Caddx',
    model: 'Ratel 2 1200TVL',
    quantity: 1,
    spec: {
      tvl: 1200,
      sensor: '1/1.8" Starlight CMOS',
      lens_mm: 2.1,
      ratio: '4:3 / 16:9',
      weight_g: 8.5,
    },
    price: 29.99,
  },
  {
    category: PartCategory.RX,
    manufacturer: 'RadioMaster',
    model: 'RP1 V2 ExpressLRS 2.4GHz Nano',
    quantity: 2,
    spec: {
      protocol: 'ExpressLRS',
      band: '2.4GHz',
      weight_g: 0.9,
      antenna: 'T-type',
    },
    price: 10.99,
  },
  {
    category: PartCategory.ANTENNA,
    manufacturer: 'Foxeer',
    model: 'Lollipop 4 Plus 5.8G RHCP',
    quantity: 2,
    spec: {
      band: '5.8GHz',
      polarisation: 'RHCP',
      connector: 'SMA',
      gain_dbi: 2.6,
      length_mm: 62,
    },
    price: 12.99,
  },
  {
    category: PartCategory.PROP,
    manufacturer: 'Gemfan',
    model: 'Hurricane 51466 3-blade',
    quantity: 8,
    spec: {
      size_inch: 5.1,
      pitch: 4.66,
      blades: 3,
      hub_mm: 5,
      material: 'polycarbonate',
    },
    price: 2.25,
    notes: 'Consumable. Eight is two sets, which is the smallest sensible order.',
  },
  {
    category: PartCategory.BATTERY,
    manufacturer: 'CNHL',
    model: 'Black Series 1500mAh 6S 100C',
    quantity: 2,
    spec: {
      capacity_mah: 1500,
      cells: 6,
      c_rating: 100,
      connector: 'XT60',
      weight_g: 245,
    },
    price: 32.99,
  },
  {
    category: PartCategory.OTHER,
    manufacturer: 'VIFLY',
    model: 'Finder 2 Lost Model Buzzer',
    quantity: 1,
    spec: {
      type: 'lost model buzzer',
      volume_db: 100,
      weight_g: 2.6,
      self_powered: true,
    },
    price: 8.99,
    notes:
      'Self-powered, so it still sounds after the quad has cut power in a field somewhere.',
  },
];

/**
 * Whose inventory to seed.
 *
 * Ownership is not optional anywhere in this codebase, so the script has to
 * resolve a real user rather than invent one. `--email=` wins; otherwise the
 * only user in the database is taken, and more than one is an error rather
 * than a guess.
 */
async function resolveOwner(): Promise<{ id: string; email: string }> {
  const flag = process.argv.find((arg) => arg.startsWith('--email='));

  if (flag) {
    const email = flag.slice('--email='.length);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new Error(`No user with the email ${email}. Sign in once first.`);
    }

    return user;
  }

  const users = await prisma.user.findMany({ take: 2 });
  const only = users.at(0);

  if (!only) {
    throw new Error(
      'No users yet. Sign in through the app once so there is an owner to attach parts to.',
    );
  }

  if (users.length > 1) {
    throw new Error(
      'More than one user. Say whose inventory this is: --email=you@example.com',
    );
  }

  return only;
}

async function seed(ownerId: string): Promise<void> {
  let added = 0;
  let skipped = 0;

  for (const part of PARTS) {
    const existing = await prisma.part.findFirst({
      where: { ownerId, manufacturer: part.manufacturer, model: part.model },
      select: { id: true },
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.part.create({
      data: {
        ownerId,
        category: part.category,
        manufacturer: part.manufacturer,
        model: part.model,
        spec: part.spec,
        notesMd: part.notes ?? null,
        units: {
          create: Array.from({ length: part.quantity }, () => ({
            condition: PartCondition.SERVICEABLE,
          })),
        },
        sources: {
          create: {
            vendor: 'AliExpress',
            url: search(`${part.manufacturer} ${part.model}`),
            price: part.price,
            currency: 'USD',
            isPurchase: true,
            quantity: part.quantity,
          },
        },
      },
    });

    added += 1;
    console.log(`  + ${part.manufacturer} ${part.model} (${part.quantity})`);
  }

  console.log(`\nAdded ${added}, already present ${skipped}.`);
}

/**
 * Removes only what this script knows it created.
 *
 * A part with a unit on a build is left alone and reported: deleting it would
 * cascade through `build_parts` and take real install history with it.
 */
async function undo(ownerId: string): Promise<void> {
  let removed = 0;
  const kept: string[] = [];

  for (const part of PARTS) {
    const existing = await prisma.part.findFirst({
      where: { ownerId, manufacturer: part.manufacturer, model: part.model },
      select: {
        id: true,
        units: {
          select: { installs: { where: { removedOn: null }, select: { id: true } } },
        },
      },
    });

    if (!existing) {
      continue;
    }

    const fitted = existing.units.some((unit) => unit.installs.length > 0);

    if (fitted) {
      kept.push(`${part.manufacturer} ${part.model}`);
      continue;
    }

    // Units and sources cascade from the part.
    await prisma.part.delete({ where: { id: existing.id } });
    removed += 1;
    console.log(`  - ${part.manufacturer} ${part.model}`);
  }

  console.log(`\nRemoved ${removed}.`);

  if (kept.length) {
    console.log(
      `Left alone because they are fitted to a build (take them off first):\n  ${kept.join('\n  ')}`,
    );
  }
}

async function main(): Promise<void> {
  const owner = await resolveOwner();
  const reverse = process.argv.includes('--undo');

  console.log(
    `${reverse ? 'Removing demo parts for' : 'Seeding demo parts for'} ${owner.email}\n`,
  );

  await (reverse ? undo(owner.id) : seed(owner.id));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
