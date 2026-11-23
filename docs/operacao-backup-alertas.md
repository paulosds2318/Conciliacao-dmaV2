# Operação: backup, restauração e alarmes

Roteiro para conferir (e, se faltar, configurar) backup do banco e dos arquivos, e alarmes de falha na AWS. O código não tem acesso à conta AWS, então **nada aqui foi conferido na conta real**: é uma lista para quem administra a AWS verificar. Os nomes entre `<...>` são do seu ambiente.

## 1. Backup do banco (RDS PostgreSQL)

Conferir no console do RDS, na instância de produção:

| Item | Esperado |
|---|---|
| Backups automáticos | Ligados, retenção de **no mínimo 7 dias** (o guia de deploy pede isso). Para dados de contrato, 14 a 35 dias é mais seguro. |
| Restauração para um ponto no tempo | Disponível (vem com o backup automático). |
| Proteção contra exclusão | **Deletion protection** ligada. |
| Snapshot final ao excluir | Ligado (nunca excluir sem snapshot). |
| Criptografia | Ligada, nos dados e nos backups. |
| Alta disponibilidade | Multi-AZ, se o custo permitir (um backup recupera dados, mas não evita a queda). |

## 2. Backup dos arquivos (S3: vouchers e contratos)

Conferir no bucket `<bucket-de-documentos>`:

| Item | Esperado |
|---|---|
| Versionamento | **Ligado**. Sem ele, um arquivo apagado ou sobrescrito não volta. |
| Regra de ciclo de vida | Versões antigas expiram depois de um prazo definido (por exemplo 90 dias), para não crescer sem limite. |
| Acesso público | Bloqueado (*Block Public Access*). |
| Criptografia | Padrão do bucket ligada. |
| Cópia fora da região ou da conta | Opcional: replicação ou AWS Backup, se a política da empresa exigir. |

O app só grava e lê objetos; a permissão de apagar existe para a remoção de anexos. Por isso o versionamento é a proteção principal contra apagar por engano.

## 3. Teste de restauração (fazer ao menos a cada 3 meses)

Backup que nunca foi restaurado é uma suposição. Roteiro:

1. **Banco:** no RDS, restaurar um snapshot ou um ponto no tempo para uma **nova instância de teste** (nunca sobre a de produção).
2. Conectar nela e conferir que existem dados recentes, por exemplo:
   `SELECT count(*), max("createdAt") FROM dma_requests;`
3. Anotar quanto tempo a restauração levou e se os números batem com a produção.
4. **Excluir a instância de teste** ao final, para não gerar custo.
5. **Arquivos:** apagar um objeto de teste no bucket, recuperar a versão anterior e abrir o arquivo.
6. Registrar a data, quem fez e o resultado.

## 4. Alarmes recomendados (CloudWatch)

Todos devem notificar um tópico SNS com e-mail de quem acompanha o sistema. Criar o tópico uma vez:

```
aws sns create-topic --name conciliacao-dma-alertas
aws sns subscribe --topic-arn <arn-do-topico> --protocol email --notification-endpoint <email>
```

(confirmar a inscrição pelo e-mail recebido).

| Alarme | Métrica | Condição sugerida |
|---|---|---|
| Aplicação fora do ar | ALB `UnHealthyHostCount` (ou `HealthyHostCount` < 1) | maior ou igual a 1 por 2 períodos de 1 min |
| Erros do servidor | ALB `HTTPCode_Target_5XX_Count` | soma maior que 5 em 5 min |
| Resposta lenta | ALB `TargetResponseTime` | média acima de 30 s em 5 min (a análise da IA pode levar até 2 min, ajuste conforme o que for normal) |
| Banco sem espaço | RDS `FreeStorageSpace` | abaixo de 20% do total |
| Banco sobrecarregado | RDS `CPUUtilization` | acima de 80% por 10 min |
| Banco sem conexões | RDS `DatabaseConnections` | acima de 80% do limite da instância |
| Falhas do sistema | Filtro de métrica `[ALERTA]` (seção 5) | maior ou igual a 1 em 5 min |

Também vale ativar as **notificações de eventos do RDS** (falha de backup, reinício, failover) apontando para o mesmo tópico.

## 5. Alarme de falhas do sistema (log `[ALERTA]`)

O app escreve uma linha com o marcador fixo `[ALERTA]` quando algo pede atenção humana. A linha traz só o código e o id da solicitação, sem dados do cliente:

| Linha no log | Significado | O que fazer |
|---|---|---|
| `[ALERTA] EXECUCAO_FALHOU solicitacao=<id>` | O Coral recusou a ação. | Conferir o contrato no Coral; se a ação ainda for necessária, fazer em "Ação manual". |
| `[ALERTA] EXECUCAO_INCERTA solicitacao=<id>` | O Coral não confirmou o resultado. | Conferir no Coral e registrar o resultado na tela da solicitação. **Não aprovar de novo.** |
| `[ALERTA] ANALISE_FALHOU solicitacao=<id>` | A análise documental não terminou (IA fora, erro). | Pedir ao atendente para tentar de novo; se repetir, ver o serviço da IA. |
| `[ALERTA] PROCESSO_INTERROMPIDO solicitacao=<id>` | O servidor reiniciou no meio de uma análise ou execução. | Tratar como incerta (conferir no Coral) se era uma execução. |

Criar o filtro de métrica no grupo de logs do container (`<grupo-de-logs>`) e o alarme:

```
aws logs put-metric-filter --log-group-name <grupo-de-logs> --filter-name alerta-dma \
  --filter-pattern '"[ALERTA]"' \
  --metric-transformations metricName=AlertasDMA,metricNamespace=ConciliacaoDMA,metricValue=1,defaultValue=0

aws cloudwatch put-metric-alarm --alarm-name conciliacao-dma-alertas \
  --namespace ConciliacaoDMA --metric-name AlertasDMA --statistic Sum --period 300 \
  --evaluation-periods 1 --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching --alarm-actions <arn-do-topico>
```

O aviso por e-mail diz que houve falha; a solicitação exata está no log (busque por `[ALERTA]`) e também no painel do administrador, em "precisam de ação".

## 6. Outros pontos de operação

- **Segredos:** `BETTER_AUTH_SECRET`, chaves do OpenRouter e do Coral ficam no Secrets Manager; definir a rotação e quem pode lê-los.
- **Modo de teste:** conferir que `MODO_TESTE_API` está em `false` em produção. Em `true`, as aprovações só simulam.
- **Retenção dos documentos (LGPD):** os arquivos têm CPF e nome. Definir por quanto tempo ficam guardados e como são apagados; isso é decisão da empresa e deve refletir no ciclo de vida do bucket.
- **Verificação de saúde:** `GET /api/health` responde 200 só com o banco acessível; é o que o ALB usa.
