import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LiveRunState } from '@redinfo/shared';
import { SyncLiveRunDto } from './live-run.dto';

/**
 * Exercises the DTO the way `main.ts`'s global `ValidationPipe` actually does —
 * `whitelist` and `forbidNonWhitelisted` both on — which is the one thing the
 * service-level specs in `live-runs.integration.spec.ts` cannot see: they call
 * `LiveRunsService.sync()` directly, so a field this DTO does not know about
 * never gets a chance to fail a real `PUT`.
 *
 * `LiveRunInput` — the whole document a phone holds, `closedAt` included — is
 * exactly the body a sync PUT sends. If the DTO does not also know that field,
 * `forbidNonWhitelisted` rejects every sync with "property closedAt should not
 * exist", the run is never created, and closing it later 404s. That was a real
 * regression; this is what would have caught it.
 */
describe('SyncLiveRunDto', () => {
  const body = {
    id: 'run-on-a-phone',
    revision: 0,
    state: LiveRunState.INTAKE,
    startedAt: new Date().toISOString(),
    externalReference: null,
    chiefComplaint: null,
    locationType: null,
    localityId: null,
    victimGender: null,
    victimAge: null,
    vehicleId: null,
    crew: [],
    shift: null,
    activationAt: null,
    sceneArrivalAt: null,
    sceneDepartureAt: null,
    hospitalArrivalAt: null,
    availableAt: null,
    destinationKind: null,
    destinationHospitalId: null,
    identity: { victimHomeLocalityId: null },
    capture: { notes: null, assessments: [], supportActions: [] },
    closedAt: null,
  };

  it('accepts the whole document a phone holds, `closedAt` included', async () => {
    const instance = plainToInstance(SyncLiveRunDto, body);
    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).toEqual([]);
  });
});
