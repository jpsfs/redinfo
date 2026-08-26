import type { ApiErrorCode, Locale } from '@redinfo/shared';
import {
  AVAILABILITY_WINDOW_CATEGORY_METADATA,
  AvailabilityWindowCategory,
  availabilityWindowCategoryLabel,
  EventLocationType,
  EventReportProblem,
  EventReportType,
  EventReportWarningCode,
  Gender,
  UserRole,
  VictimDestinationKind,
} from '@redinfo/shared';

export type { Locale };

/**
 * The app's own message catalogue — everything that is not one of
 * react-admin's ~164 built-in strings (those live in `ra-pt.ts`, merged in by
 * `i18nProvider.ts`).
 *
 * The side-by-side `{ pt, en }` authoring shape predates #180 and is kept on
 * purpose: a gap is obvious at a glance, and `MessageKey` makes a typo a
 * compile error instead of a blank label on a phone. What #180 changed is the
 * plumbing underneath — this file no longer holds any locale state of its
 * own. `messagesFor()` flattens a locale's half of the map into what
 * `ra-i18n-polyglot` wants; the actual lookup happens through react-admin's
 * `useTranslate()` (see `useT.ts`), which re-renders when the locale changes.
 * A bare, non-reactive `t()` could not do that — see #180's plan for why.
 */

/** What every enum-label helper below takes as its first argument. */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

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

  // ── My profile ──
  'profile.title': { pt: 'O meu perfil', en: 'My profile' },
  'profile.operational': { pt: 'Operacional', en: 'Operational' },
  'profile.notOperational': { pt: 'Não operacional', en: 'Not operational' },
  'profile.myCertifications': { pt: 'As minhas certificações', en: 'My certifications' },
  'profile.certificationsHint': {
    pt: 'Mantidas pelo coordenador. Se algo estiver errado, fale com ele.',
    en: 'Maintained by your coordinator. If something looks wrong, talk to them.',
  },
  'profile.noCertifications': {
    pt: 'Ainda não tem certificações registadas.',
    en: 'No certifications on file yet.',
  },
  'profile.grantedBy': { pt: 'concedido por', en: 'granted by' },
  'profile.noExpiryOnFile': { pt: 'sem data de validade registada', en: 'no expiry on file' },
  'profile.personalData': { pt: 'Dados pessoais', en: 'Personal data' },
  'profile.edit': { pt: 'Editar', en: 'Edit' },
  'profile.save': { pt: 'Guardar', en: 'Save' },
  'profile.cancel': { pt: 'Cancelar', en: 'Cancel' },
  'profile.saved': { pt: 'Perfil atualizado', en: 'Profile updated' },
  'profile.saveFailed': { pt: 'Não foi possível guardar.', en: 'Could not save.' },
  'profile.phone': { pt: 'Telefone', en: 'Phone' },
  'profile.address': { pt: 'Morada', en: 'Address' },
  'profile.postalCode': { pt: 'Código postal', en: 'Postal code' },
  'profile.birthDate': { pt: 'Data de nascimento', en: 'Date of birth' },
  'profile.emergencyContact': { pt: 'Contacto de emergência', en: 'Emergency contact' },
  'profile.emergencyContactPhone': {
    pt: 'Telefone do contacto de emergência',
    en: 'Emergency contact phone',
  },
  'profile.identification': { pt: 'Identificação', en: 'Identification' },
  'profile.identificationHint': {
    pt: 'Atribuída pela delegação. Para corrigir, fale com o coordenador.',
    en: 'Assigned by the delegation. To correct, talk to your coordinator.',
  },
  'profile.redCrossNumber': { pt: 'Nº Nacional CVP', en: 'Red Cross national no.' },
  'profile.volunteerNumber': { pt: 'Nº de Voluntário', en: 'Volunteer no.' },
  'profile.joinedOn': { pt: 'Data de admissão', en: 'Joined on' },
  'profile.bloodType': { pt: 'Grupo sanguíneo', en: 'Blood type' },
  'profile.nif': { pt: 'NIF', en: 'NIF' },
  'profile.citizenCard': { pt: 'Cartão de cidadão', en: 'Citizen card' },
  'profile.notSet': { pt: 'não definido', en: 'not set' },
  'profile.expiresIn': { pt: 'expira em', en: 'expires in' },
  'profile.days': { pt: 'dias', en: 'days' },
  'profile.lapsedKeepsAccess': {
    pt: 'Continua a ter acesso, mas deixa de poder ser escalado.',
    en: 'You keep access, but you can no longer be scheduled.',
  },
  'profile.changePhoto': { pt: 'Alterar foto', en: 'Change photo' },
  'profile.removePhoto': { pt: 'Remover', en: 'Remove' },
  'profile.photoUpdated': { pt: 'Foto atualizada', en: 'Photo updated' },
  'profile.photoUpdateFailed': { pt: 'Não foi possível carregar a foto.', en: 'Could not upload the photo.' },
  'profile.photoRemoved': { pt: 'Foto removida', en: 'Photo removed' },
  'profile.photoRemoveFailed': { pt: 'Não foi possível remover a foto.', en: 'Could not remove the photo.' },

  // ── The language switcher, on this same page ──
  'profile.language': { pt: 'Idioma', en: 'Language' },
  'profile.languageHint': {
    pt: 'Muda de imediato. As certificações e o resto do texto ficam neste idioma.',
    en: 'Switches immediately. Certifications and the rest of the text follow.',
  },
  'profile.languageSaveFailed': {
    pt: 'Não foi possível guardar a preferência, mas o idioma muda nesta sessão.',
    en: 'Could not save the preference, but the language still switches for this session.',
  },

  // ── The drawer and app bar (layout/navigation.tsx, layout/AppLayout.tsx) ──
  'nav.myWork': { pt: 'O meu trabalho', en: 'My work' },
  'nav.operations': { pt: 'Operações', en: 'Operations' },
  'nav.people': { pt: 'Pessoal', en: 'People' },
  'nav.fleet': { pt: 'Frota', en: 'Fleet' },
  'nav.configuration': { pt: 'Configuração', en: 'Configuration' },
  'nav.live': { pt: 'Emergência', en: 'Live emergency' },
  'nav.liveSubtitle': { pt: 'Modo em campo', en: 'Field mode' },
  'nav.home': { pt: 'Início', en: 'Home' },
  'nav.myAvailability': { pt: 'A minha disponibilidade', en: 'My Availability' },
  'nav.myDuties': { pt: 'As minhas escalas', en: 'My Duties' },
  'nav.myReports': { pt: 'Os meus relatórios', en: 'My Reports' },
  'nav.liveEmergencies': { pt: 'Emergências em curso', en: 'Live Emergencies' },
  'nav.eventReports': { pt: 'Relatórios de evento', en: 'Event Reports' },
  'nav.schedules': { pt: 'Escalas', en: 'Schedules' },
  'nav.availabilityWindows': { pt: 'Janelas de disponibilidade', en: 'Availability Windows' },
  'nav.personnel': { pt: 'Pessoal', en: 'Personnel' },
  'nav.vehicles': { pt: 'Viaturas', en: 'Vehicles' },
  'nav.inventoryTemplates': { pt: 'Modelos de inventário', en: 'Inventory Templates' },
  'nav.hospitals': { pt: 'Hospitais', en: 'Hospitals' },
  'nav.holidays': { pt: 'Feriados', en: 'Holidays' },
  'nav.myProfile': { pt: 'O meu perfil', en: 'My Profile' },

  // ── Resource names — react-admin's `resources.<name>.name`, replacing the
  // `options={{ label }}` prop removed from every `<Resource>` in App.tsx. ──
  'resources.users.name': { pt: 'Pessoal', en: 'Users' },
  'resources.vehicles.name': { pt: 'Viaturas', en: 'Vehicles' },
  'resources.maintenance.name': { pt: 'Manutenção', en: 'Maintenance' },
  'resources.inventory-templates.name': { pt: 'Modelos de inventário', en: 'Inventory Templates' },
  'resources.inventory-template-items.name': { pt: 'Itens de inventário', en: 'Inventory Items' },
  'resources.vehicle-inventory.name': { pt: 'Inventário da viatura', en: 'Vehicle Inventory' },
  'resources.availability-windows.name': {
    pt: 'Janelas de disponibilidade',
    en: 'Availability Windows',
  },
  'resources.schedules.name': { pt: 'Escalas', en: 'Schedules' },
  'resources.event-reports.name': { pt: 'Relatórios', en: 'Reports' },
  'resources.hospitals.name': { pt: 'Hospitais', en: 'Hospitals' },
  'resources.municipalities.name': { pt: 'Concelhos', en: 'Municipalities' },
  'resources.localities.name': { pt: 'Localidades', en: 'Localities' },
  'resources.holidays.name': { pt: 'Feriados', en: 'Holidays' },

  // ── Personnel registry (#180 phase 3 — users) ──
  'resources.users.fields.firstName': { pt: 'Nome próprio', en: 'First Name' },
  'resources.users.fields.lastName': { pt: 'Apelido', en: 'Last Name' },
  'resources.users.fields.email': { pt: 'E-mail', en: 'Email' },
  'resources.users.fields.role': { pt: 'Função', en: 'Role' },
  'resources.users.fields.password': { pt: 'Palavra-passe', en: 'Password' },
  'resources.users.fields.isActive': { pt: 'Ativo', en: 'Active' },
  'resources.users.fields.readiness': { pt: 'Operacionalidade', en: 'Readiness' },
  'resources.users.fields.certification': { pt: 'Tem certificação', en: 'Holds certification' },
  'resources.users.fields.certificationStatus': {
    pt: 'Estado da certificação',
    en: 'Certification status',
  },
  'resources.users.fields.certifications': { pt: 'Certificações', en: 'Certifications' },
  'resources.users.fields.phone': { pt: 'Telefone', en: 'Phone' },
  'resources.users.fields.birthDate': { pt: 'Data de nascimento', en: 'Date of birth' },
  'resources.users.fields.joinedOn': { pt: 'Data de admissão', en: 'Joined on' },
  'resources.users.fields.addressLine': { pt: 'Morada', en: 'Address' },
  'resources.users.fields.postalCode': { pt: 'Código postal', en: 'Postal code' },
  'resources.users.fields.redCrossNumber': {
    pt: 'Nº Nacional CVP',
    en: 'Red Cross national no.',
  },
  'resources.users.fields.volunteerNumber': { pt: 'Nº de Voluntário', en: 'Volunteer no.' },
  'resources.users.fields.nif': { pt: 'NIF', en: 'NIF' },
  'resources.users.fields.citizenCardNumber': { pt: 'Cartão de cidadão', en: 'Citizen card' },
  'resources.users.fields.bloodType': { pt: 'Grupo sanguíneo', en: 'Blood type' },
  'resources.users.fields.emergencyContactName': {
    pt: 'Nome do contacto de emergência',
    en: 'Emergency contact name',
  },
  'resources.users.fields.emergencyContactPhone': {
    pt: 'Telefone do contacto de emergência',
    en: 'Emergency contact phone',
  },

  'userForm.accountSection': { pt: 'Conta', en: 'Account' },
  'userForm.personnelSection': { pt: 'Pessoal', en: 'Personnel' },
  'userForm.personnelSectionOptional': {
    pt: 'Pessoal (opcional — pode ser preenchido depois)',
    en: 'Personnel (optional — can be filled in later)',
  },
  'userForm.adminOnlyFields': {
    pt: 'O email, a função e a palavra-passe são só de administrador. Pede a um administrador para os alterar.',
    en: 'Email, role and password are administrator-only. Ask an admin to change them.',
  },
  'userForm.newPasswordHint': {
    pt: 'Nova palavra-passe (deixa em branco para manter a atual).',
    en: 'New password (leave blank to keep the current one).',
  },
  'userForm.volunteerNumberHint': {
    pt: 'Opcional, atribuído manualmente.',
    en: 'Optional, manually assigned.',
  },

  'personnelList.nameColumn': { pt: 'Nome', en: 'Name' },
  'personnelList.searchPlaceholder': {
    pt: 'Procurar nome ou número',
    en: 'Search name or number',
  },
  'personnelList.active': { pt: 'Ativo', en: 'Active' },
  'personnelList.inactive': { pt: 'Inativo', en: 'Inactive' },
  'personnelList.certStatusExpiring': {
    pt: 'A expirar nos próximos 6 meses',
    en: 'Expiring within 6 months',
  },
  'personnelList.certStatusExpired': { pt: 'Expirada', en: 'Expired' },

  'userShow.documentSaved': { pt: 'Documento guardado', en: 'Document saved' },
  'userShow.documentUploadFailed': {
    pt: 'Não foi possível carregar o documento.',
    en: 'Could not upload the document.',
  },
  'userShow.documentRemoved': { pt: 'Documento removido', en: 'Document removed' },
  'userShow.documentRemoveFailed': {
    pt: 'Não foi possível remover o documento.',
    en: 'Could not remove the document.',
  },
  'userShow.removeDocument': { pt: 'Remover documento', en: 'Remove document' },
  'userShow.attachDocument': { pt: 'Anexar documento', en: 'Attach document' },
  'userShow.removePhotoButton': { pt: 'Remover foto', en: 'Remove photo' },
  'userShow.certificationsHeading': { pt: 'Certificações', en: 'Certifications' },
  'userShow.certificationsHint': {
    pt: 'Só as certificações realmente atribuídas ficam aqui registadas. O TAS concede o TAT e o SBV, e o TAT concede o SBV — esses aparecem abaixo como concedidos, não guardados.',
    en: 'Only certifications actually awarded are recorded here. TAS grants TAT and SBV, and TAT grants SBV — those are shown below as granted, not stored.',
  },
  'userShow.noCertifications': { pt: 'Sem certificações registadas.', en: 'No certifications on file.' },
  'userShow.alsoGrantedByAbove': {
    pt: 'Também concedido pelas anteriores',
    en: 'Also granted by the above',
  },
  'userShow.certificationSaved': { pt: 'Certificação guardada', en: 'Certification saved' },
  'userShow.certificationRemoved': { pt: 'Certificação removida', en: 'Certification removed' },
  'userShow.certificationRemoveFailed': {
    pt: 'Não foi possível remover essa certificação.',
    en: 'Could not remove that certification.',
  },
  'userShow.removeCertConfirmPrefix': { pt: 'Remover a certificação ', en: 'Remove the ' },
  'userShow.removeCertConfirmSuffix': { pt: '?', en: ' certification?' },
  'userShow.contactHeading': { pt: 'Contacto', en: 'Contact' },
  'userShow.personalHeading': { pt: 'Pessoal', en: 'Personal' },
  'userShow.recordHeading': { pt: 'Registo', en: 'Record' },
  'userShow.createdLabel': { pt: 'Criado', en: 'Created' },
  'userShow.updatedLabel': { pt: 'Atualizado', en: 'Updated' },

  'certificationDialog.add': { pt: 'Adicionar certificação', en: 'Add certification' },
  'certificationDialog.edit': { pt: 'Editar certificação', en: 'Edit certification' },
  'certificationDialog.certificationLabel': { pt: 'Certificação', en: 'Certification' },
  'certificationDialog.issuedOn': { pt: 'Emitida em', en: 'Issued on' },
  'certificationDialog.validUntil': { pt: 'Válida até', en: 'Valid until' },
  'certificationDialog.noExpiry': {
    pt: 'O certificado não tem data de validade',
    en: 'The certificate carries no expiry date',
  },
  'certificationDialog.notes': { pt: 'Notas (opcional)', en: 'Notes (optional)' },
  'certificationDialog.save': { pt: 'Guardar certificação', en: 'Save certification' },
  'certificationDialog.chooseType': {
    pt: 'Escolhe a certificação.',
    en: 'Choose which certification this is.',
  },
  'certificationDialog.saveFailed': {
    pt: 'Não foi possível guardar esta certificação.',
    en: 'Could not save this certification.',
  },

  // ── Vehicles & fleet (#180 phase 3) ──
  'vehicleType.EMERGENCY': { pt: 'Emergência', en: 'Emergency' },
  'vehicleType.TRANSPORT': { pt: 'Transporte', en: 'Transport' },

  'resources.vehicles.fields.licensePlate': { pt: 'Matrícula', en: 'Licence Plate' },
  'resources.vehicles.fields.numeroCauda': { pt: 'Nº de Cauda', en: 'Fleet ID' },
  'resources.vehicles.fields.vehicleType': { pt: 'Tipo de viatura', en: 'Vehicle Type' },
  'resources.vehicles.fields.insuranceRenewalDate': {
    pt: 'Validade do seguro',
    en: 'Insurance Renewal Date',
  },
  'resources.vehicles.fields.nextImtInspectionDate': {
    pt: 'Próxima inspeção IMT',
    en: 'Next IMT Inspection Date',
  },
  'resources.vehicles.fields.manufacturer': { pt: 'Fabricante', en: 'Manufacturer' },
  'resources.vehicles.fields.model': { pt: 'Modelo', en: 'Model' },
  'resources.vehicles.fields.notes': { pt: 'Notas', en: 'Notes' },
  'resources.vehicles.fields.createdAt': { pt: 'Criado', en: 'Created' },
  'resources.vehicles.fields.updatedAt': { pt: 'Última atualização', en: 'Last Updated' },

  'vehicleForm.licensePlateInvalid': {
    pt: 'Tem de ser uma matrícula portuguesa válida: AA-99-99, 99-99-AA, 99-AA-99 ou AA-99-AA',
    en: 'Must be a valid Portuguese plate: AA-99-99, 99-99-AA, 99-AA-99 or AA-99-AA',
  },
  'vehicleForm.licensePlateHelp': {
    pt: 'Formato português, por exemplo 55-AA-12 ou AB-12-CD',
    en: 'Portuguese format, e.g. 55-AA-12 or AB-12-CD',
  },
  'vehicleForm.numeroCaudaHelp': {
    pt: 'Identificador de frota único, atribuído pela organização',
    en: 'Unique fleet identifier assigned by the organisation',
  },

  'vehicleList.overdue': { pt: 'Atrasado!', en: 'Overdue!' },
  'vehicleList.expiringSoon': { pt: 'A expirar em breve', en: 'Expiring soon' },

  'vehicleShow.overdueSuffix': { pt: ' ⚠ ATRASADO', en: ' ⚠ OVERDUE' },
  'vehicleShow.soonSuffix': { pt: ' ⚠ Em breve', en: ' ⚠ Soon' },
  'vehicleShow.totalMaintenanceCost': { pt: 'Custo total de manutenção:', en: 'Total maintenance cost:' },
  'vehicleShow.addMaintenanceEntry': { pt: 'Adicionar manutenção', en: 'Add Maintenance Entry' },
  'vehicleShow.maintenanceRegistryHeading': {
    pt: 'Registo de manutenção',
    en: 'Maintenance Registry',
  },

  'resources.maintenance.fields.vehicleId': { pt: 'Viatura', en: 'Vehicle' },
  'resources.maintenance.fields.date': { pt: 'Data', en: 'Date' },
  'resources.maintenance.fields.description': { pt: 'Descrição', en: 'Description' },
  'resources.maintenance.fields.serviceProvider': { pt: 'Fornecedor', en: 'Service Provider' },
  'resources.maintenance.fields.cost': { pt: 'Custo (€)', en: 'Cost (€)' },
  'resources.maintenance.fields.vatAmount': { pt: 'IVA (€)', en: 'VAT (€)' },
  'resources.maintenance.fields.notes': { pt: 'Notas', en: 'Notes' },

  // ── Inventory templates & items (#180 phase 3) ──
  'itemType.COUNTABLE': { pt: 'Contável (quantidade inteira)', en: 'Countable (integer quantity)' },
  'itemType.UNLIMITED': {
    pt: 'Ilimitado (presente/ausente)',
    en: 'Unlimited (present/absent only)',
  },

  'resources.inventory-template-items.fields.templateId': { pt: 'ID do modelo', en: 'Template ID' },
  'resources.inventory-template-items.fields.name': { pt: 'Nome do item', en: 'Item Name' },
  'resources.inventory-template-items.fields.type': { pt: 'Tipo', en: 'Type' },
  'resources.inventory-template-items.fields.recommendedQuantity': {
    pt: 'Quantidade recomendada',
    en: 'Recommended Quantity',
  },
  'resources.inventory-template-items.fields.unit': { pt: 'Unidade', en: 'Unit' },
  'resources.inventory-template-items.fields.order': { pt: 'Ordem de exibição', en: 'Display Order' },
  'resources.inventory-template-items.fields.notes': { pt: 'Notas', en: 'Notes' },

  'inventoryItemForm.unitHelp': { pt: 'Por exemplo, un, litros, kit', en: 'E.g. pcs, liters, kit' },

  'resources.inventory-templates.fields.vehicleType': { pt: 'Tipo de viatura', en: 'Vehicle Type' },
  'resources.inventory-templates.fields.version': { pt: 'Versão', en: 'Version' },
  'resources.inventory-templates.fields.notes': { pt: 'Notas', en: 'Notes' },
  'resources.inventory-templates.fields.items': { pt: 'Itens', en: 'Items' },

  'inventoryTemplateShow.addItem': { pt: 'Adicionar item', en: 'Add Item' },
  'inventoryTemplateShow.exportCsv': { pt: 'Exportar CSV', en: 'Export CSV' },
  'inventoryTemplateShow.itemsHeading': { pt: 'Itens de inventário', en: 'Inventory Items' },
  'inventoryTemplateShow.unlimited': { pt: 'Ilimitado', en: 'Unlimited' },
  'inventoryTemplateShow.countable': { pt: 'Contável', en: 'Countable' },

  // ── Vehicle inventory board (#180 phase 3) ──
  'vehicleInventory.heading': { pt: 'Inventário da viatura', en: 'Vehicle Inventory' },
  'vehicleInventory.loadFailed': {
    pt: 'Não foi possível carregar o inventário.',
    en: 'Could not load inventory data.',
  },
  'vehicleInventory.invalidQuantity': {
    pt: 'Introduz uma quantidade inteira válida',
    en: 'Please enter a valid integer quantity',
  },
  'vehicleInventory.updated': { pt: 'Inventário atualizado', en: 'Inventory updated' },
  'vehicleInventory.updateFailed': {
    pt: 'Não foi possível atualizar o inventário',
    en: 'Failed to update inventory',
  },
  'vehicleInventory.noTemplate': {
    pt: 'Não há modelo de inventário definido para %{type}. Um coordenador pode criar um em Modelos de Inventário.',
    en: 'No inventory template defined for %{type}. A coordinator can create one in Inventory Templates.',
  },
  'vehicleInventory.thisVehicleType': { pt: 'este tipo de viatura', en: 'this vehicle type' },
  'vehicleInventory.lowStock': { pt: '⚠ Stock baixo', en: '⚠ Low Stock' },
  'vehicleInventory.templateVersion': { pt: 'Modelo v%{version}', en: 'Template v%{version}' },
  'vehicleInventory.noItems': {
    pt: 'Não há itens de inventário definidos no modelo.',
    en: 'No inventory items defined in the template.',
  },
  'vehicleInventory.colItem': { pt: 'Item', en: 'Item' },
  'vehicleInventory.colType': { pt: 'Tipo', en: 'Type' },
  'vehicleInventory.colRecommended': { pt: 'Recomendado', en: 'Recommended' },
  'vehicleInventory.colActual': { pt: 'Real', en: 'Actual' },
  'vehicleInventory.colUnit': { pt: 'Unidade', en: 'Unit' },
  'vehicleInventory.colStatus': { pt: 'Estado', en: 'Status' },
  'vehicleInventory.colAction': { pt: 'Ação', en: 'Action' },
  'vehicleInventory.infinity': { pt: '∞', en: '∞' },
  'vehicleInventory.presentPlaceholder': { pt: 'presente', en: 'present' },
  'vehicleInventory.statusLow': { pt: 'Baixo', en: 'Low' },
  'vehicleInventory.statusOk': { pt: 'OK', en: 'OK' },
  'vehicleInventory.statusAboveRec': { pt: 'Acima do Rec.', en: 'Above Rec.' },
  'vehicleInventory.saveQuantityTooltip': { pt: 'Guardar quantidade', en: 'Save quantity' },

  // ── Availability & schedules (#180 phase 3 slice 2) — shared words ──
  'common.collapse': { pt: 'Recolher', en: 'Collapse' },
  'common.expand': { pt: 'Expandir', en: 'Expand' },
  'common.exportCsv': { pt: 'Exportar CSV', en: 'Export CSV' },
  'dayType.holiday': { pt: 'Feriado', en: 'Holiday' },
  'dayType.holidayNamed': { pt: 'Feriado · %{name}', en: 'Holiday · %{name}' },
  'dayType.weekend': { pt: 'Fim de semana', en: 'Weekend' },
  'dayType.workday': { pt: 'Dia útil', en: 'Workday' },
  'windowForm.openWindow': { pt: 'Abrir janela', en: 'Open window' },
  'schedule.statusDraft': { pt: 'Rascunho', en: 'Draft' },
  'schedule.statusPublished': { pt: 'Publicada', en: 'Published' },

  // ── Resource fields — availability-windows, schedules, holidays ──
  'resources.availability-windows.fields.category': { pt: 'Categoria', en: 'Category' },
  'resources.availability-windows.fields.status': { pt: 'Estado', en: 'Status' },
  'resources.availability-windows.fields.name': { pt: 'Nome', en: 'Name' },
  'resources.availability-windows.fields.openedBy': { pt: 'Aberta por', en: 'Opened by' },
  'resources.availability-windows.fields.openedAt': { pt: 'Aberta em', en: 'Opened at' },
  'resources.availability-windows.fields.closedBy': { pt: 'Fechada por', en: 'Closed by' },
  'resources.availability-windows.fields.closedAt': { pt: 'Fechada em', en: 'Closed at' },
  'resources.schedules.fields.category': { pt: 'Categoria', en: 'Category' },
  'resources.schedules.fields.status': { pt: 'Estado', en: 'Status' },
  'resources.schedules.fields.publishedBy': { pt: 'Publicada por', en: 'Published by' },
  'resources.schedules.fields.publishedAt': { pt: 'Publicada em', en: 'Published at' },
  'resources.holidays.fields.date': { pt: 'Data', en: 'Date' },
  'resources.holidays.fields.name': { pt: 'Feriado', en: 'Holiday' },

  // ── Window roles (WindowRoleChips, WindowRoleEditor) ──
  'windowRole.none': {
    pt: 'Sem funções — as pessoas são escaladas para esta janela sem uma.',
    en: 'No roles — people are scheduled onto this window without one.',
  },
  'windowRole.editorNone': {
    pt: 'Sem funções — as pessoas vão ser escaladas para esta janela sem uma.',
    en: 'No roles — people will be scheduled onto this window without one.',
  },
  'windowRole.requiresTooltip': {
    pt: 'Requer a certificação %{certification} — pode ser substituída com justificação.',
    en: 'Requires the %{certification} certification — overridable with a reason.',
  },
  'windowRole.roleName': { pt: 'Função %{index}', en: 'Role %{index}' },
  'windowRole.roleNameAria': { pt: 'Função %{index} nome', en: 'Role %{index} name' },
  'windowRole.rolePeopleAria': { pt: 'Função %{index} pessoas', en: 'Role %{index} people' },
  'windowRole.roleCertAria': {
    pt: 'Função %{index} certificação obrigatória',
    en: 'Role %{index} required certification',
  },
  'windowRole.removeAria': { pt: 'Remover função %{index}', en: 'Remove role %{index}' },
  'windowRole.peopleLabel': { pt: 'Pessoas', en: 'People' },
  'windowRole.requiresLabel': { pt: 'Requer', en: 'Requires' },
  'windowRole.suggestedFromName': {
    pt: 'Sugerido a partir do nome: %{certification}',
    en: 'Suggested from the name: %{certification}',
  },
  'windowRole.noSuggestion': { pt: 'Sem sugestão', en: 'No suggestion' },
  'windowRole.coordinatorChoice': { pt: 'Escolha do coordenador', en: "Coordinator's choice" },
  'windowRole.suggestedShort': { pt: 'Sugestão: %{certification}', en: 'Suggested: %{certification}' },
  'windowRole.unset': { pt: 'Por definir', en: 'Unset' },
  'windowRole.noRequirement': { pt: 'Sem requisito', en: 'No requirement' },
  'windowRole.addRole': { pt: 'Adicionar função', en: 'Add role' },
  'windowRole.capacityHint': {
    pt: 'Pessoas é o máximo que a escala pode colocar numa função por turno; %{unlimited} significa ilimitado. Uma certificação obrigatória é exigível mas não absoluta — um coordenador ainda pode escalar alguém que não a tenha, com justificação.',
    en: 'People is the most the schedule may put in a role on one shift; %{unlimited} means unlimited. A required certification is enforceable but not absolute — a coordinator may still assign someone who lacks it, with a reason.',
  },

  // ── Day shift editor ──
  'dayShift.copyWorkdays': { pt: 'Todos os dias úteis', en: 'All working days' },
  'dayShift.copyNonWorkdays': { pt: 'Todos os fins de semana e feriados', en: 'All weekends & holidays' },
  'dayShift.copyAll': { pt: 'Todos os dias', en: 'All days' },
  'dayShift.startAria': { pt: '%{day} turno %{index} início', en: '%{day} shift %{index} start' },
  'dayShift.endAria': { pt: '%{day} turno %{index} fim', en: '%{day} shift %{index} end' },
  'dayShift.vehiclesAria': { pt: '%{day} turno %{index} viaturas', en: '%{day} shift %{index} vehicles' },
  'dayShift.removeAria': { pt: 'Remover %{day} turno %{index}', en: 'Remove %{day} shift %{index}' },
  'dayShift.addShiftAria': { pt: 'Adicionar um turno a %{day}', en: 'Add a shift to %{day}' },
  'dayShift.copyToAria': {
    pt: 'Copiar os turnos de %{day} para outros dias',
    en: 'Copy %{day} shifts to other days',
  },
  'dayShift.colDay': { pt: 'Dia', en: 'Day' },
  'dayShift.colShifts': { pt: 'Turnos', en: 'Shifts' },
  'dayShift.colShiftsHint': {
    pt: 'início, fim e viaturas necessárias',
    en: 'start, end and vehicles needed',
  },
  'dayShift.noShifts': {
    pt: 'Sem turnos — não é pedido a ninguém que cubra este dia.',
    en: 'No shifts — nobody is asked to cover this day.',
  },
  'dayShift.addShift': { pt: 'Adicionar turno', en: 'Add shift' },
  'dayShift.copyToButton': { pt: 'Copiar para…', en: 'Copy to…' },

  // ── Emergency window dialog ──
  'emergencyDialog.title': { pt: 'Nova disponibilidade de emergência', en: 'New emergency availability' },
  'emergencyDialog.description': {
    pt: 'Abre uma janela que cobre um mês inteiro, com os turnos padrão: um turno das 20:00–24:00 nos dias úteis, e 08:00–16:00 mais 16:00–24:00 aos fins de semana e feriados. Cada turno pede uma viatura, e a escala é construída a partir da equipa padrão — %{crew}, uma pessoa em cada. Para variar algo disto, usa o editor completo.',
    en: 'Opens a window covering a whole month, with the standard shifts: one 20:00–24:00 shift on working days, and 08:00–16:00 plus 16:00–24:00 on weekends and holidays. Every shift asks for one vehicle, and the schedule is built from the standard crew — %{crew}, one person each. To vary any of that, use the full editor instead.',
  },
  'emergencyDialog.month': { pt: 'Mês', en: 'Month' },
  'emergencyDialog.year': { pt: 'Ano', en: 'Year' },
  'emergencyDialog.openOverlap': {
    pt: 'Já existe uma janela de Emergência aberta sobre este mês. Fecha-a antes de abrir outra.',
    en: 'An Emergency window is already open over this month. Close it before opening another one.',
  },
  'emergencyDialog.closedOverlap': {
    pt: 'Uma janela de Emergência já fechada cobre já estas datas.',
    en: 'A closed Emergency window already covers these dates.',
  },
  'emergencyDialog.acknowledgeAgain': {
    pt: 'Pedir disponibilidade para este mês outra vez, mesmo assim',
    en: 'Ask for this month again anyway',
  },
  'emergencyDialog.opened': { pt: '%{window} aberta para %{dates}', en: '%{window} opened for %{dates}' },
  'emergencyDialog.saveFailed': { pt: 'Não foi possível abrir a janela.', en: 'Could not open the window.' },

  // ── Availability window list & show ──
  'windowList.manageHolidays': { pt: 'Gerir feriados', en: 'Manage holidays' },
  'windowList.newEmergencyAvailability': { pt: 'Nova Disponibilidade de Emergência', en: 'New Emergency Availability' },
  'windowList.newWindow': { pt: 'Nova janela de disponibilidade', en: 'New availability window' },
  'windowList.statusOpen': { pt: 'Aberta', en: 'Open' },
  'windowList.statusClosed': { pt: 'Fechada', en: 'Closed' },
  'windowList.upcomingHolidays': { pt: 'Próximos feriados', en: 'Upcoming holidays' },
  'windowList.overlapRuleInfo': {
    pt: 'Pode estar aberta uma janela por categoria em qualquer dia: uma janela de Emergência e uma de Apoio Local podem cobrir as mesmas datas ao mesmo tempo, duas de Emergência não podem. Cada janela tem os seus próprios turnos, definidos quando é aberta.',
    en: 'One window per category can be open over any given day: an Emergency and a Local Support window may cover the same dates at once, two Emergency windows may not. Each window carries its own shifts, set when it is opened.',
  },
  'windowList.colWindow': { pt: 'Janela', en: 'Window' },
  'windowShow.pageTitle': { pt: 'Janela de disponibilidade', en: 'Availability window' },
  'windowShow.rolesHeading': { pt: 'Funções para a escala', en: 'Roles for the schedule' },
  'windowShow.closeButton': { pt: 'Fechar janela', en: 'Close window' },
  'windowShow.closeConfirmTitle': { pt: 'Fechar janela de disponibilidade?', en: 'Close availability window?' },
  'windowShow.closeConfirmBody': {
    pt: 'Deixam de ser aceites submissões para %{window} (%{dates}) depois de esta janela ser fechada. Esta ação não pode ser desfeita.',
    en: 'Submissions will no longer be accepted for %{window} (%{dates}) once this window is closed. This cannot be undone.',
  },
  'windowShow.closeStatsSummary': {
    pt: '%{submitted} de %{total} pessoas responderam; %{declined} recusaram; %{pending} ainda sem resposta.',
    en: '%{submitted} of %{total} personnel submitted; %{declined} declined; %{pending} still pending.',
  },
  'windowShow.closeFailed': { pt: 'Não foi possível fechar a janela.', en: 'Could not close the window.' },
  'windowShow.closed': { pt: 'Janela de disponibilidade fechada', en: 'Availability window closed' },
  'windowShow.buildSchedule': { pt: 'Construir escala', en: 'Build schedule' },
  'windowShow.openSchedule': { pt: 'Abrir escala', en: 'Open schedule' },
  'windowShow.startScheduleFailed': {
    pt: 'Não foi possível iniciar a escala.',
    en: 'Could not start the schedule.',
  },

  // ── Window create form ──
  'windowCreate.pageTitle': { pt: 'Abrir janela de disponibilidade', en: 'Open availability window' },
  'windowCreate.info': {
    pt: 'Os voluntários vão poder submeter disponibilidade para cada turno abaixo. Os dias começam na grelha padrão — um turno das 20:00–24:00 nos dias úteis, e 08:00–16:00 mais 16:00–24:00 aos fins de semana e feriados, cada um precisando de uma viatura — e podes alterar qualquer parte disto. As viaturas contam para a cobertura: um turno só conta como coberto quando todas as viaturas têm condutor.',
    en: 'Volunteers will be able to submit availability for every shift below. Days start on the default grid — one 20:00–24:00 shift on working days, and 08:00–16:00 plus 16:00–24:00 on weekends and holidays, each needing one vehicle — and you can change any of it. Vehicles matter for coverage: a shift counts as covered only once every vehicle has a driver.',
  },
  'windowCreate.nameOptional': { pt: 'Nome (opcional)', en: 'Name (optional)' },
  'windowCreate.nameHelp': {
    pt: 'Mostrado aos voluntários junto às datas. Não precisa de ser único.',
    en: 'Shown to volunteers alongside the dates. Need not be unique.',
  },
  'windowCreate.startDate': { pt: 'Data de início', en: 'Start date' },
  'windowCreate.endDate': { pt: 'Data de fim', en: 'End date' },
  'windowCreate.pickDates': { pt: 'Escolhe uma data de início e uma de fim.', en: 'Pick a start and an end date.' },
  'windowCreate.endBeforeStart': {
    pt: 'A data de fim tem de ser igual ou posterior à data de início.',
    en: 'End date must be on or after the start date.',
  },
  'windowCreate.rangeTooLong': {
    pt: 'Uma janela pode ter, no máximo, %{max} dias (esta tem %{length}).',
    en: 'A window may span at most %{max} days (this one spans %{length}).',
  },
  'windowCreate.overlapCheckFailed': {
    pt: 'Não foi possível verificar as janelas sobre estas datas',
    en: 'Could not check for windows over these dates',
  },
  'windowCreate.calendarLoadFailed': { pt: 'Não foi possível carregar o calendário.', en: 'Could not load the calendar.' },
  'windowCreate.openOverlapError': {
    pt: 'Já existe uma janela de disponibilidade de %{category} aberta sobre estas datas (%{windows}). Fecha-a primeiro, ou escolhe datas que ela não cubra. Janelas de categorias diferentes podem sobrepor-se livremente.',
    en: 'An availability window for %{category} is already open over these dates (%{windows}). Close it first, or pick dates it does not cover. Windows of a different category may overlap freely.',
  },
  'windowCreate.closedOverlapWarning': {
    pt: 'Uma janela de disponibilidade de %{category} já fechada cobre já estas datas (%{windows}). Ainda podes abrir esta — confirma abaixo se era mesmo pedir disponibilidade outra vez para as mesmas datas.',
    en: 'A closed availability window for %{category} already covers these dates (%{windows}). You can still open this one — check below if you meant to ask for the same dates again.',
  },
  'windowCreate.acknowledgeOverlap': {
    pt: 'Abrir outra janela de %{category} sobre estas datas',
    en: 'Open another %{category} window over these dates',
  },
  'windowCreate.rolesHint': {
    pt: 'Nunca se pergunta a um voluntário qual função quer — ele diz apenas quando pode estar presente. Estas são as funções às quais o vais associar quando construíres a escala desta janela.',
    en: 'Volunteers are never asked which role they want — they say only when they can be there. These are the roles you will assign them to when building the schedule for this window.',
  },
  'windowCreate.shiftsPerDayHeading': { pt: 'Turnos por dia', en: 'Shifts per day' },
  'windowCreate.dayErrorsOne': {
    pt: 'Um dia tem turnos que não podem ser gravados — vê a mensagem nessa linha.',
    en: 'One day has shifts that cannot be saved — see the message on that row.',
  },
  'windowCreate.dayErrorsMany': {
    pt: '%{count} dias têm turnos que não podem ser gravados — vê as mensagens nessas linhas.',
    en: '%{count} days have shifts that cannot be saved — see the messages on those rows.',
  },
  'windowCreate.daysShiftsSummary': {
    pt: '%{days} dias · %{shifts} turnos no total',
    en: '%{days} days · %{shifts} shifts in total',
  },
  'windowCreate.saved': { pt: 'Janela de disponibilidade aberta', en: 'Availability window opened' },
  'windowCreate.saveFailed': { pt: 'Não foi possível abrir a janela', en: 'Could not open the window' },

  // ── Holidays ──
  'holidayList.help': {
    pt: 'Um feriado faz esse dia da semana começar no padrão de fim de semana quando uma janela é aberta: dois turnos (08:00–16:00 e 16:00–24:00) em vez do único turno de 20:00–24:00 dos dias úteis. As janelas já abertas mantêm os turnos que lhes foram dados.',
    en: 'A holiday makes that weekday start on the weekend pattern when a window is opened: two shifts (08:00–16:00 and 16:00–24:00) instead of the single 20:00–24:00 workday shift. Windows already open keep the shifts they were given.',
  },
  'holidayList.backToWindows': { pt: 'Janelas de disponibilidade', en: 'Availability windows' },
  'holidayList.addHoliday': { pt: 'Adicionar feriado', en: 'Add holiday' },
  'holidayList.nameHelp': {
    pt: 'P. ex.: Implantação da República',
    en: 'e.g. Implantação da República',
  },

  // ── Availability matrix ──
  'matrix.heading': { pt: 'Matriz de cobertura', en: 'Coverage matrix' },
  'matrix.eligiblePersonnel': { pt: '%{count} elegíveis', en: '%{count} eligible personnel' },
  'matrix.capacityNote': {
    pt: 'Um turno escalado tem no máximo %{max} pessoas, e cada viatura que precisa tem de ter condutor — esta matriz mostra quem está disponível, não quem acaba escalado.',
    en: 'A scheduled shift holds at most %{max} people, and every vehicle it needs has to have a driver — this matrix shows everyone who is available, not who ends up scheduled.',
  },
  'matrix.reminderTooltip': {
    pt: 'Os avisos precisam de um canal de notificação (email/SMS), que este sistema ainda não tem.',
    en: 'Reminders need a notification channel (email/SMS), which this system does not have yet.',
  },
  'matrix.noVehicleNeeded': { pt: 'nenhuma viatura necessária', en: 'no vehicle needed' },
  'matrix.vehicleNeededOne': { pt: '%{count} viatura necessária', en: '%{count} vehicle needed' },
  'matrix.vehicleNeededMany': { pt: '%{count} viaturas necessárias', en: '%{count} vehicles needed' },
  'matrix.availableCount': { pt: '%{count} disponíveis', en: '%{count} available' },
  'matrix.driverCountOne': { pt: '%{count} condutor', en: '%{count} driver' },
  'matrix.driverCountMany': { pt: '%{count} condutores', en: '%{count} drivers' },
  'matrix.cellAriaLabel': {
    pt: '%{label}: %{available} disponíveis, %{drivers} condutores, %{vehicles}, %{level}',
    en: '%{label}: %{available} available, %{drivers} drivers, %{vehicles}, %{level}',
  },
  'matrix.driverBadgeTooltipOne': {
    pt: '%{count} condutor certificado disponível, %{vehicles}',
    en: '%{count} certified driver available, %{vehicles}',
  },
  'matrix.driverBadgeTooltipMany': {
    pt: '%{count} condutores certificados disponíveis, %{vehicles}',
    en: '%{count} certified drivers available, %{vehicles}',
  },
  'matrix.legendRed': {
    pt: 'Menos de 2 disponíveis, ou sem condutor para uma viatura',
    en: 'Fewer than 2 available, or no driver for a vehicle',
  },
  'matrix.legendYellow': {
    pt: 'Alguma cobertura, mas não há condutor para todas as viaturas',
    en: 'Some cover, but not a driver for every vehicle',
  },
  'matrix.legendGreen': {
    pt: '%{max}+ disponíveis, um condutor por viatura',
    en: '%{max}+ available, one driver per vehicle',
  },
  'matrix.legendDriversVehicles': {
    pt: 'Condutores disponíveis / viaturas necessárias',
    en: 'Drivers available / vehicles needed',
  },
  'matrix.submitted': { pt: 'Submetido', en: 'Submitted' },
  'matrix.declined': { pt: 'Recusado', en: 'Declined' },
  'matrix.notYetResponded': { pt: 'Ainda sem resposta', en: 'Not yet responded' },
  'matrix.declinedThisWindow': { pt: 'Recusou esta janela', en: 'Declined this window' },
  'matrix.nobody': { pt: 'Ninguém.', en: 'Nobody.' },
  'matrix.nobodyAvailable': { pt: 'Ninguém disponível.', en: 'Nobody available.' },
  'matrix.sendReminder': { pt: 'Enviar aviso', en: 'Send reminder' },
  'matrix.colDate': { pt: 'Data', en: 'Date' },
  'matrix.historicalView': {
    pt: 'Vista histórica — esta janela está fechada e já não aceita submissões.',
    en: 'Historical view — this window is closed and no longer accepts submissions.',
  },
  'matrix.selectCoverageHint': {
    pt: 'Seleciona um valor de cobertura para ver quem está disponível nesse turno.',
    en: 'Select a coverage figure to see who is available for that shift.',
  },
  'matrix.drillDownHeading': {
    pt: '%{day} · %{shift} — %{count} disponíveis',
    en: '%{day} · %{shift} — %{count} available',
  },
  'matrix.nobodyDeclared': {
    pt: 'Ninguém declarou disponibilidade para este turno.',
    en: 'Nobody has declared availability for this shift.',
  },
  'matrix.loadFailed': { pt: 'Não foi possível carregar a matriz de cobertura.', en: 'Could not load the coverage matrix.' },
  'matrix.exportFailed': { pt: 'Não foi possível exportar a matriz de cobertura.', en: 'Could not export the coverage matrix.' },

  // ── Schedule list ──
  'scheduleList.buildSchedulePrompt': { pt: 'Construir escala para uma janela…', en: 'Build schedule for a window…' },
  'scheduleList.overlapRuleInfo': {
    pt: 'Uma escala é construída para uma janela de disponibilidade, sobre as datas dessa janela e contra os seus próprios turnos e funções. Janelas de categorias diferentes são escaladas de forma independente, mesmo quando as suas datas se sobrepõem.',
    en: "A schedule is built for one availability window, over that window's dates and against its own shifts and roles. Windows of different categories are scheduled independently, even when their dates overlap.",
  },
  'scheduleList.colWindow': { pt: 'Janela', en: 'Window' },
  'scheduleList.colDates': { pt: 'Datas', en: 'Dates' },
  'scheduleList.colSlotsFilled': { pt: 'Lugares preenchidos', en: 'Slots filled' },
  'scheduleList.colFlags': { pt: 'Alertas', en: 'Flags' },
  'scheduleList.gapsTooltip': { pt: '%{count} turnos sem escala completa', en: '%{count} shifts are not fully crewed' },
  'scheduleList.overridesTooltip': {
    pt: '%{count} atribuições foram acordadas fora da plataforma',
    en: '%{count} assignments were agreed off-platform',
  },
  'scheduleShow.pageTitle': { pt: 'Escala', en: 'Schedule' },

  // ── Schedule board ──
  'scheduleBoard.crewColumn': { pt: 'Equipa', en: 'Crew' },
  'scheduleBoard.heading': { pt: 'Escala', en: 'Schedule' },
  'scheduleBoard.loadFailed': { pt: 'Não foi possível carregar a escala.', en: 'Could not load the schedule.' },
  'scheduleBoard.removeFailed': { pt: 'Não foi possível remover essa atribuição.', en: 'Could not remove that assignment.' },
  'scheduleBoard.exportFailed': { pt: 'Não foi possível exportar a escala.', en: 'Could not export the schedule.' },
  'scheduleBoard.autofillButton': { pt: 'Preencher automaticamente', en: 'Auto-fill draft' },
  'scheduleBoard.publishButton': { pt: 'Publicar escala', en: 'Publish schedule' },
  'scheduleBoard.windowOpenInfo': {
    pt: 'Esta janela ainda está aberta — a disponibilidade pode mudar. Podes continuar a construir; quem responder mais tarde aparece na lista de atribuição.',
    en: 'This window is still open — availability may still change. You can keep building; anyone who submits later shows up in the assign list.',
  },
  'scheduleBoard.publishedCoordinatorInfo': {
    pt: 'Publicada — toda a gente pode ver esta escala, e as pessoas podem inscrever-se num lugar aberto. As alterações que fizeres agora ficam visíveis de imediato.',
    en: 'Published — everyone can see this rota, and members can add themselves to an open place. Changes you make now are live straight away.',
  },
  'scheduleBoard.publishedMemberInfo': {
    pt: 'Podes inscrever-te em qualquer lugar aberto que consigas cobrir. Depois de estares num turno não te podes remover — pede a um coordenador, que pode arranjar substituição ao mesmo tempo.',
    en: 'You can add yourself to any open place you are able to cover. Once you are on a shift you cannot take yourself off — ask a coordinator, who can arrange cover at the same time.',
  },
  'scheduleBoard.statSlotsFilled': { pt: 'Lugares preenchidos', en: 'Slots filled' },
  'scheduleBoard.statShiftsWithGaps': { pt: 'Turnos com falhas', en: 'Shifts with gaps' },
  'scheduleBoard.statOverrides': { pt: 'Substituições', en: 'Overrides' },
  'scheduleBoard.doubleBooked': { pt: 'Duplamente escalado', en: 'Double-booked' },
  'scheduleBoard.conflictLine': {
    pt: '%{user}, %{day} — também em %{window}, %{label}',
    en: '%{user}, %{day} — also on %{window}, %{label}',
  },
  'scheduleBoard.noShifts': {
    pt: 'Esta janela não tem turnos, por isso não há nada para escalar.',
    en: 'This window has no shifts, so there is nothing to schedule.',
  },
  'scheduleBoard.footerCoordinator': {
    pt: 'As pessoas que submeteram disponibilidade para um turno são oferecidas primeiro. Qualquer outra pessoa ainda pode ser escalada — a substituição é muitas vezes acordada por telefone — e fica registada como uma excepção.',
    en: 'People who submitted availability for a shift are offered first. Anyone else can still be assigned — cover is often agreed by phone — and is recorded as an override.',
  },
  'scheduleBoard.footerMember': {
    pt: 'Só são oferecidos os lugares que consegues cobrir: as funções de condutor exigem a certificação de condutor, e uma função já preenchida ao seu limite não aceita mais ninguém.',
    en: 'Only places you are able to cover are offered: the driver posts need the driver certification, and a role that is already full cannot take another person.',
  },
  'scheduleBoard.colDate': { pt: 'Data', en: 'Date' },
  'scheduleBoard.colShift': { pt: 'Turno', en: 'Shift' },
  'scheduleBoard.noRolesOnWindow': { pt: 'sem funções nesta janela', en: 'no roles on this window' },
  'scheduleBoard.certRequiredSuffix': { pt: ' · %{certification} obrigatória', en: ' · %{certification} required' },
  'scheduleBoard.assign': { pt: 'Atribuir', en: 'Assign' },
  'scheduleBoard.addMe': { pt: 'Inscrever-me', en: 'Add me' },
  'scheduleBoard.assignToVerb': { pt: 'Atribuir a', en: 'Assign to' },
  'scheduleBoard.addMeToVerb': { pt: 'Inscrever-me em', en: 'Add me to' },
  'scheduleBoard.placeLabel': { pt: '%{verb} %{where}', en: '%{verb} %{where}' },
  'scheduleBoard.placeLabelWithIndex': {
    pt: '%{verb} %{where} — lugar %{index} de %{total}',
    en: '%{verb} %{where} — place %{index} of %{total}',
  },
  'scheduleBoard.legendAssigned': { pt: 'Atribuído a partir de disponibilidade submetida', en: 'Assigned from submitted availability' },
  'scheduleBoard.legendSignedUp': { pt: 'Inscrito pela própria pessoa', en: 'Signed up by the person themselves' },
  'scheduleBoard.legendOverride': { pt: 'Substituição — não submeteu disponibilidade para este turno', en: 'Override — did not submit for this shift' },
  'scheduleBoard.legendException': {
    pt: 'Atribuído sem a certificação obrigatória da função, com justificação',
    en: "Assigned without the post's required certification, with a reason",
  },
  'scheduleBoard.legendLapsed': { pt: 'Certificação caducou desde que este turno foi construído', en: 'Certification lapsed since this shift was built' },
  'scheduleBoard.legendOpen': { pt: 'Um lugar aberto, um por cada pessoa que a função ainda quer', en: 'An open place, one per person the role still wants' },
  'scheduleBoard.legendGap': { pt: 'Sem condutor para as viaturas deste turno', en: 'No driver for the vehicles this shift crews' },
  'scheduleBoard.legendConflict': { pt: 'Duplamente escalado', en: 'Double-booked' },
  'scheduleBoard.legendAdjusted': { pt: 'Horário ajustado só para esta escala', en: "Hours adjusted for this schedule alone" },
  'scheduleBoard.legendNameChip': { pt: 'Nome', en: 'Name' },
  'scheduleBoard.adjustShiftAria': { pt: 'Ajustar o horário de %{day}, %{label}', en: 'Adjust the hours of %{day}, %{label}' },
  'scheduleBoard.adjustedWas': { pt: 'era %{label}', en: 'was %{label}' },
  'scheduleBoard.doubleBookedTooltip': {
    pt: 'Duplamente escalado: também em %{window}, %{label}',
    en: 'Double-booked: also on %{window}, %{label}',
  },
  'scheduleBoard.lapsedTooltip': {
    pt: '%{certification} caducou desde que este turno foi construído — mantido de propósito, mas vale a pena rever.',
    en: '%{certification} lapsed since this shift was built — kept on purpose, but worth reviewing.',
  },
  'scheduleBoard.exceptionTooltip': {
    pt: 'Atribuído por excepção — não tem %{certification}. %{reason}',
    en: 'Assigned by exception — does not hold %{certification}. %{reason}',
  },
  'scheduleBoard.signedUpTooltip': { pt: 'Inscrito em %{date}', en: 'Signed up on %{date}' },
  'scheduleBoard.overrideTooltip': {
    pt: 'Substituição — não submeteu disponibilidade para este turno. Atribuído por %{assigner} em %{date}',
    en: 'Override — did not submit for this shift. Assigned by %{assigner} on %{date}',
  },
  'scheduleBoard.aCoordinator': { pt: 'um coordenador', en: 'a coordinator' },
  'scheduleBoard.submittedTooltip': { pt: 'Submeteu disponibilidade para este turno', en: 'Submitted availability for this shift' },
  'scheduleBoard.noLongerAvailableTooltip': { pt: 'Já não está disponível para este turno', en: 'No longer available for this shift' },
  'scheduleBoard.suffixSignedUp': { pt: ', inscrito', en: ', signed up' },
  'scheduleBoard.suffixOverride': { pt: ', substituição', en: ', override' },
  'scheduleBoard.suffixDoubleBooked': { pt: ', duplamente escalado', en: ', double-booked' },
  'scheduleBoard.suffixCertification': { pt: ', certificação %{issue}', en: ', certification %{issue}' },
  'scheduleBoard.issueException': { pt: 'em excepção', en: 'exception' },
  'scheduleBoard.issueLapsed': { pt: 'caducada', en: 'lapsed' },
  'scheduleBoard.suffixYou': { pt: ', tu', en: ', you' },
  'scheduleBoard.printButton': { pt: 'Imprimir escala', en: 'Print schedule' },

  // ── Schedule print (#191) ──
  'schedulePrint.title': { pt: 'Escala para impressão', en: 'Printable schedule' },
  'schedulePrint.organisation': {
    pt: 'Cruz Vermelha Portuguesa – Delegação de Campo',
    en: 'Portuguese Red Cross – Campo Delegation',
  },
  'schedulePrint.crewColumn': { pt: 'Equipa', en: 'Crew' },
  'schedulePrint.dateColumn': { pt: 'Data', en: 'Date' },
  'schedulePrint.shiftColumn': { pt: 'Turno', en: 'Shift' },
  'schedulePrint.unfilled': { pt: 'Por preencher', en: 'Unfilled' },
  'schedulePrint.holiday': { pt: 'Feriado', en: 'Holiday' },
  'schedulePrint.weekend': { pt: 'Fim de semana', en: 'Weekend' },
  'schedulePrint.draftNotice': {
    pt: 'RASCUNHO — ainda não publicada, sujeita a alterações',
    en: 'DRAFT — not yet published, subject to change',
  },
  'schedulePrint.printButton': { pt: 'Imprimir', en: 'Print' },
  'schedulePrint.close': { pt: 'Fechar', en: 'Close' },
  'schedulePrint.loadFailed': { pt: 'Não foi possível carregar a escala.', en: 'Could not load the schedule.' },
  'schedulePrint.generatedAt': { pt: 'Gerado em %{date}', en: 'Generated %{date}' },
  'schedulePrint.disclaimer': {
    pt: 'Esta escala pode ser alterada após a impressão — confirme sempre a versão em vigor online antes de uma resposta de emergência.',
    en: 'This schedule may change after printing — always confirm the current version online before an emergency response.',
  },

  // ── Assign / autofill / create schedule / publish / sign-up dialogs ──
  'assignDialog.alreadyOnRole': {
    pt: 'Já está em %{role} neste turno — uma pessoa não pode ocupar dois lugares',
    en: 'Already on %{role} for this shift — one person cannot hold two places',
  },
  'assignDialog.alreadyOnShift': { pt: 'Já está neste turno', en: 'Already on this shift' },
  'assignDialog.loadFailed': { pt: 'Não foi possível carregar quem está disponível.', en: 'Could not load who is available.' },
  'assignDialog.assignFailed': { pt: 'Não foi possível atribuir essa pessoa.', en: 'Could not assign that person.' },
  'assignDialog.declinedNote': {
    pt: 'Declarou não ter disponibilidade nesta janela — acorda isso com a pessoa antes de atribuir',
    en: 'Declared no availability this window — agree it with them before assigning',
  },
  'assignDialog.pendingNote': { pt: 'Ainda não respondeu a esta janela', en: 'Has not responded to this window' },
  'assignDialog.dutyCountOne': { pt: '%{count} serviço já nesta janela', en: '%{count} duty already this window' },
  'assignDialog.dutyCountMany': { pt: '%{count} serviços já nesta janela', en: '%{count} duties already this window' },
  'assignDialog.declinedChip': { pt: 'Recusou', en: 'Declined' },
  'assignDialog.missingCertChip': { pt: 'Sem %{certification}', en: 'No %{certification}' },
  'assignDialog.assigned': { pt: 'Atribuído', en: 'Assigned' },
  'assignDialog.assignByException': { pt: 'Atribuir por excepção', en: 'Assign by exception' },
  'assignDialog.assignAsOverride': { pt: 'Atribuir como substituição', en: 'Assign as override' },
  'assignDialog.title': { pt: 'Atribuir · %{role}', en: 'Assign · %{role}' },
  'assignDialog.requiresChip': { pt: 'Requer %{certification}', en: 'Requires %{certification}' },
  'assignDialog.searchLabel': { pt: 'Procurar pessoal', en: 'Search personnel' },
  'assignDialog.availableHeading': { pt: 'Disponível para este turno', en: 'Available for this shift' },
  'assignDialog.nobodySubmitted': {
    pt: 'Ninguém submeteu disponibilidade para este turno.',
    en: 'Nobody submitted availability for this shift.',
  },
  'assignDialog.hideOthers': { pt: 'Ocultar todos os outros', en: 'Hide everyone else' },
  'assignDialog.showOthers': { pt: 'Mostrar todos os outros (%{count})', en: 'Show everyone else (%{count})' },
  'assignDialog.overrideWarning': {
    pt: 'Ninguém aqui submeteu disponibilidade para este turno. Atribuir alguém fica registado como uma substituição, com o teu nome e a hora.',
    en: 'Nobody here submitted availability for this shift. Assigning them is recorded as an override, stamped with your name and the time.',
  },
  'assignDialog.certRequirementNote': {
    pt: 'As pessoas que não têm a certificação %{certification} aparecem na lista em vez de serem ocultadas — atribuir uma delas precisa de uma justificação, registada contra a atribuição.',
    en: 'People who do not hold the %{certification} certification are listed rather than hidden — assigning one of them needs a reason, recorded against the assignment.',
  },
  'assignDialog.closeButton': { pt: 'Fechar', en: 'Close' },
  'assignDialog.confirmTitle': {
    pt: 'Atribuir sem a certificação obrigatória?',
    en: 'Assign without the required certification?',
  },
  'assignDialog.requiresCertBold': { pt: '%{role} requer %{certification}.', en: '%{role} requires %{certification}.' },
  'assignDialog.exceptionNote': {
    pt: '%{person} não a tem. Atribuir esta pessoa fica registado como uma excepção contra este turno, com o teu nome e a hora.',
    en: '%{person} does not hold it. Assigning them is recorded as an exception against this shift, stamped with your name and the time.',
  },
  'assignDialog.reasonLabel': { pt: 'Justificação', en: 'Reason' },
  'assignDialog.reasonHelp': {
    pt: 'Aparece na escala e na versão publicada.',
    en: 'Shown on the board and on the published schedule.',
  },
  'autofillDialog.title': { pt: 'Preenchimento automático', en: 'Auto-fill draft' },
  'autofillDialog.description': {
    pt: 'Preenche a partir da disponibilidade submetida, condutores primeiro para cada viatura que um turno precisa. Ninguém que não tenha submetido é colocado.',
    en: 'Fills from submitted availability, drivers first for every vehicle a shift needs. Nobody who did not submit is placed.',
  },
  'autofillDialog.failed': { pt: 'Não foi possível preencher o rascunho.', en: 'Could not fill the draft.' },
  'autofillDialog.result': {
    pt: 'Colocadas %{placed}. %{unfilled} lugares ainda abertos, %{withoutDriver} turnos sem condutor para todas as viaturas.',
    en: 'Placed %{placed}. %{unfilled} slots still open, %{withoutDriver} shifts without a driver for every vehicle.',
  },
  'autofillDialog.modeEmptyTitle': { pt: 'Só lugares vazios', en: 'Only empty slots' },
  'autofillDialog.modeEmptyHint': {
    pt: 'Mantém quem colocaste à mão, incluindo substituições.',
    en: 'Keeps everyone you placed by hand, overrides included.',
  },
  'autofillDialog.modeReplaceTitle': { pt: 'Limpar e voltar a preencher tudo', en: 'Clear and refill everything' },
  'autofillDialog.modeReplaceHint': {
    pt: 'Descarta primeiro todas as atribuições atuais desta escala.',
    en: 'Discards every current assignment on this schedule first.',
  },
  'autofillDialog.fairnessTitle': { pt: 'Repartir serviços de forma equilibrada', en: 'Spread duties evenly' },
  'autofillDialog.fairnessHint': {
    pt: 'Prefere quem tem menos serviços até agora nesta janela.',
    en: 'Prefers whoever has fewest duties so far in this window.',
  },
  'autofillDialog.currentFill': {
    pt: '%{filled} de %{required} lugares estão preenchidos agora.',
    en: '%{filled} of %{required} slots are filled right now.',
  },
  'autofillDialog.replaceWarning': {
    pt: 'Tudo o que está agora nesta escala vai ser descartado primeiro.',
    en: 'Everything currently on this schedule will be discarded first.',
  },
  'autofillDialog.emptyOnlyNote': {
    pt: 'Só os lugares vazios vão ser tocados.',
    en: 'Only the empty slots will be touched.',
  },
  'autofillDialog.fillButton': { pt: 'Preencher rascunho', en: 'Fill draft' },
  'createScheduleDialog.title': { pt: 'Construir uma escala', en: 'Build a schedule' },
  'createScheduleDialog.loadFailed': {
    pt: 'Não foi possível carregar as janelas de disponibilidade.',
    en: 'Could not load the availability windows.',
  },
  'createScheduleDialog.startFailed': { pt: 'Não foi possível iniciar essa escala.', en: 'Could not start that schedule.' },
  'createScheduleDialog.noneAvailable': {
    pt: 'Todas as janelas de disponibilidade já têm uma escala. Abre primeiro uma nova janela.',
    en: 'Every availability window already has a schedule. Open a new window first.',
  },
  'createScheduleDialog.stillOpen': { pt: 'ainda aberta', en: 'still open' },
  'publishDialog.title': { pt: 'Publicar escala', en: 'Publish schedule' },
  'publishDialog.failed': { pt: 'Não foi possível publicar a escala.', en: 'Could not publish the schedule.' },
  'publishDialog.slotsFilled': { pt: '%{filled} de %{required} lugares preenchidos', en: '%{filled} of %{required} slots filled' },
  'publishDialog.shiftsWithGaps': { pt: '%{count} turnos com falhas', en: '%{count} shifts with gaps' },
  'publishDialog.withoutDriverNote': { pt: '%{count} sem condutor', en: '%{count} without a driver' },
  'publishDialog.overridesCount': { pt: '%{count} substituições', en: '%{count} overrides' },
  'publishDialog.agreedOffPlatform': { pt: 'acordadas fora da plataforma', en: 'agreed off-platform' },
  'publishDialog.certExceptions': { pt: '%{count} excepções de certificação', en: '%{count} certification exceptions' },
  'publishDialog.eachWithReason': { pt: 'cada uma com justificação registada', en: 'each with a recorded reason' },
  'publishDialog.lapsedCerts': {
    pt: '%{count} certificações caducadas desde a atribuição',
    en: '%{count} certifications lapsed since assignment',
  },
  'publishDialog.worthSecondLook': {
    pt: 'vale a pena rever, não é uma decisão que alguém tenha tomado',
    en: 'worth a second look, not a decision anyone made',
  },
  'publishDialog.doubleBookedCount': { pt: '%{count} duplamente escalados', en: '%{count} double-booked' },
  'publishDialog.gapsAllowedInfo': {
    pt: 'É permitido publicar com falhas — a escala é muitas vezes acabada por telefone. O pessoal atribuído vê os seus serviços de imediato, e podes continuar a editar depois.',
    en: 'Publishing with gaps is allowed — the roster is often finished by phone. Assigned personnel see their duties straight away, and you can keep editing afterwards.',
  },
  'publishDialog.publishButton': { pt: 'Publicar', en: 'Publish' },

  // ── Adjust shift dialog ──
  'adjustShift.title': { pt: 'Ajustar horário do turno', en: 'Adjust shift hours' },
  'adjustShift.startAria': { pt: 'Início', en: 'Start' },
  'adjustShift.endAria': { pt: 'Fim', en: 'End' },
  'adjustShift.windowTimes': { pt: 'Horário da janela: %{label}', en: "Window's own hours: %{label}" },
  'adjustShift.publishedWarning': {
    pt: 'Esta escala está publicada — quem estiver neste turno vai ver o novo horário.',
    en: 'This rota is published — everyone on this shift will see the new hours.',
  },
  'adjustShift.reset': { pt: 'Repor horário da janela', en: 'Reset to window hours' },
  'adjustShift.save': { pt: 'Guardar', en: 'Save' },
  'adjustShift.errorEndBeforeStart': {
    pt: 'O turno tem de terminar depois de começar.',
    en: 'A shift must end after it starts.',
  },
  'adjustShift.errorOverlaps': { pt: 'Sobrepõe-se a %{label}.', en: 'Overlaps %{label}.' },
  'adjustShift.failed': { pt: 'Não foi possível ajustar este turno.', en: 'Could not adjust this shift.' },

  'signUpDialog.title': { pt: 'Inscrever-te neste turno?', en: 'Add yourself to this shift?' },
  'signUpDialog.failed': { pt: 'Não foi possível adicionar-te a este turno.', en: 'Could not add you to this shift.' },
  'signUpDialog.vehicleCountOne': { pt: '%{count} viatura', en: '%{count} vehicle' },
  'signUpDialog.vehicleCountMany': { pt: '%{count} viaturas', en: '%{count} vehicles' },
  'signUpDialog.cannotUndo': {
    pt: 'Depois de te inscreveres, não te podes remover — pede a um coordenador, que pode arranjar substituição ao mesmo tempo.',
    en: 'Once you are on, you cannot take yourself off — ask a coordinator, who can arrange cover at the same time.',
  },

  // ── My duties & my availability ──
  'myDuties.pageTitle': { pt: 'As minhas escalas', en: 'My Duties' },
  'myDuties.heading': { pt: 'As minhas escalas', en: 'My Duties' },
  'myDuties.subheading': {
    pt: 'Turnos para os quais estás escalado em escalas publicadas. O que disseste ao coordenador que estavas livre para fazer fica em A minha disponibilidade.',
    en: 'Shifts you are scheduled for on published rotas. What you told the coordinator you were free for lives on My Availability.',
  },
  'myDuties.loadFailed': { pt: 'Não foi possível carregar as tuas escalas.', en: 'Could not load your duties.' },
  'myDuties.upcoming': { pt: 'Próximas', en: 'Upcoming' },
  'myDuties.noneScheduled': {
    pt: 'Ainda não tens serviços escalados. Um coordenador vai publicar aqui a próxima escala.',
    en: 'No duties scheduled yet. A coordinator will publish the next rota here.',
  },
  'myDuties.pastDuties': { pt: 'Serviços passados', en: 'Past duties' },
  'myDuties.vehicleCountOne': { pt: '%{count} viatura', en: '%{count} vehicle' },
  'myDuties.vehicleCountMany': { pt: '%{count} viaturas', en: '%{count} vehicles' },
  'myAvailability.pageTitle': { pt: 'A minha disponibilidade', en: 'My availability' },
  'myAvailability.heading': { pt: 'A minha disponibilidade', en: 'My availability' },
  'myAvailability.weekendHoliday': { pt: 'Fim de semana / feriado', en: 'Weekend / holiday' },
  'myAvailability.legendHint': {
    pt: 'Cada dia mostra os turnos que o teu coordenador definiu para ele.',
    en: "Each day shows the shifts your coordinator set for it.",
  },
  'myAvailability.windowPickerLabel': { pt: 'Janela de disponibilidade', en: 'Availability window' },
  'myAvailability.prevMonth': { pt: 'Mês anterior', en: 'Previous month' },
  'myAvailability.nextMonth': { pt: 'Mês seguinte', en: 'Next month' },
  'myAvailability.notSelected': { pt: 'Não selecionado', en: 'Not selected' },
  'myAvailability.allShifts': { pt: 'Todos os turnos', en: 'All shifts' },
  'myAvailability.selectedOfTotal': { pt: '%{selected} de %{total}', en: '%{selected} of %{total}' },
  'myAvailability.noShiftsOnDay': { pt: 'Sem turnos neste dia.', en: 'No shifts on this day.' },
  'myAvailability.windowOpenChip': { pt: 'Janela aberta', en: 'Window open' },
  'myAvailability.windowClosedChip': { pt: 'Janela fechada', en: 'Window closed' },
  'myAvailability.noWindowHeading': {
    pt: 'Não há nenhuma janela de disponibilidade aberta',
    en: 'No availability window is currently open',
  },
  'myAvailability.noWindowBody': {
    pt: "Um coordenador vai abrir aqui a próxima janela de disponibilidade. Verifica de novo em breve — vais poder submeter a tua disponibilidade para cada dia e turno quando ela abrir.",
    en: "A coordinator will open the next availability window here. Check back soon — you'll be able to submit your availability for each day and shift once it opens.",
  },
  'myAvailability.noAvailabilityLabel': { pt: 'Não tenho disponibilidade nesta janela', en: 'I have no availability this window' },
  'myAvailability.noAvailabilityHint': {
    pt: "Avisa o teu coordenador que não podes fazer nenhum turno entre %{dates}, em vez de deixares todos os dias sem resposta.",
    en: "Let your coordinator know you can't take any shifts between %{dates}, instead of leaving every day unanswered.",
  },
  'myAvailability.declinedHeading': {
    pt: "Avisámos que não estás disponível nesta janela",
    en: "You've told us you're not available this window",
  },
  'myAvailability.declinedBody': {
    pt: 'O teu coordenador pode ver isto. Se isso mudar antes de a janela fechar, desmarca a caixa acima e seleciona os teus turnos disponíveis.',
    en: 'Your coordinator can see this. If that changes before the window closes, uncheck the box above and select your available shifts.',
  },
  'myAvailability.canSubmitInfo': {
    pt: 'Seleciona os turnos que consegues cobrir. Podes alterar em qualquer momento antes de a janela fechar — só os dias entre %{dates} estão abertos para submissão.',
    en: 'Select the shifts you can cover. You can amend anytime before the window closes — only days between %{dates} are open for submission.',
  },
  'myAvailability.closedInfo': {
    pt: 'Esta janela está fechada. A mostrar as tuas submissões finais para referência — não podem ser feitas mais alterações.',
    en: 'This window is closed. Showing your final submissions for reference — no further changes can be made.',
  },
  'myAvailability.saveHint': {
    pt: 'As alterações são gravadas para a janela toda de uma vez.',
    en: 'Changes are saved for the whole window at once.',
  },
  'myAvailability.saveButton': { pt: 'Gravar disponibilidade', en: 'Save availability' },
  'myAvailability.savedNotify': { pt: 'Disponibilidade gravada', en: 'Availability saved' },
  'myAvailability.saveFailedNotify': { pt: 'Não foi possível gravar a tua disponibilidade', en: 'Could not save your availability' },
  'myAvailability.declinedNotify': {
    pt: 'O teu coordenador foi informado de que não estás disponível nesta janela',
    en: 'Your coordinator has been told you are not available this window',
  },
  'myAvailability.undeclinedNotify': { pt: 'Podes voltar a selecionar os teus turnos', en: 'You can select your shifts again' },
  'myAvailability.declineFailedNotify': { pt: 'Não foi possível atualizar a tua resposta', en: 'Could not update your response' },
  'myAvailability.loadFailedNotify': { pt: 'Não foi possível carregar a tua disponibilidade.', en: 'Could not load your availability.' },

  // ── Login page (#180 phase 3) ──
  'login.orSignInWith': { pt: 'ou entrar com', en: 'or sign in with' },
  'login.signInWithGoogle': { pt: 'Entrar com Google', en: 'Sign in with Google' },
  'login.signInWithMicrosoft': { pt: 'Entrar com Microsoft', en: 'Sign in with Microsoft' },
  'login.orgName': {
    pt: 'Cruz Vermelha Portuguesa — Delegação de Campo',
    en: 'Portuguese Red Cross — Field Delegation',
  },

  // ── Dashboard (#180 phase 3) ──
  'dashboard.welcomeTitle': { pt: 'Bem-vindo ao RedInfo', en: 'Welcome to RedInfo' },
  'dashboard.welcomeSubtitle': {
    pt: 'Sistema de informação da Cruz Vermelha Portuguesa – Delegação de Campo.',
    en: 'Information system for the Portuguese Red Cross – Field Delegation.',
  },
  'dashboard.warningPrefix': {
    pt: 'As viaturas com seguro ou inspeção IMT a vencer nos próximos',
    en: 'Vehicles with insurance or IMT inspection dates within',
  },
  'dashboard.daysUnit': { pt: 'dias', en: 'days' },
  'dashboard.warningSuffix': {
    pt: 'aparecem assinaladas acima.',
    en: 'are flagged above.',
  },
  'dashboard.lowStockTitle': { pt: 'Viaturas com stock baixo (%{count})', en: 'Low Stock Vehicles (%{count})' },
  'dashboard.moreItems': { pt: '+%{count} mais', en: '+%{count} more' },
  'dashboard.certificationsTitle': { pt: 'Certificações do pessoal', en: 'Personnel Certifications' },
  'dashboard.certExpiredCount': {
    pt: '%{smart_count} expirada |||| %{smart_count} expiradas',
    en: '%{smart_count} expired',
  },
  'dashboard.certExpiringCount': {
    pt: '%{smart_count} a expirar nos próximos 6 meses',
    en: '%{smart_count} expiring within 6 months',
  },
  'dashboard.renewalsTitle': {
    pt: 'Renovações e inspeções a aproximar-se (%{count})',
    en: 'Upcoming Renewals & Inspections (%{count})',
  },
  'dashboard.insuranceLabel': { pt: 'Seguro', en: 'Insurance' },

  // ── Live Runs page (#180 phase 3) — the drawer's own key, reused here ──
  'liveRunsPage.noRunsRightNow': {
    pt: 'Não há nenhuma emergência em curso.',
    en: 'No emergency is being run right now.',
  },

  // ── Hospitals (#180 phase 3) ──
  'resources.hospitals.fields.name': { pt: 'Hospital', en: 'Hospital' },
  'resources.hospitals.fields.municipalityId': { pt: 'Concelho', en: 'Municipality' },
  'resources.hospitals.fields.isActive': { pt: 'Estado', en: 'Status' },
  'hospitalList.addHospital': { pt: 'Adicionar hospital', en: 'Add hospital' },
  'hospitalList.colMunicipality': { pt: 'Concelho', en: 'Municipality' },
  'hospitalList.colDistrict': { pt: 'Distrito', en: 'District' },
  'hospitalList.colCoordinates': { pt: 'Coordenadas', en: 'Coordinates' },
  'hospitalList.municipalityCentreFallback': { pt: 'centro do concelho', en: 'municipality centre' },
  'hospitalList.active': { pt: 'Ativo', en: 'Active' },
  'hospitalList.retired': { pt: 'Retirado', en: 'Retired' },
  'hospitalList.retiredHiddenFromNewReports': {
    pt: 'Retirado — oculto em novos relatórios',
    en: 'Retired — hidden from new reports',
  },
  'hospitalList.helpText': {
    pt: 'Esta lista preenche o campo "transportado para" num relatório. As coordenadas ordenam os hospitais por distância à localidade do relatório — um hospital sem coordenadas usa como aproximação o centro do seu concelho, por isso a ordenação funciona sempre e preenchê-las só a torna mais precisa. Retirar um hospital remove-o dos novos relatórios sem alterar os já entregues.',
    en: 'This list fills the "taken to" field on a report. Coordinates order the ' +
      'hospitals by distance from the report\'s locality — a hospital without them ' +
      'falls back to the centre of its municipality, so the ordering always works ' +
      'and filling them in only sharpens it. Retiring a hospital removes it from ' +
      'new reports without changing the ones already filed.',
  },
  'hospitalList.nameField': { pt: 'Nome do hospital', en: 'Hospital name' },
  'hospitalList.latitude': { pt: 'Latitude (opcional)', en: 'Latitude (optional)' },
  'hospitalList.longitude': { pt: 'Longitude (opcional)', en: 'Longitude (optional)' },

  // ── Rich text editor (#180 phase 3) — shared by crew and coordinator forms ──
  'richText.bold': { pt: 'Negrito', en: 'Bold' },
  'richText.italic': { pt: 'Itálico', en: 'Italic' },
  'richText.bulletedList': { pt: 'Lista com marcadores', en: 'Bulleted list' },
  'richText.numberedList': { pt: 'Lista numerada', en: 'Numbered list' },

  // ── API error codes (#180 phase 4) — see apiErrorLabel(), and
  // @redinfo/shared's ApiErrorCode doc comment for which exceptions carry
  // one and why the rest deliberately do not. ──
  'apiError.WINDOW_OVERLAP_OPEN': {
    pt: 'Já existe uma janela de disponibilidade aberta para %{category} nestas datas (%{windows}). Fecha-a antes de abrir outra, ou escolhe datas que não estejam cobertas.',
    en: 'An availability window for %{category} is already open over these dates (%{windows}). Close it before opening another one, or pick dates it does not cover.',
  },
  'apiError.WINDOW_OVERLAP_CLOSED': {
    pt: 'Já existe uma janela de disponibilidade fechada para %{category} que cobre estas datas (%{windows}). Confirma para abrir outra para as mesmas datas.',
    en: 'A closed availability window for %{category} already covers these dates (%{windows}). Confirm to open another one for the same dates.',
  },
  'apiError.WINDOW_ALREADY_CLOSED': {
    pt: 'Esta janela de disponibilidade já está fechada.',
    en: 'This availability window is already closed.',
  },
  'apiError.SCHEDULE_DRAFT_NOT_VISIBLE': {
    pt: 'Esta escala ainda não foi publicada — só os coordenadores podem ver um rascunho.',
    en: 'This schedule has not been published yet — only coordinators can see a draft.',
  },
  'apiError.SCHEDULE_ALREADY_EXISTS_FOR_WINDOW': {
    pt: 'Esta janela já tem uma escala; abre essa em vez de criar uma segunda.',
    en: 'This window already has a schedule; open that one instead of starting a second.',
  },
  'apiError.SCHEDULE_PUBLISHED_CANNOT_DELETE': {
    pt: 'Uma escala publicada não pode ser eliminada — o pessoal já foi informado das suas funções.',
    en: 'A published schedule cannot be deleted — personnel have already been told their duties.',
  },
  'apiError.SCHEDULE_ALREADY_PUBLISHED': {
    pt: 'Esta escala já está publicada.',
    en: 'This schedule is already published.',
  },
  'apiError.ASSIGNMENT_PERSON_INACTIVE': {
    pt: '%{person} não é um membro ativo e não pode ser escalado(a).',
    en: '%{person} is not an active member and cannot be scheduled.',
  },
  'apiError.ASSIGNMENT_PERSON_NOT_FIELD_PERSONNEL': {
    pt: '%{person} não é pessoal de campo e não pode ser escalado(a).',
    en: '%{person} is not field personnel and cannot be scheduled.',
  },
  'apiError.ASSIGNMENT_CERTIFICATION_REQUIRED': {
    pt: '%{role} exige a certificação %{certification}, que %{person} não possui. Escalá-lo(a) requer um motivo.',
    en: '%{role} requires the %{certification} certification, which %{person} does not hold. Assigning them needs a reason.',
  },
  'apiError.ASSIGNMENT_ALREADY_ON_SHIFT': {
    pt: '%{person} já está neste turno — uma pessoa não pode ocupar dois lugares no mesmo turno.',
    en: '%{person} is already on this shift — one person cannot hold two places on one shift.',
  },
  'apiError.ASSIGNMENT_ROLE_FULL': {
    pt: '%{role} está completo neste turno (%{capacity}). Remove alguém primeiro, ou usa outra função.',
    en: '%{role} is full on this shift (%{capacity}). Remove someone first, or use another role.',
  },
  'apiError.ASSIGNMENT_DATE_OUTSIDE_WINDOW': {
    pt: '%{date} está fora de %{window}.',
    en: '%{date} is outside %{window}.',
  },
  'apiError.ASSIGNMENT_WINDOW_HAS_NO_ROLES': {
    pt: '%{window} não define funções — as pessoas são escaladas sem uma.',
    en: '%{window} defines no roles — people are scheduled onto it without one.',
  },
  'apiError.ASSIGNMENT_ROLE_ID_REQUIRED': {
    pt: 'Escolhe uma função: esta janela define %{roles}.',
    en: 'Choose a role: this window defines %{roles}.',
  },
  'apiError.ASSIGNMENT_ROLE_NOT_IN_WINDOW': {
    pt: 'Essa função não pertence a %{window}.',
    en: 'That role does not belong to %{window}.',
  },
  'apiError.SELF_ASSIGN_SCHEDULE_NOT_PUBLISHED': {
    pt: 'Esta escala ainda não foi publicada, por isso não está aberta para inscrição.',
    en: 'This schedule has not been published yet, so it is not open to sign up to.',
  },
  'apiError.SELF_ASSIGN_OVERLAPPING_SHIFT': {
    pt: 'Já estás em %{shift} nesse dia, o que se sobrepõe a este turno.',
    en: 'You are already on %{shift} that day, which overlaps this shift.',
  },
  'apiError.SHIFT_ADJUSTMENT_END_BEFORE_START': {
    pt: 'O turno tem de terminar depois de começar.',
    en: 'A shift must end after it starts.',
  },
  'apiError.SHIFT_ADJUSTMENT_OVERLAPS': {
    pt: 'Este horário sobrepõe-se a %{other}.',
    en: 'This overlaps %{other}.',
  },

  // ── Calendar headers (#180 phase 5) ──
  // Hand-spelled rather than delegated to `Intl`/`toLocaleDateString`: ICU
  // abbreviations drift between browsers and Node versions ("Sep" vs
  // "Sept"), which would move the calendar header between environments —
  // see `utils/dates.ts`'s doc comment. NOT the same list as
  // `@redinfo/shared`'s `MONTH_NAMES`: that one is canonical English because
  // the backend names an emergency window from it, and translating it would
  // show "Outubro" for a window still named "... - October" — see
  // `monthNames()`'s doc comment for why it stays untranslated.
  'date.weekday.MON': { pt: 'Seg', en: 'Mon' },
  'date.weekday.TUE': { pt: 'Ter', en: 'Tue' },
  'date.weekday.WED': { pt: 'Qua', en: 'Wed' },
  'date.weekday.THU': { pt: 'Qui', en: 'Thu' },
  'date.weekday.FRI': { pt: 'Sex', en: 'Fri' },
  'date.weekday.SAT': { pt: 'Sáb', en: 'Sat' },
  'date.weekday.SUN': { pt: 'Dom', en: 'Sun' },
  'date.monthAbbr.JAN': { pt: 'Jan', en: 'Jan' },
  'date.monthAbbr.FEB': { pt: 'Fev', en: 'Feb' },
  'date.monthAbbr.MAR': { pt: 'Mar', en: 'Mar' },
  'date.monthAbbr.APR': { pt: 'Abr', en: 'Apr' },
  'date.monthAbbr.MAY': { pt: 'Mai', en: 'May' },
  'date.monthAbbr.JUN': { pt: 'Jun', en: 'Jun' },
  'date.monthAbbr.JUL': { pt: 'Jul', en: 'Jul' },
  'date.monthAbbr.AUG': { pt: 'Ago', en: 'Aug' },
  'date.monthAbbr.SEP': { pt: 'Set', en: 'Sep' },
  'date.monthAbbr.OCT': { pt: 'Out', en: 'Oct' },
  'date.monthAbbr.NOV': { pt: 'Nov', en: 'Nov' },
  'date.monthAbbr.DEC': { pt: 'Dez', en: 'Dec' },
  'date.monthFull.JAN': { pt: 'Janeiro', en: 'January' },
  'date.monthFull.FEB': { pt: 'Fevereiro', en: 'February' },
  'date.monthFull.MAR': { pt: 'Março', en: 'March' },
  'date.monthFull.APR': { pt: 'Abril', en: 'April' },
  'date.monthFull.MAY': { pt: 'Maio', en: 'May' },
  'date.monthFull.JUN': { pt: 'Junho', en: 'June' },
  'date.monthFull.JUL': { pt: 'Julho', en: 'July' },
  'date.monthFull.AUG': { pt: 'Agosto', en: 'August' },
  'date.monthFull.SEP': { pt: 'Setembro', en: 'September' },
  'date.monthFull.OCT': { pt: 'Outubro', en: 'October' },
  'date.monthFull.NOV': { pt: 'Novembro', en: 'November' },
  'date.monthFull.DEC': { pt: 'Dezembro', en: 'December' },

  // ── Certification badge (missed by #180 phase 3's slice list — it lives
  // in components/, not a resources/ directory — caught while touching this
  // file for phase 5's date formatting) ──
  'certBadge.noExpiryOnFile': { pt: '%{label} — sem data de validade registada', en: '%{label} — no expiry on file' },
  'certBadge.expiredOn': { pt: '%{label} — expirado a %{date}', en: '%{label} — expired %{date}' },
  'certBadge.validUntilDate': { pt: '%{label} — válido até %{date}', en: '%{label} — valid until %{date}' },
  'certBadge.viaGrantedBy': { pt: '%{type} · via %{grantedBy}', en: '%{type} · via %{grantedBy}' },
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
  'problem.LIVE_RUN_NOT_CLOSED': {
    pt: 'A ocorrência ainda não foi fechada.',
    en: 'The run has not been closed yet.',
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

  // ── Certifications ── SBV/TAT/TAS are already Portuguese acronyms.
  'certification.DRIVER': { pt: 'Condutor', en: 'Driver' },
  'certification.SBV': { pt: 'SBV', en: 'SBV' },
  'certification.TAT': { pt: 'TAT', en: 'TAT' },
  'certification.TAS': { pt: 'TAS', en: 'TAS' },

  // ── Blood types ──
  'bloodType.A_POS': { pt: 'A+', en: 'A+' },
  'bloodType.A_NEG': { pt: 'A-', en: 'A-' },
  'bloodType.B_POS': { pt: 'B+', en: 'B+' },
  'bloodType.B_NEG': { pt: 'B-', en: 'B-' },
  'bloodType.AB_POS': { pt: 'AB+', en: 'AB+' },
  'bloodType.AB_NEG': { pt: 'AB-', en: 'AB-' },
  'bloodType.O_POS': { pt: 'O+', en: 'O+' },
  'bloodType.O_NEG': { pt: 'O-', en: 'O-' },

  // ── Account roles (#180 phase 2) ──
  // A different vocabulary from `role.*` above: this is `UserRole` (the
  // account-level role — "System Administrator") not a shift post ("Driver").
  // Moved out of `@redinfo/shared`'s `ROLE_METADATA`, which nothing else
  // needed an English fallback for — see its doc comment.
  [`accountRole.${UserRole.SYSTEM_ADMIN}`]: { pt: 'Administrador de Sistema', en: 'System Administrator' },
  [`accountRole.${UserRole.EMERGENCY_OPERATIONAL}`]: {
    pt: 'Operacional de Emergência',
    en: 'Emergency Operational',
  },
  [`accountRole.${UserRole.EMERGENCY_COORDINATOR}`]: {
    pt: 'Coordenador de Emergência',
    en: 'Emergency Coordinator',
  },
  [`accountRole.${UserRole.LOGISTICS_COORDINATOR}`]: {
    pt: 'Coordenador de Logística',
    en: 'Logistics Coordinator',
  },
  [`accountRoleDescription.${UserRole.SYSTEM_ADMIN}`]: {
    pt: 'Acesso total a todos os recursos e operações do sistema.',
    en: 'Full access to all system resources and operations.',
  },
  [`accountRoleDescription.${UserRole.EMERGENCY_OPERATIONAL}`]: {
    pt: 'Realiza operações de emergência no terreno; não gere configuração.',
    en: 'Performs emergency field operations; cannot manage configuration.',
  },
  [`accountRoleDescription.${UserRole.EMERGENCY_COORDINATOR}`]: {
    pt: 'Gere a configuração e os fluxos das operações de emergência.',
    en: 'Manages emergency-operation configuration and workflows.',
  },
  [`accountRoleDescription.${UserRole.LOGISTICS_COORDINATOR}`]: {
    pt: 'Gere as operações e a configuração de logística.',
    en: 'Manages logistics operations and configuration.',
  },

  // ── Availability-window categories (#180 phase 2) ──
  // `@redinfo/shared`'s `AVAILABILITY_WINDOW_CATEGORY_METADATA.label` stays
  // English (the backend still builds an exception message from it, until
  // #180 phase 4) — these are the frontend's own translated keys, with the
  // shared English value as the fallback if one is ever missing.
  [`windowCategory.${AvailabilityWindowCategory.EMERGENCY}`]: { pt: 'Emergência', en: 'Emergency' },
  [`windowCategory.${AvailabilityWindowCategory.LOCAL_SUPPORT}`]: {
    pt: 'Apoio Local',
    en: 'Local Support',
  },
  [`windowCategory.${AvailabilityWindowCategory.SALOP_SUPPORT}`]: {
    pt: 'Apoio SALOP',
    en: 'SALOP Support',
  },
  [`windowCategoryDescription.${AvailabilityWindowCategory.EMERGENCY}`]: {
    pt: 'Cobertura de resposta a emergências — a escala permanente de prevenção.',
    en: 'Emergency response cover — the standing on-call rota.',
  },
  [`windowCategoryDescription.${AvailabilityWindowCategory.LOCAL_SUPPORT}`]: {
    pt: 'Cobertura para eventos locais e pedidos de prevenção.',
    en: 'Cover for local events and standby requests.',
  },
  [`windowCategoryDescription.${AvailabilityWindowCategory.SALOP_SUPPORT}`]: {
    pt: 'Cobertura para operações SALOP.',
    en: 'Cover for SALOP operations.',
  },
} as const;

const ALL_MESSAGES: Record<string, { pt: string; en: string }> = {
  ...MESSAGES,
  ...ENUM_MESSAGES,
};

/**
 * The catalogue polyglot wants: one locale, flat dotted keys. Fed to
 * `ra-i18n-polyglot` by `i18nProvider.ts`, merged over the hand-written
 * `ra.*` catalogue (`ra-pt.ts`) and `ra-language-english`.
 */
export function messagesFor(locale: Locale): Record<string, string> {
  return Object.fromEntries(
    Object.entries(ALL_MESSAGES).map(([key, value]) => [key, value[locale]]),
  );
}

export const reportTypeLabel = (t: Translate, type: EventReportType | string): string =>
  t(`reportType.${type}`);

export const reportTypeHint = (t: Translate, type: EventReportType | string): string =>
  t(`reportTypeHint.${type}`);

export const locationTypeLabel = (t: Translate, value: EventLocationType | string): string =>
  t(`locationType.${value}`);

export const genderLabel = (t: Translate, value: Gender | string): string => t(`gender.${value}`);

export const destinationLabel = (t: Translate, value: VictimDestinationKind | string): string =>
  t(`destination.${value}`);

export const occurrenceTimeLabel = (t: Translate, field: string): string => t(`time.${field}`);

/**
 * Why a report cannot be saved, in the crew's language.
 *
 * Falls back to the English message the rule carries, so a code added to
 * `@redinfo/shared` without a translation still says something true rather than
 * showing a bare `problem.WHATEVER`.
 */
export const problemLabel = (t: Translate, problem: EventReportProblem | null): string => {
  if (!problem) return '';
  const key = `problem.${problem.code}`;
  return key in ALL_MESSAGES ? t(key) : problem.message;
};

/** What is still unfinished, in the crew's language. */
export const warningLabel = (t: Translate, code: EventReportWarningCode): string =>
  t(`warning.${code}`);

/** What is still unfinished on a live run, in the crew's language. */
export const liveWarningLabel = (t: Translate, code: string): string => t(`liveWarning.${code}`);

/** What actually stops a run being closed. */
export const liveBlockerLabel = (t: Translate, code: string): string => t(`liveBlocker.${code}`);

/** The label on the bottom bar's primary control, from the stamp it writes. */
export const liveStampLabel = (t: Translate, field: string): string => t(`live.stamp.${field}`);

export const liveScreenLabel = (t: Translate, screen: string): string => t(`live.screen.${screen}`);

export const abcdeBandLabel = (t: Translate, band: string): string => t(`abcde.${band}`);

export const abcdeStatusLabel = (t: Translate, status: string): string => t(`abcdeStatus.${status}`);

export const chamuLabel = (t: Translate, field: string): string => t(`chamu.${field}`);

export const vitalLabel = (t: Translate, key: string): string => t(`vital.${key}`);

export const syncStateLabel = (t: Translate, state: string): string => t(`sync.${state}`);

/**
 * A crew post, translated when it is one of the standard three and left as
 * typed otherwise — a coordinator may name a role anything, and inventing a
 * translation for "Apoio Extra" would be worse than showing what they wrote.
 */
export const roleLabel = (t: Translate, name?: string | null): string => {
  if (!name) return '';
  const key = `role.${name}`;
  return key in ALL_MESSAGES ? t(key) : name;
};

export const certificationLabel = (t: Translate, type: string): string =>
  t(`certification.${type}`);

export const bloodTypeLabel = (t: Translate, type: string): string => t(`bloodType.${type}`);

/** The account role's display name — `UserRole`, not a shift post; see `roleLabel` for that. */
export const accountRoleLabel = (t: Translate, role: UserRole | string): string =>
  t(`accountRole.${role}`);

export const accountRoleDescription = (t: Translate, role: UserRole | string): string =>
  t(`accountRoleDescription.${role}`);

/**
 * A window category's display label, falling back to `@redinfo/shared`'s
 * English `AVAILABILITY_WINDOW_CATEGORY_METADATA` if this catalogue is ever
 * missing an entry — that shared English string is what the backend still
 * builds an overlap exception message from (until #180 phase 4), so it is
 * never removed, only preferred-over.
 */
export const windowCategoryLabel = (t: Translate, category: AvailabilityWindowCategory | string): string => {
  const key = `windowCategory.${category}`;
  return key in ALL_MESSAGES ? t(key) : availabilityWindowCategoryLabel(category);
};

export const windowCategoryDescription = (
  t: Translate,
  category: AvailabilityWindowCategory | string,
): string => {
  const key = `windowCategoryDescription.${category}`;
  if (key in ALL_MESSAGES) return t(key);
  return (
    AVAILABILITY_WINDOW_CATEGORY_METADATA[category as AvailabilityWindowCategory]?.description ??
    String(category)
  );
};

/**
 * A backend `ApiErrorBody` (#180 phase 4), in the reader's language.
 *
 * Falls back to `error.message` — the English the API sent — whenever
 * `error.code` is absent (most exceptions; see `@redinfo/shared`'s
 * `ApiErrorCode` doc comment for which ones deliberately carry one) or the
 * catalogue is missing an entry for a code that exists. That fallback is
 * the same safety net every other translated-with-a-fallback helper in this
 * file uses: a gap here degrades to true and readable, never to blank.
 */
export const apiErrorLabel = (
  t: Translate,
  error: { code?: ApiErrorCode; message: string; params?: Record<string, string | number> },
): string => {
  if (!error.code) return error.message;
  const key = `apiError.${error.code}`;
  return key in ALL_MESSAGES ? t(key, { _: error.message, ...error.params }) : error.message;
};
