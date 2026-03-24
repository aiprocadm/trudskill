import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { mvpDomainSchemas, mvpDomainTableList, mvpDomainTables, mvpTablesWithSoftDelete } from './mvp-domain.schema';

const migrationsDir = join(process.cwd(), 'migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort();

const migrationSqlByFile = new Map(
  migrationFiles.map((file) => [file, readFileSync(join(migrationsDir, file), 'utf8')])
);

const fullSql = migrationFiles.map((file) => migrationSqlByFile.get(file)).join('\n\n');

function escapeRegex(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function expectSqlContains(pattern: RegExp, message: string): void {
  expect(fullSql, message).toMatch(pattern);
}

function expectTableBody(tableName: string, assertion: (body: string) => void): void {
  const tablePattern = new RegExp(
    `CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${escapeRegex(tableName)}\\s*\\(([^;]+?)\\);`,
    'is'
  );
  const match = fullSql.match(tablePattern);
  expect(match, `table definition not found for ${tableName}`).toBeTruthy();
  assertion(match?.[1] ?? '');
}

describe('SQL migration chain', () => {
  it('keeps migrations ordered and includes MVP migration', () => {
    expect(migrationFiles).toEqual([
      '0001_backend_foundation.sql',
      '0002_mvp_domain_model.sql'
    ]);
  });

  it('creates all required MVP schemas', () => {
    for (const schema of mvpDomainSchemas) {
      expectSqlContains(new RegExp(`CREATE\\s+SCHEMA\\s+IF\\s+NOT\\s+EXISTS\\s+${schema}`, 'i'), `schema ${schema} should be created`);
    }
  });

  it('creates all declared MVP domain tables', () => {
    for (const [schema, tables] of Object.entries(mvpDomainTables)) {
      for (const table of tables) {
        expectSqlContains(
          new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${schema}\\.${table}`, 'i'),
          `table ${schema}.${table} should be created`
        );
      }
    }
  });

  it('keeps migration idempotence primitives for existing storage.files extension', () => {
    expectSqlContains(/ALTER\s+TABLE\s+storage\.files\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i, 'storage.files should be evolved with IF NOT EXISTS');
  });
});

describe('tenant-awareness and audit fields', () => {
  it('defines tenant_id in every MVP table', () => {
    for (const tableName of mvpDomainTableList) {
      expectTableBody(tableName, (body) => {
        expect(body).toMatch(/tenant_id\s+text\s+NOT\s+NULL/i);
      });
    }
  });

  it('defines created_at and updated_at on mutable transactional tables', () => {
    for (const tableName of mvpDomainTableList.filter((table) => table !== 'learning.enrollment_status_history' && table !== 'assessment.test_questions')) {
      expectTableBody(tableName, (body) => {
        expect(body, `${tableName} must include created_at`).toMatch(/created_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i);
        expect(body, `${tableName} must include updated_at`).toMatch(/updated_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i);
      });
    }
  });

  it('uses deleted_at in selected soft-delete tables', () => {
    for (const tableName of mvpTablesWithSoftDelete) {
      expectTableBody(tableName, (body) => {
        expect(body, `${tableName} must include deleted_at`).toMatch(/deleted_at\s+timestamptz/i);
      });
    }
  });
});

describe('schema integrity constraints', () => {
  it('enforces enrollment uniqueness and progress constraints', () => {
    expectSqlContains(/CONSTRAINT\s+enrollments_group_learner_uniq\s+UNIQUE\s*\(group_id,\s*learner_id\)/i, 'missing unique(group_id, learner_id)');
    expectSqlContains(/CONSTRAINT\s+course_progress_percent_chk\s+CHECK\s*\(progress_percent\s*>=\s*0\s+AND\s+progress_percent\s*<=\s*100\)/i, 'missing course progress range check');
    expectSqlContains(/CONSTRAINT\s+module_progress_percent_chk\s+CHECK\s*\(progress_percent\s*>=\s*0\s+AND\s+progress_percent\s*<=\s*100\)/i, 'missing module progress range check');
    expectSqlContains(/CONSTRAINT\s+material_progress_percent_chk\s+CHECK\s*\(progress_percent\s*>=\s*0\s+AND\s+progress_percent\s*<=\s*100\)/i, 'missing material progress range check');
  });

  it('enforces score and attempt number restrictions for assessment', () => {
    expectSqlContains(/CONSTRAINT\s+test_attempts_no_chk\s+CHECK\s*\(attempt_no\s*>\s*0\)/i, 'missing attempt_no > 0 check');
    expectSqlContains(/CONSTRAINT\s+test_attempts_score_chk\s+CHECK\s*\(score\s+IS\s+NULL\s+OR\s+score\s*>=\s*0\)/i, 'missing score >= 0 check');
    expectSqlContains(/CONSTRAINT\s+exam_results_score_chk\s+CHECK\s*\(final_score\s*>=\s*0\)/i, 'missing exam final_score >= 0 check');
  });

  it('enforces generated document finalization consistency and reservation rules', () => {
    expectSqlContains(/CONSTRAINT\s+generated_documents_final_date_chk\s+CHECK\s*\(\(is_final\s*=\s*false\)\s+OR\s+\(document_date\s+IS\s+NOT\s+NULL\)\)/i, 'missing final document date check');
    expectSqlContains(/CONSTRAINT\s+generated_documents_finalized_at_chk\s+CHECK\s*\(\(is_final\s*=\s*false\)\s+OR\s+\(finalized_at\s+IS\s+NOT\s+NULL\)\)/i, 'missing final document finalized_at check');
    expectSqlContains(/CONSTRAINT\s+number_reservations_consumed_chk\s+CHECK\s*\(status\s*<>\s*'consumed'\s+OR\s+generated_document_id\s+IS\s+NOT\s+NULL\)/i, 'missing consumed reservation consistency check');
  });

  it('has tenant-aware uniqueness on core business identifiers', () => {
    expectSqlContains(/CONSTRAINT\s+courses_tenant_code_uniq\s+UNIQUE\s*\(tenant_id,\s*code\)/i, 'missing courses tenant code uniqueness');
    expectSqlContains(/CONSTRAINT\s+study_groups_tenant_code_uniq\s+UNIQUE\s*\(tenant_id,\s*code\)/i, 'missing study_groups tenant code uniqueness');
    expectSqlContains(/CONSTRAINT\s+tests_tenant_code_uniq\s+UNIQUE\s*\(tenant_id,\s*code\)/i, 'missing tests tenant code uniqueness');
    expectSqlContains(/CONSTRAINT\s+templates_tenant_code_uniq\s+UNIQUE\s*\(tenant_id,\s*code\)/i, 'missing templates tenant code uniqueness');
  });

  it('keeps storage metadata-only model with polymorphic links', () => {
    expectSqlContains(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+storage\.file_links/i, 'missing storage.file_links table');
    expectSqlContains(/entity_type\s+text\s+NOT\s+NULL/i, 'missing file_links.entity_type column');
    expectSqlContains(/entity_id\s+text\s+NOT\s+NULL/i, 'missing file_links.entity_id column');
    expectSqlContains(/link_role\s+text\s+NOT\s+NULL/i, 'missing file_links.link_role column');
    expect(fullSql).not.toMatch(/\bbytea\b/i);
  });
});
