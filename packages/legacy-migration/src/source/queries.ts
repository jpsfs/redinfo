/**
 * One named SELECT per legacy table, and the `LegacySource` interface every
 * loader depends on instead of on `mysql2` directly. This is the only module
 * in the tree that speaks SQL — every column list is explicit (never
 * `SELECT *`), which is also what keeps the "never touch the password
 * columns" constraint (`no-secrets.spec.ts`) a property of the query text
 * itself rather than something reviewed by eye.
 *
 * `LegacySource` is what lets `legacy-migration.integration.spec.ts` inject a
 * synthetic in-memory fixture instead of standing up a MySQL container —
 * nothing downstream of this interface can tell the difference.
 */
import { Pool } from 'mysql2/promise';
import {
  AberturaDisponibilidadeRow,
  AlteracoesEscalaRow,
  AmbulanciasHistRow,
  AmbulanciasRow,
  ApoioInemRow,
  DisponibilidadeRow,
  EscalaRow,
  FuncaoRow,
  HabilitacoesRow,
  HorasVoluntariadoRow,
  MaterialRow,
  MaterialSaidaRow,
  SaidasRow,
  SocorristaHistRow,
  SocorristaRow,
  TipoLocalRow,
  TipoOcorrenciaRow,
  TransporteRow,
  UsuariosHistRow,
  UsuariosRow,
} from './row-types';

export interface LegacySource {
  usuarios(): Promise<UsuariosRow[]>;
  usuariosHist(): Promise<UsuariosHistRow[]>;
  socorrista(): Promise<SocorristaRow[]>;
  socorristaHist(): Promise<SocorristaHistRow[]>;
  ambulancias(): Promise<AmbulanciasRow[]>;
  ambulanciasHist(): Promise<AmbulanciasHistRow[]>;
  material(): Promise<MaterialRow[]>;
  materialSaida(): Promise<MaterialSaidaRow[]>;
  /** `since`, when given, restricts to `data >= since` (`YYYY-MM-DD`) — plan §7 `--since`. */
  saidas(since?: string): Promise<SaidasRow[]>;
  escala(since?: string): Promise<EscalaRow[]>;
  alteracoesEscala(): Promise<AlteracoesEscalaRow[]>;
  disponibilidade(since?: string): Promise<DisponibilidadeRow[]>;
  aberturaDisponibilidade(): Promise<AberturaDisponibilidadeRow[]>;
  horasVoluntariado(since?: string): Promise<HorasVoluntariadoRow[]>;
  tipoLocal(): Promise<TipoLocalRow[]>;
  tipoOcorrencia(): Promise<TipoOcorrenciaRow[]>;
  apoioInem(): Promise<ApoioInemRow[]>;
  transporte(): Promise<TransporteRow[]>;
  funcao(): Promise<FuncaoRow[]>;
  habilitacoes(): Promise<HabilitacoesRow[]>;
}

export class MysqlLegacySource implements LegacySource {
  constructor(private readonly pool: Pool) {}

  async usuarios(): Promise<UsuariosRow[]> {
    const [rows] = await this.pool.query(
      'SELECT id, nome, usuario, tipo, activo, fbid, updated_by, update_date FROM usuarios',
    );
    return rows as UsuariosRow[];
  }

  async usuariosHist(): Promise<UsuariosHistRow[]> {
    const [rows] = await this.pool.query(
      'SELECT id, nome, usuario, tipo, activo, fbid, updated_by, update_date FROM usuarios_hist ORDER BY id, update_date',
    );
    return rows as UsuariosHistRow[];
  }

  async socorrista(): Promise<SocorristaRow[]> {
    const [rows] = await this.pool.query(
      `SELECT numero, imagem, sangue, dae, n_tripulante, nome, nascimento, juramento, contacto,
              contacto2, sexo, curso_tripulante, habilitacoes, curso, num_curso, estado_civil,
              n_carta, data_validade_carta, data_bi, bi, data_ta, email, rua, cidade, freguesia,
              cod_postal, grupo_ii, validade_grupoII, nif, numero_porta, n_cvp, tem_carta,
              data_inicio_carta, estado, profissao, updated_by, update_date
         FROM socorrista`,
    );
    return rows as SocorristaRow[];
  }

  async socorristaHist(): Promise<SocorristaHistRow[]> {
    const [rows] = await this.pool.query(
      `SELECT numero, imagem, sangue, dae, n_tripulante, nome, nascimento, juramento, contacto,
              contacto2, sexo, curso_tripulante, habilitacoes, curso, num_curso, estado_civil,
              n_carta, data_validade_carta, data_bi, bi, data_ta, email, rua, cidade, freguesia,
              cod_postal, grupo_ii, validade_grupoII, nif, numero_porta, n_cvp, tem_carta,
              data_inicio_carta, estado, profissao, updated_by, update_date, operacao
         FROM socorrista_hist
        ORDER BY numero, update_date`,
    );
    return rows as SocorristaHistRow[];
  }

  async ambulancias(): Promise<AmbulanciasRow[]> {
    const [rows] = await this.pool.query(
      `SELECT n_regional, matricula, descricao, seguro, nome_seguro, inspecao, inem, tipo,
              imagem, created_by, creation_date, updated_by, update_date
         FROM ambulancias`,
    );
    return rows as AmbulanciasRow[];
  }

  async ambulanciasHist(): Promise<AmbulanciasHistRow[]> {
    const [rows] = await this.pool.query(
      `SELECT n_regional, matricula, descricao, seguro, nome_seguro, inspecao, inem, tipo,
              imagem, created_by, creation_date, updated_by, update_date, operacao
         FROM ambulancias_hist
        ORDER BY n_regional, update_date`,
    );
    return rows as AmbulanciasHistRow[];
  }

  async material(): Promise<MaterialRow[]> {
    const [rows] = await this.pool.query(
      `SELECT Ambulancia, Descricao, validade, Quantidade, Quantidade_minima, Tipo, Status,
              aviso, Imagem, preco_unitario
         FROM Material`,
    );
    return rows as MaterialRow[];
  }

  async materialSaida(): Promise<MaterialSaidaRow[]> {
    const [rows] = await this.pool.query(
      'SELECT id, ano, material, quantidade, ambulancia, Outro, updated_by, update_date FROM material_saida',
    );
    return rows as MaterialSaidaRow[];
  }

  async saidas(since?: string): Promise<SaidasRow[]> {
    const where = since ? 'WHERE data >= ?' : '';
    const [rows] = await this.pool.query(
      `SELECT id, ano, estado, data, tipo_ocorrencia, ambulancia, ficha_codu, idade_AM, idade,
              sexo, h_chamada, hcl, hsl, hch, quilometros, descricao, contacto, tipo_local,
              freguesia, inem, transporte, condutor, socorrista1, socorrista2, hd, created_by,
              create_date, updated_by, update_date
         FROM saidas
         ${where}`,
      since ? [since] : [],
    );
    return rows as SaidasRow[];
  }

  async escala(since?: string): Promise<EscalaRow[]> {
    const where = since ? 'WHERE ano >= YEAR(?)' : '';
    const [rows] = await this.pool.query(
      `SELECT mes, condutor, socorrista_1, socorrista_3, trocas, turno, ano, dia, observacoes,
              dia_semana, update_date, updated_by
         FROM escala
         ${where}`,
      since ? [since] : [],
    );
    return rows as EscalaRow[];
  }

  async alteracoesEscala(): Promise<AlteracoesEscalaRow[]> {
    const [rows] = await this.pool.query(
      'SELECT time, socorrista, dia, mes, ano, turno, funcao, acao, estado FROM alteracoes_escala',
    );
    return rows as AlteracoesEscalaRow[];
  }

  async disponibilidade(since?: string): Promise<DisponibilidadeRow[]> {
    const where = since ? 'WHERE ano >= YEAR(?)' : '';
    const [rows] = await this.pool.query(
      `SELECT ano, mes, dia, turno, socorrista FROM disponibilidade ${where}`,
      since ? [since] : [],
    );
    return rows as DisponibilidadeRow[];
  }

  async aberturaDisponibilidade(): Promise<AberturaDisponibilidadeRow[]> {
    const [rows] = await this.pool.query('SELECT data_inicio, status, id FROM abertura_disponibilidade');
    return rows as AberturaDisponibilidadeRow[];
  }

  async horasVoluntariado(since?: string): Promise<HorasVoluntariadoRow[]> {
    const where = since ? 'WHERE data >= ?' : '';
    const [rows] = await this.pool.query(
      `SELECT socorrista, data, hora_inicio, hora_fim, horas, tipo, descricao, info, codigo, explicacao
         FROM horas_voluntariado
         ${where}`,
      since ? [since] : [],
    );
    return rows as HorasVoluntariadoRow[];
  }

  async tipoLocal(): Promise<TipoLocalRow[]> {
    const [rows] = await this.pool.query('SELECT id, descricao FROM tipo_local');
    return rows as TipoLocalRow[];
  }

  async tipoOcorrencia(): Promise<TipoOcorrenciaRow[]> {
    const [rows] = await this.pool.query('SELECT id, descricao FROM tipo_ocorrencia');
    return rows as TipoOcorrenciaRow[];
  }

  async apoioInem(): Promise<ApoioInemRow[]> {
    const [rows] = await this.pool.query('SELECT id, descricao FROM apoio_inem');
    return rows as ApoioInemRow[];
  }

  async transporte(): Promise<TransporteRow[]> {
    const [rows] = await this.pool.query('SELECT id, descricao FROM transporte');
    return rows as TransporteRow[];
  }

  async funcao(): Promise<FuncaoRow[]> {
    const [rows] = await this.pool.query('SELECT id, descricao FROM funcao');
    return rows as FuncaoRow[];
  }

  async habilitacoes(): Promise<HabilitacoesRow[]> {
    // Backtick-quoted: the legacy table name itself carries the accent.
    const [rows] = await this.pool.query('SELECT descricao, outro FROM `habilitações`');
    return rows as HabilitacoesRow[];
  }
}
