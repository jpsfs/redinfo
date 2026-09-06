# Notas de manutenção do manual

Notas internas para quem edita este manual — não fazem parte do `manual.md` porque este é
para ser lido pelo operador, não por quem mantém o documento ou o sistema.

- As capturas de ecrã em `imagens/` são geradas pelo script `capturar-ecras.mjs` nesta
  mesma pasta — corre-o de novo sempre que a aplicação mudar de aspeto, em vez de tirar
  capturas à mão.
- Depois de editar `manual.md`, gera o PDF com `node docs/manual-operador/gerar-pdf.mjs`
  (ver o cabeçalho desse ficheiro para os pré-requisitos, nomeadamente `pandoc`).
