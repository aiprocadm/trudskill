export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface DocumentTask {
  id: string;
  tenantId: string;
  status: TaskStatus;
  documentType: string;
  sourceEntityType: string;
  sourceEntityId: string;
  templateVersionId: string;
}

export interface PipelineDeps {
  setRunning: (taskId: string) => Promise<boolean | void>;
  reserveNumber: (tenantId: string, documentType: string) => Promise<string>;
  render: (payload: Record<string, unknown>) => Promise<{ fileId: string }>;
  registerGenerated: (payload: Record<string, unknown>) => Promise<{ generatedDocumentId: string }>;
  setCompleted: (taskId: string, generatedDocumentId: string) => Promise<void>;
  setFailed: (taskId: string, errorMessage: string) => Promise<void>;
}

export class DocumentGenerationPipeline {
  constructor(private readonly deps: PipelineDeps) {}

  async handle(task: DocumentTask): Promise<{ taskId: string; status: TaskStatus; generatedDocumentId?: string; errorMessage?: string }> {
    const claimed = await this.deps.setRunning(task.id);
    if (claimed === false) {
      return { taskId: task.id, status: 'queued' };
    }

    try {
      const number = await this.deps.reserveNumber(task.tenantId, task.documentType);
      const rendered = await this.deps.render({ taskId: task.id, number, templateVersionId: task.templateVersionId });
      const generated = await this.deps.registerGenerated({ ...task, number, fileId: rendered.fileId });
      await this.deps.setCompleted(task.id, generated.generatedDocumentId);

      return { taskId: task.id, status: 'completed', generatedDocumentId: generated.generatedDocumentId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unknown worker error';
      await this.deps.setFailed(task.id, errorMessage);
      return { taskId: task.id, status: 'failed', errorMessage };
    }
  }
}
