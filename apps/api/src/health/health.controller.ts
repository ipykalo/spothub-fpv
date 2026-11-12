import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '../common';
import { PrismaService } from '../prisma';

interface HealthResponse {
  readonly status: 'ok' | 'degraded';
  readonly database: 'up' | 'down';
  readonly uptimeSeconds: number;
}

/** Used by docker-compose and any future orchestrator to decide readiness. */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Asked by the container's health check and the uptime monitor, never
  // by anyone worth limiting.
  @SkipThrottle()
  @Public()
  @Get()
  async check(): Promise<HealthResponse> {
    const database = await this.pingDatabase();

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  private async pingDatabase(): Promise<'up' | 'down'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }
}
