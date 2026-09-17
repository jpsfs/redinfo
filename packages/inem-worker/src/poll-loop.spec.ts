import { INEMLoginJob, INEMLoginJobResult } from '@redinfo/shared';
import { BackendClient } from './backend-client';
import { Logger } from './logger';
import { pollOnce } from './poll-loop';

const JOB: INEMLoginJob = { id: 'job-1', storageState: { cookies: [] }, startedAt: '2026-09-02T10:00:00.000Z' };

function silentLogger(): Logger {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function fakeBackend(claim: jest.Mock, submit: jest.Mock): BackendClient {
  return { claimJob: claim, submitResult: submit };
}

describe('pollOnce', () => {
  it('returns "idle" and never calls submitResult when there is no job to claim', async () => {
    const claim = jest.fn().mockResolvedValue(null);
    const submit = jest.fn();
    const runLoginJob = jest.fn();

    const outcome = await pollOnce(fakeBackend(claim, submit), runLoginJob, silentLogger());

    expect(outcome).toBe('idle');
    expect(runLoginJob).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('runs the claimed job and submits its result', async () => {
    const claim = jest.fn().mockResolvedValue(JOB);
    const submit = jest.fn().mockResolvedValue(undefined);
    const result: INEMLoginJobResult = { ok: true, cookies: {}, expiresAt: '2026-09-02T11:00:00.000Z', refreshedStorageState: {} };
    const runLoginJob = jest.fn().mockResolvedValue(result);

    const outcome = await pollOnce(fakeBackend(claim, submit), runLoginJob, silentLogger());

    expect(outcome).toBe('ran');
    expect(runLoginJob).toHaveBeenCalledWith(JOB);
    expect(submit).toHaveBeenCalledWith('job-1', result);
  });

  it('submits a typed failure result the job function itself returns', async () => {
    const claim = jest.fn().mockResolvedValue(JOB);
    const submit = jest.fn().mockResolvedValue(undefined);
    const runLoginJob = jest.fn().mockResolvedValue({ ok: false, reason: 'otp_timeout', message: 'no code arrived' });

    await pollOnce(fakeBackend(claim, submit), runLoginJob, silentLogger());

    expect(submit).toHaveBeenCalledWith('job-1', { ok: false, reason: 'otp_timeout', message: 'no code arrived' });
  });

  it('turns a thrown error into an unknown_error result rather than propagating', async () => {
    const claim = jest.fn().mockResolvedValue(JOB);
    const submit = jest.fn().mockResolvedValue(undefined);
    const runLoginJob = jest.fn().mockRejectedValue(new Error('browser crashed'));

    const outcome = await pollOnce(fakeBackend(claim, submit), runLoginJob, silentLogger());

    expect(outcome).toBe('ran');
    expect(submit).toHaveBeenCalledWith('job-1', { ok: false, reason: 'unknown_error', message: 'browser crashed' });
  });

  it('never retries within one cycle — one claim, one run, one submit', async () => {
    const claim = jest.fn().mockResolvedValue(JOB);
    const submit = jest.fn().mockResolvedValue(undefined);
    const runLoginJob = jest.fn().mockRejectedValue(new Error('boom'));

    await pollOnce(fakeBackend(claim, submit), runLoginJob, silentLogger());

    expect(claim).toHaveBeenCalledTimes(1);
    expect(runLoginJob).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
