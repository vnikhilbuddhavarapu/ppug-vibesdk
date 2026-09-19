/**
 * D1 migration statement allowlist for `run_d1_migration`.
 *
 * Only additive schema changes are allowed (CREATE TABLE, CREATE INDEX,
 * ALTER TABLE ... ADD COLUMN). Anything else — DROP, DELETE, UPDATE,
 * TRUNCATE, raw DML, or multiple statements packed into one — is rejected
 * before it ever reaches the Cloudflare API, so a migration can extend a
 * schema but never destroy data or structure already built.
 */

const ALLOWED_STATEMENT_PATTERNS: RegExp[] = [
	/^CREATE\s+TABLE\b/i,
	/^CREATE\s+(UNIQUE\s+)?INDEX\b/i,
	/^ALTER\s+TABLE\s+\S+\s+ADD\s+COLUMN\b/i,
];

/** Thrown when a migration statement fails the additive-only allowlist. */
export class MigrationNotAllowedError extends Error {
	constructor(
		public readonly statement: string,
		reason: string,
	) {
		super(`Migration statement rejected: ${reason}: "${statement}"`);
		this.name = 'MigrationNotAllowedError';
	}
}

/** Splits a migration SQL blob into individual, non-empty statements. */
export function splitStatements(sql: string): string[] {
	return sql
		.split(';')
		.map((statement) => statement.trim())
		.filter((statement) => statement.length > 0);
}

/**
 * Validates every statement in `sql` against the additive-only allowlist.
 * Throws `MigrationNotAllowedError` on the first violation; does nothing
 * (returns void) if every statement is allowed. Throws if `sql` contains no
 * statements at all.
 */
export function validateMigrationSql(sql: string): void {
	const statements = splitStatements(sql);
	if (statements.length === 0) {
		throw new MigrationNotAllowedError(sql, 'no statements found');
	}
	for (const statement of statements) {
		const isAllowed = ALLOWED_STATEMENT_PATTERNS.some((pattern) =>
			pattern.test(statement),
		);
		if (!isAllowed) {
			throw new MigrationNotAllowedError(
				statement,
				'only CREATE TABLE, CREATE INDEX, and ALTER TABLE ... ADD COLUMN are allowed',
			);
		}
	}
}
