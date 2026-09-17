import { TranslationMessages } from 'react-admin';

/**
 * European Portuguese for react-admin's own ~164 built-in strings.
 *
 * Hand-written against `ra-language-english`'s key tree
 * (`node_modules/ra-language-english/src/index.ts`), not `ra-language-
 * portuguese` — that package is 1.6.0, last published in 2022 against
 * react-admin v3, and Brazilian ("Salvar", "Excluir", "você"). Wording a
 * Portuguese Red Cross delegation would notice. See #180's plan.
 *
 * Merged *over* `ra-language-english` by `i18nProvider.ts`, so a key added
 * to a future react-admin version that this file has not caught up with
 * still falls back to English rather than vanishing.
 */
const raPortugueseMessages: TranslationMessages = {
  ra: {
    action: {
      add_filter: 'Adicionar filtro',
      add: 'Adicionar',
      back: 'Voltar',
      bulk_actions: '1 elemento selecionado |||| %{smart_count} elementos selecionados',
      cancel: 'Cancelar',
      clear_array_input: 'Limpar a lista',
      clear_input_value: 'Limpar valor',
      clone: 'Duplicar',
      confirm: 'Confirmar',
      create: 'Criar',
      create_item: 'Criar %{item}',
      delete: 'Eliminar',
      edit: 'Editar',
      export: 'Exportar',
      list: 'Lista',
      refresh: 'Atualizar',
      remove_filter: 'Remover este filtro',
      remove_all_filters: 'Remover todos os filtros',
      remove: 'Remover',
      reset: 'Repor',
      save: 'Guardar',
      search: 'Procurar',
      search_columns: 'Procurar colunas',
      select_all: 'Selecionar tudo',
      select_all_button: 'Selecionar tudo',
      select_row: 'Selecionar esta linha',
      show: 'Ver',
      sort: 'Ordenar',
      undo: 'Anular',
      unselect: 'Anular seleção',
      expand: 'Expandir',
      close: 'Fechar',
      open_menu: 'Abrir menu',
      close_menu: 'Fechar menu',
      update: 'Atualizar',
      move_up: 'Mover para cima',
      move_down: 'Mover para baixo',
      open: 'Abrir',
      toggle_theme: 'Alternar modo claro/escuro',
      select_columns: 'Colunas',
      update_application: 'Recarregar aplicação',
    },
    boolean: {
      true: 'Sim',
      false: 'Não',
      null: ' ',
    },
    page: {
      create: 'Criar %{name}',
      dashboard: 'Painel',
      edit: '%{name} %{recordRepresentation}',
      error: 'Ocorreu um erro',
      list: '%{name}',
      loading: 'A carregar',
      not_found: 'Não encontrado',
      show: '%{name} %{recordRepresentation}',
      empty: 'Ainda não há %{name}.',
      invite: 'Pretende adicionar um?',
      access_denied: 'Acesso negado',
      authentication_error: 'Erro de autenticação',
    },
    input: {
      file: {
        upload_several: 'Solte alguns ficheiros aqui, ou clique para escolher um.',
        upload_single: 'Solte um ficheiro aqui, ou clique para escolher um.',
      },
      image: {
        upload_several: 'Solte algumas imagens aqui, ou clique para escolher uma.',
        upload_single: 'Solte uma imagem aqui, ou clique para escolher uma.',
      },
      references: {
        all_missing: 'Não foi possível encontrar os dados de referência.',
        many_missing: 'Pelo menos uma das referências associadas já não está disponível.',
        single_missing: 'A referência associada já não está disponível.',
      },
      password: {
        toggle_visible: 'Ocultar palavra-passe',
        toggle_hidden: 'Mostrar palavra-passe',
      },
    },
    message: {
      about: 'Sobre',
      access_denied: 'Não tem permissões para aceder a esta página',
      are_you_sure: 'Tem a certeza?',
      authentication_error:
        'O servidor de autenticação devolveu um erro e não foi possível verificar as suas credenciais.',
      auth_error: 'Ocorreu um erro ao validar o token de autenticação.',
      bulk_delete_content:
        'Tem a certeza de que quer eliminar este %{name}? |||| Tem a certeza de que quer eliminar estes %{smart_count} elementos?',
      bulk_delete_title: 'Eliminar %{name} |||| Eliminar %{smart_count} %{name}',
      bulk_update_content:
        'Tem a certeza de que quer atualizar %{name} %{recordRepresentation}? |||| Tem a certeza de que quer atualizar estes %{smart_count} elementos?',
      bulk_update_title:
        'Atualizar %{name} %{recordRepresentation} |||| Atualizar %{smart_count} %{name}',
      clear_array_input: 'Tem a certeza de que quer limpar toda a lista?',
      delete_content: 'Tem a certeza de que quer eliminar este %{name}?',
      delete_title: 'Eliminar %{name} %{recordRepresentation}',
      details: 'Detalhes',
      error: 'Ocorreu um erro no cliente e não foi possível concluir o pedido.',
      invalid_form: 'O formulário não é válido. Verifique os erros',
      loading: 'Aguarde, por favor',
      no: 'Não',
      not_found: 'Escreveu um URL incorreto, ou seguiu uma ligação inválida.',
      select_all_limit_reached:
        'Há demasiados elementos para selecionar todos. Foram selecionados apenas os primeiros %{max}.',
      unsaved_changes: 'Algumas alterações não foram guardadas. Tem a certeza de que quer ignorá-las?',
      yes: 'Sim',
      placeholder_data_warning: 'Problema de rede: não foi possível atualizar os dados.',
    },
    navigation: {
      clear_filters: 'Limpar filtros',
      no_filtered_results: 'Não foi encontrado nenhum %{name} com os filtros atuais.',
      no_results: 'Não foi encontrado nenhum %{name}',
      no_more_results: 'A página número %{page} está fora dos limites. Tente a página anterior.',
      page_out_of_boundaries: 'Página número %{page} fora dos limites',
      page_out_from_end: 'Não é possível avançar além da última página',
      page_out_from_begin: 'Não é possível recuar antes da página 1',
      page_range_info: '%{offsetBegin}-%{offsetEnd} de %{total}',
      partial_page_range_info: '%{offsetBegin}-%{offsetEnd} de mais de %{offsetEnd}',
      current_page: 'Página %{page}',
      page: 'Ir para a página %{page}',
      first: 'Ir para a primeira página',
      last: 'Ir para a última página',
      next: 'Ir para a página seguinte',
      previous: 'Ir para a página anterior',
      page_rows_per_page: 'Linhas por página:',
      skip_nav: 'Saltar para o conteúdo',
    },
    sort: {
      sort_by: 'Ordenar por %{field_lower_first} %{order}',
      ASC: 'ascendente',
      DESC: 'descendente',
    },
    auth: {
      auth_check_error: 'Inicie sessão para continuar',
      user_menu: 'Perfil',
      username: 'Utilizador',
      password: 'Palavra-passe',
      email: 'Email',
      sign_in: 'Entrar',
      sign_in_error: 'Falha na autenticação, tente novamente',
      logout: 'Sair',
    },
    notification: {
      updated: 'Elemento atualizado |||| %{smart_count} elementos atualizados',
      created: 'Elemento criado',
      deleted: 'Elemento eliminado |||| %{smart_count} elementos eliminados',
      bad_item: 'Elemento incorreto',
      item_doesnt_exist: 'O elemento não existe',
      http_error: 'Erro de comunicação com o servidor',
      data_provider_error: 'Erro do dataProvider. Consulte a consola para mais detalhes.',
      i18n_error: 'Não é possível carregar as traduções para o idioma indicado',
      canceled: 'Ação cancelada',
      logged_out: 'A sua sessão terminou, volte a ligar-se.',
      not_authorized: 'Não tem autorização para aceder a este recurso.',
      application_update_available: 'Está disponível uma nova versão.',
      offline: 'Sem ligação. Não foi possível obter os dados.',
    },
    validation: {
      required: 'Obrigatório',
      minLength: 'Deve ter pelo menos %{min} caracteres',
      maxLength: 'Deve ter no máximo %{max} caracteres',
      minValue: 'Deve ser pelo menos %{min}',
      maxValue: 'Deve ser %{max} ou menos',
      number: 'Deve ser um número',
      email: 'Deve ser um email válido',
      oneOf: 'Deve ser um de: %{options}',
      regex: 'Deve corresponder a um formato específico (regex): %{pattern}',
      unique: 'Deve ser único',
    },
    saved_queries: {
      label: 'Pesquisas guardadas',
      query_name: 'Nome da pesquisa',
      new_label: 'Guardar pesquisa atual...',
      new_dialog_title: 'Guardar pesquisa atual como',
      remove_label: 'Remover pesquisa guardada',
      remove_label_with_name: 'Remover pesquisa "%{name}"',
      remove_dialog_title: 'Remover pesquisa guardada?',
      remove_message:
        'Tem a certeza de que quer remover este elemento da lista de pesquisas guardadas?',
      help: 'Filtre a lista e guarde esta pesquisa para mais tarde',
    },
    guesser: {
      empty: {
        title: 'Sem dados para mostrar',
        message: 'Verifique o seu fornecedor de dados',
      },
    },
    configurable: {
      customize: 'Personalizar',
      configureMode: 'Configurar esta página',
      inspector: {
        title: 'Inspetor',
        content: 'Passe o cursor pelos elementos da interface para os configurar',
        reset: 'Repor configurações',
        hideAll: 'Ocultar tudo',
        showAll: 'Mostrar tudo',
      },
      Datagrid: {
        title: 'Tabela',
        unlabeled: 'Coluna sem nome #%{column}',
      },
      SimpleForm: {
        title: 'Formulário',
        unlabeled: 'Campo sem nome #%{input}',
      },
      SimpleList: {
        title: 'Lista',
        primaryText: 'Texto principal',
        secondaryText: 'Texto secundário',
        tertiaryText: 'Texto terciário',
      },
    },
  },
};

export default raPortugueseMessages;
