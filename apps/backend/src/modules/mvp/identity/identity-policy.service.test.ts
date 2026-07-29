import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { IdentityPolicyService } from './identity-policy.service.js';
import { InMemoryIdentityPolicyRepository } from './in-memory-identity-policy.repository.js';

/** Хранение и вычисление политики идентификации (ФТ-C1, Фаза 3 Task 1). */

const T = 'tenant_demo';

const makeService = () => {
  const repo = new InMemoryIdentityPolicyRepository();
  return { service: new IdentityPolicyService(repo), repo };
};

describe('IdentityPolicyService.save', () => {
  it('сохраняет политику тенанта', async () => {
    const { service } = makeService();
    const saved = await service.save(T, { scope: 'tenant', level: 2 });
    expect(saved).toMatchObject({ scope: 'tenant', level: 2, requirePhotoBeforeExam: false });
  });

  it('повторное сохранение той же области обновляет запись, а не плодит вторую', async () => {
    const { service } = makeService();
    await service.save(T, { scope: 'tenant', level: 1 });
    await service.save(T, { scope: 'tenant', level: 3 });

    const items = await service.list(T);
    // Две записи на одну область означали бы «уровень как повезёт» в допуске к экзамену.
    expect(items).toHaveLength(1);
    expect(items[0]!.level).toBe(3);
  });

  it('политика тенанта с привязкой к объекту отвергается', async () => {
    const { service } = makeService();
    await expect(
      service.save(T, { scope: 'tenant', scopeId: 'course_1', level: 2 })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('политика курса без курса — настройка-призрак, отвергается', async () => {
    const { service } = makeService();
    await expect(service.save(T, { scope: 'course', level: 2 })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('мусорный уровень приводится к 0 при сохранении', async () => {
    const { service } = makeService();
    const saved = await service.save(T, { scope: 'tenant', level: 99 });
    expect(saved.level).toBe(0);
  });
});

describe('IdentityPolicyService.effectiveForCourse', () => {
  it('без настроек — уровень 0', async () => {
    const { service } = makeService();
    expect(await service.effectiveForCourse(T, 'course_1')).toMatchObject({
      level: 0,
      source: 'default'
    });
  });

  it('политика курса перекрывает тенантскую', async () => {
    const { service } = makeService();
    await service.save(T, { scope: 'tenant', level: 3 });
    await service.save(T, { scope: 'course', scopeId: 'course_1', level: 1 });

    expect(await service.effectiveForCourse(T, 'course_1')).toMatchObject({
      level: 1,
      source: 'course'
    });
    // Для другого курса действует тенантская.
    expect(await service.effectiveForCourse(T, 'course_2')).toMatchObject({
      level: 3,
      source: 'tenant'
    });
  });

  it('направление применяется, когда курс не настроен', async () => {
    const { service } = makeService();
    await service.save(T, { scope: 'tenant', level: 1 });
    await service.save(T, { scope: 'direction', scopeId: 'dir_1', level: 2 });

    expect(await service.effectiveForCourse(T, 'course_1', 'dir_1')).toMatchObject({
      level: 2,
      source: 'direction'
    });
  });

  it('флаг фото перед экзаменом доезжает до действующей политики', async () => {
    const { service } = makeService();
    await service.save(T, { scope: 'tenant', level: 2, requirePhotoBeforeExam: true });
    expect((await service.effectiveForCourse(T, 'course_1')).requirePhotoBeforeExam).toBe(true);
  });

  it('политика чужого тенанта не применяется', async () => {
    const { service } = makeService();
    await service.save('tenant_other', { scope: 'tenant', level: 3 });
    expect(await service.effectiveForCourse(T, 'course_1')).toMatchObject({ level: 0 });
  });

  it('удаление возвращает политику к уровню тенанта', async () => {
    const { service } = makeService();
    await service.save(T, { scope: 'tenant', level: 2 });
    await service.save(T, { scope: 'course', scopeId: 'course_1', level: 0 });
    expect((await service.effectiveForCourse(T, 'course_1')).level).toBe(0);

    await service.remove(T, 'course', 'course_1');

    expect((await service.effectiveForCourse(T, 'course_1')).level).toBe(2);
  });
});
