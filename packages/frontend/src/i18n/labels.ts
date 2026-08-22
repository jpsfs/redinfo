import {
  EventLocationType,
  EventReportProblem,
  EventReportType,
  EventReportWarningCode,
  Gender,
  VictimDestinationKind,
} from '@redinfo/shared';

/**
 * Labels for the report screens, in the crew's language.
 *
 * The rest of the app is in English because coordinators use it at a desk. The
 * report screens are the ones used at three in the morning with one thumb, so
 * they are in Portuguese — and every string goes through here rather than being
 * typed into a component, so switching the whole app later is a matter of
 * translating this file rather than hunting through JSX.
 *
 * Deliberately not `react-admin`'s i18n provider: that would mean translating
 * every existing English screen at the same time, which is a separate job. This
 * is a small, typed map with room for a second locale, and `MessageKey` makes a
 * typo a compile error instead of a blank label on a phone.
 */

export type Locale = 'pt' | 'en';

/** Every message, with its translations side by side so a gap is obvious. */
const MESSAGES = {
  // ── Titles and navigation ──
  'report.new': { pt: 'Novo relatório', en: 'New report' },
  'report.mine': { pt: 'Os meus relatórios', en: 'My reports' },
  'report.all': { pt: 'Relatórios de evento', en: 'Event reports' },
  'report.saved': { pt: 'Relatório gravado', en: 'Report saved' },
  'report.numberAssigned': { pt: 'Número atribuído', en: 'Number assigned' },
  'report.chooseType': { pt: 'Que tipo de evento?', en: 'What kind of event?' },
  'report.chooseTypeHint': {
    pt: 'Escolhe uma opção. O número é atribuído no fim.',
    en: 'Pick one. The number is assigned at the end.',
  },
  'report.yourShiftToday': { pt: 'É o teu turno de hoje', en: 'This is your shift today' },
  'report.open': { pt: 'Abrir', en: 'Open' },
  'report.view': { pt: 'Ver o relatório', en: 'View the report' },
  'report.none': { pt: 'Ainda não tens relatórios.', en: 'You have no reports yet.' },

  // ── Steps ──
  'step.whenWhere': { pt: 'Quando e onde', en: 'When and where' },
  'step.times': { pt: 'Tempos', en: 'Times' },
  'step.crew': { pt: 'Equipa', en: 'Crew' },
  'step.vehicles': { pt: 'Viatura e quilómetros', en: 'Vehicle and kilometres' },
  'step.vehiclesPlural': { pt: 'Viaturas e quilómetros', en: 'Vehicles and kilometres' },
  'step.victims': { pt: 'Vítima e transporte', en: 'Victim and transport' },
  'step.victimsPlural': { pt: 'Vítimas e transporte', en: 'Victims and transport' },
  'step.narrative': { pt: 'Relato e anexos', en: 'Report and attachments' },
  'step.review': { pt: 'Revisão', en: 'Review' },
  'step.of': { pt: 'de', en: 'of' },
  'step.optional': { pt: 'opcional', en: 'optional' },

  // ── Fields ──
  'field.date': { pt: 'Data', en: 'Date' },
  'field.hours': { pt: 'Horas do serviço', en: 'Service hours' },
  'field.start': { pt: 'Início', en: 'Start' },
  'field.end': { pt: 'Fim', en: 'End' },
  'field.locationType': { pt: 'Tipo de local', en: 'Location type' },
  'field.locality': { pt: 'Localidade', en: 'Locality' },
  'field.reference': { pt: 'Nº de referência', en: 'Reference number' },
  'field.coduReference': { pt: 'Nº CODU', en: 'CODU number' },
  'field.vehicle': { pt: 'Viatura', en: 'Vehicle' },
  'field.vehiclesUsed': { pt: 'Viaturas usadas', en: 'Vehicles used' },
  'field.kilometres': { pt: 'Quilómetros percorridos', en: 'Kilometres covered' },
  'field.kilometresShort': { pt: 'km', en: 'km' },
  'field.total': { pt: 'Total', en: 'Total' },
  'field.gender': { pt: 'Género', en: 'Gender' },
  'field.age': { pt: 'Idade', en: 'Age' },
  'field.years': { pt: 'anos', en: 'years' },
  'field.destination': { pt: 'Transportado para', en: 'Taken to' },
  'field.narrative': { pt: 'Relato operacional', en: 'Operational report' },
  'field.attachments': { pt: 'Anexos', en: 'Attachments' },
  'field.reportNumber': { pt: 'Nº do relatório', en: 'Report number' },
  'field.type': { pt: 'Tipo de evento', en: 'Event type' },
  'field.crew': { pt: 'Equipa', en: 'Crew' },
  'field.shift': { pt: 'Turno', en: 'Shift' },
  'field.victims': { pt: 'Vítimas assistidas', en: 'Victims assisted' },

  // ── Actions ──
  'action.next': { pt: 'Seguinte', en: 'Next' },
  'action.back': { pt: 'Voltar', en: 'Back' },
  'action.save': { pt: 'Gravar relatório', en: 'Save report' },
  'action.cancel': { pt: 'Cancelar', en: 'Cancel' },
  'action.now': { pt: 'Agora', en: 'Now' },
  'action.change': { pt: 'Alterar', en: 'Change' },
  'action.changeShift': { pt: 'Mudar turno', en: 'Change shift' },
  'action.addPerson': { pt: 'Adicionar pessoa', en: 'Add person' },
  'action.addVehicle': { pt: 'Adicionar viatura', en: 'Add vehicle' },
  'action.addVictim': { pt: 'Adicionar vítima', en: 'Add victim' },
  'action.remove': { pt: 'Remover', en: 'Remove' },
  'action.takePhoto': { pt: 'Tirar fotografia', en: 'Take a photo' },
  'action.attachFile': { pt: 'Anexar ficheiro', en: 'Attach a file' },
  'action.search': { pt: 'Procurar', en: 'Search' },
  'action.useMyLocation': { pt: 'Usar a minha localização', en: 'Use my location' },
  'action.newReport': { pt: 'Novo relatório', en: 'New report' },
  'action.continueDraft': { pt: 'Continuar', en: 'Continue' },
  'action.discardDraft': { pt: 'Apagar rascunho', en: 'Discard draft' },
  'action.edit': { pt: 'Editar', en: 'Edit' },
  'action.print': { pt: 'Imprimir', en: 'Print' },

  // ── Status and hints ──
  'status.draftSaved': { pt: 'Guardado', en: 'Saved' },
  'status.draftUnfinished': { pt: 'Rascunho por terminar', en: 'Unfinished draft' },
  'status.today': { pt: 'HOJE', en: 'TODAY' },
  'status.fromShift': { pt: 'DO TURNO', en: 'FROM SHIFT' },
  'status.saving': { pt: 'A gravar…', en: 'Saving…' },
  'hint.numberOnSave': {
    pt: 'O número do relatório é atribuído ao gravar.',
    en: 'The report number is assigned when you save.',
  },
  'hint.timesOptional': {
    pt: 'Toca em Agora para marcar a hora. Podes deixar em branco.',
    en: 'Tap Now to stamp the time. You may leave it blank.',
  },
  'hint.emergencyTimesOnly': {
    pt: 'Só nos relatórios de emergência.',
    en: 'Emergency reports only.',
  },
  'hint.crewFromSchedule': {
    pt: 'A equipa vem da escala do dia e do tipo de evento. Se saiu outra equipa, muda o turno.',
    en: 'The crew comes from the day’s rota for this event type. If another crew went, change the shift.',
  },
  'hint.oneVehicleEmergency': {
    pt: 'Numa emergência sai uma viatura. Nos apoios podes registar várias.',
    en: 'An emergency uses one vehicle. Support reports may list several.',
  },
  'hint.kilometresTotal': {
    pt: 'Total da saída até ao regresso ao quartel.',
    en: 'Total from leaving to returning to the station.',
  },
  'hint.ageApproximate': {
    pt: 'Se não souberes ao certo, aproxima.',
    en: 'If you are not sure, approximate.',
  },
  'hint.hospitalsByDistance': {
    pt: 'Hospitais mais próximos primeiro. Se não houve transporte, escolhe o desfecho.',
    en: 'Nearest hospitals first. If nobody was transported, pick the outcome.',
  },
  'hint.localitiesOffline': {
    pt: 'Todas as localidades de Portugal — funciona sem rede.',
    en: 'Every locality in Portugal — works with no signal.',
  },
  'hint.canSaveIncomplete': {
    pt: 'Podes gravar assim e completar depois.',
    en: 'You can save this and finish it later.',
  },
  'hint.victimEach': {
    pt: 'Cada vítima guarda o seu género, idade e para onde foi transportada.',
    en: 'Each victim keeps their own gender, age and destination.',
  },
  'hint.approximateDistance': {
    pt: 'distância ao concelho',
    en: 'distance to the municipality',
  },
  'hint.noVictim': { pt: 'Não houve vítima a registar', en: 'No victim to record' },
  'hint.recent': { pt: 'RECENTES', en: 'RECENT' },
  'hint.noTransport': { pt: 'SEM TRANSPORTE', en: 'NOT TRANSPORTED' },
  'hint.chooseShift': { pt: 'Escolher turno', en: 'Choose a shift' },
  'hint.recogniseCrew': {
    pt: 'Reconhece a equipa pelos nomes.',
    en: 'Recognise the crew by their names.',
  },
  'hint.noShift': {
    pt: 'Não havia turno — escolher pessoas',
    en: 'No shift — pick people',
  },
  'hint.searchLocality': { pt: 'Procurar localidade…', en: 'Search for a locality…' },
  'hint.searchHospital': { pt: 'Procurar hospital…', en: 'Search for a hospital…' },
  'hint.nothingFound': { pt: 'Nada encontrado.', en: 'Nothing found.' },
  'hint.loading': { pt: 'A carregar…', en: 'Loading…' },
} as const;

export type MessageKey = keyof typeof MESSAGES;

/**
 * Enum labels live in the same map, under a derived key, so a value added to an
 * enum without a label fails to compile rather than rendering its raw name.
 */
const ENUM_MESSAGES = {
  [`reportType.${EventReportType.EMERGENCY}`]: { pt: 'Emergência', en: 'Emergency' },
  [`reportType.${EventReportType.LOCAL_SUPPORT}`]: {
    pt: 'Apoio Local',
    en: 'Local Support',
  },
  [`reportType.${EventReportType.SALOP_SUPPORT}`]: {
    pt: 'Apoio SALOP',
    en: 'SALOP Support',
  },

  [`reportTypeHint.${EventReportType.EMERGENCY}`]: {
    pt: 'Ocorrência com número CODU',
    en: 'Call with a CODU number',
  },
  [`reportTypeHint.${EventReportType.LOCAL_SUPPORT}`]: {
    pt: 'Eventos e prevenções da delegação',
    en: 'Delegation events and standbys',
  },
  [`reportTypeHint.${EventReportType.SALOP_SUPPORT}`]: {
    pt: 'Apoio logístico às operações',
    en: 'Logistical support to operations',
  },

  [`locationType.${EventLocationType.HOME}`]: { pt: 'Habitação', en: 'Home' },
  [`locationType.${EventLocationType.ROAD}`]: { pt: 'Via pública', en: 'Road' },
  [`locationType.${EventLocationType.PUBLIC_SPACE}`]: {
    pt: 'Espaço público',
    en: 'Public space',
  },

  [`gender.${Gender.FEMALE}`]: { pt: 'Feminino', en: 'Female' },
  [`gender.${Gender.MALE}`]: { pt: 'Masculino', en: 'Male' },
  [`gender.${Gender.UNKNOWN}`]: { pt: 'Desconhecido', en: 'Unknown' },

  [`destination.${VictimDestinationKind.HOSPITAL}`]: { pt: 'Hospital', en: 'Hospital' },
  [`destination.${VictimDestinationKind.TREATED_ON_SCENE}`]: {
    pt: 'Tratado no local',
    en: 'Treated on scene',
  },
  [`destination.${VictimDestinationKind.REFUSED_TRANSPORT}`]: {
    pt: 'Recusou transporte',
    en: 'Refused transport',
  },
  [`destination.${VictimDestinationKind.DECEASED_ON_SCENE}`]: {
    pt: 'Óbito no local',
    en: 'Deceased on scene',
  },
  [`destination.${VictimDestinationKind.CANCELLED}`]: { pt: 'Cancelado', en: 'Cancelled' },

  // The five stamps of an emergency, in the order they happen.
  'time.activationAt': { pt: 'Ativação', en: 'Activation' },
  'time.sceneArrivalAt': { pt: 'Chegada ao local', en: 'Arrival on scene' },
  'time.sceneDepartureAt': { pt: 'Saída do local', en: 'Departure from scene' },
  'time.hospitalArrivalAt': { pt: 'Chegada ao hospital', en: 'Arrival at hospital' },
  'time.availableAt': { pt: 'Disponível', en: 'Available' },

  // ── Why a report cannot be saved ──
  // Keyed by the code `validateEventReport` returns, so the crew reads
  // Portuguese while the API's own 400 keeps its English sentence.
  'problem.MISSING_DATE': {
    pt: 'Falta a data do evento.',
    en: 'The date of the activity is missing.',
  },
  'problem.MISSING_START': { pt: 'Falta a hora de início.', en: 'The start time is missing.' },
  'problem.INVALID_END': { pt: 'A hora de fim não é válida.', en: 'The end time is not valid.' },
  'problem.END_BEFORE_START': {
    pt: 'O serviço não pode acabar antes de começar.',
    en: 'The activity cannot end before it starts.',
  },
  'problem.MISSING_LOCATION_TYPE': {
    pt: 'Escolhe o tipo de local: habitação, via pública ou espaço público.',
    en: 'Choose the location type.',
  },
  'problem.MISSING_LOCALITY': { pt: 'Escolhe a localidade.', en: 'Choose the locality.' },
  'problem.MISSING_REFERENCE': {
    pt: 'O nº CODU é obrigatório num relatório de emergência.',
    en: 'The CODU number is required on an emergency report.',
  },
  'problem.REFERENCE_TOO_LONG': {
    pt: 'O nº de referência é demasiado longo.',
    en: 'The reference is too long.',
  },
  'problem.TIMES_NOT_FOR_TYPE': {
    pt: 'Estes tempos só existem nos relatórios de emergência.',
    en: 'These times only exist on emergency reports.',
  },
  'problem.INVALID_TIME': { pt: 'Há uma hora inválida.', en: 'One of the times is not valid.' },
  'problem.TIMES_OUT_OF_ORDER': {
    pt: 'Os tempos estão fora de ordem.',
    en: 'The times are out of order.',
  },
  'problem.TOO_MANY_CREW': { pt: 'Demasiadas pessoas na equipa.', en: 'Too many people.' },
  'problem.CREW_MISSING_PERSON': {
    pt: 'Há uma pessoa em falta na equipa.',
    en: 'A crew member is missing.',
  },
  'problem.CREW_DUPLICATE': {
    pt: 'A mesma pessoa está na equipa duas vezes.',
    en: 'The same person is listed twice.',
  },
  'problem.ROLE_NAME_TOO_LONG': {
    pt: 'O nome da função é demasiado longo.',
    en: 'The role name is too long.',
  },
  'problem.TOO_MANY_VEHICLES': {
    pt: 'Numa emergência registas uma só viatura.',
    en: 'An emergency records a single vehicle.',
  },
  'problem.VEHICLE_MISSING_ID': { pt: 'Falta escolher a viatura.', en: 'Choose the vehicle.' },
  'problem.VEHICLE_DUPLICATE': {
    pt: 'A mesma viatura está registada duas vezes.',
    en: 'The same vehicle is listed twice.',
  },
  'problem.KILOMETRES_INVALID': {
    pt: 'Os quilómetros têm de ser um número inteiro.',
    en: 'Kilometres must be a whole number.',
  },
  'problem.TOO_MANY_VICTIMS': {
    pt: 'Numa emergência registas uma só vítima.',
    en: 'An emergency records a single victim.',
  },
  'problem.VICTIM_GENDER_MISSING': {
    pt: 'Falta o género da vítima.',
    en: 'The victim needs a gender.',
  },
  'problem.VICTIM_AGE_INVALID': {
    pt: 'A idade da vítima tem de estar entre 0 e 130.',
    en: 'The victim’s age must be between 0 and 130.',
  },
  'problem.DESTINATION_INVALID': {
    pt: 'Escolhe para onde foi a vítima, ou por que não foi transportada.',
    en: 'Choose where the victim went, or why they were not transported.',
  },
  'problem.DESTINATION_HOSPITAL_REQUIRED': {
    pt: 'Escolhe o hospital para onde a vítima foi transportada.',
    en: 'Choose which hospital the victim was taken to.',
  },
  'problem.DESTINATION_HOSPITAL_NOT_ALLOWED': {
    pt: 'Uma vítima que não foi transportada não pode ter hospital.',
    en: 'A victim who was not transported cannot have a hospital.',
  },
  'problem.NARRATIVE_TOO_LONG': {
    pt: 'O relato é demasiado longo.',
    en: 'The report is too long.',
  },
  'problem.UNKNOWN_TYPE': {
    pt: 'Tipo de relatório desconhecido.',
    en: 'Unknown report type.',
  },
  'problem.CREW_NOT_A_LIST': { pt: 'Falta a equipa.', en: 'The crew is missing.' },
  'problem.VEHICLES_NOT_A_LIST': { pt: 'Faltam as viaturas.', en: 'The vehicles are missing.' },
  'problem.VICTIMS_NOT_A_LIST': { pt: 'Faltam as vítimas.', en: 'The victims are missing.' },
  'problem.SHIFT_MISSING_SCHEDULE': {
    pt: 'O turno indicado não tem escala.',
    en: 'The shift reference has no schedule.',
  },
  'problem.SHIFT_MISSING_DATE': {
    pt: 'O turno indicado não tem data.',
    en: 'The shift reference has no date.',
  },
  'problem.SHIFT_MISSING_SLOT': {
    pt: 'O turno indicado não tem período.',
    en: 'The shift reference has no slot.',
  },

  // ── What is still unfinished ──
  'warning.MISSING_END_TIME': { pt: 'Falta a hora de fim.', en: 'The end time is missing.' },
  'warning.MISSING_NARRATIVE': {
    pt: 'O relato ainda não está escrito.',
    en: 'The report has not been written yet.',
  },
  'warning.NO_CREW': { pt: 'Não há ninguém na equipa.', en: 'Nobody is on the crew.' },
  'warning.NO_VEHICLE': { pt: 'Não há viatura registada.', en: 'No vehicle is listed.' },
  'warning.NO_VICTIM': { pt: 'Não há vítima registada.', en: 'No victim is recorded.' },
  'warning.NO_TIMES_MARKED': {
    pt: 'Nenhum tempo da ocorrência foi marcado.',
    en: 'None of the occurrence times were marked.',
  },

  // Crew posts as the schedule names them, translated where we recognise them.
  'role.Driver': { pt: 'Condutor', en: 'Driver' },
  'role.Team Leader': { pt: 'Chefe de Equipa', en: 'Team Leader' },
  'role.Team Member': { pt: 'Socorrista', en: 'Team Member' },
} as const;

type EnumMessageKey = keyof typeof ENUM_MESSAGES;

const ALL_MESSAGES: Record<string, { pt: string; en: string }> = {
  ...MESSAGES,
  ...ENUM_MESSAGES,
};

let locale: Locale = 'pt';

/** The locale every `t()` call reads. Portuguese unless something says otherwise. */
export function setLocale(next: Locale): void {
  locale = next;
}

export function getLocale(): Locale {
  return locale;
}

/**
 * A label.
 *
 * Falls back to the key itself for a message that does not exist — visible in
 * development, and far better on a phone than a blank button.
 */
export function t(key: MessageKey | EnumMessageKey): string {
  return ALL_MESSAGES[key]?.[locale] ?? String(key);
}

export const reportTypeLabel = (type: EventReportType | string): string =>
  t(`reportType.${type}` as EnumMessageKey);

export const reportTypeHint = (type: EventReportType | string): string =>
  t(`reportTypeHint.${type}` as EnumMessageKey);

export const locationTypeLabel = (value: EventLocationType | string): string =>
  t(`locationType.${value}` as EnumMessageKey);

export const genderLabel = (value: Gender | string): string =>
  t(`gender.${value}` as EnumMessageKey);

export const destinationLabel = (value: VictimDestinationKind | string): string =>
  t(`destination.${value}` as EnumMessageKey);

export const occurrenceTimeLabel = (field: string): string =>
  t(`time.${field}` as EnumMessageKey);

/**
 * Why a report cannot be saved, in the crew's language.
 *
 * Falls back to the English message the rule carries, so a code added to
 * `@redinfo/shared` without a translation still says something true rather than
 * showing a bare `problem.WHATEVER`.
 */
export const problemLabel = (problem: EventReportProblem | null): string => {
  if (!problem) return '';
  const key = `problem.${problem.code}`;
  return key in ALL_MESSAGES ? t(key as EnumMessageKey) : problem.message;
};

/** What is still unfinished, in the crew's language. */
export const warningLabel = (code: EventReportWarningCode): string =>
  t(`warning.${code}` as EnumMessageKey);

/**
 * A crew post, translated when it is one of the standard three and left as
 * typed otherwise — a coordinator may name a role anything, and inventing a
 * translation for "Apoio Extra" would be worse than showing what they wrote.
 */
export const roleLabel = (name?: string | null): string => {
  if (!name) return '';
  const key = `role.${name}`;
  return key in ALL_MESSAGES ? t(key as EnumMessageKey) : name;
};
