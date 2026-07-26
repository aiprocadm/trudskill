-- 0061: шифрование ПДн слушателей (ФТ-C3.3, Фаза 0 Task 7) — индексы слепого хэша СНИЛС.
--
-- Learners хранятся JSONB-документами в learning.mvp_runtime_documents (+ stage1-зеркало),
-- а не колонками (нормализованная learning.learners рантаймом не используется), поэтому
-- само шифрование — на границе персистенса приложения (AES-256-GCM, keyring
-- INTEGRATION_CRYPTO_KEYS): при записи data->>'snils' становится 'enc:…' и появляется
-- data->>'snilsHash' (keyed HMAC по нормализованным цифрам). Существующие plaintext-строки
-- перешифровываются приложением при первом сохранении состояния тенанта (lazy-миграция).
--
-- Здесь — только аддитивные functional-индексы под будущие SQL-выборки/уникальность по
-- слепому хэшу (нормализованный read-model Фазы 4). Идемпотентно.
create index if not exists idx_mvp_runtime_learners_snils_hash
  on learning.mvp_runtime_documents ((data->>'snilsHash'))
  where collection = 'learners';

create index if not exists idx_mvp_stage1_learners_snils_hash
  on learning.mvp_stage1_runtime_documents ((data->>'snilsHash'))
  where collection = 'learners';
