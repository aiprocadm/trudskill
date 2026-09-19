'use client';

import Link from 'next/link';
import { useState } from 'react';

import { previewNote, previewOutline } from './course-preview';
import {
  PageContainer,
  PageHeader,
  RecordNotFound,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { useCourseTree } from '../course-viewer/hooks';
import { MaterialPlayer } from '../course-viewer/material-player';
import { useCourse } from '../mvp/hooks';
import { useObjectCrumb } from '../navigation/use-object-crumb';

/**
 * «Посмотреть глазами слушателя» (ТЗ «Стабилизация, UX и развитие», 8.4).
 *
 * **Зачем.** Методист собирает программу и не может её проверить: кабинет слушателя открывается
 * по зачислению, а зачислять себя на собственный курс — способ, которым пользоваться не должен
 * никто. ТЗ формулирует прямо: «без неё методист не может проверить свою работу».
 *
 * **Почему отдельный экран, а не режим кабинета слушателя.** Кабинет завязан на зачисление:
 * он считает прогресс, открывает материалы по порядку и ПИШЕТ отметки о прохождении. Вплести
 * туда режим «как бы слушатель» значило бы поставить условие на каждую из этих веток и
 * рисковать настоящим обучением ради удобства проверки. Предпросмотр ничего не пишет — ему
 * нечем: зачисления у методиста нет.
 *
 * **Честность важнее полноты.** Видео и файлы выдаются ПО ЗАЧИСЛЕНИЮ (ФТ-B2.1, ФТ-B4.1), и в
 * предпросмотре они не проигрываются. Экран говорит об этом прямо, а не показывает пустой
 * проигрыватель, из которого методист сделает вывод, что материал сломан.
 */
export const CoursePreviewScreen = ({ id }: { id: string }) => {
  const { data: course, notFound, error: courseError } = useCourse(id);
  useObjectCrumb(course?.title, { notFound, failed: Boolean(courseError) });
  const { tree, loading, error } = useCourseTree(id);
  const [currentId, setCurrentId] = useState<string | null>(null);

  /*
   * Курса нет — честный ответ вместо пустого предпросмотра с рабочими кнопками (`TPL-002`).
   * Ссылку на карточку курса методист кладёт в переписку, а курс за это время могли снять.
   */
  if (notFound) {
    return <RecordNotFound what="Курс" backHref="/courses" backLabel="К списку курсов" />;
  }

  const outline = previewOutline(tree ?? []);
  const current =
    outline.flatMap((node) => node.materials).find((item) => item.id === currentId) ??
    outline[0]?.materials[0] ??
    null;

  return (
    <PageContainer>
      <PageHeader
        title={course?.title ? `${course.title}: предпросмотр` : 'Предпросмотр программы'}
        subtitle="Так программу видит слушатель"
      />

      <SectionCard title="Это предпросмотр">
        <p className="ui-hint">
          Отметки о прохождении здесь не сохраняются, порядок изучения не проверяется. Видео и файлы
          выдаются слушателю по зачислению, поэтому в предпросмотре не открываются.
        </p>
        <p className="ui-inline">
          <Link className="ui-button-secondary" href={`/courses/${id}?tab=program`}>
            Вернуться к программе
          </Link>
        </p>
      </SectionCard>

      {error ? <SectionError message={error} /> : null}

      {loading ? <SectionCard title="Загружаем программу">&nbsp;</SectionCard> : null}

      {!loading && outline.length === 0 ? (
        <SectionEmpty
          message="В программе пока нет материалов"
          hint="Добавьте модуль и хотя бы один материал на вкладке «Программа» — тогда здесь появится то, что увидит слушатель."
        />
      ) : null}

      {!loading && outline.length > 0 ? (
        <SectionCard title="Содержание">
          <ol className="ui-stack">
            {outline.map((node) => (
              <li key={node.moduleId}>
                <strong>{node.moduleTitle}</strong>
                <ul className="ui-bare-list">
                  {node.materials.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="ui-button-link"
                        onClick={() => setCurrentId(item.id)}
                      >
                        {item.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </SectionCard>
      ) : null}

      {current ? (
        <SectionCard title={current.title}>
          <p className="ui-hint">{previewNote(current.materialType)}</p>
          <MaterialPlayer material={current} />
        </SectionCard>
      ) : null}
    </PageContainer>
  );
};
