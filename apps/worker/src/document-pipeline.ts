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

export type RetryDecision = 'retry' | 'fail';

export interface RetryPolicy {
  decide: (error: unknown) => RetryDecision;
}

export class ErrorNameRetryPolicy implements RetryPolicy {
  private readonly retryableNames = new Set(['TimeoutError', 'ServiceUnavailableError', 'RateLimitError']);

  decide(error: unknown): RetryDecision {
    if (error instanceof Error && this.retryableNames.has(error.name)) {
      return 'retry';
    }

    return 'fail';
  }
}

export class DocumentGenerationOrchestrator {
  constructor(
    private readonly deps: PipelineDeps,
    private readonly retryPolicy: RetryPolicy
  ) {}

  async execute(task: DocumentTask): Promise<{ taskId: string; status: TaskStatus; generatedDocumentId?: string; errorMessage?: string }> {
    const number = await this.deps.reserveNumber(task.tenantId, task.documentType);
    const rendered = await this.deps.render({ taskId: task.id, number, templateVersionId: task.templateVersionId });
    const generated = await this.deps.registerGenerated({ ...task, number, fileId: rendered.fileId });
    await this.deps.setCompleted(task.id, generated.generatedDocumentId);

    return { taskId: task.id, status: 'completed', generatedDocumentId: generated.generatedDocumentId };
  }

  async handleFailure(task: DocumentTask, error: unknown): Promise<{ taskId: string; status: TaskStatus; errorMessage: string }> {
    const errorMessage = error instanceof Error ? error.message : 'unknown worker error';
    const retryDecision = this.retryPolicy.decide(error);

    if (retryDecision === 'retry') {
      return { taskId: task.id, status: 'queued', errorMessage };
    }

    await this.deps.setFailed(task.id, errorMessage);
    return { taskId: task.id, status: 'failed', errorMessage };
  }
}

export class DocumentGenerationPipeline {
  private readonly orchestrator: DocumentGenerationOrchestrator;

  constructor(
    private readonly deps: PipelineDeps,
    retryPolicy: RetryPolicy = new ErrorNameRetryPolicy()
  ) {
    this.orchestrator = new DocumentGenerationOrchestrator(deps, retryPolicy);
  }

  async handle(task: DocumentTask): Promise<{ taskId: string; status: TaskStatus; generatedDocumentId?: string; errorMessage?: string }> {
    const claimed = await this.deps.setRunning(task.id);
    if (claimed === false) {
      return { taskId: task.id, status: 'queued' };
    }

    try {
      return await this.orchestrator.execute(task);
    } catch (error) {
      return this.orchestrator.handleFailure(task, error);
    }
  }
}
