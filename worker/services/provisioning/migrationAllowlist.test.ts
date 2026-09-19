import { describe, it, expect } from 'vitest';
import {
	validateMigrationSql,
	splitStatements,
	MigrationNotAllowedError,
} from './migrationAllowlist';

describe('splitStatements', () => {
	it('splits on semicolons and drops empty fragments', () => {
		expect(splitStatements('CREATE TABLE a (id text); ;  ')).toEqual([
			'CREATE TABLE a (id text)',
		]);
	});
});

describe('validateMigrationSql', () => {
	it('accepts CREATE TABLE', () => {
		expect(() =>
			validateMigrationSql('CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT)'),
		).not.toThrow();
	});

	it('accepts CREATE INDEX and CREATE UNIQUE INDEX', () => {
		expect(() =>
			validateMigrationSql('CREATE INDEX notes_id_idx ON notes (id)'),
		).not.toThrow();
		expect(() =>
			validateMigrationSql('CREATE UNIQUE INDEX notes_id_uidx ON notes (id)'),
		).not.toThrow();
	});

	it('accepts ALTER TABLE ... ADD COLUMN', () => {
		expect(() =>
			validateMigrationSql('ALTER TABLE notes ADD COLUMN archived INTEGER DEFAULT 0'),
		).not.toThrow();
	});

	it('accepts multiple allowed statements in one call', () => {
		expect(() =>
			validateMigrationSql(
				'CREATE TABLE notes (id TEXT PRIMARY KEY); CREATE INDEX notes_id_idx ON notes (id);',
			),
		).not.toThrow();
	});

	it('is case-insensitive', () => {
		expect(() =>
			validateMigrationSql('create table notes (id text primary key)'),
		).not.toThrow();
	});

	it.each([
		['DROP TABLE notes'],
		['DELETE FROM notes'],
		['UPDATE notes SET body = 1'],
		['TRUNCATE TABLE notes'],
		['INSERT INTO notes (id) VALUES (1)'],
		['ALTER TABLE notes DROP COLUMN body'],
		['ALTER TABLE notes RENAME TO notes2'],
	])('rejects %s', (statement) => {
		expect(() => validateMigrationSql(statement)).toThrow(
			MigrationNotAllowedError,
		);
	});

	it('rejects a mix of one allowed and one disallowed statement', () => {
		expect(() =>
			validateMigrationSql('CREATE TABLE notes (id TEXT); DROP TABLE notes;'),
		).toThrow(MigrationNotAllowedError);
	});

	it('rejects an empty migration', () => {
		expect(() => validateMigrationSql('   ;  ')).toThrow(
			MigrationNotAllowedError,
		);
	});
});
