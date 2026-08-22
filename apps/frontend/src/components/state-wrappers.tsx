import { SectionError as PackageSectionError } from '@trudskill/ui';

import { describeError } from '../lib/errors/error-text';

/**
 * `CMP-020`: каркас страницы и обёртки состояний переехали в пакет
 * (`@trudskill/ui`, `composition/page-shell`). Этот файл — прослойка на одну фазу:
 * реэкспорт сохраняет рабочими импорты десятков экранов, волны переезда меняют их
 * на прямой импорт из пакета вместе с правкой самих экранов.
 *
 * Единственное, что остаётся здесь по существу, — разбор пойманной ошибки (`TXT-004`):
 * словарь `describeError` знает коды нашего сервера, и в бренд-нейтральный пакет ему
 * нельзя — по той же причине, по которой `CMP-022` оставляет в приложении `FieldError`.
 */
export {
  GlobalError,
  GlobalLoading,
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty
} from '@trudskill/ui';

export const SectionError = ({
  message,
  error,
  onRetry
}: {
  message?: string;
  /** Пойманная ошибка целиком: текст для человека и спойлер «Подробности» соберутся сами. */
  error?: unknown;
  onRetry?: () => void;
}) => {
  const view = error === undefined ? undefined : describeError(error);
  return (
    <PackageSectionError
      {...((view?.message ?? message) ? { message: view?.message ?? message } : {})}
      {...(view?.details ? { details: view.details } : {})}
      {...(onRetry ? { onRetry } : {})}
    />
  );
};
