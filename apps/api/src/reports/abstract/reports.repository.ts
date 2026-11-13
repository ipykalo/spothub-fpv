import type { FileReportData, OpenReportEntity, ReportRef } from '../report.entity';

/**
 * Persistence contract for reports.
 *
 * Filing takes a subject the service has already asked its owning module
 * about. Reading and closing are for an admin, checked in the service.
 */
export abstract class ReportsRepository {
  /**
   * Files the reporter's report about the subject, or — if they reported it
   * before — replaces its reason and details and opens it again.
   */
  abstract file(ref: ReportRef, data: FileReportData): Promise<void>;

  /** Every open report, newest first, with what it is about joined in. */
  abstract findOpen(): Promise<OpenReportEntity[]>;

  /**
   * Closes the report and every other open one about the same post or
   * comment, recording the admin who did. False when there is no such open
   * report.
   */
  abstract resolveWithSubject(reportId: string, adminId: string): Promise<boolean>;
}
