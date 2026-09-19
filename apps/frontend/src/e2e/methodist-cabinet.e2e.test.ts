import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';
import {
  COURSE_TABS,
  assessmentSummary,
  coursePreviewHref,
  finalExamOf,
  moduleTestsOf,
  resolveCourseTab
} from '../features/courses/course-card';
import { previewNote, previewOutline } from '../features/courses/course-preview';
import { evaluateRouteAccess, getNavigationView } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';
import type { CourseTestRef } from '../features/courses/course-card';

/**
 * Кабинет методиста (ТЗ «Стабилизация, UX и развитие», 8.4), часть 1.
 *
 * **Что было.** Карточка курса стояла на вкладках ещё с 5.7, но состав их не совпадал с
 * названным в ТЗ: «Состав программы · Нормативные параметры · Документы по окончании ·
 * Версии». Аттестации — того, чем обучение заканчивается, — места не было вовсе: методист
 * собирал программу здесь, а наличие экзамена проверял в другом разделе. Проверить свою
 * работу глазами слушателя он не мог никак: кабинет слушателя открывается по зачислению.
 * В меню при этом лежало чужое — «Заявки на НЭП», «Подписание документов», «Переаттестация»,
 * «Госвыгрузки».
 *
 * **Права взяты из живой `iam.role_permissions`**, а не из названия роли.
 */

const METHODIST_PERMISSIONS = [
  'assessment.assignments.read',
  'assessment.assignments.write',
  'assessment.attempts.read',
  'assessment.question_banks.read',
  'assessment.question_banks.write',
  'assessment.questions.read',
  'assessment.questions.write',
  'assessment.read.cross_learner',
  'assessment.results.read',
  'assessment.reviews.review',
  'assessment.tests.publish',
  'assessment.tests.read',
  'assessment.tests.write',
  'courses.archive',
  'courses.publish',
  'courses.read',
  'courses.write',
  'directions.read',
  'directions.write',
  'documents.generate',
  'documents.read',
  'documents.sign',
  'documents.write',
  'esign.applications.read',
  'esign.applications.submit',
  'esign.applications.write',
  'esign.participants.sign',
  'esign.processes.read',
  'esign.processes.write',
  'identity.read',
  'identity.review',
  'learners.act_as',
  'learning.commissions.read',
  'learning.course_document_sets.read',
  'learning.course_document_sets.write',
  'learning.courses.publish',
  'materials.read',
  'materials.write',
  'notifications.read',
  'org.licenses.read',
  'proctoring.read',
  'progress.read',
  'progress.recalculate',
  'recertification.read',
  'regulatory.export.read',
  'tenant.read',
  'video.read',
  'video.write',
  'webinars.read',
  'webinars.write',
  'workspace.read'
];

const methodistSession = (): UserSession => ({
  user: {
    id: 'u_methodist',
    tenantId: 't1',
    login: 'methodist',
    email: null,
    status: 'active',
    displayName: 'Методист'
  },
  tokens: { accessToken: 'a', sessionId: 's', expiresIn: 300 },
  roles: ['methodist'],
  permissions: METHODIST_PERMISSIONS
});

const allLabels = (session: UserSession): string[] => {
  const view = getNavigationView(session);
  return view.main.concat(view.more).map((item) => item.label);
};

describe('меню методиста: чужой работы в нём нет (ТЗ 8.4)', () => {
  it('НЭП, подписание, переаттестация и госвыгрузки убраны', () => {
    const labels = allLabels(methodistSession());

    for (const alien of [
      'Заявки на НЭП',
      'Подписание документов',
      'Переаттестация',
      'Госвыгрузки'
    ]) {
      expect(labels, `«${alien}» — не работа методиста (ТЗ 8.4)`).not.toContain(alien);
    }
  });

  it('его собственная работа осталась на месте', () => {
    const labels = allLabels(methodistSession());

    for (const own of ['Курсы', 'Материалы', 'Банки вопросов', 'Библиотека курсов', 'Тесты']) {
      expect(labels, `«${own}» — ядро работы методиста, убирать его нельзя`).toContain(own);
    }
  });

  it('право у методиста осталось: убран пункт меню, а не доступ', () => {
    /*
     * Разница существенная. Скрыть раздел из меню — решение о том, чья это работа; отобрать
     * право — решение о безопасности, и делается оно миграцией, а не разметкой. По прямой
     * ссылке методист в эти разделы по-прежнему войдёт.
     */
    expect(METHODIST_PERMISSIONS).toContain('regulatory.export.read');
    expect(evaluateRouteAccess('/gov-export', methodistSession()).kind).toBe('ok');
  });

  it('у администрации центра эти разделы на месте', () => {
    const admin = {
      ...methodistSession(),
      roles: ['tenant_admin']
    };
    const labels = allLabels(admin);
    expect(labels, 'отчётность в надзор — их работа').toContain('Госвыгрузки');
    expect(labels).toContain('Переаттестация');
  });
});

describe('карточка курса: вкладки по ТЗ 8.4', () => {
  it('вкладки — ровно четыре, названные ТЗ', () => {
    expect(COURSE_TABS.map((tab) => tab.label)).toEqual([
      'Параметры',
      'Программа',
      'Аттестация',
      'Документы'
    ]);
  });

  it('прежние ссылки на вкладки не ломаются', () => {
    /* `?tab=content` люди клали в переписку и в закладки — молча увести их не туда нельзя. */
    expect(resolveCourseTab('content')).toBe('program');
    expect(resolveCourseTab('versions')).toBe('params');
    expect(resolveCourseTab('assessment')).toBe('assessment');
    expect(resolveCourseTab('опечатка'), 'незнакомое значение — на первую вкладку').toBe('params');
    expect(resolveCourseTab(null)).toBe('params');
  });

  it('итоговый экзамен — тест без модуля, промежуточные его не заменяют', () => {
    const tests: CourseTestRef[] = [
      { id: 't1', courseId: 'c1', moduleId: 'm1', title: 'Проверка модуля' },
      { id: 't2', courseId: 'c1', title: 'Итоговый экзамен', publishedAt: '2026-09-01' },
      { id: 't3', courseId: 'c2', title: 'Чужой экзамен' }
    ];

    expect(finalExamOf(tests, 'c1')?.id).toBe('t2');
    expect(moduleTestsOf(tests, 'c1').map((item) => item.id)).toEqual(['t1']);
    expect(finalExamOf(tests, 'c3'), 'у курса без тестов экзамена нет').toBeNull();
  });

  it('архивный тест экзаменом не считается', () => {
    const tests: CourseTestRef[] = [
      { id: 't1', courseId: 'c1', title: 'Старый', publishedAt: '2026-01-01', isArchived: true }
    ];
    expect(finalExamOf(tests, 'c1')).toBeNull();
  });

  it('состояние аттестации объясняется словами, а не кодом', () => {
    const none = assessmentSummary(null);
    expect(none.ready).toBe(false);
    expect(none.hint, 'человеку нужно знать, ЧТО сделать').toContain('Создайте итоговый тест');

    const draft = assessmentSummary({ id: 't', courseId: 'c', title: 'Экзамен' });
    expect(draft.ready, 'черновик слушателю не выдаётся').toBe(false);
    expect(draft.hint).toContain('Опубликуйте');

    const ready = assessmentSummary({
      id: 't',
      courseId: 'c',
      title: 'Экзамен',
      publishedAt: '2026-09-01'
    });
    expect(ready.ready).toBe(true);
  });
});

describe('предпросмотр глазами слушателя (ТЗ 8.4)', () => {
  it('содержание идёт в том порядке, в каком его пройдёт слушатель', () => {
    const tree = [
      {
        module: { id: 'm2', title: 'Второй', sortOrder: 1 },
        materials: [
          { id: 'x2', title: 'Б', sortOrder: 1, materialType: 'text' },
          { id: 'x1', title: 'А', sortOrder: 0, materialType: 'text' }
        ]
      },
      { module: { id: 'm1', title: 'Первый', sortOrder: 0 }, materials: [] }
    ] as unknown as Parameters<typeof previewOutline>[0];

    const outline = previewOutline(tree);

    expect(outline.map((node) => node.moduleTitle)).toEqual(['Первый', 'Второй']);
    expect(outline[1]?.materials.map((item) => item.title)).toEqual(['А', 'Б']);
    expect(outline[0]?.materials, 'пустой модуль остаётся — его и надо увидеть').toEqual([]);
  });

  it('про видео и файлы сказано честно, а не показан пустой проигрыватель', () => {
    expect(previewNote('video')).toContain('по зачислению');
    expect(previewNote('file')).toContain('по зачислению');
    expect(previewNote('text'), 'текст показывается как есть').not.toContain('по зачислению');
  });

  it('предпросмотр открыт тем, кто видит курс и его материалы', () => {
    expect(coursePreviewHref('c1')).toBe('/courses/c1/preview');
    expect(evaluateRouteAccess('/courses/c1/preview', methodistSession()).kind).toBe('ok');

    /*
     * Право АВТОРСКОЕ, а не читательское. Сначала здесь стояло `materials.read` — сторож
     * изоляции показал, что оно есть у СЛУШАТЕЛЯ, и тот открыл бы предпросмотр любого курса
     * центра, не будучи зачисленным (журнал 538).
     */
    const asLearner = {
      ...methodistSession(),
      roles: ['learner'],
      permissions: ['courses.read', 'materials.read', 'enrollments.read', 'progress.read']
    };
    expect(
      evaluateRouteAccess('/courses/c1/preview', asLearner).kind,
      'слушателю материалы выдаются по зачислению — предпросмотр обходил бы это правило'
    ).toBe('forbidden');
  });

  it('кнопка предпросмотра стоит на вкладке «Программа»', () => {
    /*
     * Комментарии снимаются ПЕРЕД поиском. Два промаха замера подряд, оба записаны в журнал:
     *
     * 1. Срез брался «до следующей панели», а «Программа» стоит в файле ПОСЛЕ «Аттестации» —
     *    срез выходил пустым, и проверка прошла бы на пустом месте (журнал 536).
     * 2. Подсаженная поломка (подпись кнопки заменена на «Открыть») НЕ покраснела: искомая
     *    фраза нашлась в КОММЕНТАРИИ над панелью. Сторож считал живым пояснение к коду —
     *    известная грабля проверок по тексту исходника (журнал 537).
     */
    const screen = stripComments(
      readFileSync(fromApp('src', 'features', 'courses', 'courses-screens.tsx'), 'utf8')
    );
    const start = screen.indexOf('<TabPanel id="program"');
    expect(start, 'панель «Программа» должна существовать').toBeGreaterThan(-1);
    const end = screen.indexOf('</TabPanel>', start);
    expect(end, 'панель должна быть закрыта').toBeGreaterThan(start);
    const program = screen.slice(start, end);
    expect(program, 'без неё методист собирает программу вслепую').toContain(
      'Посмотреть глазами слушателя'
    );
    expect(program).toContain('coursePreviewHref(id)');
  });

  it('план фазы 8 записан', () => {
    const plan = readFileSync(
      fromApp(
        '..',
        '..',
        'docs',
        'superpowers',
        'plans',
        '2026-09-19-stabux-phase-8-role-cabinets.md'
      ),
      'utf8'
    );
    expect(plan).toContain('8.4');
    expect(plan, 'фаза идёт по плану — правило репозитория').toContain('Срез 4');
  });
});
