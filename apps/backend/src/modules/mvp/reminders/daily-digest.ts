/**
 * Одно письмо в день на человека (ТЗ «Стабилизация, UX и развитие», 11.3, решение Р11).
 *
 * **Что было (журнал 601).** Ночной обход запускает четыре сканера, и каждый слал письма сам.
 * У слушателя, у которого в один день подходят срок обучения и повторная проверка, в почте
 * оказывались два письма; у администратора центра, получающего копии по всем слушателям, — по
 * письму на каждого. ТЗ прямо: «Не более одного письма в день на человека: несколько поводов
 * объединяются в одно».
 *
 * **Почему это не косметика.** Человек, получивший пять писем подряд, перестаёт читать их
 * все — включая то единственное, где написано про его собственный срок. Рассылка, которую
 * перестали читать, не работает вовсе, и хуже того: она выглядит работающей.
 *
 * **Один повод — прежнее письмо, не список.** У каждого повода свой текст, написанный под
 * него: «срок обучения подходит», «требуется повторная проверка». Заворачивать одинокий повод
 * в список из одного пункта значит ухудшить самый частый случай ради редкого.
 *
 * **Отметка о каждом поводе сохраняется отдельно.** Это главная ловушка объединения: если
 * записать только факт «письмо ушло», то завтра те же пороги сработают снова, и человек будет
 * получать одно и то же каждый день до самого срока. Поэтому у каждого повода остаётся своя
 * отметка, даже когда письмо ушло одно.
 */

export interface DigestItem {
  /** Кому. */
  email: string;
  recipientKind: 'learner' | 'employer' | 'curator' | 'admin';
  recipientName?: string | undefined;
  /** Кого касается — имя слушателя; у писем про лицензию центра пусто. */
  subjectName?: string | undefined;
  /** Что за повод, человеческими словами: «Срок обучения», «Повторная проверка знаний». */
  reasonTitle: string;
  /** О чём именно: название программы, документа, лицензии. */
  about: string;
  /** До какого числа, `ГГГГ-ММ-ДД`. */
  dueDate: string;
  /** Ключ подавления повтора у этого повода — он обязан сохраниться при объединении. */
  dedupKey: string;
}

/** Всё, что накопилось на одного получателя за обход. */
export interface DigestGroup {
  email: string;
  recipientKind: DigestItem['recipientKind'];
  recipientName?: string | undefined;
  items: DigestItem[];
}

/**
 * Разложить накопленное по получателям.
 *
 * Адрес приводится к нижнему регистру: `Ivanov@x` и `ivanov@x` — один человек, и не объединить
 * их значило бы прислать ему два письма ровно в том случае, ради которого всё и делается.
 * Порядок получателей сохраняется — так письма уходят в том же порядке, в каком их насчитали,
 * и журнал читается по порядку.
 */
export const groupForDigest = (items: readonly DigestItem[]): DigestGroup[] => {
  const groups = new Map<string, DigestGroup>();
  for (const item of items) {
    const key = item.email.toLowerCase().trim();
    const existing = groups.get(key);
    if (existing) {
      /* Один и тот же повод мог прийти дважды: два сканера, один адрес. Второй не нужен. */
      if (!existing.items.some((one) => one.dedupKey === item.dedupKey)) existing.items.push(item);
      continue;
    }
    groups.set(key, {
      email: item.email,
      recipientKind: item.recipientKind,
      recipientName: item.recipientName,
      items: [item]
    });
  }
  return [...groups.values()];
};

/** Ключ подавления повтора у объединённого письма: один на человека в день. */
export const digestDedupKey = (email: string, day: string): string =>
  `digest:${email.toLowerCase().trim()}:${day.slice(0, 10)}`;

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря'
];

/** Дата словами: «20 октября». Цифровой формат человек читает медленнее и путает с кодом. */
export const humanDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return `${date.getDate()} ${MONTHS[date.getMonth()] ?? ''}`;
};

/**
 * Строка одного повода в объединённом письме.
 *
 * Имя слушателя ставится первым, когда оно есть: администратор центра получает письмо про
 * ЧУЖИЕ сроки, и без имени список превращается в набор безадресных строк.
 */
export const digestLine = (item: DigestItem): string =>
  [
    item.subjectName ? `${item.subjectName} — ` : '',
    item.reasonTitle,
    item.about ? `: ${item.about}` : '',
    `. Срок — ${humanDate(item.dueDate)}.`
  ].join('');

/**
 * Объединённое письмо.
 *
 * Сроки идут по возрастанию: то, что горит раньше, человек должен увидеть первым. Сортировка
 * по дате, а не по порядку насчитывания, — иначе самое срочное может оказаться внизу списка.
 */
export const digestLetter = (
  group: DigestGroup
): { subject: string; body: string; count: number } => {
  const sorted = [...group.items].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const lines = sorted.map((item) => `— ${digestLine(item)}`).join('\n');
  return {
    subject: `Напоминания об учебных сроках: ${sorted.length}`,
    body:
      `${group.recipientName ? `Здравствуйте, ${group.recipientName}!` : 'Здравствуйте!'}\n\n` +
      'Напоминаем о приближающихся сроках:\n\n' +
      `${lines}\n\n` +
      'Подробности — в личном кабинете.\n\n' +
      'С уважением, {{tenantName}}.',
    count: sorted.length
  };
};
