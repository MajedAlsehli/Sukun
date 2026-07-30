import { Building, Company, HomeownerActivation, Ownership, Project, Unit, User, Warranty } from '@prisma/client';
import { env } from '../config/env';
import { isWarrantyActive } from '../warranty/warranty.types';

export interface HomeownerActivationDto {
  id: string;
  unitId: string;
  status: string;
  expiresAt: Date;
  // Task 5 (decisions.md F15): mirrors technician.mapper.ts's
  // TechnicianInvitationInfo env-gating exactly - the raw activation code is
  // a real credential (it, alone, plus a chosen password, activates the
  // account) and must never appear in a production response merely because
  // no real delivery provider is configured. Non-production environments get
  // a preview to exercise the flow without a real inbox.
  activationCodePreview?: string;
}

export function toHomeownerActivationDto(
  entity: HomeownerActivation,
  rawCode?: string,
): HomeownerActivationDto {
  return {
    id: entity.id,
    unitId: entity.unitId,
    status: entity.status,
    expiresAt: entity.expiresAt,
    ...(env.nodeEnv !== 'production' && rawCode ? { activationCodePreview: rawCode } : {}),
  };
}

type OwnershipWithUnit = Ownership & {
  unit: Unit & { building: Building & { project: Project & { company: Company } } };
};

// Task 7 (H7) created this as a stable, honest boundary while no canonical
// Report model existed (decisions.md B1/H8). Task 8 filled it in exactly as H8
// promised: `available` is now true, `openCount` is a real canonical count, and
// the SHAPE is unchanged - only the literal type of `boundary` widened, so
// nothing that already reads this field breaks (decisions.md I15).
export interface MyHomeReportsSummaryDto {
  available: boolean;
  openCount: number;
  boundary: 'PENDING_TASK_8' | 'ACTIVE';
}

export interface MyHomeWarrantySummaryDto {
  isActive: boolean;
  endDate: Date;
  daysRemaining: number | null;
}

export interface MyHomeDto {
  ownershipId: string;
  /** @deprecated kept for compatibility - identical to `handoverDate` below. */
  startDate: Date;
  // Task 7 (decisions.md H1): the authoritative handover/move-in date - the
  // moment Ownership.status became ACTIVE at activation, never the project's
  // creation date or any other stand-in.
  handoverDate: Date;
  unit: {
    id: string;
    number: string;
    floor: number;
    type: string;
    status: string;
    area: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    parkingSpots: number | null;
  };
  building: { id: string; name: string; number: string };
  project: { id: string; name: string; city: string; developerName: string };
  // Task 7: real cover media only - `url: null` renders the frontend's
  // explicit "no image available" placeholder, never a fabricated photo URL.
  coverImage: { url: string | null; isPlaceholder: boolean };
  warranty: MyHomeWarrantySummaryDto | null;
  reportsSummary: MyHomeReportsSummaryDto;
}

export function toMyHomeDto(
  ownership: OwnershipWithUnit,
  warranty: Warranty | null,
  openReportsCount = 0,
): MyHomeDto {
  return {
    ownershipId: ownership.id,
    startDate: ownership.startDate,
    handoverDate: ownership.startDate,
    unit: {
      id: ownership.unit.id,
      number: ownership.unit.number,
      floor: ownership.unit.floor,
      type: ownership.unit.type,
      status: ownership.unit.status,
      area: ownership.unit.area,
      bedrooms: ownership.unit.bedrooms,
      bathrooms: ownership.unit.bathrooms,
      parkingSpots: ownership.unit.parkingSpots,
    },
    building: {
      id: ownership.unit.building.id,
      name: ownership.unit.building.name,
      number: ownership.unit.building.number,
    },
    project: {
      id: ownership.unit.building.project.id,
      name: ownership.unit.building.project.name,
      city: ownership.unit.building.project.city,
      developerName: ownership.unit.building.project.company.name,
    },
    coverImage: {
      url: ownership.unit.building.project.coverImageUrl,
      isPlaceholder: !ownership.unit.building.project.coverImageUrl,
    },
    warranty: warranty
      ? {
          isActive: isWarrantyActive(warranty),
          endDate: warranty.endDate,
          daysRemaining: isWarrantyActive(warranty)
            ? Math.ceil((warranty.endDate.getTime() - Date.now()) / 86_400_000)
            : null,
        }
      : null,
    // Task 8 (decisions.md I15): real now. The count comes from the one
    // canonical report repository every other report surface reads, not from a
    // second hand-written query, and never from a legacy WarrantyReport row.
    reportsSummary: { available: true, openCount: openReportsCount, boundary: 'ACTIVE' },
  };
}

// ---------------------------------------------------------------------
// Task 5 (RE4): company-wide homeowner management DTOs.
// ---------------------------------------------------------------------

export type HomeownerStatus = 'ACTIVE' | 'PENDING' | 'NOT_ACTIVATED' | 'DEACTIVATED';

type UnitWithContext = Unit & { building: Building & { project: Project } };
type ActivationWithUnit = HomeownerActivation & { unit: UnitWithContext };
type OwnershipWithUnitContext = Ownership & { unit: UnitWithContext };

// decisions.md F8: DEACTIVATED (User.status) is checked before the
// role/activation-derived states - a temporary deactivation must always win
// visually over whatever the underlying ownership/activation state is.
export function deriveHomeownerStatus(
  user: { status: string; role: string },
  latestActivation: { status: string; expiresAt: Date } | null,
): HomeownerStatus {
  if (user.status === 'ARCHIVED') return 'DEACTIVATED';
  if (user.role === 'HOMEOWNER') return 'ACTIVE';
  if (latestActivation && latestActivation.status === 'PENDING' && latestActivation.expiresAt > new Date()) {
    return 'PENDING';
  }
  return 'NOT_ACTIVATED';
}

export interface HomeownerRecordDto {
  id: string;
  name: string;
  nationalId: string | null;
  email: string;
  phone: string;
  status: HomeownerStatus;
  unit: { id: string; number: string; buildingName: string; projectName: string } | null;
  moveInDate: Date | null;
  createdAt: Date;
}

export function toHomeownerRecordDto(
  user: User,
  latestActivation: ActivationWithUnit | null,
  activeOwnership: OwnershipWithUnitContext | null,
): HomeownerRecordDto {
  const currentUnit = activeOwnership?.unit ?? latestActivation?.unit ?? null;
  return {
    id: user.id,
    name: user.name,
    nationalId: user.nationalId,
    email: user.email,
    phone: user.phone,
    status: deriveHomeownerStatus(user, latestActivation),
    unit: currentUnit
      ? {
          id: currentUnit.id,
          number: currentUnit.number,
          buildingName: currentUnit.building.name,
          projectName: currentUnit.building.project.name,
        }
      : null,
    moveInDate: activeOwnership?.startDate ?? null,
    createdAt: user.createdAt,
  };
}

export interface HomeownerHistoryEntryDto {
  id: string;
  kind: 'ACTIVATION' | 'OWNERSHIP';
  status: string;
  unitNumber: string;
  buildingName: string;
  endReason?: string | null;
  createdAt: Date;
}

/** RE4's "current reports" rows - a real, canonical, homeowner-scoped list (decisions.md I15). */
export interface HomeownerReportRowDto {
  id: string;
  reportNumber: number;
  status: string;
  statusGroup: string;
  category: string;
  priority: string;
  problemText: string;
  warrantyVerdict: string;
  technicianName: string | null;
  createdAt: Date;
  closedAt: Date | null;
}

export interface HomeownerProfileDto extends HomeownerRecordDto {
  invitationHistory: HomeownerHistoryEntryDto[];
  ownershipHistory: HomeownerHistoryEntryDto[];
  warranty: { coverage: string; startDate: Date; endDate: Date } | null;
  // Task 8 (decisions.md I15): now the canonical post-ownership count, no
  // longer the legacy WarrantyReport stand-in F12/B1 had to settle for.
  openReportsCount: number;
  /** Most recent canonical reports for this homeowner (newest first). */
  reports: HomeownerReportRowDto[];
}

export function toHomeownerProfileDto(input: {
  user: User;
  latestActivation: ActivationWithUnit | null;
  activeOwnership: OwnershipWithUnitContext | null;
  allActivations: ActivationWithUnit[];
  allOwnerships: OwnershipWithUnitContext[];
  warranty: { coverage: string; startDate: Date; endDate: Date } | null;
  openReportsCount: number;
  reports: HomeownerReportRowDto[];
}): HomeownerProfileDto {
  const record = toHomeownerRecordDto(input.user, input.latestActivation, input.activeOwnership);
  return {
    ...record,
    invitationHistory: input.allActivations.map((a) => ({
      id: a.id,
      kind: 'ACTIVATION',
      status: a.status,
      unitNumber: a.unit.number,
      buildingName: a.unit.building.name,
      createdAt: a.createdAt,
    })),
    ownershipHistory: input.allOwnerships.map((o) => ({
      id: o.id,
      kind: 'OWNERSHIP',
      status: o.status,
      unitNumber: o.unit.number,
      buildingName: o.unit.building.name,
      endReason: o.endReason,
      createdAt: o.startDate,
    })),
    warranty: input.warranty,
    openReportsCount: input.openReportsCount,
    reports: input.reports,
  };
}
