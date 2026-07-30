import { analyzeInspectionReport, validateRepair, analyzeWarrantyReport } from '../ai-gateway.service';
import { inspectionReportRepository } from '../../inspection-reports/inspection-report.repository';
import { repairRepository } from '../../repairs/repair.repository';
import { warrantyRepository } from '../../warranty/warranty.repository';
import { aiResultRepository } from '../ai-result.repository';
import { runDetectionLayer } from '../layers/detection.layer';
import { runClassificationLayer } from '../layers/classification.layer';
import { runRepairSuggestionLayer } from '../layers/repair-suggestion.layer';
import { runRepairValidationLayer } from '../layers/repair-validation.layer';
import { AIUnavailableError } from '../ai-gateway.types';
import { InspectionReportStatus } from '../../inspection-reports/inspection-report.types';
import { RepairStatus } from '../../repairs/repair.types';
import { WarrantyReportStatus } from '../../warranty/warranty.types';

jest.mock('../../inspection-reports/inspection-report.repository');
jest.mock('../../repairs/repair.repository');
jest.mock('../../warranty/warranty.repository');
jest.mock('../ai-result.repository');
jest.mock('../layers/detection.layer');
jest.mock('../layers/classification.layer');
jest.mock('../layers/repair-suggestion.layer');
jest.mock('../layers/repair-validation.layer');
jest.mock('../../shared/audit.service', () => ({ writeAuditLog: jest.fn() }));

const mockedReports = inspectionReportRepository as jest.Mocked<typeof inspectionReportRepository>;
const mockedResults = aiResultRepository as jest.Mocked<typeof aiResultRepository>;
const mockedDetection = runDetectionLayer as jest.MockedFunction<typeof runDetectionLayer>;
const mockedClassification = runClassificationLayer as jest.MockedFunction<typeof runClassificationLayer>;
const mockedRepairSuggestion = runRepairSuggestionLayer as jest.MockedFunction<typeof runRepairSuggestionLayer>;
const mockedRepairs = repairRepository as jest.Mocked<typeof repairRepository>;
const mockedRepairValidation = runRepairValidationLayer as jest.MockedFunction<typeof runRepairValidationLayer>;
const mockedWarranty = warrantyRepository as jest.Mocked<typeof warrantyRepository>;

const reportInProcessing = {
  id: 'report-1',
  visitId: 'visit-1',
  unitId: 'unit-1',
  searchJourneyId: 'journey-1',
  status: InspectionReportStatus.AI_PROCESSING,
  priority: null,
  location: 'Kitchen wall',
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  images: [
    {
      id: 'img-1',
      reportId: 'report-1',
      fileId: 'file-1',
      order: 0,
      createdAt: new Date(),
      file: {
        id: 'file-1',
        storageKey: 'x',
        url: '/files/x.jpg',
        hash: 'h',
        mimeType: 'image/jpeg',
        size: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
  ],
  aiResults: [],
};

beforeEach(() => {
  mockedReports.findById.mockResolvedValue(reportInProcessing as never);
});

describe('analyzeInspectionReport', () => {
  it('is a no-op when the report is not in AI_PROCESSING (idempotency guard)', async () => {
    mockedReports.findById.mockResolvedValue({
      ...reportInProcessing,
      status: InspectionReportStatus.ASSIGNED,
    } as never);

    await analyzeInspectionReport('report-1');

    expect(mockedDetection).not.toHaveBeenCalled();
  });

  it('goes straight to manual review when detection is unconfigured (no retries)', async () => {
    mockedDetection.mockResolvedValue(null);

    await analyzeInspectionReport('report-1');

    expect(mockedDetection).toHaveBeenCalledTimes(1);
    expect(mockedResults.create).toHaveBeenCalledWith(
      expect.objectContaining({ prediction: 'MANUAL_REVIEW_REQUIRED' }),
    );
    expect(mockedReports.updateAfterAnalysis).toHaveBeenCalledWith('report-1', {
      status: InspectionReportStatus.WAITING_MANUAL_REVIEW,
    });
  });

  it('goes straight to manual review on AIUnavailableError (no retries)', async () => {
    mockedDetection.mockResolvedValue({ detections: [{ label: 'crack', confidence: 80 }], modelVersion: 'v1' });
    mockedClassification.mockRejectedValue(new AIUnavailableError('no key'));

    await analyzeInspectionReport('report-1');

    expect(mockedClassification).toHaveBeenCalledTimes(1);
    expect(mockedReports.updateAfterAnalysis).toHaveBeenCalledWith('report-1', {
      status: InspectionReportStatus.WAITING_MANUAL_REVIEW,
    });
  });

  it('requires manual review when the final confidence is below threshold (AI-012)', async () => {
    mockedDetection.mockResolvedValue({ detections: [{ label: 'crack', confidence: 80 }], modelVersion: 'v1' });
    mockedClassification.mockResolvedValue({ defectType: 'crack', priority: 'MEDIUM', confidence: 70 });
    mockedRepairSuggestion.mockResolvedValue({ description: 'a crack', suggestedRepair: 'patch it', confidence: 40 });

    await analyzeInspectionReport('report-1');

    expect(mockedReports.updateAfterAnalysis).toHaveBeenCalledWith('report-1', {
      status: InspectionReportStatus.WAITING_MANUAL_REVIEW,
    });
  });

  it('completes successfully and assigns the report when confidence is high enough', async () => {
    mockedDetection.mockResolvedValue({ detections: [{ label: 'crack', confidence: 80 }], modelVersion: 'v1' });
    mockedClassification.mockResolvedValue({ defectType: 'crack', priority: 'HIGH', confidence: 85 });
    mockedRepairSuggestion.mockResolvedValue({ description: 'a crack', suggestedRepair: 'patch it', confidence: 90 });

    await analyzeInspectionReport('report-1');

    expect(mockedResults.create).toHaveBeenCalledWith(
      expect.objectContaining({ prediction: 'crack', confidence: 90, suggestedRepair: 'patch it' }),
    );
    expect(mockedReports.updateAfterAnalysis).toHaveBeenCalledWith('report-1', {
      status: InspectionReportStatus.ASSIGNED,
      priority: 'HIGH',
    });
  });

  // AI-011: confidence must be 0-100. Nothing validates the LLM's raw JSON
  // response before this fix - an out-of-range value would have been
  // persisted as-is.
  it('clamps an out-of-range confidence from the LLM into 0-100 (AI-011)', async () => {
    mockedDetection.mockResolvedValue({ detections: [{ label: 'crack', confidence: 80 }], modelVersion: 'v1' });
    mockedClassification.mockResolvedValue({ defectType: 'crack', priority: 'HIGH', confidence: 85 });
    mockedRepairSuggestion.mockResolvedValue({ description: 'a crack', suggestedRepair: 'patch it', confidence: 150 });

    await analyzeInspectionReport('report-1');

    expect(mockedResults.create).toHaveBeenCalledWith(expect.objectContaining({ confidence: 100 }));
  });

  it('retries a transient failure and succeeds on the next attempt (INS-033/034)', async () => {
    jest.useFakeTimers();
    try {
      mockedDetection
        .mockRejectedValueOnce(new Error('temporary failure'))
        .mockResolvedValueOnce({ detections: [{ label: 'crack', confidence: 80 }], modelVersion: 'v1' });
      mockedClassification.mockResolvedValue({ defectType: 'crack', priority: 'LOW', confidence: 80 });
      mockedRepairSuggestion.mockResolvedValue({ description: 'a crack', suggestedRepair: 'patch it', confidence: 80 });

      const promise = analyzeInspectionReport('report-1');
      await jest.advanceTimersByTimeAsync(30_000);
      await promise;

      expect(mockedDetection).toHaveBeenCalledTimes(2);
      expect(mockedReports.updateAfterAnalysis).toHaveBeenCalledWith('report-1', {
        status: InspectionReportStatus.ASSIGNED,
        priority: 'LOW',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('falls back to manual review after exhausting all retries (INS-007/INS-035)', async () => {
    jest.useFakeTimers();
    try {
      mockedDetection.mockRejectedValue(new Error('permanently down'));

      const promise = analyzeInspectionReport('report-1');
      // 4 retry delays between 5 attempts.
      for (let i = 0; i < 4; i++) {
        await jest.advanceTimersByTimeAsync(30_000);
      }
      await promise;

      expect(mockedDetection).toHaveBeenCalledTimes(5);
      expect(mockedReports.updateAfterAnalysis).toHaveBeenCalledWith('report-1', {
        status: InspectionReportStatus.WAITING_MANUAL_REVIEW,
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

const repairWithImages = {
  id: 'repair-1',
  reportId: 'report-1',
  technicianId: 'tech-1',
  status: RepairStatus.WAITING_VALIDATION,
  startedAt: new Date(),
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  images: [
    { id: 'i1', repairId: 'repair-1', type: 'BEFORE', fileId: 'f1', createdAt: new Date(), file: { id: 'f1', storageKey: 'before.jpg', url: '/files/before.jpg', hash: 'h', mimeType: 'image/jpeg', size: 1, createdAt: new Date(), updatedAt: new Date() } },
    { id: 'i2', repairId: 'repair-1', type: 'AFTER', fileId: 'f2', createdAt: new Date(), file: { id: 'f2', storageKey: 'after.jpg', url: '/files/after.jpg', hash: 'h', mimeType: 'image/jpeg', size: 1, createdAt: new Date(), updatedAt: new Date() } },
  ],
};

describe('validateRepair', () => {
  beforeEach(() => {
    mockedRepairs.findById.mockResolvedValue(repairWithImages as never);
  });

  it('is a no-op when the repair is not WAITING_VALIDATION (idempotency guard)', async () => {
    mockedRepairs.findById.mockResolvedValue({
      ...repairWithImages,
      status: RepairStatus.IN_PROGRESS,
    } as never);

    await validateRepair('repair-1');

    expect(mockedRepairValidation).not.toHaveBeenCalled();
  });

  it('always proceeds to WAITING_CUSTOMER_APPROVAL on success, regardless of the AI verdict (AI-002)', async () => {
    mockedRepairValidation.mockResolvedValue({ isResolved: false, confidence: 90, notes: 'still visible' });

    await validateRepair('repair-1');

    expect(mockedRepairs.updateStatus).toHaveBeenCalledWith(
      'repair-1',
      RepairStatus.WAITING_CUSTOMER_APPROVAL,
    );
  });

  it('proceeds to approval even when AI is unavailable - never blocks the human review gate', async () => {
    mockedRepairValidation.mockRejectedValue(new AIUnavailableError('no key'));

    await validateRepair('repair-1');

    expect(mockedRepairs.updateStatus).toHaveBeenCalledWith(
      'repair-1',
      RepairStatus.WAITING_CUSTOMER_APPROVAL,
    );
  });
});

const warrantyReportInAnalysis = {
  id: 'wreport-1',
  warrantyId: 'warranty-1',
  unitId: 'unit-1',
  homeownerId: 'homeowner-1',
  referenceNumber: 'WR-AAAAAAAA',
  status: WarrantyReportStatus.AI_ANALYSIS,
  priority: null,
  category: 'Plumbing',
  location: 'Bathroom',
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  images: [
    { id: 'i1', reportId: 'wreport-1', fileId: 'f1', order: 0, createdAt: new Date(), file: { id: 'f1', storageKey: 'x', url: '/files/x.jpg', hash: 'h', mimeType: 'image/jpeg', size: 1, createdAt: new Date(), updatedAt: new Date() } },
  ],
  aiResults: [],
};

describe('analyzeWarrantyReport', () => {
  beforeEach(() => {
    mockedWarranty.findReportById.mockResolvedValue(warrantyReportInAnalysis as never);
  });

  it('is a no-op when the report is not in AI_ANALYSIS (idempotency guard)', async () => {
    mockedWarranty.findReportById.mockResolvedValue({
      ...warrantyReportInAnalysis,
      status: WarrantyReportStatus.ASSIGNED,
    } as never);

    await analyzeWarrantyReport('wreport-1');

    expect(mockedDetection).not.toHaveBeenCalled();
  });

  it('moves to WAITING_MANUAL_REVIEW when detection is unconfigured', async () => {
    mockedDetection.mockResolvedValue(null);

    await analyzeWarrantyReport('wreport-1');

    expect(mockedWarranty.updateReportAfterAnalysis).toHaveBeenCalledWith('wreport-1', {
      status: WarrantyReportStatus.WAITING_MANUAL_REVIEW,
    });
  });

  it('completes successfully and assigns the report when confidence is high enough', async () => {
    mockedDetection.mockResolvedValue({ detections: [{ label: 'leak', confidence: 80 }], modelVersion: 'v1' });
    mockedClassification.mockResolvedValue({ defectType: 'leak', priority: 'HIGH', confidence: 85 });
    mockedRepairSuggestion.mockResolvedValue({ description: 'a leak', suggestedRepair: 'replace pipe', confidence: 90 });

    await analyzeWarrantyReport('wreport-1');

    expect(mockedResults.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'WARRANTY', warrantyReportId: 'wreport-1', prediction: 'leak' }),
    );
    expect(mockedWarranty.updateReportAfterAnalysis).toHaveBeenCalledWith('wreport-1', {
      status: WarrantyReportStatus.ASSIGNED,
      priority: 'HIGH',
    });
  });
});
