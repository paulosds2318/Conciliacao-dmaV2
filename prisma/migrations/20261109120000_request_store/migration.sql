-- AlterTable
ALTER TABLE "dma_requests" ADD COLUMN "store" TEXT;

-- CreateIndex
CREATE INDEX "dma_requests_createdAt_idx" ON "dma_requests"("createdAt");

-- Solicitações existentes: loja deduzida do prefixo do contrato (GRU → SAO10, CGH → SAO11, demais pelas 3 letras).
-- Prefixo que corresponde a mais de uma loja, ou a nenhuma, fica sem loja.
UPDATE "dma_requests" AS r
SET "store" = CASE upper(left(r."contractName", 3))
  WHEN 'GRU' THEN 'SAO10'
  WHEN 'CGH' THEN 'SAO11'
  ELSE (
    SELECT min(s)
    FROM unnest(ARRAY['AJU10','BPS10','CGR10','CNF10','CWB10','FLN10','FOR10','GIG10','GYN10','JPA10','MCZ10','NAT10','NVT10','POA10','QNS10','RAO10','REC20','SAO10','SAO11','SDU10','SSA10','VCP10','VIX10']) AS s
    WHERE left(s, 3) = upper(left(r."contractName", 3))
    HAVING count(*) = 1
  )
END
WHERE r."store" IS NULL;
