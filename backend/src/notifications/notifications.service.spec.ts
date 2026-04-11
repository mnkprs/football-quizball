import { NotificationsService, NotificationRow } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

function buildChain(overrides: Record<string, jest.Mock> = {}) {
  const chain: Record<string, jest.Mock> = {
    insert: jest.fn(),
    select: jest.fn(),
    update: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    range: jest.fn(),
    ...overrides,
  };

  // Make all chain methods return `chain` so calls can be chained fluently,
  // except the terminal call which is set per-test.
  Object.keys(chain).forEach((key) => {
    chain[key].mockReturnValue(chain);
  });

  return chain;
}

function buildMockSupabase(chain: ReturnType<typeof buildChain>) {
  return {
    client: {
      from: jest.fn().mockReturnValue(chain),
    },
  };
}

const MOCK_NOTIFICATIONS: NotificationRow[] = [
  {
    id: 'notif-1',
    user_id: 'user-1',
    type: 'challenge_received',
    title: 'You were challenged!',
    body: 'Standard Duel — tap to accept',
    icon: '⚔️',
    route: '/duel',
    metadata: { challengerId: 'user-2' },
    read: false,
    created_at: '2026-04-11T10:00:00Z',
  },
];

describe('NotificationsService', () => {
  describe('create', () => {
    it('inserts notification row with correct shape', async () => {
      const chain = buildChain();
      chain.insert.mockResolvedValueOnce({ error: null });
      const service = new NotificationsService(buildMockSupabase(chain) as any);

      const dto: CreateNotificationDto = {
        userId: 'user-1',
        type: 'challenge_received',
        title: 'Title',
        body: 'Body',
        icon: '⚔️',
        route: '/duel',
        metadata: { key: 'value' },
      };

      await service.create(dto);

      expect(chain.insert).toHaveBeenCalledWith({
        user_id: 'user-1',
        type: 'challenge_received',
        title: 'Title',
        body: 'Body',
        icon: '⚔️',
        route: '/duel',
        metadata: { key: 'value' },
      });
    });

    it('defaults icon and route to null when not provided', async () => {
      const chain = buildChain();
      chain.insert.mockResolvedValueOnce({ error: null });
      const service = new NotificationsService(buildMockSupabase(chain) as any);

      await service.create({ userId: 'u1', type: 't', title: 'T', body: 'B' });

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ icon: null, route: null, metadata: {} }),
      );
    });

    it('defaults metadata to empty object when not provided', async () => {
      const chain = buildChain();
      chain.insert.mockResolvedValueOnce({ error: null });
      const service = new NotificationsService(buildMockSupabase(chain) as any);

      await service.create({ userId: 'u1', type: 't', title: 'T', body: 'B' });

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: {} }),
      );
    });

    it('logs error when insert fails', async () => {
      const chain = buildChain();
      chain.insert.mockResolvedValueOnce({ error: { message: 'DB error' } });
      const service = new NotificationsService(buildMockSupabase(chain) as any);
      const logSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});

      await service.create({ userId: 'u1', type: 't', title: 'T', body: 'B' });

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('DB error'));
    });
  });

  describe('getForUser', () => {
    it('returns notifications for a user', async () => {
      const chain = buildChain();
      chain.range.mockResolvedValueOnce({ data: MOCK_NOTIFICATIONS, error: null });
      const service = new NotificationsService(buildMockSupabase(chain) as any);

      const result = await service.getForUser('user-1');

      expect(result).toEqual(MOCK_NOTIFICATIONS);
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('applies default limit=50 and offset=0 as range(0, 49)', async () => {
      const chain = buildChain();
      chain.range.mockResolvedValueOnce({ data: [], error: null });
      const service = new NotificationsService(buildMockSupabase(chain) as any);

      await service.getForUser('user-1');

      expect(chain.range).toHaveBeenCalledWith(0, 49);
    });

    it('applies custom limit and offset', async () => {
      const chain = buildChain();
      chain.range.mockResolvedValueOnce({ data: [], error: null });
      const service = new NotificationsService(buildMockSupabase(chain) as any);

      await service.getForUser('user-1', 10, 20);

      expect(chain.range).toHaveBeenCalledWith(20, 29);
    });

    it('returns empty array when data is null', async () => {
      const chain = buildChain();
      chain.range.mockResolvedValueOnce({ data: null, error: null });
      const service = new NotificationsService(buildMockSupabase(chain) as any);

      const result = await service.getForUser('user-1');

      expect(result).toEqual([]);
    });

    it('returns empty array and logs error on DB failure', async () => {
      const chain = buildChain();
      chain.range.mockResolvedValueOnce({ data: null, error: { message: 'fetch error' } });
      const service = new NotificationsService(buildMockSupabase(chain) as any);
      const logSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});

      const result = await service.getForUser('user-1');

      expect(result).toEqual([]);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('fetch error'));
    });
  });

  describe('markAsRead', () => {
    it('updates read=true for the given notificationId and userId', async () => {
      const chain = buildChain();
      // eq is called twice (id + user_id), last eq resolves
      chain.eq.mockReturnValue(chain);
      chain.eq.mockReturnValueOnce(chain).mockResolvedValueOnce({ error: null });

      // Simpler: make the second eq call resolve
      const eqMock = jest.fn();
      eqMock
        .mockReturnValueOnce({ eq: jest.fn().mockResolvedValueOnce({ error: null }) });

      const updateChain = { eq: eqMock };
      const fromChain = { update: jest.fn().mockReturnValue(updateChain) };
      const mockSupabase = { client: { from: jest.fn().mockReturnValue(fromChain) } };

      const service = new NotificationsService(mockSupabase as any);

      await service.markAsRead('user-1', 'notif-1');

      expect(fromChain.update).toHaveBeenCalledWith({ read: true });
      expect(eqMock).toHaveBeenCalledWith('id', 'notif-1');
    });

    it('logs error when update fails', async () => {
      const eqMock = jest.fn();
      eqMock.mockReturnValueOnce({ eq: jest.fn().mockResolvedValueOnce({ error: { message: 'update fail' } }) });

      const fromChain = { update: jest.fn().mockReturnValue({ eq: eqMock }) };
      const mockSupabase = { client: { from: jest.fn().mockReturnValue(fromChain) } };

      const service = new NotificationsService(mockSupabase as any);
      const logSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});

      await service.markAsRead('user-1', 'notif-1');

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('update fail'));
    });
  });

  describe('markAllAsRead', () => {
    it('updates read=true for all unread notifications of user', async () => {
      const eqMock = jest.fn();
      eqMock
        .mockReturnValueOnce({ eq: jest.fn().mockResolvedValueOnce({ error: null }) });

      const fromChain = { update: jest.fn().mockReturnValue({ eq: eqMock }) };
      const mockSupabase = { client: { from: jest.fn().mockReturnValue(fromChain) } };

      const service = new NotificationsService(mockSupabase as any);

      await service.markAllAsRead('user-1');

      expect(fromChain.update).toHaveBeenCalledWith({ read: true });
      expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1');
    });

    it('logs error when update fails', async () => {
      const eqMock = jest.fn();
      eqMock.mockReturnValueOnce({ eq: jest.fn().mockResolvedValueOnce({ error: { message: 'bulk fail' } }) });

      const fromChain = { update: jest.fn().mockReturnValue({ eq: eqMock }) };
      const mockSupabase = { client: { from: jest.fn().mockReturnValue(fromChain) } };

      const service = new NotificationsService(mockSupabase as any);
      const logSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});

      await service.markAllAsRead('user-1');

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('bulk fail'));
    });
  });

  describe('getUnreadCount', () => {
    it('returns the unread count for a user', async () => {
      const eqMock = jest.fn();
      eqMock.mockReturnValueOnce({ eq: jest.fn().mockResolvedValueOnce({ count: 7, error: null }) });

      const fromChain = {
        select: jest.fn().mockReturnValue({ eq: eqMock }),
      };
      const mockSupabase = { client: { from: jest.fn().mockReturnValue(fromChain) } };

      const service = new NotificationsService(mockSupabase as any);

      const result = await service.getUnreadCount('user-1');

      expect(result).toBe(7);
      expect(fromChain.select).toHaveBeenCalledWith('*', { count: 'exact', head: true });
    });

    it('returns 0 when count is null', async () => {
      const eqMock = jest.fn();
      eqMock.mockReturnValueOnce({ eq: jest.fn().mockResolvedValueOnce({ count: null, error: null }) });

      const fromChain = { select: jest.fn().mockReturnValue({ eq: eqMock }) };
      const mockSupabase = { client: { from: jest.fn().mockReturnValue(fromChain) } };

      const service = new NotificationsService(mockSupabase as any);

      expect(await service.getUnreadCount('user-1')).toBe(0);
    });

    it('returns 0 and logs error on DB failure', async () => {
      const eqMock = jest.fn();
      eqMock.mockReturnValueOnce({ eq: jest.fn().mockResolvedValueOnce({ count: null, error: { message: 'count fail' } }) });

      const fromChain = { select: jest.fn().mockReturnValue({ eq: eqMock }) };
      const mockSupabase = { client: { from: jest.fn().mockReturnValue(fromChain) } };

      const service = new NotificationsService(mockSupabase as any);
      const logSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});

      const result = await service.getUnreadCount('user-1');

      expect(result).toBe(0);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('count fail'));
    });
  });
});
