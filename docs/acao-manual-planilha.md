# Ação manual por planilha

Este fluxo replica a operação de lote da V1 como uma alternativa direta ao fluxo V2 com voucher, contrato PDF, OpenRouter e aprovação.

## Uso

1. Acesse **Ação manual por planilha**.
2. Importe um arquivo `.xlsx` ou `.csv`.
3. Escolha a aba, a coluna com números dos contratos e a ação DMA.
4. Confira a prévia e confirme a criação do lote.
5. Execute ou continue o lote; cada contrato é enviado individualmente à Coral e o resultado é salvo antes do próximo.
6. Baixe o resultado CSV para conferência.

Linhas vazias e contratos duplicados são ignorados. O limite é 15 MB, 20 abas, 100 colunas e 1.000 linhas de contratos. O processo trabalha em blocos sequenciais de 10 e pode ser pausado entre blocos.

## Checkpoint e repetição

O status e as tentativas ficam registrados por linha. Ao continuar um lote, contratos confirmados não são repetidos. Erros definitivos podem ser reenviados manualmente. Timeout, falha de rede, HTTP 5xx e interrupção durante uma chamada são classificados como resultado incerto; repetir um desses itens exige confirmação explícita porque a Coral pode já ter aplicado a ação.

O lote usa o mesmo payload da V1 (`contrato`, `considerar_dma`, `desconsiderar_dma`) e consulta a configuração Coral no servidor. Ele não valida individualmente os contratos, não exige documentos e não exige análise ou aprovação, conforme o caminho de execução direta da V1. Mantenha `MODO_TESTE_API=true` enquanto a URL real de alteração DMA e as credenciais Coral não estiverem confirmadas.
