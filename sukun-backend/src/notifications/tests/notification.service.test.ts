import { notificationService } from '../notification.service';
import { notificationRepository } from '../notification.repository';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';

jest.mock('../notification.repository');
jest.mock('../../config/prisma', () => ({
  prisma: { notification: { updateMany: jest.fn() } },
}));

const mockedRepo = notificationRepository as jest.Mocked<typeof notificationRepository>;
const mockedPrisma = prisma as unknown as { notification: { updateMany: jest.Mock } };

describe('notificationService.send (Task 10 honesty correction)', () => {
  const queued = {
    id: 'notif-1',
    userId: 'user-1',
    title: 'Hi',
    body: 'Body',
    type: 'PUSH' as const,
    status: 'QUEUED' as const,
    createdAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedRepo.create.mockResolvedValue(queued);
    mockedRepo.markSent.mockResolvedValue({ ...queued, status: 'SENT' });
  });

  afterEach(() => {
    env.messaging.emailProvider = '';
    env.messaging.smsProvider = '';
  });

  // This used to assert the opposite. It was wrong: no Push/Email/SMS provider
  // has ever been configured in this product, so marking every notification
  // SENT recorded a delivery that never happened. QUEUED is what actually
  // occurred, and 11_State_Machines.md already had the state for it.
  it('leaves a notification QUEUED - never SENT - when no delivery provider is configured', async () => {
    const result = await notificationService.send('user-1', 'Hi', 'Body');

    expect(mockedRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', title: 'Hi', body: 'Body' }),
    );
    expect(mockedRepo.markSent).not.toHaveBeenCalled();
    expect(result.status).toBe('QUEUED');
  });

  it('does not treat an EMAIL notification as sent either, with no email provider', async () => {
    await notificationService.send('user-1', 'Hi', 'Body', 'EMAIL' as never);
    expect(mockedRepo.markSent).not.toHaveBeenCalled();
  });

  it('marks SENT only once a real provider is genuinely configured', async () => {
    env.messaging.emailProvider = 'some-provider';
    await notificationService.send('user-1', 'Hi', 'Body', 'EMAIL' as never);
    expect(mockedRepo.markSent).toHaveBeenCalledWith('notif-1');
  });
});

describe('notificationService.markRead', () => {
  it('rejects marking a notification owned by someone else (NOT-007 ownership)', async () => {
    mockedRepo.findById.mockResolvedValue({
      id: 'notif-1',
      userId: 'other-user',
      title: 'Hi',
      body: 'Body',
      type: 'PUSH',
      status: 'SENT',
      createdAt: new Date(),
    });

    await expect(notificationService.markRead('user-1', 'notif-1')).rejects.toMatchObject({
      errorCode: 'NOTIFICATION_NOT_FOUND',
    });
  });

  it('marks all unread as read when no notificationId is given', async () => {
    mockedPrisma.notification.updateMany.mockResolvedValue({ count: 3 });

    await notificationService.markRead('user-1');

    expect(mockedPrisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1' }) }),
    );
  });
});
