import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (file: string): string =>
  readFileSync(resolve(HERE, '../../../migrations', file), 'utf8');

const m0104 = read('0104_learning_groups_extend.sql');
const m0105 = read('0105_learning_group_fks_to_groups.sql');
const m0106 = read('0106_learners_and_counterparties_extend.sql');
const m0107 = read('0107_learning_enrollments_extend.sql');
const m0108 = read('0108_exam_results_and_generated_documents_extend.sql');
const m0109 = read('0109_normalized_search_trgm_indexes.sql');
const m0110 = read('0110_phase1_backfill_prerequisites.sql');

const column = (sql: string, name: string): void => {
  expect(sql, `нет колонки ${name}`).toMatch(
    new RegExp(`ADD COLUMN IF NOT EXISTS ${name}\\s`, 'i')
  );
};
const index = (sql: string, name: string): void => {
  expect(sql, `нет индекса ${name}`).toMatch(
    new RegExp(`CREATE INDEX IF NOT EXISTS ${name}\\s`, 'i')
  );
};
const dropped = (sql: string, name: string): void => {
  expect(sql, `ограничение ${name} должно сниматься`).toMatch(
    new RegExp(`DROP CONSTRAINT IF EXISTS ${name}\\b`, 'i')
  );
};

/**
 * Фаза 1 ТЗ перехода с CDOPROF, срез 0 (план 2026-09-23-cdoprof-migration-phase-1-slice-0-migrations):
 * нормализованные таблицы горячих коллекций получают колонки §17, объединённые CHECK статусов
 * и индексы; мёртвые внешние ключи на таблицы-снимки снимаются (РМ31). Текстовый сторож —
 * чтобы миграции не потеряли ни одну строку плана; вставку в живую базу проверяет
 * `phase-1-normalized-tables.integration.test.ts`.
 */
describe('0104 learning.groups extend', () => {
  it('добавляет колонки §17 и уникальность (tenant_id, id) для составных FK', () => {
    for (const c of [
      'exam_date',
      'exam_access_from',
      'materials_access_until',
      'study_form',
      'is_dot',
      'responsible_user_id',
      'notify_on_pass',
      'closed_at',
      'archived_at'
    ]) {
      column(m0104, c);
    }
    expect(m0104).toMatch(/ADD CONSTRAINT groups_tenant_id_id_uniq UNIQUE \(tenant_id, id\)/);
  });

  it('объединяет CHECK статусов: значения кода (closed) и §17 (recruiting …), старый снимается', () => {
    dropped(m0104, 'learning_groups_status_chk');
    const check = m0104.match(
      /ADD CONSTRAINT learning_groups_status_chk CHECK \(status IN \(([\s\S]*?)\)\)/
    );
    expect(check).toBeTruthy();
    for (const s of [
      'draft',
      'active',
      'closed',
      'archived',
      'recruiting',
      'in_progress',
      'exam',
      'documents',
      'cancelled'
    ]) {
      expect(check![1]).toContain(`'${s}'`);
    }
    expect(m0104).toMatch(/learning_groups_status_chk CHECK[\s\S]*?\)\) NOT VALID/);
  });

  it('ставит индексы списков и календаря (МГ-A4.1)', () => {
    for (const i of [
      'groups_tenant_status_starts_idx',
      'groups_tenant_exam_date_idx',
      'groups_tenant_ends_idx',
      'groups_tenant_responsible_idx'
    ]) {
      index(m0104, i);
    }
    expect(m0104).toMatch(
      /groups_tenant_status_starts_idx ON learning\.groups \(tenant_id, status, starts_at\)/
    );
  });
});

describe('0105 group FKs → learning.groups, мёртвые FK сняты (РМ31)', () => {
  it('снимает ключи на study_groups, core.users, templates, courses, tests', () => {
    for (const c of [
      'enrollments_group_id_fkey',
      'enrollments_group_tenant_fk',
      'learning_enrollments_learner_id_fkey',
      'group_courses_group_id_fkey',
      'group_courses_group_tenant_fk',
      'group_courses_course_id_fkey',
      'group_courses_course_tenant_fk',
      'group_courses_course_version_id_fkey',
      'group_courses_course_version_tenant_fk',
      'generated_documents_group_id_fkey',
      'generated_documents_group_tenant_fk',
      'generated_documents_template_id_fkey',
      'generated_documents_template_tenant_fk',
      'generated_documents_template_version_id_fkey',
      'generated_documents_template_version_tenant_fk',
      'exam_results_test_id_fkey',
      'exam_results_test_tenant_fk',
      'exam_results_best_attempt_id_fkey',
      'exam_results_best_attempt_tenant_fk',
      'learning_enrollments_status_chk'
    ]) {
      dropped(m0105, c);
    }
    expect(m0105).not.toMatch(/REFERENCES learning\.study_groups/i);
  });

  it('ставит три составных ключа на learning.groups в режиме NOT VALID', () => {
    for (const c of [
      'enrollments_group_tenant_fk',
      'group_courses_group_tenant_fk',
      'generated_documents_group_tenant_fk'
    ]) {
      expect(m0105).toMatch(
        new RegExp(
          `ADD CONSTRAINT ${c}\\s+FOREIGN KEY \\(tenant_id, group_id\\) REFERENCES learning\\.groups \\(tenant_id, id\\) NOT VALID`
        )
      );
    }
    column(m0105, 'teacher_user_id');
  });

  it('каждый снятый ключ назван в шапке вместе с исходной миграцией — вернуть можно одной строкой', () => {
    expect(m0105).toMatch(/РМ31/);
    for (const origin of ['0002', '0003', '0014']) expect(m0105).toContain(origin);
  });
});

describe('0106 learners (ПДн-шифртекст + §17) и counterparties (§17)', () => {
  it('learners: колонки шифртекста, слепой индекс СНИЛС, реквизиты §17', () => {
    for (const c of [
      'snils_enc',
      'snils_hash',
      'email_enc',
      'phone_enc',
      'birth_date_enc',
      'organization_unit_id',
      'gender',
      'birth_place',
      'citizenship',
      'registration_address',
      'education_level',
      'passport_enc',
      'passport_hash',
      'diploma',
      'tracking_number',
      'delivery_method',
      'extra_fields',
      'consent_status',
      'photo_file_id',
      'login',
      'last_login_at',
      'position_id'
    ]) {
      column(m0106, c);
    }
    expect(m0106).toMatch(
      /learners_tenant_snils_hash_idx ON learning\.learners \(tenant_id, snils_hash\) WHERE snils_hash IS NOT NULL/
    );
    index(m0106, 'learners_tenant_counterparty_idx');
    index(m0106, 'learners_tenant_status_idx');
    expect(m0106).toMatch(
      /COMMENT ON COLUMN learning\.learners\.date_of_birth IS\s+'[^']*deprecated/i
    );
    expect(m0106).toMatch(/COMMENT ON COLUMN learning\.learners\.snils IS\s+'[^']*deprecated/i);
  });

  it('counterparties: реквизиты §17 и индексы по ИНН и менеджеру', () => {
    for (const c of [
      'short_name',
      'ogrn',
      'okpo',
      'okato',
      'oktmo',
      'okogu',
      'okopf',
      'okved',
      'postal_address',
      'actual_address',
      'region',
      'city',
      'postal_code',
      'fax',
      'director_name',
      'director_position',
      'manager_user_id',
      'contract_date',
      'contract_number',
      'branding'
    ]) {
      column(m0106, c);
    }
    index(m0106, 'counterparties_tenant_inn_idx');
    index(m0106, 'counterparties_tenant_manager_idx');
  });
});

describe('0107 learning.enrollments extend', () => {
  it('результат, реквизиты документа, индексы; мёртвый CHECK completion_state снят (РМ31)', () => {
    for (const c of [
      'result_code',
      'certificate_number',
      'certificate_series',
      'protocol_number',
      'protocol_date'
    ]) {
      column(m0107, c);
    }
    expect(m0107).toMatch(
      /enrollments_result_code_chk CHECK \(result_code IS NULL OR result_code IN \('passed', 'failed', 'absent'\)\)/
    );
    for (const i of [
      'enrollments_tenant_group_idx',
      'enrollments_tenant_learner_idx',
      'enrollments_tenant_status_idx',
      'enrollments_tenant_planned_end_idx',
      'enrollment_status_history_tenant_enrollment_idx'
    ]) {
      index(m0107, i);
    }
    dropped(m0107, 'enrollments_completed_payload_chk');
  });
});

describe('0108 exam_results и generated_documents extend', () => {
  it('exam_results: итоговый балл необязателен, счётчики попыток и порогов', () => {
    expect(m0108).toMatch(/ALTER COLUMN final_score DROP NOT NULL/);
    for (const c of ['attempts_count', 'best_score', 'max_score', 'passing_score'])
      column(m0108, c);
    index(m0108, 'exam_results_tenant_learner_idx');
  });

  it('generated_documents: колонки §17, один объединённый CHECK статусов вместо двух', () => {
    for (const c of [
      'kind_code',
      'series',
      'rank',
      'document_type',
      'name',
      'pdf_file_id',
      'archived_at',
      'protocol_document_id',
      'enrollment_id',
      'tracking_number'
    ]) {
      column(m0108, c);
    }
    dropped(m0108, 'generated_documents_status_chk');
    dropped(m0108, 'documents_generated_documents_status_chk');
    const check = m0108.match(
      /ADD CONSTRAINT generated_documents_status_chk CHECK \(status IN \(([\s\S]*?)\)\)/
    );
    expect(check).toBeTruthy();
    for (const s of [
      'draft',
      'generated',
      'final',
      'issued',
      'archived',
      'revoked',
      'cancelled',
      'void'
    ]) {
      expect(check![1]).toContain(`'${s}'`);
    }
    for (const i of [
      'generated_documents_tenant_learner_idx',
      'generated_documents_tenant_group_idx',
      'generated_documents_tenant_kind_date_idx',
      'generated_documents_tenant_valid_until_idx'
    ]) {
      index(m0108, i);
    }
  });
});

describe('0109 pg_trgm и индексы поиска (РМ33)', () => {
  it('расширение ставится под перехватом ошибки — миграция не падает без прав на CREATE EXTENSION', () => {
    expect(m0109).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_trgm/);
    expect(m0109).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE NOTICE/);
  });

  it('trgm-индексы создаются только при наличии расширения', () => {
    expect(m0109).toMatch(/FROM pg_extension WHERE extname = 'pg_trgm'/);
    for (const i of [
      'counterparties_name_trgm_idx',
      'learners_full_name_trgm_idx',
      'groups_name_trgm_idx',
      'groups_code_trgm_idx',
      'generated_documents_number_trgm_idx'
    ]) {
      expect(m0109, `нет индекса ${i}`).toContain(i);
      expect(m0109).toMatch(new RegExp(`${i} ON [a-z]+\\.[a-z_]+ USING gin \\(`));
    }
  });
});

describe('0110 предпосылки бэкфилла (срез 0b)', () => {
  it('слушатели: «пусто» — не значение; уникальность учётной записи и номера — частичными индексами', () => {
    dropped(m0110, 'learners_tenant_user_uniq');
    dropped(m0110, 'learners_tenant_learner_no_uniq');
    expect(m0110).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS learners_tenant_user_uniq_idx\s+ON learning\.learners \(tenant_id, user_id\) WHERE user_id IS NOT NULL/
    );
    expect(m0110).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS learners_tenant_learner_no_uniq_idx\s+ON learning\.learners \(tenant_id, learner_no\) WHERE learner_no IS NOT NULL/
    );
  });

  it('результаты экзамена: CHECK знает статусы кода; курсы группы и результаты получают status/payload', () => {
    dropped(m0110, 'exam_results_status_chk');
    expect(m0110).toMatch(
      /exam_results_status_chk CHECK \(status IN \('draft', 'final', 'void', 'active', 'needs_review'\)\) NOT VALID/
    );
    expect(m0110).toMatch(/ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'/);
    expect(
      (m0110.match(/ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '\{\}'::jsonb/g) ?? [])
        .length
    ).toBe(2);
  });
});

describe('все миграции среза 0 и 0b повторяемы', () => {
  it('ни одного ADD COLUMN / CREATE INDEX без IF NOT EXISTS и ни одного DROP CONSTRAINT без IF EXISTS', () => {
    for (const sql of [m0104, m0105, m0106, m0107, m0108, m0109, m0110]) {
      const body = sql.replace(/--[^\n]*/g, '');
      expect(body.match(/ADD COLUMN(?! IF NOT EXISTS)/g) ?? []).toHaveLength(0);
      expect(body.match(/CREATE (?:UNIQUE )?INDEX(?! IF NOT EXISTS)/g) ?? []).toHaveLength(0);
      expect(body.match(/DROP CONSTRAINT(?! IF EXISTS)/g) ?? []).toHaveLength(0);
      expect(body).not.toMatch(/DROP COLUMN|DROP TABLE|DELETE FROM|TRUNCATE/i);
    }
  });
});
