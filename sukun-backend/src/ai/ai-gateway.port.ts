import { logger } from '../shared/logger';
import { analyzeInspectionReport, validateRepair, analyzeWarrantyReport } from './ai-gateway.service';

// 01_System_Architecture.md #12 AI ARCHITECTURE: "Backend never communicates
// directly with AI models. Every request goes through AI Gateway." Callers
// (inspection-report.service.ts, repair.service.ts, warranty.service.ts) only
// ever see this port, never the individual layers/OpenAI client directly.
export interface AIGatewayPort {
  enqueueInspectionAnalysis(reportId: string): Promise<void>;
  enqueueRepairValidation(repairId: string): Promise<void>;
  enqueueWarrantyAnalysis(warrantyReportId: string): Promise<void>;
}

// Fire-and-forget: callers must not block on a pipeline that can legitimately
// take minutes across retries (INS-034: 30s interval x up to 5 attempts). No
// persistent queue is wired up yet (pg-boss needs a real DATABASE_URL) - this
// is the documented in-process stand-in; see Task 008 report.
function fireAndForget(label: string, promise: Promise<void>): void {
  void promise.catch((err) => {
    logger.error(`Unhandled error in AI Gateway background job: ${label}`, {
      error: err instanceof Error ? err.stack : err,
    });
  });
}

export const aiGatewayPort: AIGatewayPort = {
  async enqueueInspectionAnalysis(reportId: string) {
    fireAndForget('analyzeInspectionReport', analyzeInspectionReport(reportId));
  },

  async enqueueRepairValidation(repairId: string) {
    fireAndForget('validateRepair', validateRepair(repairId));
  },

  async enqueueWarrantyAnalysis(warrantyReportId: string) {
    fireAndForget('analyzeWarrantyReport', analyzeWarrantyReport(warrantyReportId));
  },
};
