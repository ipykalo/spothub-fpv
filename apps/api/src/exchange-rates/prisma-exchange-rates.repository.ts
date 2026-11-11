import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma';
import { ExchangeRatesRepository } from './abstract/exchange-rates.repository';
import type { RatesByDay } from './conversion';

const toDate = (day: string): Date => new Date(`${day}T00:00:00.000Z`);
const toDay = (date: Date): string => date.toISOString().slice(0, 10);

/** The only place in this module that knows Prisma exists. */
@Injectable()
export class PrismaExchangeRatesRepository extends ExchangeRatesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ratesAround(days: readonly string[]): Promise<RatesByDay> {
    if (days.length === 0) {
      return new Map();
    }

    const last = [...days].sort().at(-1) ?? days[0];
    // The latest day stored on or before the last one asked for, else the
    // earliest after it — what a day not fetched yet falls back on.
    const fallback =
      (await this.prisma.exchangeRate.findFirst({
        where: { day: { lte: toDate(last) } },
        orderBy: { day: 'desc' },
        select: { day: true },
      })) ??
      (await this.prisma.exchangeRate.findFirst({
        orderBy: { day: 'asc' },
        select: { day: true },
      }));

    const wanted = [...days.map(toDate), ...(fallback ? [fallback.day] : [])];
    const rows = await this.prisma.exchangeRate.findMany({
      where: { day: { in: wanted } },
    });

    const byDay = new Map<string, Map<string, number>>();

    for (const row of rows) {
      const day = toDay(row.day);
      const rates = byDay.get(day) ?? new Map<string, number>();
      rates.set(row.currency, row.uahPerUnit.toNumber());
      byDay.set(day, rates);
    }

    return byDay;
  }

  async storedDays(days: readonly string[]): Promise<ReadonlySet<string>> {
    if (days.length === 0) {
      return new Set();
    }

    const rows = await this.prisma.exchangeRate.findMany({
      where: { day: { in: days.map(toDate) } },
      distinct: ['day'],
      select: { day: true },
    });

    return new Set(rows.map((row) => toDay(row.day)));
  }

  async saveDay(day: string, rates: ReadonlyMap<string, number>): Promise<void> {
    await this.prisma.exchangeRate.createMany({
      data: [...rates].map(([currency, uahPerUnit]) => ({
        day: toDate(day),
        currency,
        uahPerUnit: new Prisma.Decimal(uahPerUnit),
      })),
      skipDuplicates: true,
    });
  }
}
