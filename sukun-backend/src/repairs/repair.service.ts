import { TechnicianStatus } from '@prisma/client';
import { repairRepository } from './repair.repository';
import { toRepairDto } from './repair.mapper';
import { assertValidTransition, canUploadImages, RepairStatus } from './repair.types';
import { inspectionReportRepository } from '../inspection-reports/inspection-report.repository';
import { visitRepository } from '../visits/visit.repository';
import { unitRepository } from '../units/unit.repository';
import { buildingRepository } from '../buildings/building.repository';
import { technicianRepository } from '../technicians/technician.repository';
import { projectManagerRepository } from '../project-managers/project-manager.repository';
import { fileRepository } from '../files/file.repository';
import { aiGatewayPort } from '../ai/ai-gateway.port';
import { notificationService } from '../notifications/notification.service';
import { AuthorizationError, BusinessError, NotFoundError } from '../shared/errors';
import { writeAuditLog } from '../shared/audit.service';
import { InspectionReportStatus } from '../inspection-reports/inspection-report.types';
import { AssignRepairDto } from './repair.dto';

interface RequestContext {
  ipAddress: string | null;
}

async function requireOwnRepair(repairId: string, technicianUserId: string) {
  const technician = await technicianRepository.findByUserId(technicianUserId);
  if (!technician) {
    throw new AuthorizationError('This account is not registered as a technician.');
  }
  const repair = await repairRepository.findById(repairId);
  if (!repair || repair.technicianId !== technician.id) {
    // TEC-004: technician only sees assigned reports/repairs - hide otherwise.
    throw new NotFoundError('Repair not found', 'REPAIR_NOT_FOUND');
  }
  return repair;
}

export const repairService = {
  // POST /api/repairs (not itemized in Task 009's endpoint list, but "Assign
  // Repair" is a real PM permission in 14_Permissions_Matrix.md and nothing
  // else in the module can function without it - same rationale as the
  // Technician/ProjectManager infra built alongside this task).
  async assign(dto: AssignRepairDto, requesterUserId: string, ctx: RequestContext) {
    const pm = await projectManagerRepository.findByUserId(requesterUserId);
    if (!pm) {
      throw new AuthorizationError('This account is not registered as a project manager.');
    }

    const report = await inspectionReportRepository.findById(dto.reportId);
    if (!report) {
      throw new NotFoundError('Inspection report not found', 'REPORT_NOT_FOUND');
    }
    if (report.status !== InspectionReportStatus.ASSIGNED) {
      throw new BusinessError(
        'Report is not ready for repair assignment',
        'REPORT_NOT_READY_FOR_ASSIGNMENT',
      );
    }

    const unit = await unitRepository.findById(report.unitId);
    const building = unit ? await buildingRepository.findById(unit.buildingId) : null;
    if (!building || building.projectId !== pm.projectId) {
      // PM-002: Project Manager views/manages assigned project only.
      throw new AuthorizationError('This report is outside your assigned project.');
    }

    const technician = await technicianRepository.findById(dto.technicianId);
    if (!technician || technician.projectId !== pm.projectId) {
      throw new BusinessError(
        'Technician does not belong to this project',
        'TECHNICIAN_PROJECT_MISMATCH',
      );
    }
    // Confirmed gap: nothing previously stopped a deactivated technician from
    // receiving new repair assignments.
    if (technician.status === TechnicianStatus.INACTIVE) {
      throw new BusinessError('Technician is inactive', 'TECHNICIAN_INACTIVE');
    }

    const existing = await repairRepository.findByReportId(dto.reportId);
    if (existing) {
      throw new BusinessError('This report already has a repair assigned', 'REPAIR_ALREADY_EXISTS');
    }

    const repair = await repairRepository.create({
      reportId: dto.reportId,
      technicianId: dto.technicianId,
    });

    await writeAuditLog({
      userId: requesterUserId,
      action: 'REPAIR_ASSIGNED',
      entity: 'Repair',
      entityId: repair.id,
      ipAddress: ctx.ipAddress,
    });

    // NOT: contractor notification deferred to Task 012.
    return toRepairDto(repair);
  },

  // POST /api/repairs/{id}/start
  async start(repairId: string, technicianUserId: string, ctx: RequestContext) {
    const repair = await requireOwnRepair(repairId, technicianUserId);
    assertValidTransition(repair.status, RepairStatus.IN_PROGRESS);

    const updated = await repairRepository.updateStatus(repairId, RepairStatus.IN_PROGRESS, {
      startedAt: new Date(),
    });

    await inspectionReportRepository.updateAfterAnalysis(repair.reportId, {
      status: InspectionReportStatus.REPAIR_IN_PROGRESS,
    });

    await writeAuditLog({
      userId: technicianUserId,
      action: 'REPAIR_STARTED',
      entity: 'Repair',
      entityId: repairId,
      ipAddress: ctx.ipAddress,
    });

    return toRepairDto(updated);
  },

  // POST /api/repairs/{id}/before-images and /after-images
  async uploadImages(
    repairId: string,
    type: 'BEFORE' | 'AFTER',
    fileIds: string[],
    technicianUserId: string,
    ctx: RequestContext,
  ) {
    const repair = await requireOwnRepair(repairId, technicianUserId);
    if (!canUploadImages(repair.status)) {
      throw new BusinessError('Repair is not in progress', 'REPAIR_NOT_IN_PROGRESS');
    }

    const files = await fileRepository.findManyByIds(fileIds);
    if (files.length !== fileIds.length) {
      throw new NotFoundError('One or more uploaded files were not found', 'FILE_NOT_FOUND');
    }

    await repairRepository.addImages(repairId, type, fileIds);

    await writeAuditLog({
      userId: technicianUserId,
      action: type === 'BEFORE' ? 'REPAIR_BEFORE_IMAGES_UPLOADED' : 'REPAIR_AFTER_IMAGES_UPLOADED',
      entity: 'Repair',
      entityId: repairId,
      ipAddress: ctx.ipAddress,
    });

    const updated = await repairRepository.findById(repairId);
    return toRepairDto(updated!);
  },

  // POST /api/repairs/{id}/complete - REP-005: both before and after images required.
  async complete(repairId: string, technicianUserId: string, ctx: RequestContext) {
    const repair = await requireOwnRepair(repairId, technicianUserId);
    if (!canUploadImages(repair.status)) {
      throw new BusinessError('Repair is not in progress', 'REPAIR_NOT_IN_PROGRESS');
    }

    const hasBefore = repair.images.some((img) => img.type === 'BEFORE');
    const hasAfter = repair.images.some((img) => img.type === 'AFTER');
    if (!hasBefore) throw new BusinessError('Before images are required', 'MISSING_BEFORE_IMAGES');
    if (!hasAfter) throw new BusinessError('After images are required', 'MISSING_AFTER_IMAGES');

    assertValidTransition(repair.status, RepairStatus.WAITING_VALIDATION);
    const updated = await repairRepository.updateStatus(repairId, RepairStatus.WAITING_VALIDATION);

    // REP-006/007: AI validation starts, routed through the AI Gateway port.
    await aiGatewayPort.enqueueRepairValidation(repairId);

    await writeAuditLog({
      userId: technicianUserId,
      action: 'REPAIR_SUBMITTED_FOR_VALIDATION',
      entity: 'Repair',
      entityId: repairId,
      ipAddress: ctx.ipAddress,
    });

    // NOT-003: repair completion sends a notification, to the report creator.
    const report = await inspectionReportRepository.findById(repair.reportId);
    const visit = report ? await visitRepository.findById(report.visitId) : null;
    if (visit) {
      await notificationService.send(
        visit.userId,
        'Repair completed',
        'Your repair has been completed and is awaiting your approval.',
      );
    }

    return toRepairDto(updated);
  },

  // POST /api/repairs/{id}/approve - Flow 7: "Only creator may approve."
  async approve(
    repairId: string,
    approved: boolean,
    reason: string | undefined,
    requesterUserId: string,
    ctx: RequestContext,
  ) {
    const repair = await repairRepository.findById(repairId);
    if (!repair) {
      throw new NotFoundError('Repair not found', 'REPAIR_NOT_FOUND');
    }

    const report = await inspectionReportRepository.findById(repair.reportId);
    const visit = report ? await visitRepository.findById(report.visitId) : null;
    if (!visit || visit.userId !== requesterUserId) {
      throw new NotFoundError('Repair not found', 'REPAIR_NOT_FOUND');
    }

    if (repair.status !== RepairStatus.WAITING_CUSTOMER_APPROVAL) {
      throw new BusinessError(
        'Repair is not awaiting customer approval',
        'REPAIR_NOT_AWAITING_APPROVAL',
      );
    }

    if (approved) {
      assertValidTransition(repair.status, RepairStatus.COMPLETED);
      const updated = await repairRepository.updateStatus(repairId, RepairStatus.COMPLETED, {
        completedAt: new Date(),
      });
      // INS-008: closed reports become immutable.
      await inspectionReportRepository.updateAfterAnalysis(repair.reportId, {
        status: InspectionReportStatus.CLOSED,
      });
      await writeAuditLog({
        userId: requesterUserId,
        action: 'REPAIR_APPROVED',
        entity: 'Repair',
        entityId: repairId,
        ipAddress: ctx.ipAddress,
      });
      return toRepairDto(updated);
    }

    // REP-009/state machine: Rejected is a transient branch back to In Progress,
    // not a resting state - technician must redo the work. Validate both hops
    // (-> REJECTED, then REJECTED ->) even though only the final state persists.
    assertValidTransition(repair.status, RepairStatus.REJECTED);
    assertValidTransition(RepairStatus.REJECTED, RepairStatus.IN_PROGRESS);
    const updated = await repairRepository.updateStatus(repairId, RepairStatus.IN_PROGRESS);
    await inspectionReportRepository.updateAfterAnalysis(repair.reportId, {
      status: InspectionReportStatus.REPAIR_IN_PROGRESS,
    });
    await writeAuditLog({
      userId: requesterUserId,
      action: 'REPAIR_REJECTED',
      entity: 'Repair',
      entityId: repairId,
      ipAddress: ctx.ipAddress,
      metadata: reason ? { reason } : undefined,
    });
    return toRepairDto(updated);
  },
};
