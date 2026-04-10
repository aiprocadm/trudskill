import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { mvpDomainSchemas, mvpDomainTableList, mvpDomainTables, mvpTablesWithSoftDelete } from './mvp-domain.schema';

const projectRoot = process.cwd();
const migrationsDirCandidates = [
  join(projectRoot, 'migrations'),
  join(projectRoot, 'apps/backend/migrations')
];
const migrationsDir = migrationsDirCandidates.find((dir) => existsSync(dir));

if (!migrationsDir) {
  throw new Error(`Unable to locate migrations directory. Checked: ${migrationsDirCandidates.join(', ')}`);
}

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
  it('keeps migrations lexicographically ordered and includes baseline milestones', () => {
    const normalizedOrder = [...migrationFiles].sort();
    expect(migrationFiles).toEqual(normalizedOrder);

    const expectedBaselines = [
      '0001_backend_foundation.sql',
      '0002_mvp_domain_model.sql',
      '0003_mvp_domain_integrity_hardening.sql',
      '0004_mvp_esign_domain.sql',
      '0005_documents_domain.sql',
      '0006_documents_task_numbering_hardening.sql',
      '0007_communication_realtime_foundation.sql',
      '0008_integrations_foundation.sql',
      '0009_assessment_extensions.sql',
      '0010_iam_role_permissions_and_seed.sql'
    ];

    for (const migration of expectedBaselines) {
      expect(migrationFiles).toContain(migration);
    }
  });


  it('does not contain duplicate migration numbers', () => {
    const prefixes = migrationFiles.map((name) => name.split('_')[0]);
    expect(new Set(prefixes).size).toBe(prefixes.length);
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
    const appendOnlyOrStaticTables = new Set([
      'learning.enrollment_status_history',
      'assessment.test_questions',
      'storage.files',
      'esign.legal_log_entries',
      'esign.signature_events'
    ]);

    for (const tableName of mvpDomainTableList.filter((table) => !appendOnlyOrStaticTables.has(table))) {
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

  it('adds tenant-bound foreign keys for cross-domain relations', () => {
    expectSqlContains(/CONSTRAINT\s+enrollments_learner_tenant_fk\s+FOREIGN\s+KEY\s*\(tenant_id,\s*learner_id\)\s+REFERENCES\s+learning\.learners\s*\(tenant_id,\s*id\)/i, 'missing tenant-bound enrollment -> learner fk');
    expectSqlContains(/CONSTRAINT\s+test_attempts_enrollment_tenant_fk\s+FOREIGN\s+KEY\s*\(tenant_id,\s*enrollment_id\)\s+REFERENCES\s+learning\.enrollments\s*\(tenant_id,\s*id\)/i, 'missing tenant-bound test_attempts -> enrollments fk');
    expectSqlContains(/CONSTRAINT\s+generated_documents_template_tenant_fk\s+FOREIGN\s+KEY\s*\(tenant_id,\s*template_id\)\s+REFERENCES\s+documents\.templates\s*\(tenant_id,\s*id\)/i, 'missing tenant-bound generated_documents -> templates fk');
    expectSqlContains(/CONSTRAINT\s+file_links_file_tenant_fk\s+FOREIGN\s+KEY\s*\(tenant_id,\s*file_id\)\s+REFERENCES\s+storage\.files\s*\(tenant_id,\s*id\)/i, 'missing tenant-bound file_links -> files fk');
  });
});

describe('schema integrity constraints', () => {
  it('enforces enrollment uniqueness and progress constraints', () => {
    expectSqlContains(/CONSTRAINT\s+enrollments_group_learner_uniq\s+UNIQUE\s*\(group_id,\s*learner_id\)/i, 'missing unique(group_id, learner_id)');
    expectSqlContains(/CONSTRAINT\s+course_modules_min_view_chk\s+CHECK\s*\(min_view_seconds\s*>=\s*0\)/i, 'missing module min_view_seconds non-negative check');
    expectSqlContains(/CONSTRAINT\s+materials_min_view_chk\s+CHECK\s*\(min_view_seconds\s*>=\s*0\)/i, 'missing material min_view_seconds non-negative check');
    expectSqlContains(/CONSTRAINT\s+course_progress_seconds_chk\s+CHECK\s*\(studied_seconds\s*>=\s*0\s+AND\s+required_seconds\s*>=\s*0\)/i, 'missing course progress seconds non-negative check');
    expectSqlContains(/CONSTRAINT\s+module_progress_seconds_chk\s+CHECK\s*\(studied_seconds\s*>=\s*0\s+AND\s+required_seconds\s*>=\s*0\)/i, 'missing module progress seconds non-negative check');
    expectSqlContains(/CONSTRAINT\s+material_progress_seconds_chk\s+CHECK\s*\(studied_seconds\s*>=\s*0\s+AND\s+required_seconds\s*>=\s*0\)/i, 'missing material progress seconds non-negative check');
    expectSqlContains(/CONSTRAINT\s+course_progress_percent_chk\s+CHECK\s*\(progress_percent\s*>=\s*0\s+AND\s+progress_percent\s*<=\s*100\)/i, 'missing course progress range check');
    expectSqlContains(/CONSTRAINT\s+module_progress_percent_chk\s+CHECK\s*\(progress_percent\s*>=\s*0\s+AND\s+progress_percent\s*<=\s*100\)/i, 'missing module progress range check');
    expectSqlContains(/CONSTRAINT\s+material_progress_percent_chk\s+CHECK\s*\(progress_percent\s*>=\s*0\s+AND\s+progress_percent\s*<=\s*100\)/i, 'missing material progress range check');
  });

  it('enforces score and attempt number restrictions for assessment', () => {
    expectSqlContains(/CONSTRAINT\s+test_attempts_no_chk\s+CHECK\s*\(attempt_no\s*>\s*0\)/i, 'missing attempt_no > 0 check');
    expectSqlContains(/CONSTRAINT\s+test_attempts_score_chk\s+CHECK\s*\(score\s+IS\s+NULL\s+OR\s+score\s*>=\s*0\)/i, 'missing score >= 0 check');
    expectSqlContains(/CONSTRAINT\s+exam_results_score_chk\s+CHECK\s*\(final_score\s*>=\s*0\)/i, 'missing exam final_score >= 0 check');
    expectSqlContains(/CONSTRAINT\s+test_attempts_submitted_state_chk\s+CHECK\s*\(status\s+NOT\s+IN\s+\('submitted',\s*'evaluated'\)\s+OR\s+submitted_at\s+IS\s+NOT\s+NULL\)/i, 'missing submitted state check');
  });

  it('enforces generated document finalization consistency and reservation rules', () => {
    expectSqlContains(/CONSTRAINT\s+generated_documents_final_date_chk\s+CHECK\s*\(\(is_final\s*=\s*false\)\s+OR\s+\(document_date\s+IS\s+NOT\s+NULL\)\)/i, 'missing final document date check');
    expectSqlContains(/CONSTRAINT\s+generated_documents_finalized_at_chk\s+CHECK\s*\(\(is_final\s*=\s*false\)\s+OR\s+\(finalized_at\s+IS\s+NOT\s+NULL\)\)/i, 'missing final document finalized_at check');
    expectSqlContains(/CONSTRAINT\s+generated_documents_final_state_chk\s+CHECK\s*\(is_final\s*=\s*false\s+OR\s+status\s*=\s*'final'\)/i, 'missing final status alignment check');
    expectSqlContains(/CONSTRAINT\s+number_reservations_consumed_chk\s+CHECK\s*\(status\s*<>\s*'consumed'\s+OR\s+generated_document_id\s+IS\s+NOT\s+NULL\)/i, 'missing consumed reservation consistency check');
    expectSqlContains(/CONSTRAINT\s+number_reservations_consumed_at_chk\s+CHECK\s*\(status\s*<>\s*'consumed'\s+OR\s+consumed_at\s+IS\s+NOT\s+NULL\)/i, 'missing consumed_at consistency check');
  });

  it('has tenant-aware uniqueness on core business identifiers', () => {
    expectSqlContains(/UNIQUE\s*\(tenant_id,\s*login\)/i, 'missing users tenant login uniqueness');
    expectSqlContains(/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+users_tenant_email_uniq\s+ON\s+iam\.users\s*\(tenant_id,\s*email\)\s+WHERE\s+email\s+IS\s+NOT\s+NULL/i, 'missing users tenant email uniqueness');
    expectSqlContains(/CONSTRAINT\s+courses_tenant_code_uniq\s+UNIQUE\s*\(tenant_id,\s*code\)/i, 'missing courses tenant code uniqueness');
    expectSqlContains(/CONSTRAINT\s+study_groups_tenant_code_uniq\s+UNIQUE\s*\(tenant_id,\s*code\)/i, 'missing study_groups tenant code uniqueness');
    expectSqlContains(/CONSTRAINT\s+tests_tenant_code_uniq\s+UNIQUE\s*\(tenant_id,\s*code\)/i, 'missing tests tenant code uniqueness');
    expectSqlContains(/CONSTRAINT\s+templates_tenant_code_uniq\s+UNIQUE\s*\(tenant_id,\s*code\)/i, 'missing templates tenant code uniqueness');
  });


  it('enforces e-sign domain invariants and append-only logs', () => {
    expectSqlContains(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+esign\.esign_applications/i, 'missing esign applications table');
    expectSqlContains(/CONSTRAINT\s+signing_participants_signed_at_chk\s+CHECK\s*\(status\s*<>\s*'signed'\s+OR\s+signed_at\s+IS\s+NOT\s+NULL\)/i, 'missing signed_at invariant for participant signed status');
    expectSqlContains(/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+signing_processes_tenant_signed_document_uniq/i, 'missing uniqueness for final signed artifact per generated document');
    expectSqlContains(/CREATE\s+TRIGGER\s+legal_log_entries_no_update\s+BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+esign\.legal_log_entries/i, 'missing legal log append-only trigger');
    expectSqlContains(/CREATE\s+TRIGGER\s+signature_events_no_update\s+BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+esign\.signature_events/i, 'missing signature events append-only trigger');
  });

  it('keeps storage metadata-only model with polymorphic links', () => {
    expectSqlContains(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+storage\.file_links/i, 'missing storage.file_links table');
    expectSqlContains(/entity_type\s+text\s+NOT\s+NULL/i, 'missing file_links.entity_type column');
    expectSqlContains(/entity_id\s+text\s+NOT\s+NULL/i, 'missing file_links.entity_id column');
    expectSqlContains(/link_role\s+text\s+NOT\s+NULL/i, 'missing file_links.link_role column');
    expect(fullSql).not.toMatch(/\bbytea\b/i);
  });
});
