import { BloodType, CertificationType, EventLocationType, Gender, VehicleType, VictimDestinationKind, VolunteerActivityType } from '@redinfo/shared';
import { InemSupportUnitType } from '@redinfo/shared';
import { isTodoReview } from '../mapping.config';
import { NO_STRUCTURED_INEM_ROW } from '../mapping.config';
import {
  lookupMonth,
  mapBloodType,
  mapCertification,
  mapDestination,
  mapGender,
  mapInemUnit,
  mapLocationType,
  mapOcorrenciaLabel,
  mapVehicleType,
  mapVolunteerActivity,
} from './enums';

describe('mapLocationType', () => {
  it.each([
    ['dom', EventLocationType.HOME],
    ['lt', EventLocationType.WORK_PLACE],
    ['est', EventLocationType.ROAD],
    ['aest', EventLocationType.ROAD],
    ['vu', EventLocationType.ROAD],
    ['lp', EventLocationType.OTHER_PUBLIC_LOCATION],
    ['vf', EventLocationType.OTHER_PUBLIC_LOCATION],
  ])('maps %s to %s', (code, expected) => {
    expect(mapLocationType(code)).toBe(expected);
  });

  it('returns null, never throws, for an unknown code', () => {
    expect(mapLocationType('does-not-exist')).toBeNull();
  });
});

describe('mapOcorrenciaLabel', () => {
  it('prefers the live label read from the legacy table', () => {
    expect(mapOcorrenciaLabel('av', 'Live description')).toBe('Live description');
  });

  it('falls back to the static table when no live label is given', () => {
    expect(mapOcorrenciaLabel('atrop')).toBe('Atropelamento');
    expect(mapOcorrenciaLabel('af')).toBe('Acidente ferroviário');
  });

  it('returns null for a code neither source knows', () => {
    expect(mapOcorrenciaLabel('zzz')).toBeNull();
  });
});

describe('mapInemUnit', () => {
  it('resolves the certain codes to their type and base hospital', () => {
    const vbar = mapInemUnit('vbar');
    expect(isTodoReview(vbar)).toBe(false);
    expect(vbar).toMatchObject({ unitType: InemSupportUnitType.VMER, hospitalMunicipality: 'Barcelos' });

    const sivpl = mapInemUnit('sivpl');
    expect(sivpl).toMatchObject({ unitType: InemSupportUnitType.SIV, hospitalMunicipality: 'Ponte de Lima' });
  });

  it('"0" (Nenhum) resolves to null — a real answer, not "unknown"', () => {
    expect(mapInemUnit('0')).toBeNull();
  });

  it.each(['heli', 'moto', 'pem', 'out', 'vout', 'sivou', 'umip'])(
    'the homeless code %s resolves to NO_STRUCTURED_INEM_ROW, not a guessed hospital (Q1, resolved)',
    (code) => {
      expect(mapInemUnit(code)).toBe(NO_STRUCTURED_INEM_ROW);
    },
  );

  it('an entirely unknown code is undefined, distinct from the "Nenhum" null', () => {
    expect(mapInemUnit('not-a-real-code')).toBeUndefined();
  });
});

describe('mapDestination', () => {
  it.each([
    ['s1', 'Barcelos'],
    ['s2', 'Braga'],
    ['s3', 'Viana do Castelo'],
    ['s4', 'Ponte de Lima'],
  ])('%s resolves to a HOSPITAL destination in %s', (code, municipality) => {
    const result = mapDestination(code);
    expect(isTodoReview(result)).toBe(false);
    expect(result).toMatchObject({ kind: VictimDestinationKind.HOSPITAL, hospitalMunicipality: municipality });
  });

  it('n1 means no victim row at all', () => {
    expect(mapDestination('n1')).toBe('NO_VICTIM');
  });

  it('n2/n3/n5 resolve without a hospital', () => {
    expect(mapDestination('n2')).toMatchObject({ kind: VictimDestinationKind.DECEASED_ON_SCENE });
    expect(mapDestination('n3')).toMatchObject({ kind: VictimDestinationKind.REFUSED_TRANSPORT });
    expect(mapDestination('n5')).toMatchObject({ kind: VictimDestinationKind.CANCELLED });
  });

  it('n4 resolves to CANCELLED (never TREATED_ON_SCENE) with a narrative note preserving the nuance', () => {
    const result = mapDestination('n4');
    expect(result).toMatchObject({ kind: VictimDestinationKind.CANCELLED });
    expect((result as { narrativeNote?: string }).narrativeNote).toMatch(/já transportado por outrem/i);
  });

  it('n6 and s5 reject the whole report rather than guessing a destination or hospital (Q2, resolved)', () => {
    const n6 = mapDestination('n6');
    expect(n6).toMatchObject({ reject: true, reasonCode: 'UNRESOLVED_VICTIM_DESTINATION_N6' });

    const s5 = mapDestination('s5');
    expect(s5).toMatchObject({ reject: true, reasonCode: 'UNRESOLVED_HOSPITAL_S5' });
  });

  it('an unknown code is undefined', () => {
    expect(mapDestination('zzz')).toBeUndefined();
  });
});

describe('mapCertification', () => {
  it('maps tat/tas, case- and accent-insensitively', () => {
    expect(mapCertification('tat')).toBe(CertificationType.TAT);
    expect(mapCertification('TAT')).toBe(CertificationType.TAT);
    expect(mapCertification('tas')).toBe(CertificationType.TAS);
  });

  it('blank or unknown is null, not a rejection', () => {
    expect(mapCertification(null)).toBeNull();
    expect(mapCertification(undefined)).toBeNull();
    expect(mapCertification('')).toBeNull();
    expect(mapCertification('bombeiro')).toBeNull();
  });
});

describe('mapVehicleType', () => {
  it('B is EMERGENCY; A1 and VDTD are TRANSPORT (confirmed)', () => {
    expect(mapVehicleType('B')).toBe(VehicleType.EMERGENCY);
    expect(mapVehicleType('A1')).toBe(VehicleType.TRANSPORT);
    expect(mapVehicleType('VDTD')).toBe(VehicleType.TRANSPORT);
  });

  it('an unrecognised code is null', () => {
    expect(mapVehicleType('ZZ')).toBeNull();
  });
});

describe('mapGender', () => {
  it('maps masculino/feminino, case- and accent-insensitively', () => {
    expect(mapGender('masculino')).toBe(Gender.MALE);
    expect(mapGender('MASCULINO')).toBe(Gender.MALE);
    expect(mapGender('feminino')).toBe(Gender.FEMALE);
  });

  it('is total: blank or unrecognised is UNKNOWN, never a rejection', () => {
    expect(mapGender(null)).toBe(Gender.UNKNOWN);
    expect(mapGender(undefined)).toBe(Gender.UNKNOWN);
    expect(mapGender('')).toBe(Gender.UNKNOWN);
    expect(mapGender('other')).toBe(Gender.UNKNOWN);
  });
});

describe('mapBloodType', () => {
  it.each([
    ['A+', BloodType.A_POS],
    ['a-', BloodType.A_NEG],
    ['AB+', BloodType.AB_POS],
    ['0+', BloodType.O_POS],
    [' O- ', BloodType.O_NEG],
  ])('maps %s to %s', (raw, expected) => {
    expect(mapBloodType(raw)).toBe(expected);
  });

  it('anything else is null, never a rejection', () => {
    expect(mapBloodType(null)).toBeNull();
    expect(mapBloodType('')).toBeNull();
    expect(mapBloodType('XYZ')).toBeNull();
  });
});

describe('mapVolunteerActivity', () => {
  it('maps the four labels grounded in the legacy stats view', () => {
    expect(mapVolunteerActivity('Escala de Emergência')).toEqual({
      activityType: VolunteerActivityType.EMERGENCY,
      description: null,
    });
    expect(mapVolunteerActivity('Apoio')).toEqual({
      activityType: VolunteerActivityType.LOCAL_SUPPORT,
      description: null,
    });
    expect(mapVolunteerActivity('Formação')).toEqual({
      activityType: VolunteerActivityType.TRAINING,
      description: null,
    });
    expect(mapVolunteerActivity('Reunião')).toEqual({
      activityType: VolunteerActivityType.MEETING,
      description: null,
    });
  });

  it('anything else becomes OTHER with the legacy label preserved as the description', () => {
    expect(mapVolunteerActivity('Visita à comunidade')).toEqual({
      activityType: VolunteerActivityType.OTHER,
      description: 'Visita à comunidade',
    });
  });
});

describe('lookupMonth', () => {
  it.each([
    ['janeiro', 1],
    ['Março', 3],
    ['MARCO', 3],
    ['dezembro', 12],
    ['January', 1],
    ['december', 12],
  ])('maps label %s to %d', (label, month) => {
    expect(lookupMonth(label)).toBe(month);
  });

  it.each([
    ['1', 1],
    ['01', 1],
    ['12', 12],
  ])('maps numeric string %s to %d', (label, month) => {
    expect(lookupMonth(label)).toBe(month);
  });

  it('returns null for an unparseable label rather than throwing', () => {
    expect(lookupMonth('not-a-month')).toBeNull();
    expect(lookupMonth('13')).toBeNull();
    expect(lookupMonth('0')).toBeNull();
  });
});
