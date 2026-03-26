export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface DocumentTask {
  id: string;
  tenantId: string;
  status: TaskStatus;
  sourceEntityType: string;
  sourceEntityId: string;
  templateVersionId: string;
}

export interface PipelineDeps {
  reserveNumber: (tenantId: string, documentType: string) => Promise<string>;
  render: (payload: Record<string, unknown>) => Promise<{ fileId: string }>;
  registerGenerated: (payload: Record<string, unknown>) => Promise<{ generatedDocumentId: string }>;
}

export class DocumentGenerationPipeline {
  private handled = new Map<string, { generatedDocumentId?: string }>();

  constructor(private readonly deps: PipelineDeps) {}

  async handle(task: DocumentTask): Promise<{ taskId: string; status: TaskStatus; generatedDocumentId?: string }> {
    const existing = this.handled.get(task.id);
    if (existing) {
      return { taskId: task.id, status: 'completed', generatedDocumentId: existing.generatedDocumentId };
    }

    try {
      const number = await this.deps.reserveNumber(task.tenantId, 'default');
      const rendered = await this.deps.render({ taskId: task.id, number, templateVersionId: task.templateVersionId });
      const generated = await this.deps.registerGenerated({ ...task, number, fileId: rendered.fileId });
      this.handled.set(task.id, { generatedDocumentId: generated.generatedDocumentId });

      return { taskId: task.id, status: 'completed', generatedDocumentId: generated.generatedDocumentId };
    } catch {
      return { taskId: task.id, status: 'failed' };
    }
  }
}
