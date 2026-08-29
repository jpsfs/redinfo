import { WebPushChannelService } from './web-push-channel.service';

const sendNotificationMock = jest.fn();
const setVapidDetailsMock = jest.fn();

jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    setVapidDetails: (...args: unknown[]) => setVapidDetailsMock(...args),
    sendNotification: (...args: unknown[]) => sendNotificationMock(...args),
  },
}));

const DESTINATION = { endpoint: 'https://push.example/abc', p256dh: 'key', auth: 'secret' };

describe('WebPushChannelService', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('fails soft with no VAPID keys configured, without calling the SDK', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    const service = new WebPushChannelService();

    const result = await service.send(DESTINATION, 'Storm warning', 'Roads closed.');

    expect(result).toEqual({ ok: false, error: 'Push channel not configured' });
    expect(sendNotificationMock).not.toHaveBeenCalled();
    expect(service.publicKey).toBeNull();
  });

  it('sends the encrypted payload once VAPID keys are set', async () => {
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    sendNotificationMock.mockResolvedValue(undefined);
    const service = new WebPushChannelService();

    const result = await service.send(DESTINATION, 'Storm warning', 'Roads closed.');

    expect(result).toEqual({ ok: true });
    expect(setVapidDetailsMock).toHaveBeenCalled();
    expect(sendNotificationMock).toHaveBeenCalledWith(
      { endpoint: DESTINATION.endpoint, keys: { p256dh: 'key', auth: 'secret' } },
      JSON.stringify({ title: 'Storm warning', body: 'Roads closed.' }),
    );
    expect(service.publicKey).toBe('pub');
  });

  it('flags a 410 as an expired subscription for the caller to prune', async () => {
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    sendNotificationMock.mockRejectedValue(Object.assign(new Error('Gone'), { statusCode: 410 }));
    const service = new WebPushChannelService();

    const result = await service.send(DESTINATION, 'Storm warning', 'Roads closed.');

    expect(result).toEqual({ ok: false, error: 'Gone', expired: true });
  });

  it('does not flag an ordinary send failure as expired', async () => {
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    sendNotificationMock.mockRejectedValue(Object.assign(new Error('Server error'), { statusCode: 500 }));
    const service = new WebPushChannelService();

    const result = await service.send(DESTINATION, 'Storm warning', 'Roads closed.');

    expect(result).toEqual({ ok: false, error: 'Server error', expired: false });
  });
});
