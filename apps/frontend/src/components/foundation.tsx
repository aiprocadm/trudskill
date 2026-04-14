'use client';

import {
  ConfirmDialog,
  DataTable,
  FilterBar,
  FormField,
  RegistryFilterBar,
  RegistryTableState,
  RegistryToolbar
} from '@cdoprof/ui';
import { useState } from 'react';

export const FormFoundation = () => (
  <form style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
    <FormField label="Название" name="title" placeholder="Введите значение" />
    <FormField label="Описание" name="description" placeholder="Короткое описание" />
    <button type="submit">Сохранить</button>
  </form>
);

export const RegistryFoundation = () => (
  <section style={{ display: 'grid', gap: 8 }}>
    <RegistryToolbar>
      <strong>Реестр (foundation)</strong>
    </RegistryToolbar>
    <RegistryFilterBar>
      <FilterBar>
        <button type="button">Активные</button>
        <button type="button">Архив</button>
      </FilterBar>
    </RegistryFilterBar>
    <DataTable
      columns={[
        { key: 'id', title: 'ID' },
        { key: 'name', title: 'Название' }
      ]}
      rows={[]}
    />
    <RegistryTableState state="empty" />
  </section>
);

export const ConfirmDialogFoundation = () => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Открыть confirm dialog
      </button>
      {open ? (
        <ConfirmDialog
          title="Подтверждение"
          message="Подтвердите действие для демонстрации модального окна."
          confirmLabel="ОК"
          cancelLabel="Отмена"
          onConfirm={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
};
