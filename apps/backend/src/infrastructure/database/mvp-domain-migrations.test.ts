import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  mvpDomainSchemas,
  mvpDomainTableList,
  mvpDomainTables,
  mvpTablesWithSoftDelete
} from './mvp-domain.schema';

const projectRoot = process.cwd();
const migrationsDirCandidates = [
  join(projectRoot, 'migrations'),
  join(projectRoot, 'apps/backend/migrations')
];
const migrationsDir = migrationsDirCandidates.find((dir) => existsSync(dir));

if (!migrationsDir) {
  throw new Error(
    `Unable to locate migrations directory. Checked: ${migrationsDirCandidates.join(', ')}`
  );
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
      '0010_iam_role_permissions_and_seed.sql',
      '0011_mvp_runtime_json.sql',
      '0012_documents_runtime_json.sql',
      '0013_enterprise_normalized_foundation.sql'
    ];

    for (const migration of expectedBaselines) {
      expect(migrationFiles).toContain(migration);
    }
  });

  it('does not contain unexpected duplicate migration numbers', () => {
    const prefixes = migrationFiles.map((name) => name.split('_')[0]);
    const duplicates = prefixes.filter((prefix, index) => prefixes.indexOf(prefix) !== index);
    expect([...duplicates].sort()).toEqual(['0019']);
  });

  it('creates all required MVP schemas', () => {
    for (const schema of mvpDomainSchemas) {
      expectSqlContains(
        new RegExp(`CREATE\\s+SCHEMA\\s+IF\\s+NOT\\s+EXISTS\\s+${schema}`, 'i'),
        `schema ${schema} should be created`
      );
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
    expectSqlContains(
      /ALTER\s+TABLE\s+storage\.files\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/i,
      'storage.files should be evolved with IF NOT EXISTS'
    );
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

    for (const tableName of mvpDomainTableList.filter(
      (table) => !appendOnlyOrStaticTables.has(table)
    )) {
      expectTableBody(tableName, (body) => {
        expect(body, `${tableName} must include created_at`).toMatch(
          /created_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i
        );
        expect(body, `${tableName} must include updated_at`).toMatch(
          /updated_at\s+timestamptz\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i
        );
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
    expectSqlContains(
      /CONSTRAINT\s+enrollments_learner_tenant_fk\s+FOREIGN\s+KEY\s*\(tenant_id,\s*learner_id\)\s+REFERENCES\s+learning\.learners\s*\(tenant_id,\s*id\)/i,
      'missing tenant-bound enrollment -> learner fk'
    );
    expectSqlContains(
      /CONSTRAINT\s+test_attempts_enrollment_tenant_fk\s+FOREIGN\s+KEY\s*\(tenant_id,\s*enrollment_id\)\s+REFERENCES\s+learning\.enrollments\s*\(tenant_id,\s*id\)/i,
      'missing tenant-bound test_attempts -> enrollments fk'
    );
    expectSqlContains(
      /CONSTRAINT\s+generated_documents_template_tenant_fk\s+FOREIGN\s+KEY\s*\(tenant_id,\s*template_id\)\s+REFERENCES\s+documents\.templates\s*\(tenant_id,\s*id\)/i,
      'missing tenant-bound generated_documents -> templates fk'
    );
    expectSqlContains(
      /CONSTRAINT\s+file_links_file_tenant_fk\s+FOREIGN\s+KEY\s*\(tenant_id,\s*file_id\)\s+REFERENCES\s+storage\.files\s*\(tenant_id,\s*id\)/i,
      'missing tenant-bound file_links -> files fk'
    );
  });
});

describe('schema integrity constraints', () => {
  it('enforces enrollment uniqueness and progress constraints', () => {
    expectSqlContains(
      /CONSTRAINT\s+enrollments_group_learner_uniq\s+UNIQUE\s*\(group_id,\s*learner_id\)/i,
      'missing unique(group_id, learner_id)'
    );
    expectSqlContains(
      /CONSTRAINT\s+course_modules_min_view_chk\s+CHECK\s*\(min_view_seconds\s*>=\s*0\)/i,
      'missing module min_view_seconds non-negative check'
    );
    expectSqlContains(
      /CONSTRAINT\s+materials_min_view_chk\s+CHECK\s*\(min_view_seconds\s*>=\s*0\)/i,
      'missing material min_view_seconds non-negative check'
    );
    expectSqlContains(
      /CONSTRAINT\s+course_progress_seconds_chk\s+CHECK\s*\(studied_seconds\s*>=\s*0\s+AND\s+required_seconds\s*>=\s*0\)/i,
      'missing course progress seconds non-negative check'
    );
    expectSqlContains(
      /CONSTRAINT\s+module_progress_seconds_chk\s+CHECK\s*\(studied_seconds\s*>=\s*0\s+AND\s+required_seconds\s*>=\s*0\)/i,
      'missing module progress seconds non-negative check'
    );
    expectSqlContains(
      /CONSTRAINT\s+material_progress_seconds_chk\s+CHECK\s*\(studied_seconds\s*>=\s*0\s+AND\s+required_seconds\s*>=\s*0\)/i,
      'missing material progress seconds non-negative check'
    );
    expectSqlContains(
      /CONSTRAINT\s+course_progress_percent_chk\s+CHECK\s*\(progress_percent\s*>=\s*0\s+AND\s+progress_percent\s*<=\s*100\)/i,
      'missing course progress range check'
    );
    expectSqlContains(
      /CONSTRAINT\s+module_progress_percent_chk\s+CHECK\s*\(progress_percent\s*>=\s*0\s+AND\s+progress_percent\s*<=\s*100\)/i,
      'missing module progress range check'
    );
    expectSqlContains(
      /CONSTRAINT\s+material_progress_percent_chk\s+CHECK\s*\(progress_percent\s*>=\s*0\s+AND\s+progress_percent\s*<=\s*100\)/i,
      'missing material progress range check'
    );
  });

  it('enforces score and attempt number restrictions for assessment', () => {
    expectSqlContains(
      /CONSTRAINT\s+test_attempts_no_chk\s+CHECK\s*\(attempt_no\s*>\s*0\)/i,
      'missing attempt_no > 0 check'
    );
    expectSqlContains(
      /CONSTRAINT\s+test_attempts_score_chk\s+CHECK\s*\(score\s+IS\s+NULL\s+OR\s+score\s*>=\s*0\)/i,
      'missing score >= 0 check'
    );
    expectSqlContains(
      /CONSTRAINT\s+exam_results_score_chk\s+CHECK\s*\(final_score\s*>=\s*0\)/i,
      'missing exam final_score >= 0 check'
    );
    expectSqlContains(
      /CONSTRAINT\s+test_attempts_submitted_state_chk\s+CHECK\s*\(status\s+NOT\s+IN\s+\('submitted',\s*'evaluated'\)\s+OR\s+submitted_at\s+IS\s+NOT\s+NULL\)/i,
      'missing submitted state check'
    );
  });

  it('enforces generated document finalization consistency and reservation rules', () => {
    expectSqlContains(
      /CONSTRAINT\s+generated_documents_final_date_chk\s+CHECK\s*\(\(is_final\s*=\s*false\)\s+OR\s+\(document_date\s+IS\s+NOT\s+NULL\)\)/i,
      'missing final document date check'
    );
    expectSqlContains(
      /CONSTRAINT\s+generated_documents_finalized_at_chk\s+CHECK\s*\(\(is_final\s*=\s*false\)\s+OR\s+\(finalized_at\s+IS\s+NOT\s+NULL\)\)/i,
      'missing final document finalized_at check'
    );
    expectSqlContains(
      /CONSTRAINT\s+generated_documents_final_state_chk\s+CHECK\s*\(is_final\s*=\s*false\s+OR\s+status\s*=\s*'final'\)/i,
      'missing final status alignment check'
    );
    expectSqlContains(
      /CONSTRAINT\s+number_reservations_consumed_chk\s+CHECK\s*\(status\s*<>\s*'consumed'\s+OR\s+generated_document_id\s+IS\s+NOT\s+NULL\)/i,
      'missing consumed reservation consistency check'
    );
    expectSqlContains(
      /CONSTRAINT\s+number_reservations_consumed_at_chk\s+CHECK\s*\(status\s*<>\s*'consumed'\s+OR\s+consumed_at\s+IS\s+NOT\s+NULL\)/i,
      'missing consumed_at consistency check'
    );
  });

  it('has tenant-aware uniqueness on core business identifiers', () => {
    expectSqlContains(/UNIQUE\s*\(tenant_id,\s*login\)/i, 'missing users tenant login uniqueness');
    expectSqlContains(
      /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+users_tenant_email_uniq\s+ON\s+iam\.users\s*\(tenant_id,\s*email\)\s+WHERE\s+email\s+IS\s+NOT\s+NULL/i,
      'missing users tenant email uniqueness'
    );
    expectSqlContains(
      /CONSTRAINT\s+courses_tenant_code_uniq\s+UNIQUE\s*\(tenant_id,\s*code\)/i,
      'missing courses tenant code uniqueness'
    );
    expectSqlContains(
      /CONSTRAINT\s+study_groups_tenant_code_uniq\s+UNIQUE\s*\(tenant_id,\s*code\)/i,
      'missing study_groups tenant code uniqueness'
    );
    expectSqlContains(
      /CONSTRAINT\s+tests_tenant_code_uniq\s+UNIQUE\s*\(tenant_id,\s*code\)/i,
      'missing tests tenant code uniqueness'
    );
    expectSqlContains(
      /CONSTRAINT\s+templates_tenant_code_uniq\s+UNIQUE\s*\(tenant_id,\s*code\)/i,
      'missing templates tenant code uniqueness'
    );
  });

  it('enforces e-sign domain invariants and append-only logs', () => {
    expectSqlContains(
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+esign\.esign_applications/i,
      'missing esign applications table'
    );
    expectSqlContains(
      /CONSTRAINT\s+signing_participants_signed_at_chk\s+CHECK\s*\(status\s*<>\s*'signed'\s+OR\s+signed_at\s+IS\s+NOT\s+NULL\)/i,
      'missing signed_at invariant for participant signed status'
    );
    expectSqlContains(
      /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+signing_processes_tenant_signed_document_uniq/i,
      'missing uniqueness for final signed artifact per generated document'
    );
    expectSqlContains(
      /CREATE\s+TRIGGER\s+legal_log_entries_no_update\s+BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+esign\.legal_log_entries/i,
      'missing legal log append-only trigger'
    );
    expectSqlContains(
      /CREATE\s+TRIGGER\s+signature_events_no_update\s+BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+esign\.signature_events/i,
      'missing signature events append-only trigger'
    );
  });

  it('keeps storage metadata-only model with polymorphic links', () => {
    expectSqlContains(
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+storage\.file_links/i,
      'missing storage.file_links table'
    );
    expectSqlContains(/entity_type\s+text\s+NOT\s+NULL/i, 'missing file_links.entity_type column');
    expectSqlContains(/entity_id\s+text\s+NOT\s+NULL/i, 'missing file_links.entity_id column');
    expectSqlContains(/link_role\s+text\s+NOT\s+NULL/i, 'missing file_links.link_role column');
    expect(fullSql).not.toMatch(/\bbytea\b/i);
  });
});

describe('Plan A — attestation commissions (migration 0029)', () => {
  it('creates learning.commissions with unique code per tenant and status check', () => {
    expectTableBody('learning.commissions', (body) => {
      expect(body).toMatch(/code\s+text\s+NOT\s+NULL/i);
      expect(body).toMatch(/name\s+text\s+NOT\s+NULL/i);
      expect(body).toMatch(/description\s+text/i);
      expect(body).toMatch(/status\s+text\s+NOT\s+NULL\s+DEFAULT\s+'active'/i);
    });
    expectSqlContains(
      /CONSTRAINT\s+commissions_status_chk\s+CHECK\s*\(status\s+IN\s*\('active',\s*'archived'\)\)/i,
      'missing commissions status check'
    );
    expectSqlContains(
      /CONSTRAINT\s+commissions_tenant_code_uniq\s+UNIQUE\s*\(tenant_id,\s*code\)/i,
      'missing commissions tenant_id+code uniqueness'
    );
    expectSqlContains(
      /CONSTRAINT\s+commissions_tenant_id_uniq\s+UNIQUE\s*\(tenant_id,\s*id\)/i,
      'missing commissions tenant_id+id uniqueness (required for composite FK from course_versions)'
    );
  });

  it('creates learning.commission_members with role check and identity constraint', () => {
    expectTableBody('learning.commission_members', (body) => {
      expect(body).toMatch(/commission_id\s+text\s+NOT\s+NULL/i);
      expect(body).toMatch(/role\s+text\s+NOT\s+NULL/i);
      expect(body).toMatch(/user_id\s+text\s+REFERENCES\s+iam\.users\(id\)/i);
      expect(body).toMatch(/external_full_name\s+text/i);
      expect(body).toMatch(/external_position\s+text/i);
      expect(body).toMatch(/signature_file_id\s+text\s+REFERENCES\s+storage\.files\(id\)/i);
      expect(body).toMatch(/position_in_order\s+smallint\s+NOT\s+NULL/i);
    });
    expectSqlContains(
      /CONSTRAINT\s+commission_members_role_chk\s+CHECK\s*\(role\s+IN\s*\('chairman',\s*'deputy_chairman',\s*'member',\s*'secretary',\s*'external_expert'\)\)/i,
      'missing commission_members role check'
    );
    expectSqlContains(
      /CONSTRAINT\s+commission_member_identity_chk\s+CHECK\s*\(user_id\s+IS\s+NOT\s+NULL\s+OR\s+external_full_name\s+IS\s+NOT\s+NULL\)/i,
      'missing commission_member identity check (user_id OR external_full_name)'
    );
    expectSqlContains(
      /CONSTRAINT\s+commission_members_commission_tenant_fk\s+FOREIGN\s+KEY\s*\(tenant_id,\s*commission_id\)\s+REFERENCES\s+learning\.commissions\s*\(tenant_id,\s*id\)\s+ON\s+DELETE\s+CASCADE/i,
      'missing tenant-bound commission_members -> commissions fk with cascade delete'
    );
  });
});

describe('migration 0045 — ОТ registry: program classifier, course mapping, permissions', () => {
  const sql0045 = migrationSqlByFile.get('0045_ot_registry_export.sql') ?? '';

  it('migration file exists in the chain', () => {
    expect(migrationFiles).toContain('0045_ot_registry_export.sql');
    expect(sql0045.length).toBeGreaterThan(0);
  });

  it('creates lookup.ot_training_programs table with correct constraints', () => {
    expect(sql0045).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+lookup\.ot_training_programs/i);
    expect(sql0045).toMatch(/code\s+text\s+PRIMARY\s+KEY/i);
    expect(sql0045).toMatch(/registry_id\s+integer\s+NOT\s+NULL/i);
    expect(sql0045).toMatch(/CONSTRAINT\s+ot_programs_kind_chk\s+CHECK/i);
    expect(sql0045).toMatch(
      /CONSTRAINT\s+ot_programs_registry_id_uniq\s+UNIQUE\s*\(registry_id\)/i
    );
  });

  it('seeds all 5 canonical ПП-2464 program rows', () => {
    for (const code of ['OT_A', 'OT_B', 'OT_V', 'OT_FIRST_AID', 'OT_SIZ']) {
      expect(sql0045, `missing seed row for ${code}`).toContain(`'${code}'`);
    }
    // registry_id values 1-5
    for (const id of [1, 2, 3, 4, 5]) {
      expect(sql0045, `missing registry_id ${id}`).toMatch(new RegExp(`\\b${id}\\b`));
    }
  });

  it('seed uses ON CONFLICT (code) DO NOTHING for idempotence', () => {
    expect(sql0045).toMatch(/ON\s+CONFLICT\s*\(code\)\s+DO\s+NOTHING/i);
  });

  it('adds ot_program_codes text[] column to learning.course_versions', () => {
    expect(sql0045).toMatch(/ALTER\s+TABLE\s+learning\.course_versions/i);
    expect(sql0045).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+ot_program_codes\s+text\[\]/i);
  });

  it('inserts regulatory.export.read and regulatory.export.write permissions', () => {
    expect(sql0045).toMatch(/INSERT\s+INTO\s+iam\.permissions/i);
    expect(sql0045).toContain("'regulatory.export.read'");
    expect(sql0045).toContain("'regulatory.export.write'");
  });

  it('assigns both export permissions to platform_admin and tenant_admin', () => {
    expect(sql0045).toMatch(/r\.code\s+IN\s*\('platform_admin',\s*'tenant_admin'\)/i);
    expect(sql0045).toMatch(
      /p\.code\s+IN\s*\('regulatory\.export\.read',\s*'regulatory\.export\.write'\)/i
    );
  });

  it('assigns only regulatory.export.read to methodist and manager roles', () => {
    expect(sql0045).toMatch(/r\.code\s+IN\s*\('methodist',\s*'manager'\)/i);
    expect(sql0045).toMatch(/p\.code\s*=\s*'regulatory\.export\.read'/i);
  });

  it('role_permissions insert seeds against tenant_demo', () => {
    expect(sql0045).toContain("'tenant_demo'");
  });

  it('role_permissions insert uses ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING', () => {
    expect(sql0045).toMatch(
      /ON\s+CONFLICT\s*\(tenant_id,\s*role_id,\s*permission_id\)\s+DO\s+NOTHING/i
    );
  });
});

describe('IAM learner role seed (migration 0038)', () => {
  const learnerSeedSql = migrationSqlByFile.get('0038_iam_learner_role_and_seed.sql') ?? '';

  it('migration file exists in the chain', () => {
    expect(migrationFiles).toContain('0038_iam_learner_role_and_seed.sql');
    expect(learnerSeedSql.length).toBeGreaterThan(0);
  });

  it('inserts the learner role for tenant_demo', () => {
    expect(learnerSeedSql).toMatch(/INSERT\s+INTO\s+iam\.roles[\s\S]*'r_learner'/i);
    expect(learnerSeedSql).toMatch(/'learner'/);
  });

  it('grants progress.read + progress.recalculate to the learner role', () => {
    expect(learnerSeedSql).toMatch(/'progress\.read'/);
    expect(learnerSeedSql).toMatch(/'progress\.recalculate'/);
  });

  it('grants learner the core read permissions needed for the course viewer', () => {
    for (const code of ['enrollments.read', 'courses.read', 'materials.read']) {
      expect(learnerSeedSql, `learner should be granted ${code}`).toContain(`'${code}'`);
    }
  });

  it('grants learner the assessment-taking permissions', () => {
    for (const code of [
      'assessment.attempts.take',
      'assessment.attempts.read',
      'assessment.results.read',
      'assessment.submissions.submit',
      'assessment.assignments.read'
    ]) {
      expect(learnerSeedSql, `learner should be granted ${code}`).toContain(`'${code}'`);
    }
  });

  it('uses idempotent INSERT ... ON CONFLICT DO NOTHING', () => {
    expect(learnerSeedSql).toMatch(/ON\s+CONFLICT[\s\S]+DO\s+NOTHING/i);
  });
});

describe('Plan A — program meta on course_versions (migration 0030)', () => {
  it('adds 8 program meta columns to learning.course_versions', () => {
    expectSqlContains(
      /ALTER\s+TABLE\s+learning\.course_versions\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+academic_hours\s+integer/i,
      'missing academic_hours column'
    );
    expectSqlContains(
      /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+training_type\s+text/i,
      'missing training_type column'
    );
    expectSqlContains(
      /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+learner_category\s+text/i,
      'missing learner_category column'
    );
    expectSqlContains(
      /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+study_form\s+text/i,
      'missing study_form column'
    );
    expectSqlContains(
      /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+final_assessment_form\s+text/i,
      'missing final_assessment_form column'
    );
    expectSqlContains(
      /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+regulatory_basis_codes\s+text\[\]/i,
      'missing regulatory_basis_codes column'
    );
    expectSqlContains(
      /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+program_attachment_file_id\s+text/i,
      'missing program_attachment_file_id column'
    );
    expectSqlContains(
      /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+commission_id\s+text/i,
      'missing commission_id column on course_versions'
    );
  });

  it('enforces enum check constraints on program meta columns', () => {
    expectSqlContains(
      /CONSTRAINT\s+course_versions_training_type_chk\s+CHECK\s*\(training_type\s+IS\s+NULL\s+OR\s+training_type\s+IN\s*\('primary',\s*'repeat',\s*'target',\s*'extraordinary'\)\)/i,
      'missing training_type check'
    );
    expectSqlContains(
      /CONSTRAINT\s+course_versions_learner_category_chk\s+CHECK\s*\(learner_category\s+IS\s+NULL\s+OR\s+learner_category\s+IN\s*\('worker',\s*'specialist',\s*'manager',\s*'mixed'\)\)/i,
      'missing learner_category check'
    );
    expectSqlContains(
      /CONSTRAINT\s+course_versions_study_form_chk\s+CHECK\s*\(study_form\s+IS\s+NULL\s+OR\s+study_form\s+IN\s*\('in_person',\s*'distance',\s*'blended'\)\)/i,
      'missing study_form check'
    );
    expectSqlContains(
      /CONSTRAINT\s+course_versions_final_assessment_chk\s+CHECK\s*\(final_assessment_form\s+IS\s+NULL\s+OR\s+final_assessment_form\s+IN\s*\('test',\s*'exam',\s*'defense',\s*'interview'\)\)/i,
      'missing final_assessment_form check'
    );
    expectSqlContains(
      /CONSTRAINT\s+course_versions_academic_hours_chk\s+CHECK\s*\(academic_hours\s+IS\s+NULL\s+OR\s+academic_hours\s*>\s*0\)/i,
      'missing academic_hours > 0 check'
    );
  });

  it('binds course_versions.commission_id to commissions via composite FK', () => {
    expectSqlContains(
      /CONSTRAINT\s+course_versions_commission_tenant_fk\s+FOREIGN\s+KEY\s*\(tenant_id,\s*commission_id\)\s+REFERENCES\s+learning\.commissions\s*\(tenant_id,\s*id\)/i,
      'missing tenant-bound course_versions -> commissions fk'
    );
  });

  it('binds course_versions.program_attachment_file_id to storage.files via composite FK', () => {
    expectSqlContains(
      /CONSTRAINT\s+course_versions_program_attachment_file_fk\s+FOREIGN\s+KEY\s*\(tenant_id,\s*program_attachment_file_id\)\s+REFERENCES\s+storage\.files\s*\(tenant_id,\s*id\)/i,
      'missing tenant-bound course_versions -> storage.files fk for program attachment'
    );
  });

  it('creates lookup.regulatory_acts with 6 seeded rows', () => {
    expectSqlContains(/CREATE\s+SCHEMA\s+IF\s+NOT\s+EXISTS\s+lookup/i, 'missing lookup schema');
    expectSqlContains(
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+lookup\.regulatory_acts/i,
      'missing lookup.regulatory_acts table'
    );
    for (const code of [
      'PP_2464_2022',
      'PRIKAZ_26N_2024',
      'FZ_116_1997',
      'PP_2168_2022',
      'PRIKAZ_707N_2015',
      'FZ_273_2012_ART_196'
    ]) {
      expectSqlContains(new RegExp(`'${code}'`), `missing regulatory_act seed for ${code}`);
    }
  });

  it('creates learning.course_document_sets with composite FKs and position uniqueness', () => {
    expectTableBody('learning.course_document_sets', (body) => {
      expect(body).toMatch(/course_version_id\s+text\s+NOT\s+NULL/i);
      expect(body).toMatch(/template_id\s+text\s+NOT\s+NULL/i);
      expect(body).toMatch(/position\s+smallint\s+NOT\s+NULL/i);
      expect(body).toMatch(/is_required\s+boolean\s+NOT\s+NULL\s+DEFAULT\s+true/i);
      expect(body).toMatch(/auto_issue_on_completion\s+boolean\s+NOT\s+NULL\s+DEFAULT\s+true/i);
    });
    expectSqlContains(
      /CONSTRAINT\s+course_doc_sets_course_tenant_fk\s+FOREIGN\s+KEY\s*\(tenant_id,\s*course_version_id\)\s+REFERENCES\s+learning\.course_versions\s*\(tenant_id,\s*id\)\s+ON\s+DELETE\s+CASCADE/i,
      'missing course_doc_sets -> course_versions fk with cascade'
    );
    expectSqlContains(
      /CONSTRAINT\s+course_doc_sets_template_tenant_fk\s+FOREIGN\s+KEY\s*\(tenant_id,\s*template_id\)\s+REFERENCES\s+documents\.templates\s*\(tenant_id,\s*id\)/i,
      'missing course_doc_sets -> documents.templates fk'
    );
    expectSqlContains(
      /CONSTRAINT\s+course_doc_sets_position_uniq\s+UNIQUE\s*\(tenant_id,\s*course_version_id,\s*position\)/i,
      'missing course_doc_sets position uniqueness'
    );
    expectSqlContains(
      /CONSTRAINT\s+course_doc_sets_position_chk\s+CHECK\s*\(position\s*>=\s*0\)/i,
      'missing course_doc_sets position >= 0 check'
    );
  });
});

describe('Phase 4 Plan B — proctoring recordings (migration 0051)', () => {
  const sql0051 = migrationSqlByFile.get('0051_learning_proctoring_recordings.sql') ?? '';

  it('migration file exists in the chain', () => {
    expect(migrationFiles).toContain('0051_learning_proctoring_recordings.sql');
    expect(sql0051.length).toBeGreaterThan(0);
  });

  it('creates learning.proctoring_recordings with the typed contract columns', () => {
    expect(sql0051).toMatch(
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+learning\.proctoring_recordings/i
    );
    for (const column of [
      'tenant_id',
      'learner_id',
      'group_id',
      'course_id',
      'attempt_id',
      'recording_status',
      'consent_at',
      'started_at',
      'completed_at',
      'chunks',
      'purged_at'
    ]) {
      expect(sql0051, `0051 must declare column ${column}`).toMatch(new RegExp(`\\b${column}\\b`));
    }
    expect(sql0051).toMatch(/chunks\s+jsonb\s+NOT\s+NULL\s+DEFAULT\s+'\[\]'::jsonb/i);
    expect(sql0051).toMatch(
      /CONSTRAINT\s+proctoring_recordings_status_chk\s+CHECK\s*\(recording_status\s+IN\s*\('recording',\s*'completed'\)\)/i
    );
  });

  it('adds requires_proctoring to group_courses and proctoring_override to enrollments', () => {
    expect(sql0051).toMatch(
      /ALTER\s+TABLE\s+learning\.group_courses\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+requires_proctoring\s+boolean\s+NOT\s+NULL\s+DEFAULT\s+false/i
    );
    expect(sql0051).toMatch(
      /ALTER\s+TABLE\s+learning\.enrollments\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+proctoring_override\s+text/i
    );
    expect(sql0051).toMatch(/enrollments_proctoring_override_chk/i);
  });

  it('inserts proctoring.submit and proctoring.read permissions with role grants', () => {
    expect(sql0051).toContain("'proctoring.submit'");
    expect(sql0051).toContain("'proctoring.read'");
    expect(sql0051).toMatch(/r\.code\s+IN\s*\('platform_admin',\s*'tenant_admin'\)/i);
    expect(sql0051).toMatch(/r\.code\s*=\s*'learner'\s+AND\s+p\.code\s*=\s*'proctoring\.submit'/i);
    expect(sql0051).toMatch(/r\.code\s*=\s*'methodist'\s+AND\s+p\.code\s*=\s*'proctoring\.read'/i);
  });

  it('seed inserts are idempotent (ON CONFLICT DO NOTHING)', () => {
    expect(sql0051).toMatch(/ON\s+CONFLICT\s*\(id\)\s+DO\s+NOTHING/i);
    expect(sql0051).toMatch(
      /ON\s+CONFLICT\s*\(tenant_id,\s*role_id,\s*permission_id\)\s+DO\s+NOTHING/i
    );
  });
});

describe('Phase 9 Plan A — SCORM 1.2 import + player (migration 0052)', () => {
  const sql0052 = migrationSqlByFile.get('0052_learning_scorm.sql') ?? '';

  it('migration file exists in the chain', () => {
    expect(migrationFiles).toContain('0052_learning_scorm.sql');
    expect(sql0052.length).toBeGreaterThan(0);
  });

  it("adds 'scorm' to materials_type_chk and scorm_package_id column", () => {
    expect(sql0052).toMatch(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+materials_type_chk/i);
    expect(sql0052).toMatch(
      /ADD\s+CONSTRAINT\s+materials_type_chk\s+CHECK\s*\(material_type\s+IN\s*\('file',\s*'external_url',\s*'text',\s*'video',\s*'scorm'\)\)/i
    );
    expect(sql0052).toMatch(
      /ALTER\s+TABLE\s+learning\.materials\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+scorm_package_id\s+text/i
    );
  });

  it('creates learning.scorm_packages with required columns', () => {
    expect(sql0052).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+learning\.scorm_packages/i);
    for (const column of [
      'id',
      'tenant_id',
      'title',
      'package_status',
      'zip_file_id',
      'storage_prefix',
      'launch_href',
      'manifest_title',
      'entry_count',
      'total_bytes',
      'error',
      'created_at',
      'updated_at'
    ]) {
      expect(sql0052, `0052 scorm_packages must declare column ${column}`).toMatch(
        new RegExp(`\\b${column}\\b`)
      );
    }
    expect(sql0052).toMatch(
      /CONSTRAINT\s+scorm_packages_status_chk\s+CHECK\s*\(package_status\s+IN\s*\('uploaded',\s*'processing',\s*'ready',\s*'failed'\)\)/i
    );
  });

  it('creates learning.scorm_attempts with required columns and lesson_status check', () => {
    expect(sql0052).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+learning\.scorm_attempts/i);
    for (const column of [
      'id',
      'tenant_id',
      'enrollment_id',
      'material_id',
      'learner_id',
      'lesson_status',
      'lesson_location',
      'suspend_data',
      'score_raw',
      'score_max',
      'score_min',
      'total_seconds',
      'started_at',
      'last_commit_at',
      'completed_at',
      'created_at',
      'updated_at'
    ]) {
      expect(sql0052, `0052 scorm_attempts must declare column ${column}`).toMatch(
        new RegExp(`\\b${column}\\b`)
      );
    }
    expect(sql0052).toMatch(
      /CONSTRAINT\s+scorm_attempts_lesson_status_chk\s+CHECK\s*\(lesson_status\s+IN\s*\('not attempted',\s*'incomplete',\s*'completed',\s*'passed',\s*'failed',\s*'browsed'\)\)/i
    );
  });

  it('creates unique index idx_scorm_attempts_tenant_enrollment_material', () => {
    expect(sql0052).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_scorm_attempts_tenant_enrollment_material\s+ON\s+learning\.scorm_attempts\s*\(tenant_id,\s*enrollment_id,\s*material_id\)/i
    );
  });

  it('does NOT insert into iam.permissions (no new perms needed for scorm)', () => {
    expect(sql0052).not.toMatch(/INSERT\s+INTO\s+iam\.permissions/i);
  });
});
