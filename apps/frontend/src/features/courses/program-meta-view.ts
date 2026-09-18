import type {
  CourseVersion,
  FinalAssessmentForm,
  LearnerCategory,
  StudyForm,
  TrainingType
} from '../mvp/types';

/**
 * Нормативные параметры программы — значения СЛОВАМИ, для режима просмотра (ТЗ 5.10 / Э10).
 *
 * Было: у опубликованной версии над формой стояла надпись «параметры доступны только для
 * просмотра», а под ней — одиннадцать обычных на вид полей ввода, просто выключенных. Человек
 * видел поле «Часы (академические)» со значением 16, щёлкал в него и не понимал, почему не
 * печатается (журнал 472).
 *
 * Здесь значения превращаются в текст. Списки подписей — ОДИН источник и для формы, и для
 * просмотра: разойдись они, форма и карточка называли бы один и тот же вид подготовки
 * по-разному.
 */

export const TRAINING_TYPE_OPTIONS: Array<{ value: TrainingType; label: string }> = [
  { value: 'primary', label: 'Первичная' },
  { value: 'repeat', label: 'Повторная' },
  { value: 'target', label: 'Целевая' },
  { value: 'extraordinary', label: 'Внеочередная' }
];

export const LEARNER_CATEGORY_OPTIONS: Array<{ value: LearnerCategory; label: string }> = [
  { value: 'worker', label: 'Рабочие' },
  { value: 'specialist', label: 'Специалисты' },
  { value: 'manager', label: 'Руководители' },
  { value: 'mixed', label: 'Смешанная' }
];

export const STUDY_FORM_OPTIONS: Array<{ value: StudyForm; label: string }> = [
  { value: 'in_person', label: 'Очная' },
  { value: 'distance', label: 'Дистанционная' },
  { value: 'blended', label: 'Смешанная' }
];

export const FINAL_ASSESSMENT_OPTIONS: Array<{ value: FinalAssessmentForm; label: string }> = [
  { value: 'test', label: 'Тест' },
  { value: 'exam', label: 'Экзамен' },
  { value: 'defense', label: 'Защита' },
  { value: 'interview', label: 'Собеседование' }
];

/** Незаполненное поле называется словами: пустая ячейка читается как сбой загрузки. */
const NOT_SET = 'Не задано';

const labelOf = <T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T | null | undefined
): string => options.find((one) => one.value === value)?.label ?? NOT_SET;

const listOf = (codes: readonly string[] | null | undefined, names: Map<string, string>): string =>
  !codes || codes.length === 0 ? NOT_SET : codes.map((code) => names.get(code) ?? code).join(', ');

export interface ProgramMetaRow {
  label: string;
  value: string;
}

/**
 * Строки для показа параметров текстом.
 *
 * `acts`, `otPrograms` и `commissions` приходят справочниками «код → человеческое имя»:
 * показывать `ot-0042` вместо названия программы — то же самое, что показывать сырой
 * идентификатор (правило «ни одного сырого кода как значения»).
 */
export const programMetaView = (
  version: CourseVersion,
  dictionaries: {
    acts: Map<string, string>;
    otPrograms: Map<string, string>;
    commissions: Map<string, string>;
  }
): ProgramMetaRow[] => [
  {
    label: 'Часы (академические)',
    value: version.academicHours == null ? NOT_SET : String(version.academicHours)
  },
  { label: 'Вид подготовки', value: labelOf(TRAINING_TYPE_OPTIONS, version.trainingType) },
  {
    label: 'Категория обучаемых',
    value: labelOf(LEARNER_CATEGORY_OPTIONS, version.learnerCategory)
  },
  { label: 'Форма обучения', value: labelOf(STUDY_FORM_OPTIONS, version.studyForm) },
  {
    label: 'Форма аттестации',
    value: labelOf(FINAL_ASSESSMENT_OPTIONS, version.finalAssessmentForm)
  },
  {
    label: 'Нормативные акты',
    value: listOf(version.regulatoryBasisCodes, dictionaries.acts)
  },
  {
    label: 'Программы реестра ОТ',
    value: listOf(version.otProgramCodes, dictionaries.otPrograms)
  },
  {
    label: 'Зачёт видео-урока',
    value:
      version.videoCompletionPercent == null
        ? NOT_SET
        : `${version.videoCompletionPercent}% просмотра`
  },
  {
    label: 'Перемотка при первом просмотре',
    /* «Да»/«Нет» рядом с подписью-вопросом читается наоборот: отвечаем самим действием. */
    value: version.noSeekOnFirstView ? 'Запрещена' : 'Разрешена'
  },
  {
    label: 'Порядок модулей',
    value: version.sequentialModules
      ? 'Строгий: следующий открывается после закрытия предыдущего'
      : 'Свободный: модули открыты в любом порядке'
  },
  {
    label: 'Аттестационная комиссия',
    value:
      version.commissionId == null || version.commissionId === ''
        ? NOT_SET
        : (dictionaries.commissions.get(version.commissionId) ?? version.commissionId)
  }
];
