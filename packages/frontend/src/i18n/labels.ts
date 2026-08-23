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
  'field.verbete': { pt: 'Verbete CODU', en: 'CODU verbete' },
  'field.verbeteHint': {
    pt: 'Uma fotografia ou ficheiro do verbete em papel. Só um por relatório.',
    en: 'A photograph or file of the paper form. One per report.',
  },
  'field.verbeteAdd': { pt: 'Adicionar verbete', en: 'Add the verbete' },
  'field.verbeteReplace': { pt: 'Substituir', en: 'Replace' },
  'field.verbeteOpen': { pt: 'Abrir', en: 'Open' },
  'field.reportNumber': { pt: 'Nº do relatório', en: 'Report number' },
  'field.type': { pt: 'Tipo de evento', en: 'Event type' },
  'field.crew': { pt: 'Equipa', en: 'Crew' },
  'field.shift': { pt: 'Turno', en: 'Shift' },
  'field.victims': { pt: 'Vítimas assistidas', en: 'Victims assisted' },

  // ── Filters (report list) ──
  'filter.allDates': { pt: 'Todas as datas', en: 'All dates' },
  'filter.previousMonth': { pt: 'Mês anterior', en: 'Previous month' },
  'filter.nextMonth': { pt: 'Mês seguinte', en: 'Next month' },
  'filter.clearMonth': { pt: 'Limpar filtro de mês', en: 'Clear month filter' },

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

  // ── Live emergency mode ──
  // The screens a crew uses one-handed, in a moving ambulance, at three in the
  // morning. Every label here is read at a glance rather than studied, which is
  // why they are short, upper-case on the primary controls, and name the act
  // rather than the field.
  'live.title': { pt: 'Emergência em direto', en: 'Live emergency' },
  'live.start': { pt: 'Registar em direto', en: 'Record live' },
  'live.startHint': {
    pt: 'Marca os tempos à medida que acontecem.',
    en: 'Mark the times as they happen.',
  },
  'live.resume': { pt: 'Continuar ocorrência em curso', en: 'Continue the run in progress' },
  'live.openRuns': { pt: 'Ocorrências em curso', en: 'Runs in progress' },
  'live.noOpenRuns': { pt: 'Não há ocorrências em curso.', en: 'No runs in progress.' },
  'live.newRun': { pt: 'Nova ocorrência', en: 'New run' },
  'live.onlyEmergency': {
    pt: 'O registo em direto é só para emergências.',
    en: 'Live recording is for emergencies only.',
  },
  'live.notPermitted': {
    pt: 'Não tens permissão para registar ocorrências.',
    en: 'You are not allowed to record runs.',
  },

  // ── Screens ──
  'live.screen.intake': { pt: 'Ativação', en: 'Intake' },
  'live.screen.enroute': { pt: 'A caminho', en: 'En route' },
  'live.screen.scene': { pt: 'No local', en: 'On scene' },
  'live.screen.assessment': { pt: 'Avaliação', en: 'Assessment' },
  'live.screen.transport': { pt: 'Transporte', en: 'Transport' },
  'live.screen.closing': { pt: 'Fecho', en: 'Closing' },

  // ── The bottom bar ──
  'live.stamp.activationAt': { pt: 'A CAMINHO', en: 'ON OUR WAY' },
  'live.stamp.sceneArrivalAt': { pt: 'CHEGUEI AO LOCAL', en: 'ARRIVED ON SCENE' },
  'live.stamp.sceneDepartureAt': { pt: 'SAÍDA DO LOCAL', en: 'LEFT THE SCENE' },
  'live.stamp.hospitalArrivalAt': { pt: 'CHEGADA AO HOSPITAL', en: 'ARRIVED AT HOSPITAL' },
  'live.stamp.availableAt': { pt: 'AMBULÂNCIA DISPONÍVEL', en: 'AMBULANCE AVAILABLE' },
  'live.stamp.change': { pt: 'Alterar', en: 'Change' },
  'live.navigate': { pt: 'NAVEGAR', en: 'NAVIGATE' },
  'live.navigateNoAddress': {
    pt: 'Sem morada ainda — a hora fica marcada.',
    en: 'No address yet — the time is still marked.',
  },
  'live.finish': { pt: 'TERMINAR E ABRIR RELATÓRIO', en: 'FINISH AND OPEN THE REPORT' },
  'live.finishing': { pt: 'A fechar…', en: 'Closing…' },
  'live.confirmAvailable': {
    pt: 'Marcar a ambulância como disponível e fechar a ocorrência?',
    en: 'Mark the ambulance available and close the run?',
  },
  'live.assessmentOpen': { pt: 'Avaliação', en: 'Assessment' },

  // ── The top bar ──
  'live.clock': { pt: 'Decorrido', en: 'Elapsed' },
  'live.menu': { pt: 'Mais', en: 'More' },
  'live.visited': { pt: 'Ecrãs já vistos', en: 'Screens already seen' },
  'live.coduDados': { pt: 'Ligar CODU DADOS', en: 'Call CODU DADOS' },
  'live.coduDadosDialled': { pt: 'CODU DADOS contactado', en: 'CODU DADOS contacted' },
  'live.back': { pt: 'Voltar', en: 'Back' },
  'live.backConfirm': {
    pt: 'Voltar apaga a hora marcada neste passo. Continuar?',
    en: 'Going back clears the time recorded for this step. Continue?',
  },
  'live.correctTimes': { pt: 'Corrigir horas', en: 'Correct the times' },
  'live.abandon': { pt: 'Abandonar ocorrência', en: 'Abandon the run' },
  'live.abandonConfirm': {
    pt: 'Abandonar apaga o que está registado neste telefone. Continuar?',
    en: 'Abandoning erases what is recorded on this phone. Continue?',
  },

  // ── Sync, in words that answer "will I lose this" ──
  'sync.saved': { pt: 'Gravado no dispositivo', en: 'Saved on the device' },
  'sync.syncing': { pt: 'A sincronizar…', en: 'Syncing…' },
  'sync.synced': { pt: 'Sincronizado', en: 'Synced' },
  'sync.offline': { pt: 'Sem rede — gravado no dispositivo', en: 'No network — saved on the device' },
  'sync.failed': { pt: 'Falha ao sincronizar', en: 'Could not sync' },
  'sync.retry': { pt: 'Tentar agora', en: 'Try now' },
  'sync.pendingOne': { pt: '1 alteração por enviar', en: '1 change to send' },
  'sync.pendingMany': { pt: 'alterações por enviar', en: 'changes to send' },

  // ── Fields the live screens add ──
  'field.chiefComplaint': { pt: 'Motivo da chamada', en: 'Reason for the call' },
  'field.occurrenceAddress': { pt: 'Rua e número', en: 'Street and number' },
  'field.referencePoints': { pt: 'Pontos de referência', en: 'Reference points' },
  'field.victimName': { pt: 'Nome da vítima', en: 'Victim’s name' },
  'field.victimDateOfBirth': { pt: 'Data de nascimento', en: 'Date of birth' },
  'field.victimSnsNumber': { pt: 'Nº de utente (SNS)', en: 'SNS number' },
  'field.victimHomeAddress': { pt: 'Residência', en: 'Home address' },
  'field.victimHomeLocality': { pt: 'Localidade da residência', en: 'Home locality' },
  'field.bodyPosition': { pt: 'Posição da vítima', en: 'Victim’s position' },
  'field.notes': { pt: 'Notas', en: 'Notes' },
  'field.takenAt': { pt: 'Hora da avaliação', en: 'Time of the assessment' },

  // ── Identity, and why it does not last ──
  'live.identityPurged': {
    pt: 'Os dados de identificação já foram apagados.',
    en: 'The identifying details have already been destroyed.',
  },
  'live.identityUnavailable': {
    pt: 'Os dados de identificação não podem ser lidos neste momento.',
    en: 'The identifying details cannot be read right now.',
  },

  // ── The clinical record ──
  'live.abcde': { pt: 'ABCDE', en: 'ABCDE' },
  'live.chamu': { pt: 'CHAMU', en: 'CHAMU' },
  'live.vitals': { pt: 'Sinais vitais', en: 'Vital signs' },
  'live.addAssessment': { pt: 'Nova avaliação', en: 'New assessment' },
  'live.removeAssessment': { pt: 'Apagar esta avaliação', en: 'Delete this assessment' },
  'live.assessmentPager': { pt: 'Avaliação', en: 'Assessment' },
  'live.noAssessments': {
    pt: 'Ainda não há sinais vitais registados.',
    en: 'No vital signs recorded yet.',
  },
  'live.outOfRange': { pt: 'Fora do intervalo possível', en: 'Outside the possible range' },
  'live.implausible': { pt: 'Valor invulgar — confirma', en: 'Unusual value — check it' },
  'live.dictate': { pt: 'Ditar', en: 'Dictate' },
  'live.dictating': { pt: 'A ouvir…', en: 'Listening…' },
  'live.dictationUnavailable': {
    pt: 'Este telefone não suporta ditado.',
    en: 'This phone does not support dictation.',
  },

  // ── Photographs ──
  'live.photos': { pt: 'Fotografias', en: 'Photographs' },
  'live.addPhoto': { pt: 'Tirar fotografia', en: 'Take a photograph' },
  'live.photosPending': { pt: 'fotografias por enviar', en: 'photographs to send' },
  'live.photoPending': { pt: '1 fotografia por enviar', en: '1 photograph to send' },
  'live.photosUploading': { pt: 'A enviar fotografias…', en: 'Sending photographs…' },

  // ── Closing ──
  'live.chronology': { pt: 'Cronologia', en: 'Chronology' },
  'live.notMarked': { pt: 'não marcado', en: 'not marked' },
  'live.closeBlocked': {
    pt: 'Falta o seguinte para fechar:',
    en: 'These are still needed to close:',
  },
  'live.closeWarnings': {
    pt: 'Podes fechar assim — isto fica para o relatório:',
    en: 'You can close as it is — these are for the report:',
  },
  'live.closedIntoDraft': {
    pt: 'Ocorrência fechada. O relatório está por entregar.',
    en: 'Run closed. The report is not filed yet.',
  },

  // ── Drafts and filing ──
  'report.pending': { pt: 'Por entregar', en: 'Not filed' },
  'report.pendingHint': {
    pt: 'Relatórios abertos a partir de uma ocorrência em direto, à espera de serem entregues.',
    en: 'Reports opened from a live run, waiting to be filed.',
  },
  'report.filed': { pt: 'Entregues', en: 'Filed' },
  'report.noNumberYet': { pt: 'Sem número', en: 'No number yet' },
  'report.submit': { pt: 'Entregar relatório', en: 'File the report' },
  'report.submitting': { pt: 'A entregar…', en: 'Filing…' },
  'report.submitted': { pt: 'Relatório entregue', en: 'Report filed' },
  'report.renumbered': {
    pt: 'relatórios já entregues mudaram de número',
    en: 'already-filed reports changed number',
  },
  'report.kilometresPending': { pt: 'por calcular', en: 'not computed yet' },
  'report.kilometresComputed': { pt: 'Calculado a partir do percurso', en: 'Computed from the route' },
  'report.kilometresOverridden': { pt: 'Alterado à mão', en: 'Edited by hand' },
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

  // ── The clinical record's own problems ──
  'problem.CLINICAL_NOT_FOR_TYPE': {
    pt: 'Só um relatório de emergência tem registo clínico.',
    en: 'Only an emergency report has a clinical record.',
  },
  'problem.CHAMU_TOO_LONG': { pt: 'A nota é demasiado longa.', en: 'The note is too long.' },
  'problem.ABCDE_UNKNOWN_BAND': { pt: 'Letra ABCDE desconhecida.', en: 'Unknown ABCDE band.' },
  'problem.ABCDE_INVALID_STATUS': {
    pt: 'Escolhe normal, alterado ou não avaliado.',
    en: 'Choose normal, altered or not assessed.',
  },
  'problem.ABCDE_NOTE_TOO_LONG': {
    pt: 'A nota ABCDE é demasiado longa.',
    en: 'The ABCDE note is too long.',
  },
  'problem.ASSESSMENTS_NOT_A_LIST': {
    pt: 'Faltam as avaliações.',
    en: 'The assessments are missing.',
  },
  'problem.TOO_MANY_ASSESSMENTS': {
    pt: 'Demasiadas avaliações neste relatório.',
    en: 'Too many assessments on this report.',
  },
  'problem.ASSESSMENT_INVALID_TIME': {
    pt: 'A avaliação precisa da hora a que foi feita.',
    en: 'The assessment needs the time it was taken.',
  },
  'problem.ASSESSMENT_EMPTY': {
    pt: 'Esta avaliação não tem nada registado.',
    en: 'This assessment has nothing recorded in it.',
  },
  'problem.VITAL_OUT_OF_RANGE': {
    pt: 'Valor fora do intervalo possível.',
    en: 'The value is outside the possible range.',
  },
  'problem.VITAL_NOT_WHOLE': {
    pt: 'Este valor é um número inteiro.',
    en: 'This value is a whole number.',
  },
  'problem.DIASTOLIC_ABOVE_SYSTOLIC': {
    pt: 'A diastólica não pode ser maior que a sistólica.',
    en: 'The diastolic cannot be above the systolic.',
  },
  'problem.ASSESSMENT_POSITION_TOO_LONG': {
    pt: 'A posição da vítima é demasiado longa.',
    en: 'The victim’s position is too long.',
  },

  // ── The live run's own problems ──
  'problem.LIVE_RUN_MISSING_ID': {
    pt: 'A ocorrência não tem identificador.',
    en: 'The run has no id.',
  },
  'problem.LIVE_RUN_INVALID_REVISION': {
    pt: 'A ocorrência tem uma versão inválida.',
    en: 'The run has an invalid revision.',
  },
  'problem.LIVE_RUN_UNKNOWN_STATE': {
    pt: 'Estado da ocorrência desconhecido.',
    en: 'Unknown run state.',
  },
  'problem.LIVE_RUN_MISSING_START': {
    pt: 'Falta a hora de início da ocorrência.',
    en: 'The run needs a start time.',
  },
  'problem.LIVE_RUN_COMPLAINT_TOO_LONG': {
    pt: 'O motivo da chamada é demasiado longo.',
    en: 'The reason for the call is too long.',
  },
  'problem.LIVE_RUN_ADDRESS_TOO_LONG': {
    pt: 'A morada é demasiado longa.',
    en: 'The address is too long.',
  },
  'problem.LIVE_RUN_NAME_TOO_LONG': { pt: 'O nome é demasiado longo.', en: 'The name is too long.' },
  'problem.LIVE_RUN_INVALID_DATE_OF_BIRTH': {
    pt: 'A data de nascimento é uma data (AAAA-MM-DD).',
    en: 'The date of birth is a calendar date (YYYY-MM-DD).',
  },
  'problem.LIVE_RUN_INVALID_SNS': {
    pt: 'O nº de utente tem nove dígitos.',
    en: 'An SNS number is nine digits.',
  },

  // ── What is unfinished on a run, and what actually blocks the close ──
  'liveWarning.NO_COMPLAINT': {
    pt: 'Falta o motivo da chamada.',
    en: 'The reason for the call is missing.',
  },
  'liveWarning.NO_VICTIM_DETAILS': {
    pt: 'Faltam o género e a idade da vítima.',
    en: 'The victim’s gender and age are missing.',
  },
  'liveWarning.NO_DESTINATION': {
    pt: 'Falta o destino da vítima.',
    en: 'The victim’s outcome is missing.',
  },
  'liveWarning.NO_VITALS': {
    pt: 'Não há sinais vitais registados.',
    en: 'No vital signs were recorded.',
  },
  'liveWarning.NO_CREW': { pt: 'Não há ninguém na equipa.', en: 'Nobody is on the crew.' },
  'liveWarning.NO_VEHICLE': { pt: 'Não há viatura registada.', en: 'No vehicle is listed.' },
  'liveWarning.MISSING_STAMPS': {
    pt: 'Faltam tempos da ocorrência.',
    en: 'Some occurrence times are missing.',
  },

  'liveBlocker.NO_STAMPS': {
    pt: 'Marca pelo menos um tempo da ocorrência.',
    en: 'Mark at least one occurrence time.',
  },
  'liveBlocker.NO_LOCALITY': { pt: 'Escolhe a localidade.', en: 'Choose the locality.' },
  'liveBlocker.NO_LOCATION_TYPE': {
    pt: 'Escolhe o tipo de local.',
    en: 'Choose the kind of place.',
  },
  'liveBlocker.NO_REFERENCE': { pt: 'Escreve o nº CODU.', en: 'Enter the CODU number.' },

  // ── ABCDE ──
  'abcde.A': { pt: 'A — Via aérea', en: 'A — Airway' },
  'abcde.B': { pt: 'B — Ventilação', en: 'B — Breathing' },
  'abcde.C': { pt: 'C — Circulação', en: 'C — Circulation' },
  'abcde.D': { pt: 'D — Disfunção neurológica', en: 'D — Disability' },
  'abcde.E': { pt: 'E — Exposição', en: 'E — Exposure' },
  'abcdeStatus.NORMAL': { pt: 'Normal', en: 'Normal' },
  'abcdeStatus.ALTERED': { pt: 'Alterado', en: 'Altered' },
  'abcdeStatus.NOT_ASSESSED': { pt: 'Não avaliado', en: 'Not assessed' },

  // ── CHAMU, as the national form names it ──
  'chamu.chamuCircumstances': { pt: 'C — Circunstâncias', en: 'C — Circumstances' },
  'chamu.chamuHistory': { pt: 'H — História clínica', en: 'H — History' },
  'chamu.chamuAllergies': { pt: 'A — Alergias', en: 'A — Allergies' },
  'chamu.chamuMedication': { pt: 'M — Medicação', en: 'M — Medication' },
  'chamu.chamuLastMeal': { pt: 'U — Última refeição', en: 'U — Last meal' },

  // ── Vitals ──
  'vital.spo2': { pt: 'SpO₂', en: 'SpO₂' },
  'vital.respiratoryRate': { pt: 'Freq. respiratória', en: 'Respiratory rate' },
  'vital.heartRate': { pt: 'Freq. cardíaca', en: 'Heart rate' },
  'vital.systolic': { pt: 'T.A. sistólica', en: 'Systolic' },
  'vital.diastolic': { pt: 'T.A. diastólica', en: 'Diastolic' },
  'vital.bloodGlucose': { pt: 'Glicemia', en: 'Blood glucose' },
  'vital.temperature': { pt: 'Temperatura', en: 'Temperature' },
  'vital.glasgow': { pt: 'Escala de Glasgow', en: 'Glasgow scale' },
  'vital.painScore': { pt: 'Dor (0–10)', en: 'Pain (0–10)' },

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

/** What is still unfinished on a live run, in the crew's language. */
export const liveWarningLabel = (code: string): string =>
  t(`liveWarning.${code}` as EnumMessageKey);

/** What actually stops a run being closed. */
export const liveBlockerLabel = (code: string): string =>
  t(`liveBlocker.${code}` as EnumMessageKey);

/** The label on the bottom bar's primary control, from the stamp it writes. */
export const liveStampLabel = (field: string): string =>
  t(`live.stamp.${field}` as EnumMessageKey);

export const liveScreenLabel = (screen: string): string =>
  t(`live.screen.${screen}` as EnumMessageKey);

export const abcdeBandLabel = (band: string): string => t(`abcde.${band}` as EnumMessageKey);

export const abcdeStatusLabel = (status: string): string =>
  t(`abcdeStatus.${status}` as EnumMessageKey);

export const chamuLabel = (field: string): string => t(`chamu.${field}` as EnumMessageKey);

export const vitalLabel = (key: string): string => t(`vital.${key}` as EnumMessageKey);

export const syncStateLabel = (state: string): string => t(`sync.${state}` as EnumMessageKey);

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
