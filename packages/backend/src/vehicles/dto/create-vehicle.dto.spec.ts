import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateVehicleDto } from './create-vehicle.dto';

const baseFields = {
  licensePlate: '55-AA-12',
  numeroCauda: 'VIAT-01',
  vehicleType: 'EMERGENCY',
  insuranceRenewalDate: '2099-12-31',
  nextImtInspectionDate: '2099-12-31',
};

/**
 * #221's physical-configuration fields (`seatedCapacity`, `wheelchairPositions`,
 * `stretcherPositions`, `hasRampOrLift`): non-negative integers with a sensible
 * upper bound, and optional so a plate-only create still validates.
 */
describe('CreateVehicleDto — physical configuration', () => {
  it('is optional — omitting all four is not a validation error', async () => {
    const dto = plainToInstance(CreateVehicleDto, baseFields);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts valid values for all four fields', async () => {
    const dto = plainToInstance(CreateVehicleDto, {
      ...baseFields,
      seatedCapacity: 4,
      wheelchairPositions: 2,
      stretcherPositions: 1,
      hasRampOrLift: true,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it.each(['seatedCapacity', 'wheelchairPositions', 'stretcherPositions'])(
    'rejects a negative %s',
    async (field) => {
      const dto = plainToInstance(CreateVehicleDto, { ...baseFields, [field]: -1 });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === field)).toBe(true);
    },
  );

  it.each([
    ['seatedCapacity', 21],
    ['wheelchairPositions', 5],
    ['stretcherPositions', 5],
  ])('rejects %s above its upper bound', async (field, value) => {
    const dto = plainToInstance(CreateVehicleDto, { ...baseFields, [field]: value });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === field)).toBe(true);
  });

  it('rejects a non-boolean hasRampOrLift', async () => {
    const dto = plainToInstance(CreateVehicleDto, { ...baseFields, hasRampOrLift: 'yes' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'hasRampOrLift')).toBe(true);
  });
});
