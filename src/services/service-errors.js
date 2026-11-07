/**
 * An update/delete matched no rows: the row is gone, or RLS did not let this user touch it.
 * PostgREST reports neither as an error, so services check for it explicitly.
 */
export class AffectedRowsError extends Error {
  constructor() {
    super('No rows were affected');
    this.name = 'AffectedRowsError';
    this.code = 'NO_ROWS_AFFECTED';
  }
}

export function requireAffected(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new AffectedRowsError();
  return rows;
}
