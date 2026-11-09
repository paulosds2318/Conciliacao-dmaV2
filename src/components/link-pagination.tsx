import Link from "next/link";

/** Paginação por links (sem estado no navegador): cada página é uma URL, mantendo os filtros. */
export function LinkPagination({
  page,
  total,
  pageSize,
  href,
}: {
  page: number;
  total: number;
  pageSize: number;
  href: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  const numbers = Array.from({ length: pages }, (_, index) => index + 1).filter(
    (item) => item === 1 || item === pages || Math.abs(item - current) <= 1,
  );
  const step = (target: number, label: string, enabled: boolean) =>
    enabled ? (
      <Link className="button secondary" href={href(target)} scroll={false}>
        {label}
      </Link>
    ) : (
      <span className="button secondary" aria-disabled="true">
        {label}
      </span>
    );
  return (
    <div className="audit-pagination">
      <span>
        Página <strong>{current}</strong> de <strong>{pages}</strong> · {total} {total === 1 ? "registro" : "registros"}
      </span>
      {pages > 1 && (
        <div>
          {step(current - 1, "← Anterior", current > 1)}
          {numbers.map((item, index) => (
            <span key={item}>
              {index > 0 && numbers[index - 1] !== item - 1 && <span className="pagination-ellipsis">…</span>}
              <Link
                className={`button ${item === current ? "primary" : "secondary"}`}
                href={href(item)}
                scroll={false}
                aria-current={item === current ? "page" : undefined}
              >
                {item}
              </Link>
            </span>
          ))}
          {step(current + 1, "Próxima →", current < pages)}
        </div>
      )}
    </div>
  );
}
