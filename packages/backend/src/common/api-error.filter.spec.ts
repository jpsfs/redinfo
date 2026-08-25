import { ArgumentsHost, NotFoundException } from '@nestjs/common';
import { ApiErrorFilter } from './api-error.filter';
import { ApiConflictException } from './api-error.exception';

function hostFor(res: { status: jest.Mock; json: jest.Mock }): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({}),
    }),
  } as unknown as ArgumentsHost;
}

function fakeResponse() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('ApiErrorFilter', () => {
  it('adds code and params to the body of a coded exception', () => {
    const filter = new ApiErrorFilter();
    const res = fakeResponse();
    const exception = new ApiConflictException(
      'WINDOW_OVERLAP_OPEN',
      'An availability window for Emergency is already open over these dates.',
      { category: 'Emergency', windows: '1–14 Sep' },
    );

    filter.catch(exception, hostFor(res));

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'An availability window for Emergency is already open over these dates.',
        statusCode: 409,
        code: 'WINDOW_OVERLAP_OPEN',
        params: { category: 'Emergency', windows: '1–14 Sep' },
      }),
    );
  });

  it('leaves an ordinary exception body exactly as Nest would have sent it', () => {
    const filter = new ApiErrorFilter();
    const res = fakeResponse();
    const exception = new NotFoundException('Holiday abc123 not found');

    filter.catch(exception, hostFor(res));

    expect(res.status).toHaveBeenCalledWith(404);
    const [body] = res.json.mock.calls[0];
    expect(body).not.toHaveProperty('code');
    expect(body).not.toHaveProperty('params');
    expect(body.message).toBe('Holiday abc123 not found');
  });

  it('is still a real ConflictException — instanceof checks elsewhere keep working', () => {
    const exception = new ApiConflictException('WINDOW_ALREADY_CLOSED', 'Already closed.');
    expect(exception.getStatus()).toBe(409);
    expect(exception).toBeInstanceOf(Error);
  });
});
