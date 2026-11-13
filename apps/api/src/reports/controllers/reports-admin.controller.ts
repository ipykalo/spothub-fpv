import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import {
  type ReportDto,
  type ResolveReportDto,
  resolveReportSchema,
} from '@spothub/shared';

import { type AuthenticatedUser, CurrentUser, ZodValidationPipe } from '../../common';
import { ReportsService } from '../reports.service';

/** The Admin page's reports. Admins only, checked by role in the service. */
@Controller('admin/reports')
export class ReportsAdminController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  list(@CurrentUser() viewer: AuthenticatedUser): Promise<ReportDto[]> {
    return this.reports.listOpen(viewer);
  }

  /** Closes it, and every other open report about the same post or comment; answers with what is left open. */
  @Patch(':id')
  resolve(
    @CurrentUser() viewer: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resolveReportSchema)) _body: ResolveReportDto,
  ): Promise<ReportDto[]> {
    return this.reports.resolve(viewer, id);
  }
}
