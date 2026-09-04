import { LocalitiesController, MunicipalitiesController } from './geography.controller';
import { GeographyService } from './geography.service';

// ── The municipality picker's list shape ────────────────────────────────────
//
// The hospital form's `<ReferenceInput>` reads municipalities through the
// admin app's dataProvider, which expects every list endpoint to answer
// `{ data, total }` — that's what broke opening a hospital record (the
// endpoint used to hand back a bare array) and is worth pinning down here.

const COIMBRA = {
  id: 'mun-coimbra',
  ineCode: '0603',
  name: 'Coimbra',
  district: 'Coimbra',
  latitude: 40.2111,
  longitude: -8.4289,
};

describe('MunicipalitiesController', () => {
  it('wraps the municipality list in the { data, total } shape the admin app expects', async () => {
    const geography = {
      listMunicipalities: jest.fn(() => Promise.resolve([COIMBRA])),
    } as unknown as GeographyService;
    const controller = new MunicipalitiesController(geography);

    await expect(controller.findAll()).resolves.toEqual({ data: [COIMBRA], total: 1 });
  });
});

describe('LocalitiesController', () => {
  it('passes lat/lon through as the origin when both are given', async () => {
    const geography = { searchLocalities: jest.fn(() => Promise.resolve([])) } as unknown as GeographyService;
    const controller = new LocalitiesController(geography);

    await controller.search('ceira', 10, '40.2111', '-8.4289');

    expect(geography.searchLocalities).toHaveBeenCalledWith('ceira', 10, {
      latitude: 40.2111,
      longitude: -8.4289,
    });
  });

  it('leaves the origin undefined when lat/lon are missing or not numbers', async () => {
    const geography = { searchLocalities: jest.fn(() => Promise.resolve([])) } as unknown as GeographyService;
    const controller = new LocalitiesController(geography);

    await controller.search('ceira', 10);
    expect(geography.searchLocalities).toHaveBeenLastCalledWith('ceira', 10, undefined);

    await controller.search('ceira', 10, 'not-a-number', '-8.4289');
    expect(geography.searchLocalities).toHaveBeenLastCalledWith('ceira', 10, undefined);
  });
});
