import { BadRequestException } from '@nestjs/common';
import { DEFAULT_DELEGATION_SETTINGS, TransportRequestOccurrenceType } from '@redinfo/shared';
import { TransportConfigController } from './transport-config.controller';
import { DelegationSettingsService } from '../live-runs/delegation-settings.service';
import { OccurrenceTypePoliciesService } from './occurrence-type-policies.service';

function makeController() {
  const settings = {
    get: jest.fn(() => Promise.resolve(DEFAULT_DELEGATION_SETTINGS)),
    update: jest.fn((patch) => Promise.resolve({ ...DEFAULT_DELEGATION_SETTINGS, ...patch })),
  } as unknown as DelegationSettingsService;
  const policies = {
    findAll: jest.fn(),
    update: jest.fn(),
  } as unknown as OccurrenceTypePoliciesService;
  return { controller: new TransportConfigController(settings, policies), settings, policies };
}

describe('TransportConfigController', () => {
  describe('updateArrivalWindowThresholds', () => {
    it('rejects an earliest threshold lower than the latest one', async () => {
      const { controller } = makeController();
      await expect(
        controller.updateArrivalWindowThresholds({
          arrivalWindowEarliestMinutes: 2,
          arrivalWindowLatestMinutes: 5,
          arrivalToleranceMinutes: 10,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('persists a valid set of thresholds as a patch, without touching base/CODU fields', async () => {
      const { controller, settings } = makeController();
      const result = await controller.updateArrivalWindowThresholds({
        arrivalWindowEarliestMinutes: 45,
        arrivalWindowLatestMinutes: 10,
        arrivalToleranceMinutes: 15,
      });
      expect(settings.update).toHaveBeenCalledWith({
        arrivalWindowEarliestMinutes: 45,
        arrivalWindowLatestMinutes: 10,
        arrivalToleranceMinutes: 15,
      });
      expect(result).toEqual({
        arrivalWindowEarliestMinutes: 45,
        arrivalWindowLatestMinutes: 10,
        arrivalToleranceMinutes: 15,
      });
    });
  });

  describe('updateOccurrenceTypePolicy', () => {
    it('rejects an unknown occurrence type', async () => {
      const { controller } = makeController();
      await expect(
        controller.updateOccurrenceTypePolicy('NOT_A_TYPE', { minimumDurationMinutes: 30, defaultDurationMinutes: 30 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a default duration shorter than the minimum', async () => {
      const { controller } = makeController();
      await expect(
        controller.updateOccurrenceTypePolicy(TransportRequestOccurrenceType.CONSULTA, {
          minimumDurationMinutes: 30,
          defaultDurationMinutes: 10,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('delegates a valid patch to the service', async () => {
      const { controller, policies } = makeController();
      await controller.updateOccurrenceTypePolicy(TransportRequestOccurrenceType.EXAME, {
        minimumDurationMinutes: 20,
        defaultDurationMinutes: 40,
      });
      expect(policies.update).toHaveBeenCalledWith(TransportRequestOccurrenceType.EXAME, {
        minimumDurationMinutes: 20,
        defaultDurationMinutes: 40,
      });
    });
  });
});
