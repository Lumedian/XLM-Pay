import { WorkflowModel } from './workflow.model';
import { WorkflowState } from '../../workflow/types/workflow-state.enum';
import { WorkflowType } from '../../workflow/types/workflow-type.enum';

describe('WorkflowModel', () => {
  it('should create a workflow model with all required fields', () => {
    const workflow: WorkflowModel = {
      id: 'test-id',
      idempotencyKey: 'test-key',
      type: WorkflowType.CONTRACT_DEPLOYMENT,
      state: WorkflowState.PENDING,
      userId: 'user-123',
      walletAddress: 'GXXX...',
      input: { test: 'data' },
      output: undefined,
      context: undefined,
      currentStepIndex: 0,
      totalSteps: 3,
      startedAt: undefined,
      completedAt: undefined,
      failedAt: undefined,
      failureReason: undefined,
      retryCount: 0,
      maxRetries: 3,
      nextRetryAt: undefined,
      requiresCompensation: false,
      isCompensated: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      steps: [],
    };

    expect(workflow).toBeDefined();
    expect(workflow.id).toBe('test-id');
    expect(workflow.type).toBe(WorkflowType.CONTRACT_DEPLOYMENT);
    expect(workflow.state).toBe(WorkflowState.PENDING);
  });

  it('should support all workflow states', () => {
    const states = [
      WorkflowState.PENDING,
      WorkflowState.RUNNING,
      WorkflowState.COMPLETED,
      WorkflowState.FAILED,
      WorkflowState.CANCELLED,
      WorkflowState.COMPENSATING,
      WorkflowState.COMPENSATED,
    ];

    states.forEach((state) => {
      expect(state).toBeDefined();
    });
  });

  it('should support all workflow types', () => {
    const types = [
      WorkflowType.CONTRACT_DEPLOYMENT,
      WorkflowType.TRADE_EXECUTION,
      WorkflowType.AI_JOB_CHAIN,
    ];

    types.forEach((type) => {
      expect(type).toBeDefined();
    });
  });
});
