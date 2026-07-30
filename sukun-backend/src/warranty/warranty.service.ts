import crypto from 'crypto';
import { warrantyRepository } from './warranty.repository';
import { toWarrantyDto, toWarrantyReportDto } from './warranty.mapper';
import { isWarrantyActive, WarrantyReportStatus } from './warranty.types';
import { homeownerRepository } from '../homeowners/homeowner.repository';
import { fileRepository } from '../files/file.repository';
import { aiGatewayPort } from '../ai/ai-gateway.port';
import { BusinessError, NotFoundError } from '../shared/errors';
import { writeAuditLog } from '../shared/audit.service';
import { CreateWarrantyReportDto } from './warranty.dto';

interface RequestContext {
  ipAddress: string | null;
}

// WAR-011/012: Warranty Report requires active, verified ownership.
async function requireActiveOwner(unitId: string, requesterId: string) {
  const ownership = await homeownerRepository.findActiveOwnershipByUnit(unitId);
  if (!ownership || ownership.userId !== requesterId) {
    throw new NotFoundError('Warranty not found', 'WARRANTY_NOT_FOUND');
  }
}

function generateReferenceNumber(): string {
  return `WR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

export const warrantyService = {
  // GET /api/warranty - "Returns Coverage, Expiration, Eligibility"
  async getByUnit(unitId: string, requesterId: string) {
    await requireActiveOwner(unitId, requesterId);
    const warranty = await warrantyRepository.findByUnitId(unitId);
    if (!warranty) {
      throw new NotFoundError('Warranty not found', 'WARRANTY_NOT_FOUND');
    }
    return toWarrantyDto(warranty);
  },

  // POST /api/warranty-reports - WAR-017: only a Homeowner creates a report.
  async createReport(dto: CreateWarrantyReportDto, requesterId: string, ctx: RequestContext) {
    await requireActiveOwner(dto.unitId, requesterId);

    const warranty = await warrantyRepository.findByUnitId(dto.unitId);
    if (!warranty) {
      throw new NotFoundError('Warranty not found', 'WARRANTY_NOT_FOUND');
    }
    // WAR-002/003/014/015: eligibility checked before creation; expired blocks it.
    if (!isWarrantyActive(warranty)) {
      throw new BusinessError('Warranty has expired', 'WARRANTY_EXPIRED');
    }

    // WAR-016: cannot overlap another active claim on the same unit.
    const existingReports = await warrantyRepository.findReportsByHomeowner(requesterId);
    const hasOpenClaim = existingReports.some(
      (r) => r.unitId === dto.unitId && r.status !== WarrantyReportStatus.CLOSED,
    );
    if (hasOpenClaim) {
      throw new BusinessError(
        'An active warranty claim already exists for this unit',
        'OVERLAPPING_WARRANTY_CLAIM',
      );
    }

    const files = await fileRepository.findManyByIds(dto.images);
    if (files.length !== dto.images.length) {
      throw new NotFoundError('One or more uploaded files were not found', 'FILE_NOT_FOUND');
    }

    const report = await warrantyRepository.createReport({
      warrantyId: warranty.id,
      unitId: dto.unitId,
      homeownerId: requesterId,
      referenceNumber: generateReferenceNumber(),
      category: dto.category,
      location: dto.location,
      notes: dto.notes,
      fileIds: dto.images,
    });

    // WAR-009: warranty validation (AI analysis) precedes technician assignment.
    await aiGatewayPort.enqueueWarrantyAnalysis(report.id);

    await writeAuditLog({
      userId: requesterId,
      action: 'WARRANTY_REPORT_CREATED',
      entity: 'WarrantyReport',
      entityId: report.id,
      ipAddress: ctx.ipAddress,
    });

    return toWarrantyReportDto(report);
  },

  async listReports(requesterId: string) {
    const reports = await warrantyRepository.findReportsByHomeowner(requesterId);
    return reports.map(toWarrantyReportDto);
  },

  async getReportById(reportId: string, requesterId: string) {
    const report = await warrantyRepository.findReportById(reportId);
    if (!report || report.homeownerId !== requesterId) {
      throw new NotFoundError('Warranty report not found', 'WARRANTY_REPORT_NOT_FOUND');
    }
    return toWarrantyReportDto(report);
  },
};
