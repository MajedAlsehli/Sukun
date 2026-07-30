import { inspectionReportRepository } from './inspection-report.repository';
import { toInspectionReportDto } from './inspection-report.mapper';
import { visitRepository } from '../visits/visit.repository';
import { canCreateInspection } from '../visits/visit.types';
import { fileRepository } from '../files/file.repository';
import { aiGatewayPort } from '../ai/ai-gateway.port';
import { notificationService } from '../notifications/notification.service';
import { BusinessError, NotFoundError } from '../shared/errors';
import { writeAuditLog } from '../shared/audit.service';
import { CreateInspectionReportDto } from './inspection-report.dto';

interface RequestContext {
  ipAddress: string | null;
}

export const inspectionReportService = {
  // POST /api/inspection-reports - Flow 5 (Inspection Report)
  async create(dto: CreateInspectionReportDto, requesterId: string, ctx: RequestContext) {
    const visit = await visitRepository.findById(dto.visitId);
    if (!visit || visit.userId !== requesterId) {
      // INS-023: creator must equal Visit owner - hide existence otherwise.
      throw new NotFoundError('Visit not found', 'VISIT_NOT_FOUND');
    }

    // VIS-004/VIS-010/Decision 007: only during a Checked-In visit.
    if (!canCreateInspection(visit.status)) {
      throw new BusinessError(
        'Inspection Reports may only be created during a Checked-In visit',
        'VISIT_NOT_CHECKED_IN',
      );
    }

    if (visit.unitId !== dto.unitId) {
      throw new BusinessError('Unit does not match the visit', 'UNIT_VISIT_MISMATCH');
    }

    // INS-015: image upload completes before AI starts - files must already exist.
    const files = await fileRepository.findManyByIds(dto.images);
    if (files.length !== dto.images.length) {
      throw new NotFoundError('One or more uploaded files were not found', 'FILE_NOT_FOUND');
    }

    const report = await inspectionReportRepository.create({
      visitId: visit.id,
      unitId: visit.unitId,
      searchJourneyId: visit.searchJourneyId,
      location: dto.location,
      notes: dto.notes,
      fileIds: dto.images,
    });

    // INS-004/INS-039: every report requires AI analysis, no skipping the stage.
    // Routed through the AI Gateway port (System_Architecture.md #12) - the
    // stub logs for now; Task 008 implements the real 3-layer pipeline behind
    // this same call.
    await aiGatewayPort.enqueueInspectionAnalysis(report.id);

    await writeAuditLog({
      userId: requesterId,
      action: 'INSPECTION_REPORT_CREATED',
      entity: 'InspectionReport',
      entityId: report.id,
      ipAddress: ctx.ipAddress,
    });

    // NOT-002: inspection submission sends a notification. Flow 5's
    // Contractor/PM notifications still aren't wired - they'd fire once the
    // report is actually assigned (Task 009's repair.service.ts#assign), not
    // at submission time; flagged as remaining work in the task report.
    await notificationService.send(
      requesterId,
      'Inspection report submitted',
      'Your inspection report has been submitted and is being analyzed.',
    );

    return toInspectionReportDto(report);
  },

  async list(requesterId: string) {
    const reports = await inspectionReportRepository.findAllByUser(requesterId);
    return reports.map(toInspectionReportDto);
  },

  async getById(reportId: string, requesterId: string) {
    const report = await inspectionReportRepository.findById(reportId);
    if (!report) {
      throw new NotFoundError('Inspection report not found', 'REPORT_NOT_FOUND');
    }

    const visit = await visitRepository.findById(report.visitId);
    if (!visit || visit.userId !== requesterId) {
      // Visibility Rules: "Home Seeker -> Own Reports Only" - hide otherwise.
      throw new NotFoundError('Inspection report not found', 'REPORT_NOT_FOUND');
    }

    return toInspectionReportDto(report);
  },
};
