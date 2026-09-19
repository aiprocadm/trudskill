import type { CourseTree } from '../course-viewer/types';
import type { Material } from '../mvp/types';

/**
 * Предпросмотр программы глазами слушателя (ТЗ 8.4) — чистая часть.
 *
 * Вынесена отдельно от экрана, чтобы её можно было проверить тестом без React: сторож
 * читает значения функций, а не ищет строки в разметке.
 */

export interface PreviewModule {
  moduleId: string;
  moduleTitle: string;
  materials: Material[];
}

/**
 * Содержание в том порядке, в каком его пройдёт слушатель.
 *
 * Модули и материалы сортируются по `sortOrder`, а не по порядку ответа сервера: порядок —
 * это и есть программа, и показать его иначе значило бы показать не ту программу. Модуль без
 * материалов остаётся в списке: пустой модуль — это то, что методист как раз и должен увидеть.
 */
export const previewOutline = (tree: CourseTree): PreviewModule[] =>
  [...tree]
    .sort((a, b) => a.module.sortOrder - b.module.sortOrder)
    .map((node) => ({
      moduleId: node.module.id,
      moduleTitle: node.module.title,
      materials: [...node.materials].sort((a, b) => a.sortOrder - b.sortOrder)
    }));

/**
 * Что честно сказать про материал в предпросмотре.
 *
 * Видео и файлы выдаются ПО ЗАЧИСЛЕНИЮ (ФТ-B2.1, ФТ-B4.1): у методиста его нет, и
 * проигрыватель останется пустым. Молчать об этом нельзя — методист решит, что материал
 * сломан, и пойдёт чинить исправное.
 */
export const previewNote = (materialType: string): string => {
  switch (materialType) {
    case 'video':
      return 'Видео выдаётся слушателю по зачислению — в предпросмотре оно не проигрывается. Проверить можно название, порядок и минимальное время просмотра.';
    case 'file':
      return 'Файл выдаётся слушателю по зачислению — в предпросмотре он не открывается. Проверить можно название и место материала в программе.';
    case 'scorm':
      return 'Учебный пакет запускается в кабинете слушателя. Здесь видно, что он стоит в программе и в каком месте.';
    case 'external_url':
      return 'Внешняя ссылка откроется так же, как у слушателя.';
    default:
      return 'Текст показан ровно так, как его увидит слушатель.';
  }
};

/**
 * Какую версию программы показывать в предпросмотре и что сказать про выбор.
 *
 * Слушатель видит ОПУБЛИКОВАННУЮ версию — её и показываем, когда она есть. Но методист
 * приходит сюда проверять то, что только что собрал, а собирает он ЧЕРНОВИК. Показать ему
 * пустоту со словами «в программе нет материалов», пока версия не опубликована, значило бы
 * соврать про его же работу: материалы есть, просто в другой редакции (журнал 539).
 */
export interface PreviewVersionChoice {
  versionId: string | null;
  /** Пусто — оговорка не нужна: показывается ровно то, что видит слушатель. */
  note: string;
}

export const choosePreviewVersion = (
  versions: Array<{ id: string; status: string; versionNo: number }>
): PreviewVersionChoice => {
  const published = versions
    .filter((item) => item.status === 'published')
    .sort((a, b) => b.versionNo - a.versionNo)[0];
  if (published) return { versionId: published.id, note: '' };

  const latest = [...versions].sort((a, b) => b.versionNo - a.versionNo)[0];
  if (!latest) return { versionId: null, note: '' };
  return {
    versionId: latest.id,
    note: `Опубликованной версии пока нет — показана черновая, редакция ${latest.versionNo}. Слушателям она ещё не выдаётся.`
  };
};
