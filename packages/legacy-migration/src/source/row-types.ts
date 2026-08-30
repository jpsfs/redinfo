/**
 * One interface per legacy table this loader reads, transcribed field-for-
 * field from `migration/legacy-schema.sql` — only the tables the load order
 * (plan §5.3) actually needs, including the ones whose loaders are Track B
 * stubs today (the types are cheap and save re-deriving them later).
 *
 * `DATE`/`DATETIME`/`TIME` columns are typed `string`: `source/mysql-client.ts`
 * configures the pool with `dateStrings: true`, so mysql2 hands them back as
 * `'YYYY-MM-DD'` / `'YYYY-MM-DD HH:MM:SS'` / `'HH:MM:SS'` rather than a `Date`
 * — a `Date` would silently apply the *server process's* local timezone to a
 * value that is actually a naive wall-clock stamp with no zone of its own
 * (see `transform/chronology.ts`).
 *
 * `YEAR(4)` columns come back as `number`. `TINYINT(1)` comes back as
 * `number` (`0`/`1`) — mysql2 is not configured to cast it to `boolean`,
 * so there is exactly one place (the loader) that decides what "true" means.
 *
 * **Deliberately absent, and never to be added:** the legacy password column
 * carried by `usuarios`/`socorrista`/`usuarios_hist`/`socorrista_hist`, and
 * the whole of the legacy password-reset table. See `no-secrets.spec.ts`,
 * which enforces this at the source-text level rather than by convention.
 */

export interface UsuariosRow {
  id: string;
  nome: string;
  usuario: string;
  tipo: string;
  activo: number;
  fbid: string;
  updated_by: string;
  update_date: string;
}

/** No `operacao` column — unlike every other `*_hist` table here. */
export interface UsuariosHistRow {
  id: string;
  nome: string | null;
  usuario: string | null;
  tipo: string | null;
  activo: number | null;
  fbid: string | null;
  updated_by: string | null;
  update_date: string;
}

export interface SocorristaRow {
  numero: number;
  imagem: string;
  sangue: string;
  dae: number | null;
  n_tripulante: number | null;
  nome: string;
  nascimento: string;
  juramento: string | null;
  contacto: number | null;
  contacto2: number | null;
  sexo: string;
  curso_tripulante: string | null;
  habilitacoes: string | null;
  curso: string | null;
  num_curso: number | null;
  estado_civil: string | null;
  n_carta: string | null;
  data_validade_carta: string | null;
  data_bi: string | null;
  bi: number | null;
  data_ta: string | null;
  email: string;
  rua: string | null;
  cidade: string | null;
  freguesia: string | null;
  cod_postal: string | null;
  grupo_ii: string | null;
  validade_grupoII: string | null;
  nif: number | null;
  numero_porta: number | null;
  n_cvp: number | null;
  tem_carta: number | null;
  data_inicio_carta: string | null;
  estado: string | null;
  profissao: string | null;
  updated_by: string;
  update_date: string;
}

export interface SocorristaHistRow {
  numero: number;
  imagem: string | null;
  sangue: string | null;
  dae: number | null;
  n_tripulante: number | null;
  nome: string | null;
  nascimento: string | null;
  juramento: string | null;
  contacto: number | null;
  contacto2: number | null;
  sexo: string | null;
  curso_tripulante: string | null;
  habilitacoes: string | null;
  curso: string | null;
  num_curso: number | null;
  estado_civil: string | null;
  n_carta: string | null;
  data_validade_carta: string | null;
  data_bi: string | null;
  bi: number | null;
  data_ta: string | null;
  email: string | null;
  rua: string | null;
  cidade: string | null;
  freguesia: string | null;
  cod_postal: string | null;
  grupo_ii: string | null;
  validade_grupoII: string | null;
  nif: number | null;
  numero_porta: number | null;
  n_cvp: number | null;
  tem_carta: number | null;
  data_inicio_carta: string | null;
  estado: string | null;
  profissao: string | null;
  updated_by: string | null;
  update_date: string;
  operacao: string;
}

export interface AmbulanciasRow {
  n_regional: string;
  matricula: string;
  descricao: string | null;
  seguro: string | null;
  nome_seguro: string;
  inspecao: string | null;
  inem: string;
  tipo: string;
  imagem: string | null;
  created_by: string | null;
  creation_date: string | null;
  updated_by: string | null;
  update_date: string;
}

export interface AmbulanciasHistRow {
  n_regional: string;
  matricula: string | null;
  descricao: string | null;
  seguro: string | null;
  nome_seguro: string | null;
  inspecao: string | null;
  inem: string | null;
  tipo: string | null;
  imagem: string | null;
  created_by: string | null;
  creation_date: string | null;
  updated_by: string | null;
  update_date: string;
  operacao: string | null;
}

/** PK is `(Ambulancia, Descricao)` — legacy has no synthetic id for this table. */
export interface MaterialRow {
  Ambulancia: number;
  Descricao: string;
  validade: string;
  Quantidade: number | null;
  Quantidade_minima: number | null;
  Tipo: string;
  Status: string;
  aviso: string | null;
  Imagem: string;
  preco_unitario: number;
}

/** PK is `(id, ano, material, ambulancia)`. */
export interface MaterialSaidaRow {
  id: string;
  ano: number;
  material: string;
  quantidade: number;
  ambulancia: number;
  Outro: string;
  updated_by: string;
  update_date: string;
}

/** PK is `(id, ano)`. Every `saidas` row is an EMERGENCY report (plan finding F1). */
export interface SaidasRow {
  id: number;
  ano: number;
  estado: string;
  data: string;
  tipo_ocorrencia: string;
  ambulancia: number;
  ficha_codu: number | null;
  idade_AM: string | null;
  idade: number | null;
  sexo: string | null;
  h_chamada: string;
  hcl: string;
  hsl: string | null;
  hch: string | null;
  quilometros: number;
  descricao: string;
  contacto: number;
  tipo_local: string;
  freguesia: string;
  inem: string;
  transporte: string;
  condutor: number;
  socorrista1: number;
  socorrista2: number;
  hd: string;
  created_by: string;
  create_date: string;
  updated_by: string;
  update_date: string;
}

/** PK is `(mes, turno, ano, dia)`. `socorrista_3` is not a typo for `socorrista_2` — see plan §10 Q4 (resolved: named roles regardless of numbering). */
export interface EscalaRow {
  mes: string;
  condutor: number;
  socorrista_1: number;
  socorrista_3: number;
  trocas: string;
  turno: number;
  ano: number;
  dia: number;
  observacoes: string;
  dia_semana: string;
  update_date: string;
  updated_by: string | null;
}

/** PK is `(time, socorrista)`. */
export interface AlteracoesEscalaRow {
  time: string;
  socorrista: number;
  dia: number;
  mes: number;
  ano: number;
  turno: number;
  funcao: string;
  acao: string;
  estado: string;
}

/** PK is `(ano, mes, dia, turno, socorrista)`. No columns beyond the key. */
export interface DisponibilidadeRow {
  ano: number;
  mes: number;
  dia: number;
  turno: number;
  socorrista: number;
}

/** 0 rows in the live dump (plan finding F3) — read anyway for the preflight row-count check. */
export interface AberturaDisponibilidadeRow {
  data_inicio: string;
  status: string;
  id: number;
}

/** PK is `(socorrista, data, hora_inicio)`. */
export interface HorasVoluntariadoRow {
  socorrista: number;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  horas: string;
  tipo: string;
  descricao: string;
  info: string;
  codigo: string;
  explicacao: string;
}

export interface TipoLocalRow {
  id: string;
  descricao: string;
}

export interface TipoOcorrenciaRow {
  id: string;
  descricao: string;
}

export interface ApoioInemRow {
  id: string;
  descricao: string;
}

export interface TransporteRow {
  id: string;
  descricao: string;
}

export interface FuncaoRow {
  id: string;
  descricao: string;
}

/** PK is `descricao` itself — legacy names this table `habilitações` (with the accent). */
export interface HabilitacoesRow {
  descricao: string;
  outro: string | null;
}
