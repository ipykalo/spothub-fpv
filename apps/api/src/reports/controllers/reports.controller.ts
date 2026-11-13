import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { type CreateReportDto, createReportSchema } from '@spothub/shared';

import { type AuthenticatedUser, CurrentUser, ZodValidationPipe } from '../../common';
import { ReportsService } from '../reports.service';

/** A signed-in pilot reports a post or a comment. Nothing comes back but 204. */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  file(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createReportSchema)) body: CreateReportDto,
  ): Promise<void> {
    return this.reports.file(user.id, body);
  }
}
