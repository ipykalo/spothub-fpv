import { Module } from '@nestjs/common';

import { CommentsModule } from '../comments';
import { PostsModule } from '../posts';
import { ReportsRepository } from './abstract/reports.repository';
import { ReportsAdminController } from './controllers/reports-admin.controller';
import { ReportsController } from './controllers/reports.controller';
import { PrismaReportsRepository } from './prisma-reports.repository';
import { ReportsService } from './reports.service';

/**
 * Reports: a pilot flags a post or a comment, and an admin reads and closes
 * them on the Admin page.
 *
 * Its own bounded context, at the top of the graph — `reports → posts`,
 * `reports → comments` — asking each, through its facade, whether the
 * reporter may see what they report and who wrote it. What an admin reads is
 * joined inside its own repository. Nothing depends on it, so it exports
 * nothing.
 */
@Module({
  imports: [PostsModule, CommentsModule],
  controllers: [ReportsController, ReportsAdminController],
  providers: [
    ReportsService,
    { provide: ReportsRepository, useClass: PrismaReportsRepository },
  ],
})
export class ReportsModule {}
