import { EmailChannelService } from './email-channel.service';

const sendMock = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

describe('EmailChannelService', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('fails soft with no RESEND_API_KEY, without ever calling the SDK', async () => {
    delete process.env.RESEND_API_KEY;
    const service = new EmailChannelService();

    const result = await service.send('ana@example.com', 'Storm warning', 'Roads closed.');

    expect(result).toEqual({ ok: false, error: 'Email channel not configured' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('reports the provider message id on success', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    sendMock.mockResolvedValue({ data: { id: 'email-123' }, error: null });
    const service = new EmailChannelService();

    const result = await service.send('ana@example.com', 'Storm warning', 'Roads closed.');

    expect(result).toEqual({ ok: true, providerMessageId: 'email-123' });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ana@example.com', subject: 'Storm warning', text: 'Roads closed.' }),
    );
  });

  it('surfaces the provider error without throwing', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    sendMock.mockResolvedValue({ data: null, error: { message: 'Domain not verified' } });
    const service = new EmailChannelService();

    const result = await service.send('ana@example.com', 'Storm warning', 'Roads closed.');

    expect(result).toEqual({ ok: false, error: 'Domain not verified' });
  });

  it('catches a thrown network error rather than propagating it', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    sendMock.mockRejectedValue(new Error('ECONNRESET'));
    const service = new EmailChannelService();

    const result = await service.send('ana@example.com', 'Storm warning', 'Roads closed.');

    expect(result).toEqual({ ok: false, error: 'ECONNRESET' });
  });
});
