'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { clearDraft, loadDraft, saveDraft } from './draft-storage';
import {
  type CourseWizardDraft,
  STEP_TITLES,
  WIZARD_STEPS,
  type WizardStep,
  buildCreationPlan,
  canJumpTo,
  emptyDraft,
  nextStep,
  prevStep,
  validateAll,
  validateStep
} from './wizard-state';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionError
} from '../../components/state-wrappers';
import { useDirectionsList, useDomainMutations } from '../mvp/hooks';
import { RECERT_PRESETS } from '../recertification/expiring';

/**
 * Мастер создания курса (ФТ-E1, Фаза 2 Task 11b).
 *
 * Прежний экран рисовал степпер, но всё лежало на одной форме и создавалась только
 * карточка курса: программу, часы, модули, материалы и правила методист добивал по
 * разным экранам. Теперь курс собирается за один проход, черновик переживает закрытую
 * вкладку, а вся логика (шаги, проверки, план создания) лежит в чистых функциях рядом.
 */

const MATERIAL_TYPE_LABELS: Record<
  CourseWizardDraft['modules'][number]['materials'][number]['materialType'],
  string
> = {
  text: 'Текст',
  file: 'Файл (PDF, презентация)',
  video: 'Видео',
  external_url: 'Внешняя ссылка'
};

export function CourseWizardScreen() {
  const router = useRouter();
  const { data: directions } = useDirectionsList({ page: 1, page_size: 100 });
  const {
    saveCourse,
    createCourseVersion,
    updateCourseVersionProgramMeta,
    saveModule,
    saveMaterial
  } = useDomainMutations();

  const [draft, setDraft] = useState<CourseWizardDraft>(emptyDraft);
  const [step, setStep] = useState<WizardStep>('card');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  // Черновик читаем один раз при открытии — вернуться к недособранному курсу можно
  // и на следующий день.
  useEffect(() => {
    setDraft(loadDraft());
  }, []);

  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  const patch = (changes: Partial<CourseWizardDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const stepErrors = validateStep(step, draft);
  const allErrors = validateAll(draft);

  const goNext = () => {
    setShowErrors(true);
    const target = nextStep(step, draft);
    if (target !== step) setShowErrors(false);
    setStep(target);
  };

  /**
   * Создание курса. Порядок вызовов задан планом и намеренно последовательный:
   * версия создаётся после курса, метаданные пишутся в версию, модули — в неё же,
   * материалы — в свои модули. Перепутанный порядок дал бы наполовину созданный курс.
   */
  const create = async () => {
    if (allErrors.length) {
      setShowErrors(true);
      setStep('review');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const plan = buildCreationPlan(draft);
      const course = await saveCourse(null, plan.course);
      const version = await createCourseVersion(course.id);
      await updateCourseVersionProgramMeta(version.id, plan.programMeta);

      // Имя `module` в этом файле недопустимо: Next запрещает присваивание переменной
      // с таким именем (конфликт с модульной системой) — отсюда `moduleItem`.
      for (const moduleItem of plan.modules) {
        const createdModule = await saveModule(null, {
          courseVersionId: version.id,
          title: moduleItem.title,
          isRequired: moduleItem.isRequired
        });
        for (const material of moduleItem.materials) {
          await saveMaterial(null, {
            moduleId: createdModule.id,
            title: material.title,
            materialType: material.materialType,
            minViewSeconds: material.minViewSeconds,
            isRequired: material.isRequired
          });
        }
      }

      // Чистим черновик ТОЛЬКО после успеха: иначе сбой на середине стёр бы работу.
      clearDraft();
      router.push(`/courses/${course.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать курс');
    } finally {
      setBusy(false);
    }
  };

  const addModule = () =>
    patch({ modules: [...draft.modules, { title: '', isRequired: true, materials: [] }] });

  const updateModule = (index: number, changes: Partial<CourseWizardDraft['modules'][number]>) =>
    patch({
      modules: draft.modules.map((module, i) => (i === index ? { ...module, ...changes } : module))
    });

  const removeModule = (index: number) =>
    patch({ modules: draft.modules.filter((_, i) => i !== index) });

  const addMaterial = (moduleIndex: number) =>
    updateModule(moduleIndex, {
      materials: [
        ...draft.modules[moduleIndex]!.materials,
        { title: '', materialType: 'text', minViewSeconds: 0, isRequired: true }
      ]
    });

  const visibleErrors = showErrors ? (step === 'review' ? allErrors : stepErrors) : [];

  return (
    <PageContainer>
      <PageHeader
        title="Создание курса"
        subtitle="Карточка → программа и часы → модули и материалы → правила прохождения → проверка"
      />
      <SectionCard title={STEP_TITLES[step]}>
        <ul className="ui-stepper" aria-label="Этапы создания курса">
          {WIZARD_STEPS.map((item) => (
            <li key={item} className={`ui-step ${item === step ? 'ui-step--active' : ''}`}>
              {/*
                Кнопка, а не кликабельный <li>: шаг должен открываться и с клавиатуры.
                Назад по степперу вернуться можно, вперёд перепрыгнуть — нет:
                непроверенный шаг дал бы наполовину заполненный курс.
              */}
              <button
                type="button"
                onClick={() => setStep(item)}
                disabled={!canJumpTo(item, step)}
                aria-current={item === step ? 'step' : undefined}
                data-testid={`wizard-step-${item}`}
              >
                {STEP_TITLES[item]}
              </button>
            </li>
          ))}
        </ul>

        {error ? <SectionError message={error} /> : null}
        {visibleErrors.length ? (
          <ul className="ui-error" role="alert" data-testid="wizard-errors">
            {visibleErrors.map((item) => (
              <li key={item.field}>{item.message}</li>
            ))}
          </ul>
        ) : null}

        {step === 'card' ? (
          <div className="ui-form">
            <label>
              Код курса
              <input value={draft.code} onChange={(e) => patch({ code: e.target.value })} />
            </label>
            <label>
              Название
              <input value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
            </label>
            <label>
              Описание
              <textarea
                value={draft.description}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </label>
            <label>
              Направление
              <select
                value={draft.directionId}
                onChange={(e) => patch({ directionId: e.target.value })}
              >
                <option value="">— не выбрано —</option>
                {directions?.items.map((direction) => (
                  <option key={direction.id} value={direction.id}>
                    {direction.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {step === 'program' ? (
          <div className="ui-form">
            <p className="ui-text-muted">
              Часы программы — основа журнала учебных часов: именно с ними сравнивается фактическое
              время слушателя на проверке.
            </p>
            <label>
              Академических часов
              <input
                type="number"
                min="1"
                value={draft.academicHours}
                onChange={(e) => patch({ academicHours: e.target.value })}
              />
            </label>
            {/* ФТ-E4: периодичность переобучения. Пресеты — из практики регулируемого ДПО;
                пустое поле означает «бессрочно», это осмысленный вариант, а не пропуск. */}
            <label>
              Переобучение каждые, мес.
              <input
                type="number"
                min="1"
                max="120"
                placeholder="пусто = бессрочно"
                value={draft.recertificationPeriodMonths}
                onChange={(e) => patch({ recertificationPeriodMonths: e.target.value })}
              />
            </label>
            <div className="ui-inline">
              {RECERT_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    patch({
                      recertificationPeriodMonths: preset.months ? String(preset.months) : ''
                    })
                  }
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <label>
              Вид обучения
              <select
                value={draft.trainingType}
                onChange={(e) =>
                  patch({ trainingType: e.target.value as CourseWizardDraft['trainingType'] })
                }
              >
                <option value="">— не выбрано —</option>
                <option value="primary">Первичное</option>
                <option value="repeated">Повторное</option>
                <option value="extraordinary">Внеочередное</option>
              </select>
            </label>
            <label>
              Форма обучения
              <select
                value={draft.studyForm}
                onChange={(e) =>
                  patch({ studyForm: e.target.value as CourseWizardDraft['studyForm'] })
                }
              >
                <option value="">— не выбрано —</option>
                <option value="distance">Дистанционная</option>
                <option value="full_time">Очная</option>
                <option value="blended">Смешанная</option>
              </select>
            </label>
            <label>
              Итоговая аттестация
              <select
                value={draft.finalAssessmentForm}
                onChange={(e) =>
                  patch({
                    finalAssessmentForm: e.target.value as CourseWizardDraft['finalAssessmentForm']
                  })
                }
              >
                <option value="">— не выбрано —</option>
                <option value="test">Тестирование</option>
                <option value="exam">Экзамен</option>
                <option value="interview">Собеседование</option>
              </select>
            </label>
          </div>
        ) : null}

        {step === 'structure' ? (
          <div className="ui-stack">
            <p className="ui-text-muted">
              Порядок модулей и материалов — тот, в котором вы их добавили. От него зависит строгий
              порядок прохождения, если вы включите его на следующем шаге.
            </p>
            {draft.modules.map((module, index) => (
              <div key={index} className="ui-stack" data-testid="wizard-module">
                <div className="ui-inline">
                  <input
                    placeholder={`Модуль ${index + 1}`}
                    value={module.title}
                    onChange={(e) => updateModule(index, { title: e.target.value })}
                  />
                  <label>
                    <input
                      type="checkbox"
                      checked={module.isRequired}
                      onChange={(e) => updateModule(index, { isRequired: e.target.checked })}
                    />
                    Обязательный
                  </label>
                  <button type="button" onClick={() => removeModule(index)}>
                    Удалить модуль
                  </button>
                </div>
                {module.materials.map((material, materialIndex) => (
                  <div key={materialIndex} className="ui-inline">
                    <input
                      placeholder={`Материал ${materialIndex + 1}`}
                      value={material.title}
                      onChange={(e) =>
                        updateModule(index, {
                          materials: module.materials.map((item, i) =>
                            i === materialIndex ? { ...item, title: e.target.value } : item
                          )
                        })
                      }
                    />
                    <select
                      value={material.materialType}
                      onChange={(e) =>
                        updateModule(index, {
                          materials: module.materials.map((item, i) =>
                            i === materialIndex
                              ? {
                                  ...item,
                                  materialType: e.target.value as typeof item.materialType
                                }
                              : item
                          )
                        })
                      }
                    >
                      {Object.entries(MATERIAL_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <label>
                      <input
                        type="checkbox"
                        checked={material.isRequired}
                        onChange={(e) =>
                          updateModule(index, {
                            materials: module.materials.map((item, i) =>
                              i === materialIndex ? { ...item, isRequired: e.target.checked } : item
                            )
                          })
                        }
                      />
                      Обязательный
                    </label>
                  </div>
                ))}
                <button type="button" onClick={() => addMaterial(index)}>
                  Добавить материал
                </button>
              </div>
            ))}
            <button type="button" onClick={addModule}>
              Добавить модуль
            </button>
            <p className="ui-text-muted">
              Файлы и видео прикрепляются к материалам после создания курса — на странице «Учебный
              контент».
            </p>
          </div>
        ) : null}

        {step === 'rules' ? (
          <div className="ui-form">
            <label>
              <input
                type="checkbox"
                checked={draft.sequentialModules}
                onChange={(e) => patch({ sequentialModules: e.target.checked })}
              />
              Строгий порядок модулей: следующий открывается после закрытия предыдущего
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.noSeekOnFirstView}
                onChange={(e) => patch({ noSeekOnFirstView: e.target.checked })}
              />
              Запретить перемотку видео вперёд при первом просмотре
            </label>
            <label>
              Зачёт видео-урока, % просмотра
              <input
                type="number"
                min="1"
                max="100"
                placeholder="90"
                value={draft.videoCompletionPercent}
                onChange={(e) => patch({ videoCompletionPercent: e.target.value })}
              />
            </label>
          </div>
        ) : null}

        {step === 'review' ? (
          <div className="ui-stack" data-testid="wizard-review">
            <p>
              <strong>{draft.title || '— без названия —'}</strong> ({draft.code || '—'})
            </p>
            <p>
              Часы: {draft.academicHours || '—'} · модулей: {draft.modules.length} · материалов:{' '}
              {draft.modules.reduce((sum, module) => sum + module.materials.length, 0)}
            </p>
            <p>
              Строгий порядок: {draft.sequentialModules ? 'да' : 'нет'} · запрет перемотки:{' '}
              {draft.noSeekOnFirstView ? 'да' : 'нет'} · зачёт видео:{' '}
              {draft.videoCompletionPercent || '90'}%
            </p>
          </div>
        ) : null}

        <div className="ui-inline">
          <button type="button" onClick={() => setStep(prevStep(step))} disabled={step === 'card'}>
            Назад
          </button>
          {step === 'review' ? (
            <button type="button" onClick={() => void create()} disabled={busy}>
              {busy ? 'Создаём…' : 'Создать курс'}
            </button>
          ) : (
            <button type="button" onClick={goNext}>
              Далее
            </button>
          )}
        </div>
      </SectionCard>
    </PageContainer>
  );
}
