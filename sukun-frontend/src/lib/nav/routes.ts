/**
 * The URL contract for all 21 production screens (18_Frontend_Navigation_Integration.md
 * Route Table / Deep-link contract). None of these `.dc.html` files carry a
 * real inter-page router of their own — every path below is a new decision
 * made here, once, so every later integration step and both persistent nav
 * shells reference the same constant instead of a hand-typed string.
 * Screen IDs (H1-H10, C1-C3, PM1-PM3, RE1-RE5) match 17_/18_/02_Navigation_Map.md.
 */
export const SCREEN_PATHS = {
  // Guest
  H1_Landing: "/",
  H2_Signup: "/signup",
  H2_Login: "/login",
  H2_ResetPassword: "/reset-password",

  // Homeowner — discovery & visit (prospect or active)
  H3_Discovery: "/discovery",
  H4_ProjectDetails: (projectId: string) => `/discovery/${projectId}`,
  H5_VisitExperience: (visitId: string) => `/visits/${visitId}`,

  // Homeowner — activation & home
  H6_OwnerOnboarding: "/activate",
  H7_MyHome: "/home",
  H8_ReportJourney: "/reports/new",
  H9_MyReports: "/reports",
  H9_MyReportDetail: (reportId: string) => `/reports/${reportId}`,
  H10_WarrantyCenter: "/warranty",

  // Technician
  C1_ContractorTasks: "/contractor",
  C2_RepairDetails: (reportId: string) => `/contractor/repair/${reportId}`,
  C3_RepairHistory: "/contractor/history",

  // Project manager
  PM1_OperationsCenter: "/pm",
  PM3_ContractorPerformance: "/pm/contractors",

  // Shared (pm, company) — the single canonical report screen (D9)
  PM2_ReportMonitor: (reportId: string) => `/report-monitor/${reportId}`,

  // Company
  RE1_CompanyDashboard: "/company",
  RE2_ProjectsManagement: "/company/projects",
  RE2_ProjectsNew: "/company/projects/new",
  RE3_ProjectWorkspace: (projectId: string) => `/company/projects/${projectId}`,
  // RE4/RE5 are single pages with internal list/wizard/profile/transfer
  // screen state, exactly like their `.dc.html` source — deep links use a
  // `#<id-or-unit>` hash read on mount (`Sakn Homeowners/Technicians
  // Management.dc.html`'s own `componentDidMount`), not a path segment.
  RE4_HomeownersManagement: "/company/homeowners",
  RE4_HomeownerProfile: (idOrUnit: string) => `/company/homeowners#${idOrUnit}`,
  RE5_TechniciansManagement: "/company/technicians",
  RE5_TechnicianProfile: (idOrUnit: string) => `/company/technicians#${idOrUnit}`,
} as const;
