export function pageRange(req) {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize || 50)));
  return {
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize
  };
}

export function pageResult(rows, total, page, pageSize) {
  return {
    data: rows,
    page,
    pageSize,
    total: Number(total || 0)
  };
}
