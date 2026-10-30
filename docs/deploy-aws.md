# Deploy na AWS — conciliacao-dma

Guia para criar e manter o ambiente da aplicação na AWS. A aplicação é um container Docker (Next.js + Node 22) que usa PostgreSQL e guarda voucher e contrato num bucket S3 privado.

## Visão geral

```
CodeCommit (master) ──► CodePipeline ──► CodeBuild (buildspec.yml) ──► ECR ──► ECS Fargate
                                                                                   │
            Usuários ──HTTPS──► Application Load Balancer ─────────────────────────┤
                                                                                   ├──► RDS PostgreSQL 16
                                                                                   ├──► S3 (documentos, privado)
                                                                                   └──► NAT ──► Coral, OpenRouter
```

- **Código:** `ssh://git-codecommit.us-east-1.amazonaws.com/v1/repos/conciliacao-dma`, branch `master`.
- **Região recomendada:** `sa-east-1` (São Paulo). Os documentos contêm nome e CPF de clientes (LGPD).

## 1. Recursos a criar

| Recurso | Configuração |
|---|---|
| **ECR** | Repositório `conciliacao-dma`, com scan de imagem ao enviar. |
| **RDS** | PostgreSQL 16, sub-rede privada, backup automático (mín. 7 dias), criptografia ativa. Acesso só a partir do security group do ECS. |
| **S3** | Bucket privado (ex.: `conciliacao-dma-documentos-prod`): *Block Public Access* ligado, criptografia padrão (SSE-S3 ou KMS), versionamento recomendado. |
| **ECS Fargate** | Cluster + serviço com 1 task (0,5 vCPU / 1 GB é suficiente para começar), container `conciliacao-dma`, porta **3000**. Sub-rede privada. |
| **ALB** | HTTPS (certificado no ACM) → target group na porta 3000. **Idle timeout: 180 s.** Health check: `GET /api/health`, sucesso `200`. |
| **NAT Gateway** | Saída para a internet (Coral e `openrouter.ai`). O IP elástico do NAT é o que o Coral deve liberar, se exigir lista de IPs. |
| **Secrets Manager** | Segredos listados na seção 3. |
| **CloudWatch Logs** | Grupo de logs do container (o app escreve em stdout). |

> **Por que 180 s de idle timeout:** a análise da IA roda dentro da requisição de envio e pode levar até 2 minutos. Com o padrão de 60 s, o atendente recebe erro mesmo com a análise concluindo.

## 2. Permissões (IAM)

**Task role** (usada pela aplicação):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
    "Resource": "arn:aws:s3:::conciliacao-dma-documentos-prod/documents/*"
  }]
}
```

Se usar chave KMS própria no bucket, inclua `kms:Encrypt`, `kms:Decrypt` e `kms:GenerateDataKey` nessa chave.

**Execution role:** a padrão do ECS (`AmazonECSTaskExecutionRolePolicy`) + `secretsmanager:GetSecretValue` nos segredos da aplicação.

**CodeBuild:** permissão de push no repositório ECR (`ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`, `ecr:PutImage`) e **privileged mode** habilitado (necessário para Docker).

## 3. Variáveis de ambiente da task

Segredos (Secrets Manager):

| Variável | Valor |
|---|---|
| `DATABASE_URL` | `postgresql://USUARIO:SENHA@ENDPOINT-RDS:5432/conciliacao_dma?schema=public` |
| `BETTER_AUTH_SECRET` | Aleatório, ≥ 32 caracteres (`openssl rand -base64 48`) |
| `OPENROUTER_API_KEY` | Chave de produção do OpenRouter |
| `CORAL_AUTH_TOKEN` | Token do usuário de serviço do Coral (ver pendências) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Primeiro administrador (usados só no passo 5) |

Configuração (texto simples):

| Variável | Valor em produção |
|---|---|
| `BETTER_AUTH_URL` | URL pública, ex.: `https://dma.aluguefoco.com.br` |
| `OPENROUTER_MODEL` | Modelo que lê PDF e imagem |
| `CORAL_CONTRACT_LOOKUP_URL` | `https://servicescoral.aluguefoco.com.br/api/rentagreement/{CONTRATO}` |
| `CORAL_DMA_ELIGIBILITY_URL` | `https://servicescoral.aluguefoco.com.br/api/rentagreement/dma/eligibility` |
| `MODO_TESTE_API` | `true` até homologar; depois `false` |
| `DOCUMENT_STORAGE_BUCKET` | Nome do bucket S3 |
| `DOCUMENT_STORAGE_REGION` | Região do bucket (ex.: `sa-east-1`) |
| `REQUIRE_DOCUMENT_BUCKET` | `true` |
| `MAX_PDF_SIZE_MB` | `20` |

A aplicação **não inicia** em produção sem `DATABASE_URL`, `BETTER_AUTH_SECRET` e `BETTER_AUTH_URL`, nem sem bucket quando `REQUIRE_DOCUMENT_BUCKET=true`. O erro aparece no log do container.

## 4. Pipeline de deploy

1. **CodeBuild:** origem CodeCommit `conciliacao-dma`, branch `master`, buildspec `buildspec.yml` (na raiz). Ambiente Linux padrão com privileged mode. Variáveis `ECR_REPOSITORY` e `CONTAINER_NAME` já têm padrão `conciliacao-dma` no buildspec; sobrescreva no projeto se os nomes forem outros.
2. **CodePipeline:** Source (CodeCommit, `master`) → Build (CodeBuild acima) → Deploy (Amazon ECS, cluster/serviço, arquivo `imagedefinitions.json`).

Cada push na `master` gera uma imagem com a tag do commit e atualiza o serviço sem derrubar o ar (rolling update).

**Banco de dados:** ao iniciar, o container roda `prisma migrate deploy` e só sobe a aplicação se as migrações forem aplicadas. Não é preciso rodar nada manualmente a cada deploy.

## 5. Primeiro acesso (uma única vez)

Depois do primeiro deploy, rode uma task avulsa com a mesma task definition, sobrescrevendo o comando:

```
node --experimental-strip-types prisma/seed.ts
```

Ela cria (ou atualiza) o administrador definido em `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`. Os demais usuários são criados pela tela **Gestão de usuários**, onde cada atendente recebe as lojas que pode consultar.

## 6. Verificação após o deploy

- `GET https://<domínio>/api/health` → `{"status":"ok","storage":"s3"}`. Se aparecer `"disk"`, o bucket não foi configurado.
- Entrar com o administrador, criar um atendente com uma loja e abrir uma solicitação de teste.
- Com `MODO_TESTE_API=true`, a aprovação é simulada: nada é alterado no Coral.

## 7. Homologação → produção

1. Subir com `MODO_TESTE_API=true` e os endpoints de **homologação** do Coral; testar o fluxo completo.
2. Trocar para os endpoints de **produção** e o token de produção.
3. Mudar `MODO_TESTE_API` para `false` e reiniciar o serviço.

## 8. Voltar uma versão

No ECS, atualize o serviço para a revisão anterior da task definition (ou reexecute o pipeline num commit anterior). As migrações de banco só adicionam estrutura; antes de voltar uma versão que tenha mudado o banco, confirme com o responsável pelo código.

## Pendências fora do código

- **Token do Coral expira em 1 hora.** É preciso um usuário de serviço com a permissão `BULK_UPDATE_DMA_ELIGIBILITY` e uma forma de renovar o token automaticamente. Sem isso, as aprovações param de executar no Coral uma hora após configurar o token.
- **Endpoint de DMA em produção:** `PUT /api/rentagreement/dma/eligibility` está validado em homologação e precisa ser publicado em `servicescoral.aluguefoco.com.br`.
- **Liberação de IP:** se o Coral de produção restringir por IP, liberar o IP elástico do NAT Gateway.
- **LGPD:** os documentos são enviados ao OpenRouter para leitura. Confirmar a aprovação da área responsável.
