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
  private handled = new Set<string>();

  constructor(private readonly deps: PipelineDeps) {}

  async handle(task: DocumentTask): Promise<{ taskId: string; status: TaskStatus; generatedDocumentId?: string }> {
    if (this.handled.has(task.id)) {
      return { taskId: task.id, status: 'completed' };
    }

    const number = await this.deps.reserveNumber(task.tenantId, 'default');
    const rendered = await this.deps.render({ taskId: task.id, number, templateVersionId: task.templateVersionId });
    const generated = await this.deps.registerGenerated({ ...task, number, fileId: rendered.fileId });
    this.handled.add(task.id);

    return { taskId: task.id, status: 'completed', generatedDocumentId: generated.generatedDocumentId };
  }
}
