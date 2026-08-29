import { EmailChannelService } from './email-channel.service';

const resendSendMock = jest.fn();
const smtpSendMailMock = jest.fn();
const createTransportMock = jest.fn().mockImplementation(() => ({ sendMail: smtpSendMailMock }));

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: resendSendMock } })),
}));

jest.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => createTransportMock(...args),
}));

describe('EmailChannelService', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.RESEND_API_KEY;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('fails soft with neither transport configured, without ever calling an SDK', async () => {
    const service = new EmailChannelService();

    const result = await service.send('ana@example.com', 'Storm warning', 'Roads closed.');

    expect(result).toEqual({ ok: false, error: 'Email channel not configured' });
    expect(resendSendMock).not.toHaveBeenCalled();
    expect(smtpSendMailMock).not.toHaveBeenCalled();
  });

  describe('Resend transport', () => {
    it('reports the provider message id on success', async () => {
      process.env.RESEND_API_KEY = 'test-key';
      resendSendMock.mockResolvedValue({ data: { id: 'email-123' }, error: null });
      const service = new EmailChannelService();

      const result = await service.send('ana@example.com', 'Storm warning', 'Roads closed.');

      expect(result).toEqual({ ok: true, providerMessageId: 'email-123' });
      expect(resendSendMock).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'ana@example.com', subject: 'Storm warning', text: 'Roads closed.' }),
      );
    });

    it('surfaces the provider error without throwing', async () => {
      process.env.RESEND_API_KEY = 'test-key';
      resendSendMock.mockResolvedValue({ data: null, error: { message: 'Domain not verified' } });
      const service = new EmailChannelService();

      const result = await service.send('ana@example.com', 'Storm warning', 'Roads closed.');

      expect(result).toEqual({ ok: false, error: 'Domain not verified' });
    });

    it('catches a thrown network error rather than propagating it', async () => {
      process.env.RESEND_API_KEY = 'test-key';
      resendSendMock.mockRejectedValue(new Error('ECONNRESET'));
      const service = new EmailChannelService();

      const result = await service.send('ana@example.com', 'Storm warning', 'Roads closed.');

      expect(result).toEqual({ ok: false, error: 'ECONNRESET' });
    });
  });

  describe('SMTP transport', () => {
    it('sends via SMTP when SMTP_HOST is set, reporting the message id', async () => {
      process.env.SMTP_HOST = 'mailpit';
      process.env.SMTP_PORT = '1025';
      smtpSendMailMock.mockResolvedValue({ messageId: 'smtp-123' });
      const service = new EmailChannelService();

      const result = await service.send('ana@example.com', 'Storm warning', 'Roads closed.');

      expect(result).toEqual({ ok: true, providerMessageId: 'smtp-123' });
      expect(createTransportMock).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'mailpit', port: 1025, secure: false }),
      );
      expect(smtpSendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'ana@example.com', subject: 'Storm warning', text: 'Roads closed.' }),
      );
    });

    it('defaults to port 1025 when SMTP_PORT is unset', async () => {
      process.env.SMTP_HOST = 'mailpit';
      smtpSendMailMock.mockResolvedValue({ messageId: 'smtp-123' });
      new EmailChannelService();

      expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ port: 1025 }));
    });

    it('catches a thrown SMTP error rather than propagating it', async () => {
      process.env.SMTP_HOST = 'mailpit';
      smtpSendMailMock.mockRejectedValue(new Error('ECONNREFUSED'));
      const service = new EmailChannelService();

      const result = await service.send('ana@example.com', 'Storm warning', 'Roads closed.');

      expect(result).toEqual({ ok: false, error: 'ECONNREFUSED' });
    });

    it('takes priority over Resend when both are configured, so a stray RESEND_API_KEY cannot cause a real send', async () => {
      process.env.SMTP_HOST = 'mailpit';
      process.env.RESEND_API_KEY = 'test-key';
      smtpSendMailMock.mockResolvedValue({ messageId: 'smtp-123' });
      const service = new EmailChannelService();

      const result = await service.send('ana@example.com', 'Storm warning', 'Roads closed.');

      expect(result).toEqual({ ok: true, providerMessageId: 'smtp-123' });
      expect(smtpSendMailMock).toHaveBeenCalled();
      expect(resendSendMock).not.toHaveBeenCalled();
    });
  });
});
