/**
 * ФТ-D6 (Фаза 4 Task 10): библиотека курсов платформы — снимок и копия.
 *
 * **Главное решение: ссылки на файлы, видео и SCORM-пакеты НЕ переносятся.** Эти объекты
 * лежат в хранилище центра-источника и привязаны к его арендатору; скопировать ссылку
 * значило бы дать чужому центру путь к чужому файлу — ровно та утечка, которую ловит
 * гейт изоляции. Поэтому материал-файл приезжает как заготовка: структура, название и
 * правила зачёта сохранены, содержимое методист прикладывает своё. Текстовые материалы
 * и внешние ссылки переносятся целиком — в них нет ничего арендаторского.
 *
 * Снимок самодостаточен: он не ссылается на источник, поэтому правка или архивация
 * исходного курса не портит каталог.
 */

/** Типы материалов, у которых содержимое лежит в хранилище арендатора. */
const TENANT_ASSET_TYPES = new Set(['file', 'video', 'scorm']);

export interface LibraryMaterial {
  title: string;
  materialType: string;
  sortOrder: number;
  minViewSeconds: number;
  isRequired: boolean;
  /** true = содержимое осталось у источника, методист прикладывает своё. */
  needsContent: boolean;
}

export interface LibraryModule {
  title: string;
  sortOrder: number;
  isRequired: boolean;
  materials: LibraryMaterial[];
}

export interface LibraryCourseContent {
  course: { code: string; title: string; description: string };
  programMeta: Record<string, unknown>;
  modules: LibraryModule[];
}

interface SourceCourse {
  id: string;
  code: string;
  title: string;
  description?: string | undefined;
}

interface SourceVersion {
  id: string;
  courseId: string;
  versionNo: number;
  [key: string]: unknown;
}

interface SourceModule {
  id: string;
  courseVersionId: string;
  title: string;
  sortOrder: number;
  isRequired?: boolean | undefined;
}

interface SourceMaterial {
  id: string;
  moduleId: string;
  title: string;
  materialType: string;
  sortOrder: number;
  minViewSeconds?: number | undefined;
  isRequired?: boolean | undefined;
}

/** Поля меты программы, которые имеют смысл в чужом центре. */
const PORTABLE_META_KEYS = [
  'academicHours',
  'trainingType',
  'learnerCategory',
  'studyForm',
  'finalAssessmentForm',
  'regulatoryBasisCodes',
  'otProgramCodes',
  'recertificationPeriodMonths',
  'videoCompletionPercent',
  'noSeekOnFirstView',
  'sequentialModules'
] as const;

/**
 * Мета программы без «арендаторских» полей: комиссия и вложенный файл программы
 * принадлежат источнику — у принимающего центра своя комиссия и свой бланк.
 */
export const portableProgramMeta = (version: Record<string, unknown>): Record<string, unknown> => {
  const meta: Record<string, unknown> = {};
  for (const key of PORTABLE_META_KEYS) {
    if (version[key] !== undefined && version[key] !== null) meta[key] = version[key];
  }
  return meta;
};

/** Снимок курса для каталога: берётся ПОСЛЕДНЯЯ версия — она и есть актуальная программа. */
export const buildLibrarySnapshot = (input: {
  course: SourceCourse;
  versions: readonly SourceVersion[];
  modules: readonly SourceModule[];
  materials: readonly SourceMaterial[];
}): LibraryCourseContent => {
  const versions = input.versions
    .filter((v) => v.courseId === input.course.id)
    .sort((a, b) => a.versionNo - b.versionNo);
  const latest = versions[versions.length - 1];

  const modules = latest
    ? input.modules
        .filter((m) => m.courseVersionId === latest.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((module) => ({
          title: module.title,
          sortOrder: module.sortOrder,
          isRequired: module.isRequired ?? true,
          materials: input.materials
            .filter((mat) => mat.moduleId === module.id)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((mat) => ({
              title: mat.title,
              materialType: mat.materialType,
              sortOrder: mat.sortOrder,
              minViewSeconds: mat.minViewSeconds ?? 0,
              isRequired: mat.isRequired ?? true,
              // Признак ставится ЗДЕСЬ, на снимке: в каталоге сразу видно, что курс
              // приедет с заготовками, а не с готовым содержимым.
              needsContent: TENANT_ASSET_TYPES.has(mat.materialType)
            }))
        }))
    : [];

  return {
    course: {
      code: input.course.code,
      title: input.course.title,
      description: input.course.description ?? ''
    },
    programMeta: latest ? portableProgramMeta(latest) : {},
    modules
  };
};

/**
 * Тип материала в копии сужен намеренно: материалы из хранилища центра приезжают
 * заготовками-текстом, поэтому в копии остаются только «переносимые» типы.
 */
export type CopiedMaterialType = 'text' | 'external_url';

export interface CopyPlan {
  course: { code: string; title: string; description: string };
  programMeta: Record<string, unknown>;
  modules: Array<{
    title: string;
    /** Порядок нужен ДЛЯ СОРТИРОВКИ при создании — сам сервис нумерует по очереди. */
    sortOrder: number;
    isRequired: boolean;
    materials: Array<{
      title: string;
      materialType: CopiedMaterialType;
      sortOrder: number;
      minViewSeconds: number;
      isRequired: boolean;
    }>;
  }>;
  /** Сколько материалов приедет без содержимого — центру это надо сказать заранее. */
  materialsNeedingContent: number;
}

/**
 * План создания копии в принимающем центре. Код курса при совпадении получает суффикс:
 * коллизия кодов ломает выдачу документов (номер завязан на курс), а молча
 * перезаписывать чужой курс недопустимо.
 */
export const buildCopyPlan = (
  content: LibraryCourseContent,
  existingCodes: readonly string[]
): CopyPlan => {
  const taken = new Set(existingCodes);
  let code = content.course.code;
  let suffix = 2;
  while (taken.has(code)) {
    code = `${content.course.code}-${suffix}`;
    suffix += 1;
  }

  const modules = content.modules.map((module) => ({
    title: module.title,
    sortOrder: module.sortOrder,
    isRequired: module.isRequired,
    materials: module.materials.map((mat) => ({
      title: mat.needsContent ? `${mat.title} (требуется загрузить материал)` : mat.title,
      // Материал без содержимого приезжает как текстовый: тип «файл» без файла
      // выглядел бы рабочим и ломался бы при открытии слушателем.
      materialType: (mat.needsContent
        ? 'text'
        : mat.materialType === 'external_url'
          ? 'external_url'
          : 'text') as CopiedMaterialType,
      sortOrder: mat.sortOrder,
      minViewSeconds: mat.minViewSeconds,
      isRequired: mat.isRequired
    }))
  }));

  return {
    course: { code, title: content.course.title, description: content.course.description },
    programMeta: content.programMeta,
    modules,
    materialsNeedingContent: content.modules
      .flatMap((m) => m.materials)
      .filter((m) => m.needsContent).length
  };
};
