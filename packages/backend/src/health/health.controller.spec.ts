import { HealthController } from './health.controller';
import { HealthCheckService } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';

// `version()` reads plain env vars and touches neither dependency — a real
// `Test.createTestingModule` would be pure ceremony here (see
// `geography.controller.spec.ts` for the same shortcut on a similar
// dependency-light controller).
const newController = () =>
  new HealthController({} as HealthCheckService, {} as PrismaHealthIndicator);

describe('HealthController#version', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('reports the commit baked in at image build time', () => {
    process.env.GIT_COMMIT_SHA = 'a1b2c3d4';
    process.env.GIT_COMMIT_DATE = '2026-09-11T20:01:09+00:00';

    expect(newController().version()).toEqual({
      commit: 'a1b2c3d4',
      commitDate: '2026-09-11T20:01:09+00:00',
    });
  });

  it('falls back to a visibly-unbuilt value outside a CI-built image', () => {
    delete process.env.GIT_COMMIT_SHA;
    delete process.env.GIT_COMMIT_DATE;

    expect(newController().version()).toEqual({ commit: 'dev', commitDate: null });
  });
});
