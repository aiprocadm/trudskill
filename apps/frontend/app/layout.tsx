import { Inter, Onest } from 'next/font/google';
import { connection } from 'next/server';

import { AppProviders } from '../src/app/providers';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

// Phase 10 Track C — PWA metadata. The web app manifest itself lives in app/manifest.ts
// (App Router metadata route) and is linked automatically; here we add the theme colour and
// iOS standalone hints so the installed app chrome matches the brand.
export const metadata: Metadata = {
  /*
   * ТЗ 4.3 (Я3), журнал 394: `<title>` не задавала ни одна страница — вкладки были безымянными.
   * Здесь запасной заголовок для всех страниц (вход, восстановление, ошибки); внутри оболочки
   * вкладку называет раздел из реестра — `tabTitle` в `app-shell.tsx`, из тех же крошек.
   */
  title: { default: 'trudskill', template: '%s — trudskill' },
  applicationName: 'trudskill',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'trudskill' }
};

export const viewport: Viewport = {
  themeColor: '#3b4fe4',
  /*
   * ТЗ 14.2 п.4: страница занимает экран целиком, включая области выреза и системной полосы,
   * а отступы под них берут на себя правила оформления через `env(safe-area-inset-*)`.
   * Без этого значения браузер сам сжимает страницу и оставляет по краям пустые полосы.
   */
  viewportFit: 'cover'
};

// Inter — гротеск для ТЕКСТА: таблицы, поля, подписи. Читаемость длинных списков не меняется.
// Кириллица + латиница. next/font self-hosts шрифт в бандл (end-user не ходит в Google → 152-ФЗ).
const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-sans',
  fallback: ['Segoe UI', 'system-ui', 'Arial', 'sans-serif']
});

/**
 * Onest — шрифт ЗАГОЛОВКОВ (ТЗ 7.4 пункт 1, решение владельца Р5).
 *
 * Зачем второй шрифт. Интерфейс был опрятным, но обезличенным — его не отличить от десятка
 * других админок. Продукт сдаётся в аренду учебным центрам, а центр выбирает в том числе
 * глазами. Пара «характерные заголовки + спокойный текст» — самый дешёвый способ дать лицо,
 * не трогая читаемость там, где человек работает часами.
 *
 * Почему Onest, а не что-то ещё: свободная лицензия SIL OFL, полноценная кириллица,
 * современный характер без вычурности. Запасной вариант, если не подойдёт визуально, — Golos
 * Text (тоже OFL с кириллицей), он есть в том же наборе.
 *
 * Почему только три начертания. Заголовкам нужны полужирный и жирный, и ничего больше. Каждое
 * лишнее начертание — это лишние килобайты, которые едут к человеку на телефоне по мобильной
 * сети перед первым экраном.
 *
 * Почему не CDN. `next/font` кладёт файлы шрифта В СБОРКУ: браузер человека берёт их с нашего
 * адреса и никуда больше не ходит. Это требование и скорости, и независимости от иностранных
 * сервисов — ровно то же основание, по которому так подключён Inter.
 */
const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-display',
  fallback: ['Segoe UI', 'system-ui', 'Arial', 'sans-serif']
});

/**
 * ФТ-G7. Ждём настоящий запрос, прежде чем рисовать страницу.
 *
 * Политика безопасности помечает наши скрипты одноразовым числом и велит браузеру
 * выполнять только помеченные. Пометить их можно лишь во время ответа на живой запрос:
 * при сборке заранее ни запроса, ни числа ещё нет, и в готовый HTML метка не попадёт.
 * Без этой строки браузер блокирует ВСЕ скрипты сайта, и человек видит вечную надпись
 * «Загрузка приложения...» — ровно так стенд и лежал (сторож
 * `src/e2e/csp-nonce-needs-dynamic.e2e.test.ts`).
 *
 * Цена решения: страницы больше не отдаются из заготовок, каждая собирается на запрос.
 * Для системы, где почти весь экран — личные данные вошедшего человека, заготовки и так
 * были пустой оболочкой, а безопасность дороже долей секунды.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  return (
    <html lang="ru" className={`${inter.variable} ${onest.variable}`}>
      <body style={{ margin: 0, fontFamily: 'var(--font-sans), Segoe UI, system-ui, sans-serif' }}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
