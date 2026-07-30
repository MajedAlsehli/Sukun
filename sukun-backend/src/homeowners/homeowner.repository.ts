import { Prisma, HomeownerActivationStatus, OwnershipStatus, UnitStatus, UserRole } from '@prisma/client';
import { prisma } from '../config/prisma';

const unitContext = { unit: { include: { building: { include: { project: true } } } } } as const;

export const homeownerRepository = {
  // HOM-001: one active owner per unit - checked here before creating either
  // a new activation or a new ownership record.
  findActiveOwnershipByUnit(unitId: string) {
    return prisma.ownership.findFirst({ where: { unitId, status: OwnershipStatus.ACTIVE } });
  },

  // Backs GET /api/homeowners/me - no endpoint anywhere resolved "which unit
  // does the current Homeowner own" (My Home page needs this to render
  // anything, and to get the unitId GET /api/warranty requires as a query
  // param). Added this session alongside the frontend wiring that needs it.
  // Task 7 (H7): now also includes `project.company` - the real
  // developer/company name My Home's hero needs, not fabricated text.
  findActiveOwnershipByUserId(userId: string) {
    return prisma.ownership.findFirst({
      where: { userId, status: OwnershipStatus.ACTIVE },
      include: {
        unit: {
          include: {
            building: {
              include: { project: { include: { company: true } } },
            },
          },
        },
      },
    });
  },

  createActivation(input: {
    unitId: string;
    userId: string;
    codeHash: string;
    expiresAt: Date;
  }) {
    return prisma.homeownerActivation.create({ data: input });
  },

  findActivationById(id: string) {
    return prisma.homeownerActivation.findUnique({ where: { id } });
  },

  // Backs the derived homeowner-state resolver (auth/accountState.ts):
  // resolving prospect vs. pending needs the *most recent* activation row,
  // since EDG-008 resend + repeated company-side re-invitation can leave a
  // user with several historical rows (old EXPIRED/ACTIVATED ones plus at
  // most one live PENDING one).
  findLatestActivationByUserId(userId: string) {
    return prisma.homeownerActivation.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  },

  findActivationByCodeHash(codeHash: string) {
    return prisma.homeownerActivation.findUnique({ where: { codeHash } });
  },

  markActivated(id: string) {
    return prisma.homeownerActivation.update({
      where: { id },
      data: { status: HomeownerActivationStatus.ACTIVATED, activatedAt: new Date() },
    });
  },

  reissueCode(id: string, codeHash: string, expiresAt: Date) {
    return prisma.homeownerActivation.update({
      where: { id },
      data: { codeHash, expiresAt, status: HomeownerActivationStatus.PENDING },
    });
  },

  createOwnership(unitId: string, userId: string) {
    return prisma.ownership.create({ data: { unitId, userId } });
  },

  // HOM-005: promotion, not recreation - same User row, role changes in place.
  promoteToHomeowner(userId: string) {
    return prisma.user.update({ where: { id: userId }, data: { role: 'HOMEOWNER' } });
  },

  // Groups the three activation-commit writes atomically so a failure in one
  // can never leave e.g. the activation code consumed with no Ownership
  // created, or vice versa (see homeowner.service.ts#activate - this used to
  // run as three separate awaits with an unrelated check in between them).
  activateAtomically(activationId: string, unitId: string, userId: string) {
    return prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { role: 'HOMEOWNER' } }),
      prisma.ownership.create({ data: { unitId, userId } }),
      prisma.homeownerActivation.update({
        where: { id: activationId },
        data: { status: HomeownerActivationStatus.ACTIVATED, activatedAt: new Date() },
      }),
    ]);
  },

  // ---------------------------------------------------------------------
  // Task 5 (RE4): company-wide homeowner management additions.
  // ---------------------------------------------------------------------

  findByNationalId(nationalId: string) {
    return prisma.user.findUnique({ where: { nationalId } });
  },

  setNationalId(userId: string, nationalId: string) {
    return prisma.user.update({ where: { id: userId }, data: { nationalId } });
  },

  findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  // decisions.md F5/F14: the object-level scoping check every RE4 endpoint
  // uses - "does this user belong to this company's homeowner roster."
  async belongsToCompany(userId: string, companyId: string): Promise<boolean> {
    const match = await prisma.homeownerActivation.findFirst({
      where: { userId, unit: { building: { project: { companyId } } } },
      select: { id: true },
    });
    return !!match;
  },

  // decisions.md F5/F14: "this company's homeowner roster" = every User with
  // at least one HomeownerActivation whose unit belongs to this company - a
  // safe, unique-per-company scope since transfers can only ever move a
  // homeowner within the same company (decisions.md F7/invariant #15).
  async findCompanyHomeowners(
    companyId: string,
    filters: { q?: string; status?: 'ACTIVE' | 'PENDING' | 'NOT_ACTIVATED' | 'DEACTIVATED' },
    page: number,
    pageSize: number,
  ) {
    const scopeFilter: Prisma.UserWhereInput = {
      role: { in: [UserRole.HOME_SEEKER, UserRole.HOMEOWNER] },
      homeownerActivations: { some: { unit: { building: { project: { companyId } } } } },
    };
    const searchFilter: Prisma.UserWhereInput = filters.q
      ? {
          OR: [
            { name: { contains: filters.q, mode: 'insensitive' } },
            { email: { contains: filters.q, mode: 'insensitive' } },
            { phone: { contains: filters.q, mode: 'insensitive' } },
            { nationalId: { contains: filters.q, mode: 'insensitive' } },
          ],
        }
      : {};
    // Status is derived (not a column), so it can't be pushed into the SQL
    // WHERE clause - filtered in-memory after mapping, same approach the
    // pre-existing derived-role resolver (accountState.ts) already uses for
    // an analogous problem. Acceptable at RE4's list scale (company-scoped,
    // not system-wide).
    const where: Prisma.UserWhereInput = { AND: [scopeFilter, searchFilter] };

    const all = await prisma.user.findMany({
      where,
      include: {
        homeownerActivations: {
          where: { unit: { building: { project: { companyId } } } },
          orderBy: { createdAt: 'desc' },
          include: unitContext,
        },
        ownerships: {
          where: { status: OwnershipStatus.ACTIVE, unit: { building: { project: { companyId } } } },
          include: unitContext,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { all, page, pageSize };
  },

  // Full invitation/activation history for one user (all rows, not just the
  // latest) - RE4 profile's "سجل الدعوات والتفعيل" timeline.
  findAllActivationsByUserId(userId: string) {
    return prisma.homeownerActivation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: unitContext,
    });
  },

  // Full ownership history for one user (all rows) - RE4 profile's
  // ownership/transfer timeline. `endReason` distinguishes transfer from
  // deactivation without re-deriving it from audit logs (decisions.md F3).
  findAllOwnershipsByUserId(userId: string) {
    return prisma.ownership.findMany({
      where: { userId },
      orderBy: { startDate: 'desc' },
      include: unitContext,
    });
  },

  findActiveOwnershipByUserIdWithContext(userId: string) {
    return prisma.ownership.findFirst({
      where: { userId, status: OwnershipStatus.ACTIVE },
      include: unitContext,
    });
  },

  // decisions.md F13: unit numbers are unique only per-building, not
  // per-company - this is a best-effort, most-recent-match lookup, not an
  // exact-match guarantee. Documented, not silently precise.
  findMostRecentByUnitNumberForCompany(companyId: string, unitNumber: string) {
    return prisma.homeownerActivation.findFirst({
      where: { unit: { number: unitNumber, building: { project: { companyId } } } },
      orderBy: { createdAt: 'desc' },
      include: unitContext,
    });
  },

  updateContact(userId: string, data: { email?: string; phone?: string }) {
    return prisma.user.update({ where: { id: userId }, data });
  },

  setUserStatus(userId: string, status: 'ACTIVE' | 'ARCHIVED') {
    return prisma.user.update({ where: { id: userId }, data: { status } });
  },

  // decisions.md F7 (pending branch): retargets a not-yet-redeemed activation
  // to a different unit - code/expiry are NOT reissued, since the person
  // doesn't need a new code just because the target unit changed.
  reassignPendingActivationUnit(activationId: string, unitId: string) {
    return prisma.homeownerActivation.update({ where: { id: activationId }, data: { unitId } });
  },

  // decisions.md F7 (active branch): one transaction - end the old
  // ownership, create the new one, flip both units' occupancy. The
  // partial unique index (decisions.md F4) is the race-safety net if two
  // transfers target the same unit concurrently.
  transferActiveOwnership(input: {
    oldOwnershipId: string;
    oldUnitId: string;
    newUnitId: string;
    userId: string;
  }) {
    return prisma.$transaction([
      prisma.ownership.update({
        where: { id: input.oldOwnershipId },
        data: { status: OwnershipStatus.ENDED, endDate: new Date(), endReason: 'TRANSFERRED' },
      }),
      prisma.ownership.create({
        data: { unitId: input.newUnitId, userId: input.userId, status: OwnershipStatus.ACTIVE },
      }),
      prisma.unit.update({ where: { id: input.oldUnitId }, data: { status: UnitStatus.AVAILABLE } }),
      prisma.unit.update({ where: { id: input.newUnitId }, data: { status: UnitStatus.OCCUPIED } }),
    ]);
  },
};
