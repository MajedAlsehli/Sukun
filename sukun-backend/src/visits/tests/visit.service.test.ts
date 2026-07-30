import { visitService } from '../visit.service';
import { visitRepository } from '../visit.repository';
import { unitRepository } from '../../units/unit.repository';
import { buildingRepository } from '../../buildings/building.repository';
import { searchJourneyRepository } from '../../search-journeys/search-journey.repository';
import { searchJourneyService } from '../../search-journeys/search-journey.service';
import { projectRepository } from '../../projects/project.repository';
import { visitMediaStorage } from '../visit-media-storage';
import { VisitStatus } from '../visit.types';
import { UnitStatus } from '../../units/unit.types';
import { BuildingStatus } from '../../buildings/building.types';
import { SearchJourneyStatus } from '../../search-journeys/search-journey.types';

jest.mock('../visit.repository');
jest.mock('../../units/unit.repository');
jest.mock('../../buildings/building.repository');
jest.mock('../../search-journeys/search-journey.repository');
jest.mock('../../search-journeys/search-journey.service');
jest.mock('../../projects/project.repository');
// Partial mock: `extensionForMimeType` must stay REAL, because Task 10's key
// assertions below check the derived `.jpg` suffix, and an auto-mocked version
// would silently produce `undefined`.
jest.mock('../visit-media-storage', () => ({
  ...jest.requireActual('../visit-media-storage'),
  visitMediaStorage: {
    isConfigured: jest.fn(),
    upload: jest.fn(),
    signedUrls: jest.fn(),
  },
}));
jest.mock('../../shared/audit.service', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../../notifications/notification.service', () => ({
  notificationService: { send: jest.fn() },
}));

const mockedVisits = visitRepository as jest.Mocked<typeof visitRepository>;
const mockedUnits = unitRepository as jest.Mocked<typeof unitRepository>;
const mockedBuildings = buildingRepository as jest.Mocked<typeof buildingRepository>;
const mockedJourneys = searchJourneyRepository as jest.Mocked<typeof searchJourneyRepository>;
const mockedJourneyService = searchJourneyService as jest.Mocked<typeof searchJourneyService>;
const mockedProjects = projectRepository as jest.Mocked<typeof projectRepository>;
const mockedMediaStorage = visitMediaStorage as jest.Mocked<typeof visitMediaStorage>;

// A genuinely valid minimal JPEG (magic number + padding). Task 10 validates
// real bytes, not just the declared MIME type, so tests must submit real ones.
const JPEG_B64 = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(64)]).toString('base64');
const jpegPhoto = () => ({ fileName: 'a.jpg', mimeType: 'image/jpeg' as const, contentBase64: JPEG_B64 });

const discoverableProjectFields = { status: 'ACTIVE', isActive: true, company: { status: 'ACTIVE' } };

const availableUnit = {
  id: 'unit-1',
  buildingId: 'building-1',
  number: '101',
  floor: 1,
  type: 'Apartment',
  status: UnitStatus.AVAILABLE,
  area: null,
  bedrooms: null,
  bathrooms: null,
  parkingSpots: null,
  price: null,
  source: 'MANUAL',
  externalId: null,
  sourceUpdatedAt: null,
  lastSyncedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const activeBuilding = {
  id: 'building-1',
  projectId: 'project-1',
  name: 'Tower A',
  number: '1',
  status: BuildingStatus.ACTIVE,
  isActive: true,
  floors: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { units: 1 },
};

const activeJourney = {
  id: 'journey-1',
  userId: 'user-1',
  status: SearchJourneyStatus.CREATED,
  startedAt: new Date(),
  closedAt: null,
};

const validDto = { projectId: 'project-1', unitId: 'unit-1', date: new Date('2026-08-01'), time: '14:00' };

// jest.config.js already sets clearMocks: true globally (resets call
// history between tests) - this only (re-)establishes the default resolved
// value every create() test relies on unless it overrides it below.
beforeEach(() => {
  mockedProjects.findDiscoverabilityFields.mockResolvedValue(discoverableProjectFields as never);
});

describe('visitService.create', () => {
  it('rejects booking a project that is not currently discoverable', async () => {
    mockedUnits.findById.mockResolvedValue(availableUnit);
    mockedBuildings.findById.mockResolvedValue(activeBuilding);
    mockedProjects.findDiscoverabilityFields.mockResolvedValue({
      status: 'DRAFT',
      isActive: true,
      company: { status: 'ACTIVE' },
    } as never);

    await expect(visitService.create(validDto, 'user-1', { ipAddress: null })).rejects.toMatchObject({
      errorCode: 'PROJECT_NOT_DISCOVERABLE',
    });
  });

  it('rejects booking a project owned by a non-active company', async () => {
    mockedUnits.findById.mockResolvedValue(availableUnit);
    mockedBuildings.findById.mockResolvedValue(activeBuilding);
    mockedProjects.findDiscoverabilityFields.mockResolvedValue({
      status: 'ACTIVE',
      isActive: true,
      company: { status: 'SUSPENDED' },
    } as never);

    await expect(visitService.create(validDto, 'user-1', { ipAddress: null })).rejects.toMatchObject({
      errorCode: 'PROJECT_NOT_DISCOVERABLE',
    });
  });

  it('rejects booking a unit that does not belong to the given project', async () => {
    mockedUnits.findById.mockResolvedValue(availableUnit);
    mockedBuildings.findById.mockResolvedValue({ ...activeBuilding, projectId: 'other-project' });

    await expect(visitService.create(validDto, 'user-1', { ipAddress: null })).rejects.toMatchObject({
      errorCode: 'UNIT_PROJECT_MISMATCH',
    });
  });

  it('rejects booking a unit that is not AVAILABLE', async () => {
    mockedUnits.findById.mockResolvedValue({ ...availableUnit, status: UnitStatus.RESERVED });
    mockedBuildings.findById.mockResolvedValue(activeBuilding);

    await expect(visitService.create(validDto, 'user-1', { ipAddress: null })).rejects.toMatchObject({
      errorCode: 'UNIT_NOT_AVAILABLE',
    });
  });

  it('rejects a conflicting slot (VIS-008)', async () => {
    mockedUnits.findById.mockResolvedValue(availableUnit);
    mockedBuildings.findById.mockResolvedValue(activeBuilding);
    mockedVisits.findConflicting.mockResolvedValue({ id: 'existing' } as never);

    await expect(visitService.create(validDto, 'user-1', { ipAddress: null })).rejects.toMatchObject({
      errorCode: 'VISIT_SLOT_ALREADY_BOOKED',
    });
  });

  it('rejects booking with no active search journey', async () => {
    mockedUnits.findById.mockResolvedValue(availableUnit);
    mockedBuildings.findById.mockResolvedValue(activeBuilding);
    mockedVisits.findConflicting.mockResolvedValue(null);
    mockedJourneys.findActiveByUserId.mockResolvedValue(null);

    await expect(visitService.create(validDto, 'user-1', { ipAddress: null })).rejects.toMatchObject({
      errorCode: 'NO_ACTIVE_SEARCH_JOURNEY',
    });
  });

  it('books the visit and advances the journey to VISITING', async () => {
    mockedUnits.findById.mockResolvedValue(availableUnit);
    mockedBuildings.findById.mockResolvedValue(activeBuilding);
    mockedVisits.findConflicting.mockResolvedValue(null);
    mockedJourneys.findActiveByUserId.mockResolvedValue(activeJourney);
    mockedVisits.create.mockResolvedValue({
      id: 'visit-1',
      userId: 'user-1',
      projectId: 'project-1',
      unitId: 'unit-1',
      searchJourneyId: 'journey-1',
      date: validDto.date,
      time: '14:00',
      status: VisitStatus.CONFIRMED,
      checkedInAt: null,
      checkedOutAt: null,
      rescheduleCount: 0,
      lastRescheduledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await visitService.create(validDto, 'user-1', { ipAddress: null });

    expect(result.status).toBe('CONFIRMED');
    expect(mockedJourneyService.advanceStatus).toHaveBeenCalledWith(
      'journey-1',
      SearchJourneyStatus.VISITING,
      { ipAddress: null },
    );
  });

  it('does not re-advance a journey already past the pre-visiting stages', async () => {
    mockedUnits.findById.mockResolvedValue(availableUnit);
    mockedBuildings.findById.mockResolvedValue(activeBuilding);
    mockedVisits.findConflicting.mockResolvedValue(null);
    mockedJourneys.findActiveByUserId.mockResolvedValue({
      ...activeJourney,
      status: SearchJourneyStatus.VISITING,
    });
    mockedVisits.create.mockResolvedValue({
      id: 'visit-2',
      userId: 'user-1',
      projectId: 'project-1',
      unitId: 'unit-1',
      searchJourneyId: 'journey-1',
      date: validDto.date,
      time: '15:00',
      status: VisitStatus.CONFIRMED,
      checkedInAt: null,
      checkedOutAt: null,
      rescheduleCount: 0,
      lastRescheduledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await visitService.create({ ...validDto, time: '15:00' }, 'user-1', { ipAddress: null });

    expect(mockedJourneyService.advanceStatus).not.toHaveBeenCalled();
  });
});

describe('visitService.checkIn / checkOut', () => {
  it('rejects check-in on a visit owned by someone else', async () => {
    mockedVisits.findById.mockResolvedValue({
      id: 'visit-1',
      userId: 'other-user',
      projectId: 'project-1',
      unitId: 'unit-1',
      searchJourneyId: 'journey-1',
      date: new Date(),
      time: '14:00',
      status: VisitStatus.CONFIRMED,
      checkedInAt: null,
      checkedOutAt: null,
      rescheduleCount: 0,
      lastRescheduledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      visitService.checkIn('visit-1', 'user-1', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'VISIT_NOT_FOUND' });
  });

  it('rejects check-out before check-in (VIS-009)', async () => {
    mockedVisits.findById.mockResolvedValue({
      id: 'visit-1',
      userId: 'user-1',
      projectId: 'project-1',
      unitId: 'unit-1',
      searchJourneyId: 'journey-1',
      date: new Date(),
      time: '14:00',
      status: VisitStatus.CONFIRMED,
      checkedInAt: null,
      checkedOutAt: null,
      rescheduleCount: 0,
      lastRescheduledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      visitService.checkOut('visit-1', 'user-1', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'INVALID_STATE_TRANSITION' });
  });
});

describe('visitService.cancel', () => {
  it('rejects cancelling a Checked-Out visit (VIS-005)', async () => {
    mockedVisits.findById.mockResolvedValue({
      id: 'visit-1',
      userId: 'user-1',
      projectId: 'project-1',
      unitId: 'unit-1',
      searchJourneyId: 'journey-1',
      date: new Date(),
      time: '14:00',
      status: VisitStatus.CHECKED_OUT,
      checkedInAt: new Date(),
      checkedOutAt: new Date(),
      rescheduleCount: 0,
      lastRescheduledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      visitService.cancel('visit-1', 'user-1', { ipAddress: null }),
    ).rejects.toMatchObject({ errorCode: 'VISIT_READ_ONLY' });
  });
});

function confirmedVisit(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'visit-1',
    userId: 'user-1',
    projectId: 'project-1',
    unitId: 'unit-1',
    searchJourneyId: 'journey-1',
    date: new Date('2026-08-01'),
    time: '14:00',
    status: VisitStatus.CONFIRMED,
    checkedInAt: null,
    checkedOutAt: null,
    rescheduleCount: 0,
    lastRescheduledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as never;
}

describe('visitService.reschedule', () => {
  it('rejects rescheduling a visit owned by someone else', async () => {
    mockedVisits.findById.mockResolvedValue(confirmedVisit({ userId: 'other-user' }));

    await expect(
      visitService.reschedule('visit-1', { date: new Date('2026-08-02'), time: '16:00' }, 'user-1', {
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ errorCode: 'VISIT_NOT_FOUND' });
  });

  it('rejects rescheduling once checked in (VIS not reschedulable)', async () => {
    mockedVisits.findById.mockResolvedValue(confirmedVisit({ status: VisitStatus.CHECKED_IN }));

    await expect(
      visitService.reschedule('visit-1', { date: new Date('2026-08-02'), time: '16:00' }, 'user-1', {
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ errorCode: 'VISIT_NOT_RESCHEDULABLE' });
  });

  it('rejects a conflicting slot on reschedule, excluding its own current slot', async () => {
    mockedVisits.findById.mockResolvedValue(confirmedVisit());
    mockedVisits.findConflicting.mockResolvedValue({ id: 'other-visit' } as never);

    await expect(
      visitService.reschedule('visit-1', { date: new Date('2026-08-02'), time: '16:00' }, 'user-1', {
        ipAddress: null,
      }),
    ).rejects.toMatchObject({ errorCode: 'VISIT_SLOT_ALREADY_BOOKED' });

    expect(mockedVisits.findConflicting).toHaveBeenCalledWith('unit-1', new Date('2026-08-02'), '16:00', 'visit-1');
  });

  it('reschedules successfully and records the new date/time', async () => {
    mockedVisits.findById.mockResolvedValue(confirmedVisit());
    mockedVisits.findConflicting.mockResolvedValue(null);
    mockedVisits.reschedule.mockResolvedValue(
      confirmedVisit({ date: new Date('2026-08-02'), time: '16:00', rescheduleCount: 1 }),
    );

    const result = await visitService.reschedule(
      'visit-1',
      { date: new Date('2026-08-02'), time: '16:00' },
      'user-1',
      { ipAddress: null },
    );

    expect(result.time).toBe('16:00');
    expect(mockedVisits.reschedule).toHaveBeenCalledWith('visit-1', new Date('2026-08-02'), '16:00');
  });
});

describe('visitService.addNote / addIssue', () => {
  it('rejects a note when the visit is not currently in progress', async () => {
    mockedVisits.findById.mockResolvedValue(confirmedVisit());

    await expect(visitService.addNote('visit-1', { text: 'ملاحظة' }, 'user-1')).rejects.toMatchObject({
      errorCode: 'VISIT_NOT_IN_PROGRESS',
    });
  });

  it('rejects a note belonging to another user (404, not 403)', async () => {
    mockedVisits.findById.mockResolvedValue(confirmedVisit({ userId: 'other-user', status: VisitStatus.CHECKED_IN }));

    await expect(visitService.addNote('visit-1', { text: 'ملاحظة' }, 'user-1')).rejects.toMatchObject({
      errorCode: 'VISIT_NOT_FOUND',
    });
  });

  it('adds a text-only note while checked in, regardless of storage configuration', async () => {
    mockedVisits.findById.mockResolvedValue(confirmedVisit({ status: VisitStatus.CHECKED_IN }));
    mockedMediaStorage.isConfigured.mockReturnValue(false);
    mockedVisits.createNote.mockResolvedValue({
      id: 'note-1',
      visitId: 'visit-1',
      userId: 'user-1',
      text: 'ملاحظة',
      photoUrl: null,
      createdAt: new Date(),
    } as never);

    const result = await visitService.addNote('visit-1', { text: 'ملاحظة' }, 'user-1');

    expect(result.text).toBe('ملاحظة');
    expect(mockedMediaStorage.upload).not.toHaveBeenCalled();
  });

  it('fails honestly with MEDIA_STORAGE_NOT_CONFIGURED when a photo is requested but storage is unavailable', async () => {
    mockedVisits.findById.mockResolvedValue(confirmedVisit({ status: VisitStatus.CHECKED_IN }));
    mockedMediaStorage.upload.mockRejectedValue(
      Object.assign(new Error('not configured'), { errorCode: 'MEDIA_STORAGE_NOT_CONFIGURED' }),
    );

    await expect(
      visitService.addNote('visit-1', { photo: jpegPhoto() }, 'user-1'),
    ).rejects.toMatchObject({ errorCode: 'MEDIA_STORAGE_NOT_CONFIGURED' });
    expect(mockedVisits.createNote).not.toHaveBeenCalled();
  });

  // --- Task 10 (decisions.md K3) - three real gaps this path used to have ---

  it('rejects a non-image disguised with an image MIME type before it reaches storage', async () => {
    mockedVisits.findById.mockResolvedValue(confirmedVisit({ status: VisitStatus.CHECKED_IN }));

    await expect(
      visitService.addNote(
        'visit-1',
        {
          photo: {
            fileName: 'a.png',
            mimeType: 'image/png',
            // "MZ" - a Windows executable. This used to be uploaded verbatim.
            contentBase64: Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]).toString('base64'),
          },
        },
        'user-1',
      ),
    ).rejects.toThrow(/not a supported image/);
    expect(mockedMediaStorage.upload).not.toHaveBeenCalled();
    expect(mockedVisits.createNote).not.toHaveBeenCalled();
  });

  it('rejects a MIME type outside the image allow-list (service-level backstop)', async () => {
    mockedVisits.findById.mockResolvedValue(confirmedVisit({ status: VisitStatus.CHECKED_IN }));

    // The zod DTO already refuses this at the router, so the cast is what a
    // future non-HTTP caller would look like. The service must not rely on the
    // DTO having run.
    await expect(
      visitService.addNote(
        'visit-1',
        { photo: { fileName: 'a.pdf', mimeType: 'application/pdf', contentBase64: JPEG_B64 } as never },
        'user-1',
      ),
    ).rejects.toThrow(/Unsupported image type/);
    expect(mockedMediaStorage.upload).not.toHaveBeenCalled();
  });

  it('derives a collision-resistant uuid key and stores it alongside a signed URL', async () => {
    mockedVisits.findById.mockResolvedValue(confirmedVisit({ status: VisitStatus.CHECKED_IN }));
    mockedMediaStorage.upload.mockImplementation(async (key: string) => ({ url: '', storageKey: key }));
    mockedMediaStorage.signedUrls.mockImplementation(
      async (keys: string[]) => new Map(keys.map((k) => [k, `https://signed.example/${k}?token=t`])),
    );
    mockedVisits.createNote.mockResolvedValue({
      id: 'note-1',
      visitId: 'visit-1',
      userId: 'user-1',
      text: null,
      photoUrl: 'https://signed.example/x?token=t',
      photoStorageKey: 'k',
      createdAt: new Date(),
    } as never);

    await visitService.addNote('visit-1', { photo: jpegPhoto() }, 'user-1');

    const key = mockedMediaStorage.upload.mock.calls[0][0] as string;
    // Previously `visits/{id}/notes/{Date.now()}.jpg` - two photos in the same
    // millisecond overwrote each other.
    expect(key).toMatch(
      /^visits\/visit-1\/notes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/,
    );

    const stored = mockedVisits.createNote.mock.calls[0][0] as { photoStorageKey?: string; photoUrl?: string };
    // The KEY is the durable reference; the signed URL expires.
    expect(stored.photoStorageKey).toBe(key);
    expect(stored.photoUrl).toBe(`https://signed.example/${key}?token=t`);
  });

  it('adds an issue with a category while checked in', async () => {
    mockedVisits.findById.mockResolvedValue(confirmedVisit({ status: VisitStatus.CHECKED_IN }));
    mockedVisits.createIssue.mockResolvedValue({
      id: 'issue-1',
      visitId: 'visit-1',
      userId: 'user-1',
      category: 'ELECTRICAL',
      description: null,
      photoUrl: null,
      createdAt: new Date(),
    } as never);

    const result = await visitService.addIssue('visit-1', { category: 'ELECTRICAL' as never }, 'user-1');

    expect(result.category).toBe('ELECTRICAL');
  });

  it('rejects an issue outside the in-progress window (e.g. after checkout) - never enters a technician queue or affects reports', async () => {
    mockedVisits.findById.mockResolvedValue(confirmedVisit({ status: VisitStatus.CHECKED_OUT }));

    await expect(
      visitService.addIssue('visit-1', { category: 'PLUMBING' as never }, 'user-1'),
    ).rejects.toMatchObject({ errorCode: 'VISIT_NOT_IN_PROGRESS' });
  });
});

describe('visitService.submitFeedback', () => {
  it('rejects feedback before the visit is completed', async () => {
    mockedVisits.findById.mockResolvedValue(confirmedVisit());

    await expect(visitService.submitFeedback('visit-1', { rating: 5 }, 'user-1')).rejects.toMatchObject({
      errorCode: 'VISIT_NOT_COMPLETED',
    });
  });

  it('rejects feedback from a non-owner (404, not 403)', async () => {
    mockedVisits.findById.mockResolvedValue(
      confirmedVisit({ userId: 'other-user', status: VisitStatus.CHECKED_OUT }),
    );

    await expect(visitService.submitFeedback('visit-1', { rating: 5 }, 'user-1')).rejects.toMatchObject({
      errorCode: 'VISIT_NOT_FOUND',
    });
  });

  it('rejects a second feedback submission for the same visit (one per visit)', async () => {
    mockedVisits.findById.mockResolvedValue(confirmedVisit({ status: VisitStatus.CHECKED_OUT }));
    mockedVisits.findFeedbackByVisitId.mockResolvedValue({ id: 'feedback-1' } as never);

    await expect(visitService.submitFeedback('visit-1', { rating: 4 }, 'user-1')).rejects.toMatchObject({
      errorCode: 'FEEDBACK_ALREADY_SUBMITTED',
    });
  });

  it('submits feedback once for a completed visit', async () => {
    mockedVisits.findById.mockResolvedValue(confirmedVisit({ status: VisitStatus.CHECKED_OUT }));
    mockedVisits.findFeedbackByVisitId.mockResolvedValue(null);
    mockedVisits.createFeedback.mockResolvedValue({
      id: 'feedback-1',
      visitId: 'visit-1',
      userId: 'user-1',
      rating: 5,
      comment: null,
      suitability: 'YES',
      createdAt: new Date(),
    } as never);

    const result = await visitService.submitFeedback(
      'visit-1',
      { rating: 5, suitability: 'YES' as never },
      'user-1',
    );

    expect(result.rating).toBe(5);
    expect(result.suitability).toBe('YES');
  });
});
