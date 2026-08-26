import { MunicipalitiesController } from './geography.controller';
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
