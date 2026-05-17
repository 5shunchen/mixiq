import {
  workflowListHandler,
  workflowCreateHandler,
  workflowGetHandler,
  workflowDeleteHandler,
  workflowRunHandler,
  workflowRunStatusHandler,
  workflowRunCancelHandler,
  workflowRunListHandler,
  workflowListSchema,
  workflowCreateSchema,
  workflowGetSchema,
  workflowDeleteSchema,
  workflowRunSchema,
  workflowRunStatusSchema,
  workflowRunCancelSchema,
  workflowRunListSchema,
  type WorkflowDefinition,
  type WorkflowRunStatus,
  type StepExecutionState,
} from '../../src/tools/orchestrator-tools';

// Mock Orchestrator
const mockOrchestrator = {
  listWorkflows: jest.fn(),
  createWorkflow: jest.fn(),
  getWorkflow: jest.fn(),
  deleteWorkflow: jest.fn(),
  runWorkflow: jest.fn(),
  getWorkflowRunStatus: jest.fn(),
  cancelWorkflowRun: jest.fn(),
  listWorkflowRuns: jest.fn(),
};

describe('Orchestrator Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== workflow_list ====================
  describe('workflow_list', () => {
    describe('Schema Validation', () => {
      it('should validate empty object', () => {
        const result = workflowListSchema.safeParse({});
        expect(result.success).toBe(true);
      });

      it('should ignore extra parameters', () => {
        const result = workflowListSchema.safeParse({ extra: 'value' });
        expect(result.success).toBe(true);
      });
    });

    describe('workflowListHandler', () => {
      it('should return success with workflows including built-in templates', async () => {
        // Setup
        const mockWorkflows: WorkflowDefinition[] = [
          {
            id: '123e4567-e89b-12d3-a456-426614174001',
            name: 'project-init',
            description: '初始化项目',
            version: '1.0.0',
            is_builtin: true,
            steps: [{ id: 'step-1', type: 'action', name: '创建目录' }],
            parameters: {},
            tags: ['init', 'project'],
            created_at: new Date(),
            updated_at: new Date(),
          },
          {
            id: '123e4567-e89b-12d3-a456-426614174002',
            name: 'custom-workflow',
            description: '自定义工作流',
            version: '1.0.0',
            is_builtin: false,
            steps: [{ id: 'step-1', type: 'action', name: '执行命令' }],
            parameters: {},
            tags: ['custom'],
            created_at: new Date(),
            updated_at: new Date(),
          },
        ];
        mockOrchestrator.listWorkflows.mockResolvedValue(mockWorkflows);

        // Execute
        const result = await workflowListHandler(mockOrchestrator as unknown as any, {});

        // Verify
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.workflows).toHaveLength(2);
          expect(result.data.workflows[0].name).toBe('project-init');
          expect(result.data.workflows[0].is_builtin).toBe(true);
          expect(result.data.workflows[1].name).toBe('custom-workflow');
          expect(result.data.workflows[1].is_builtin).toBe(false);
        }
        expect(mockOrchestrator.listWorkflows).toHaveBeenCalled();
      });

      it('should return success with empty list', async () => {
        // Setup
        mockOrchestrator.listWorkflows.mockResolvedValue([]);

        // Execute
        const result = await workflowListHandler(mockOrchestrator as unknown as any, {});

        // Verify
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.workflows).toHaveLength(0);
        }
      });

      it('should return error when listWorkflows throws', async () => {
        // Setup
        const errorMessage = 'Database connection failed';
        mockOrchestrator.listWorkflows.mockRejectedValue(new Error(errorMessage));

        // Execute
        const result = await workflowListHandler(mockOrchestrator as unknown as any, {});

        // Verify
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe(errorMessage);
        }
      });
    });
  });

  // ==================== workflow_create ====================
  describe('workflow_create', () => {
    describe('Schema Validation', () => {
      it('should validate valid simple workflow creation', () => {
        const validInput = {
          name: 'my-workflow',
          definition: {
            steps: [
              {
                id: 'step-1',
                type: 'action' as const,
                name: '执行命令',
                description: '执行 shell 命令',
                tool: 'execute_shell',
                params: { command: 'echo hello' },
              },
            ],
          },
          description: '我的工作流',
        };
        const result = workflowCreateSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should validate complex workflow with parallel and condition steps', () => {
        const validInput = {
          name: 'complex-workflow',
          definition: {
            version: '2.0.0',
            parameters: {
              env: { type: 'string' as const, required: true, description: '环境名称' },
              dry_run: { type: 'boolean' as const, default: false },
            },
            steps: [
              {
                id: 'parallel-step',
                type: 'parallel' as const,
                name: '并行执行任务',
                steps: [
                  { id: 'task-1', type: 'action' as const, name: '任务1' },
                  { id: 'task-2', type: 'action' as const, name: '任务2' },
                ],
              },
              {
                id: 'condition-step',
                type: 'condition' as const,
                name: '条件判断',
                condition: '${dry_run}',
                branches: {
                  true: [{ id: 'dry-run', type: 'action' as const, name: '执行 dry run' }],
                  false: [{ id: 'real-run', type: 'action' as const, name: '执行实际部署' }],
                },
              },
            ],
            timeout: 300000,
            tags: ['deploy', 'complex'],
          },
        };
        const result = workflowCreateSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject missing required name field', () => {
        const invalidInput = {
          definition: {
            steps: [{ id: 'step-1', type: 'action' as const, name: 'Step 1' }],
          },
        };
        const result = workflowCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject empty workflow name', () => {
        const invalidInput = {
          name: '',
          definition: {
            steps: [{ id: 'step-1', type: 'action' as const, name: 'Step 1' }],
          },
        };
        const result = workflowCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject invalid workflow name format (spaces)', () => {
        const invalidInput = {
          name: 'my workflow',
          definition: {
            steps: [{ id: 'step-1', type: 'action' as const, name: 'Step 1' }],
          },
        };
        const result = workflowCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject workflow name starting with invalid character', () => {
        const invalidInput = {
          name: '-invalid-name',
          definition: {
            steps: [{ id: 'step-1', type: 'action' as const, name: 'Step 1' }],
          },
        };
        const result = workflowCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject workflow without steps', () => {
        const invalidInput = {
          name: 'valid-name',
          definition: {
            steps: [],
          },
        };
        const result = workflowCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject steps without id field', () => {
        const invalidInput = {
          name: 'valid-name',
          definition: {
            steps: [
              { type: 'action' as const, name: 'Step 1' }, // Missing id
            ] as any,
          },
        };
        const result = workflowCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject steps without type field', () => {
        const invalidInput = {
          name: 'valid-name',
          definition: {
            steps: [
              { id: 'step-1', name: 'Step 1' }, // Missing type
            ] as any,
          },
        };
        const result = workflowCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject invalid step type', () => {
        const invalidInput = {
          name: 'valid-name',
          definition: {
            steps: [
              { id: 'step-1', type: 'invalid-type' as any, name: 'Step 1' },
            ],
          },
        };
        const result = workflowCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject description longer than 500 characters', () => {
        const invalidInput = {
          name: 'valid-name',
          definition: {
            steps: [{ id: 'step-1', type: 'action' as const, name: 'Step 1' }],
          },
          description: 'x'.repeat(501),
        };
        const result = workflowCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('workflowCreateHandler', () => {
      it('should return success with workflow_id when creating simple workflow', async () => {
        // Setup
        const mockResult = {
          workflow_id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'simple-workflow',
          created_at: new Date(),
        };
        mockOrchestrator.createWorkflow.mockResolvedValue(mockResult);

        const input = {
          name: 'simple-workflow',
          definition: {
            steps: [
              {
                id: 'step-1',
                type: 'action' as const,
                name: '执行命令',
                tool: 'execute_shell',
              },
            ],
          },
        };

        // Execute
        const result = await workflowCreateHandler(mockOrchestrator as unknown as any, input);

        // Verify
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.workflow_id).toBe(mockResult.workflow_id);
          expect(result.data.name).toBe('simple-workflow');
          expect(result.data.created_at).toBeDefined();
        }
        expect(mockOrchestrator.createWorkflow).toHaveBeenCalledWith(
          'simple-workflow',
          expect.objectContaining({ version: '1.0.0' }),
          undefined
        );
      });

      it('should pass description to createWorkflow when provided', async () => {
        // Setup
        mockOrchestrator.createWorkflow.mockResolvedValue({
          workflow_id: 'test-id',
          name: 'test-workflow',
          created_at: new Date(),
        });

        const input = {
          name: 'test-workflow',
          definition: {
            version: '1.0.0',
            steps: [{ id: 'step-1', type: 'action' as const, name: 'Step 1' }],
          },
          description: '工作流描述',
        };

        // Execute
        await workflowCreateHandler(mockOrchestrator as unknown as any, input);

        // Verify
        expect(mockOrchestrator.createWorkflow).toHaveBeenCalledWith(
          'test-workflow',
          expect.objectContaining({ version: '1.0.0' }),
          '工作流描述'
        );
      });

      it('should use default version when not provided', async () => {
        // Setup
        mockOrchestrator.createWorkflow.mockResolvedValue({
          workflow_id: 'test-id',
          name: 'test-workflow',
          created_at: new Date(),
        });

        const input = {
          name: 'test-workflow',
          definition: {
            // No version specified
            steps: [{ id: 'step-1', type: 'action' as const, name: 'Step 1' }],
          },
        };

        // Execute
        await workflowCreateHandler(mockOrchestrator as unknown as any, input);

        // Verify
        expect(mockOrchestrator.createWorkflow).toHaveBeenCalledWith(
          'test-workflow',
          expect.objectContaining({ version: '1.0.0' }),
          undefined
        );
      });

      it('should return error when validation fails', async () => {
        // Execute
        const result = await workflowCreateHandler(mockOrchestrator as unknown as any, {
          name: '', // Invalid: empty name
          definition: { steps: [] },
        });

        // Verify
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('workflow_create');
          expect(result.error).toContain('参数校验失败');
        }
        expect(mockOrchestrator.createWorkflow).not.toHaveBeenCalled();
      });

      it('should return error when workflow name already exists', async () => {
        // Setup
        const errorMessage = '工作流名称 "existing-workflow" 已被内置模板占用，请使用其他名称';
        mockOrchestrator.createWorkflow.mockRejectedValue(new Error(errorMessage));

        const input = {
          name: 'existing-workflow',
          definition: {
            steps: [{ id: 'step-1', type: 'action' as const, name: 'Step 1' }],
          },
        };

        // Execute
        const result = await workflowCreateHandler(mockOrchestrator as unknown as any, input);

        // Verify
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe(errorMessage);
        }
      });

      it('should handle non-Error throw values gracefully', async () => {
        // Setup
        mockOrchestrator.createWorkflow.mockRejectedValue('Workflow creation failed');

        const input = {
          name: 'test-workflow',
          definition: {
            steps: [{ id: 'step-1', type: 'action' as const, name: 'Step 1' }],
          },
        };

        // Execute
        const result = await workflowCreateHandler(mockOrchestrator as unknown as any, input);

        // Verify
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('Workflow creation failed');
        }
      });
    });
  });

  // ==================== workflow_get ====================
  describe('workflow_get', () => {
    describe('Schema Validation', () => {
      it('should validate workflow_id parameter', () => {
        const validInput = { workflow_id: '123e4567-e89b-12d3-a456-426614174000' };
        const result = workflowGetSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should validate name parameter', () => {
        const validInput = { name: 'project-init' };
        const result = workflowGetSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should accept both workflow_id and name', () => {
        const validInput = {
          workflow_id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'project-init',
        };
        const result = workflowGetSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject when neither workflow_id nor name is provided', () => {
        const invalidInput = {};
        const result = workflowGetSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject invalid UUID format for workflow_id', () => {
        const invalidInput = { workflow_id: 'not-a-uuid' };
        const result = workflowGetSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('workflowGetHandler', () => {
      it('should return success with workflow data when getting by workflow_id', async () => {
        // Setup
        const workflowId = '123e4567-e89b-12d3-a456-426614174000';
        const mockWorkflow: WorkflowDefinition = {
          id: workflowId,
          name: 'my-workflow',
          description: '测试工作流',
          version: '1.0.0',
          is_builtin: false,
          steps: [{ id: 'step-1', type: 'action', name: '执行命令' }],
          parameters: {},
          tags: ['test'],
          created_at: new Date(),
          updated_at: new Date(),
        };
        mockOrchestrator.getWorkflow.mockResolvedValue(mockWorkflow);

        // Execute
        const result = await workflowGetHandler(mockOrchestrator as unknown as any, {
          workflow_id: workflowId,
        });

        // Verify
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.id).toBe(workflowId);
          expect(result.data.name).toBe('my-workflow');
        }
        expect(mockOrchestrator.getWorkflow).toHaveBeenCalledWith(workflowId, undefined);
      });

      it('should return success with workflow data when getting by name', async () => {
        // Setup
        const workflowName = 'project-init';
        const mockWorkflow: WorkflowDefinition = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: workflowName,
          description: '内置工作流',
          version: '1.0.0',
          is_builtin: true,
          steps: [{ id: 'step-1', type: 'action', name: '初始化项目' }],
          parameters: {},
          tags: ['init'],
          created_at: new Date(),
          updated_at: new Date(),
        };
        mockOrchestrator.getWorkflow.mockResolvedValue(mockWorkflow);

        // Execute
        const result = await workflowGetHandler(mockOrchestrator as unknown as any, {
          name: workflowName,
        });

        // Verify
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.name).toBe(workflowName);
          expect(result.data.is_builtin).toBe(true);
        }
        expect(mockOrchestrator.getWorkflow).toHaveBeenCalledWith(undefined, workflowName);
      });

      it('should return error when validation fails', async () => {
        // Execute
        const result = await workflowGetHandler(mockOrchestrator as unknown as any, {});

        // Verify
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('workflow_get');
        }
        expect(mockOrchestrator.getWorkflow).not.toHaveBeenCalled();
      });

      it('should return error when workflow does not exist', async () => {
        // Setup
        const errorMessage = '工作流不存在';
        mockOrchestrator.getWorkflow.mockRejectedValue(new Error(errorMessage));

        // Execute
        const result = await workflowGetHandler(mockOrchestrator as unknown as any, {
          workflow_id: '123e4567-e89b-12d3-a456-426614174000',
        });

        // Verify
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe(errorMessage);
        }
      });
    });
  });

  // ==================== workflow_delete ====================
  describe('workflow_delete', () => {
    describe('Schema Validation', () => {
      it('should validate valid UUID workflow_id', () => {
        const validInput = { workflow_id: '123e4567-e89b-12d3-a456-426614174000' };
        const result = workflowDeleteSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject missing workflow_id', () => {
        const invalidInput = {};
        const result = workflowDeleteSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject invalid UUID format', () => {
        const invalidInput = { workflow_id: 'invalid-uuid' };
        const result = workflowDeleteSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('workflowDeleteHandler', () => {
      it('should return success when deleting custom workflow', async () => {
        // Setup
        const workflowId = '123e4567-e89b-12d3-a456-426614174000';
        mockOrchestrator.deleteWorkflow.mockResolvedValue(true);

        // Execute
        const result = await workflowDeleteHandler(mockOrchestrator as unknown as any, {
          workflow_id: workflowId,
        });

        // Verify
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.workflow_id).toBe(workflowId);
          expect(result.data.deleted).toBe(true);
        }
        expect(mockOrchestrator.deleteWorkflow).toHaveBeenCalledWith(workflowId);
      });

      it('should return error when validation fails', async () => {
        // Execute
        const result = await workflowDeleteHandler(mockOrchestrator as unknown as any, {
          workflow_id: 'invalid-uuid',
        });

        // Verify
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('workflow_delete');
        }
        expect(mockOrchestrator.deleteWorkflow).not.toHaveBeenCalled();
      });

      it('should return error when workflow does not exist', async () => {
        // Setup
        const errorMessage = '工作流不存在';
        mockOrchestrator.deleteWorkflow.mockRejectedValue(new Error(errorMessage));

        // Execute
        const result = await workflowDeleteHandler(mockOrchestrator as unknown as any, {
          workflow_id: '123e4567-e89b-12d3-a456-426614174000',
        });

        // Verify
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe(errorMessage);
        }
      });

      it('should return error when trying to delete built-in workflow', async () => {
        // Setup
        const errorMessage = '内置工作流模板不能删除';
        mockOrchestrator.deleteWorkflow.mockRejectedValue(new Error(errorMessage));

        // Execute
        const result = await workflowDeleteHandler(mockOrchestrator as unknown as any, {
          workflow_id: '123e4567-e89b-12d3-a456-426614174000',
        });

        // Verify
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe(errorMessage);
        }
      });
    });
  });

  // ==================== workflow_run ====================
  describe('workflow_run', () => {
    describe('Schema Validation', () => {
      it('should validate workflow_id parameter', () => {
        const validInput = { workflow_id: '123e4567-e89b-12d3-a456-426614174000' };
        const result = workflowRunSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should validate name parameter', () => {
        const validInput = { name: 'project-init' };
        const result = workflowRunSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should accept params parameter', () => {
        const validInput = {
          workflow_id: '123e4567-e89b-12d3-a456-426614174000',
          params: { projectName: 'test-project', dryRun: true },
        };
        const result = workflowRunSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should accept project_id parameter', () => {
        const validInput = {
          workflow_id: '123e4567-e89b-12d3-a456-426614174000',
          project_id: '123e4567-e89b-12d3-a456-426614174001',
        };
        const result = workflowRunSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject when neither workflow_id nor name is provided', () => {
        const invalidInput = { params: { test: 'value' } };
        const result = workflowRunSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject invalid project_id UUID format', () => {
        const invalidInput = {
          workflow_id: '123e4567-e89b-12d3-a456-426614174000',
          project_id: 'invalid-uuid',
        };
        const result = workflowRunSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('workflowRunHandler', () => {
      it('should return success with run_id when executing by workflow_id', async () => {
        // Setup
        const workflowId = '123e4567-e89b-12d3-a456-426614174000';
        const mockResult = {
          run_id: 'run-123',
          status: 'running' as WorkflowRunStatus,
          started_at: new Date(),
        };
        mockOrchestrator.runWorkflow.mockResolvedValue(mockResult);

        // Execute
        const result = await workflowRunHandler(mockOrchestrator as unknown as any, {
          workflow_id: workflowId,
        });

        // Verify
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.run_id).toBe('run-123');
          expect(result.data.status).toBe('running');
          expect(result.data.started_at).toBeDefined();
        }
        expect(mockOrchestrator.runWorkflow).toHaveBeenCalledWith(
          workflowId,
          undefined,
          undefined,
          undefined
        );
      });

      it('should return success with run_id when executing by name', async () => {
        // Setup
        const workflowName = 'project-init';
        const mockResult = {
          run_id: 'run-456',
          status: 'pending' as WorkflowRunStatus,
          started_at: new Date(),
        };
        mockOrchestrator.runWorkflow.mockResolvedValue(mockResult);

        // Execute
        const result = await workflowRunHandler(mockOrchestrator as unknown as any, {
          name: workflowName,
        });

        // Verify
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.run_id).toBe('run-456');
          expect(result.data.status).toBe('pending');
        }
        expect(mockOrchestrator.runWorkflow).toHaveBeenCalledWith(
          undefined,
          workflowName,
          undefined,
          undefined
        );
      });

      it('should pass params and project_id to runWorkflow', async () => {
        // Setup
        const workflowId = '123e4567-e89b-12d3-a456-426614174000';
        const projectId = '123e4567-e89b-12d3-a456-426614174001';
        const params = { projectName: 'my-project', env: 'production' };

        mockOrchestrator.runWorkflow.mockResolvedValue({
          run_id: 'run-789',
          status: 'running' as WorkflowRunStatus,
          started_at: new Date(),
        });

        // Execute
        await workflowRunHandler(mockOrchestrator as unknown as any, {
          workflow_id: workflowId,
          project_id: projectId,
          params,
        });

        // Verify
        expect(mockOrchestrator.runWorkflow).toHaveBeenCalledWith(
          workflowId,
          undefined,
          params,
          projectId
        );
      });

      it('should return error when validation fails', async () => {
        // Execute
        const result = await workflowRunHandler(mockOrchestrator as unknown as any, {
          // Missing both workflow_id and name
        });

        // Verify
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('workflow_run');
        }
        expect(mockOrchestrator.runWorkflow).not.toHaveBeenCalled();
      });

      it('should return error when workflow does not exist', async () => {
        // Setup
        const errorMessage = '工作流不存在';
        mockOrchestrator.runWorkflow.mockRejectedValue(new Error(errorMessage));

        // Execute
        const result = await workflowRunHandler(mockOrchestrator as unknown as any, {
          workflow_id: '123e4567-e89b-12d3-a456-426614174000',
        });

        // Verify
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe(errorMessage);
        }
      });

      it('should return error when workflow execution fails', async () => {
        // Setup
        const errorMessage = '工作流执行失败：步骤执行超时';
        mockOrchestrator.runWorkflow.mockRejectedValue(new Error(errorMessage));

        // Execute
        const result = await workflowRunHandler(mockOrchestrator as unknown as any, {
          name: 'deploy-workflow',
        });

        // Verify
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe(errorMessage);
        }
      });
    });
  });

  // ==================== workflow_run_status ====================
  describe('workflow_run_status', () => {
    describe('Schema Validation', () => {
      it('should validate valid UUID run_id', () => {
        const validInput = { run_id: '123e4567-e89b-12d3-a456-426614174000' };
        const result = workflowRunStatusSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject missing run_id', () => {
        const invalidInput = {};
        const result = workflowRunStatusSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject invalid UUID format', () => {
        const invalidInput = { run_id: 'invalid-uuid' };
        const result = workflowRunStatusSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('workflowRunStatusHandler', () => {
      it('should return success with pending status', async () => {
        // Setup
        const runId = '123e4567-e89b-12d3-a456-426614174000';
        const mockStatus = {
          run_id: runId,
          status: 'pending' as WorkflowRunStatus,
          steps: [],
          started_at: new Date(),
        };
        mockOrchestrator.getWorkflowRunStatus.mockResolvedValue(mockStatus);

        // Execute
        const result = await workflowRunStatusHandler(mockOrchestrator as unknown as any, {
          run_id: runId,
        });

        // Verify
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe('pending');
          expect(result.data.steps).toHaveLength(0);
        }
        expect(mockOrchestrator.getWorkflowRunStatus).toHaveBeenCalledWith(runId);
      });

      it('should return success with running status', async () => {
        // Setup
        const runId = '123e4567-e89b-12d3-a456-426614174001';
        const mockSteps: StepExecutionState[] = [
          { step_id: 'step-1', status: 'completed', started_at: new Date(), attempt: 1 },
          { step_id: 'step-2', status: 'running', started_at: new Date(), attempt: 1 },
        ];
        const mockStatus = {
          run_id: runId,
          status: 'running' as WorkflowRunStatus,
          steps: mockSteps,
          started_at: new Date(),
        };
        mockOrchestrator.getWorkflowRunStatus.mockResolvedValue(mockStatus);

        // Execute
        const result = await workflowRunStatusHandler(mockOrchestrator as unknown as any, {
          run_id: runId,
        });

        // Verify
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe('running');
          expect(result.data.steps).toHaveLength(2);
          expect(result.data.steps[0].status).toBe('completed');
          expect(result.data.steps[1].status).toBe('running');
        }
      });

      it('should return success with completed status and step results', async () => {
        // Setup
        const runId = '123e4567-e89b-12d3-a456-426614174002';
        const mockSteps: StepExecutionState[] = [
          {
            step_id: 'step-1',
            status: 'completed',
            result: { output: '任务完成' },
            started_at: new Date(),
            completed_at: new Date(),
            attempt: 1,
          },
          {
            step_id: 'step-2',
            status: 'completed',
            result: { files: ['file1.txt', 'file2.txt'] },
            started_at: new Date(),
            completed_at: new Date(),
            attempt: 1,
          },
        ];
        const mockStatus = {
          run_id: runId,
          status: 'completed' as WorkflowRunStatus,
          steps: mockSteps,
          result: { success: true, message: '工作流执行成功' },
          started_at: new Date(),
          completed_at: new Date(),
        };
        mockOrchestrator.getWorkflowRunStatus.mockResolvedValue(mockStatus);

        // Execute
        const result = await workflowRunStatusHandler(mockOrchestrator as unknown as any, {
          run_id: runId,
        });

        // Verify
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe('completed');
          expect(result.data.result).toEqual({ success: true, message: '工作流执行成功' });
          expect(result.data.completed_at).toBeDefined();
          expect(result.data.steps[0].result).toEqual({ output: '任务完成' });
        }
      });

      it('should return success with failed status and error information', async () => {
        // Setup
        const runId = '123e4567-e89b-12d3-a456-426614174003';
        const mockSteps: StepExecutionState[] = [
          {
            step_id: 'step-1',
            status: 'completed',
            started_at: new Date(),
            completed_at: new Date(),
            attempt: 1,
          },
          {
            step_id: 'step-2',
            status: 'failed',
            error: '命令执行失败：exit code 1',
            started_at: new Date(),
            completed_at: new Date(),
            attempt: 3,
          },
        ];
        const mockStatus = {
          run_id: runId,
          status: 'failed' as WorkflowRunStatus,
          steps: mockSteps,
          result: { success: false },
          started_at: new Date(),
          completed_at: new Date(),
        };
        mockOrchestrator.getWorkflowRunStatus.mockResolvedValue(mockStatus);

        // Execute
        const result = await workflowRunStatusHandler(mockOrchestrator as unknown as any, {
          run_id: runId,
        });

        // Verify
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe('failed');
          expect(result.data.steps[1].error).toBe('命令执行失败：exit code 1');
          expect(result.data.steps[1].attempt).toBe(3);
        }
      });

      it('should return error when validation fails', async () => {
        // Execute
        const result = await workflowRunStatusHandler(mockOrchestrator as unknown as any, {
          run_id: 'invalid-uuid',
        });

        // Verify
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('workflow_run_status');
        }
        expect(mockOrchestrator.getWorkflowRunStatus).not.toHaveBeenCalled();
      });

      it('should return error when execution record does not exist', async () => {
        // Setup
        const errorMessage = '执行记录不存在';
        mockOrchestrator.getWorkflowRunStatus.mockRejectedValue(new Error(errorMessage));

        // Execute
        const result = await workflowRunStatusHandler(mockOrchestrator as unknown as any, {
          run_id: '123e4567-e89b-12d3-a456-426614174000',
        });

        // Verify
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe(errorMessage);
        }
      });
    });
  });

  // ==================== workflow_run_cancel ====================
  describe('workflow_run_cancel', () => {
    describe('Schema Validation', () => {
      it('should validate valid UUID run_id', () => {
        const validInput = { run_id: '123e4567-e89b-12d3-a456-426614174000' };
        const result = workflowRunCancelSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject missing run_id', () => {
        const invalidInput = {};
        const result = workflowRunCancelSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject invalid UUID format', () => {
        const invalidInput = { run_id: 'invalid-uuid' };
        const result = workflowRunCancelSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('workflowRunCancelHandler', () => {
      it('should return success when cancelling running workflow', async () => {
        // Setup
        const runId = '123e4567-e89b-12d3-a456-426614174000';
        const cancelledAt = new Date();
        mockOrchestrator.cancelWorkflowRun.mockResolvedValue(cancelledAt);

        // Execute
        const result = await workflowRunCancelHandler(mockOrchestrator as unknown as any, {
          run_id: runId,
        });

        // Verify
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.run_id).toBe(runId);
          expect(result.data.status).toBe('cancelled');
          expect(result.data.cancelled_at).toBe(cancelledAt);
        }
        expect(mockOrchestrator.cancelWorkflowRun).toHaveBeenCalledWith(runId);
      });

      it('should return error when trying to cancel completed workflow', async () => {
        // Setup
        const errorMessage = '工作流当前状态 completed 无法取消';
        mockOrchestrator.cancelWorkflowRun.mockRejectedValue(new Error(errorMessage));

        // Execute
        const result = await workflowRunCancelHandler(mockOrchestrator as unknown as any, {
          run_id: '123e4567-e89b-12d3-a456-426614174000',
        });

        // Verify
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe(errorMessage);
        }
      });

      it('should return error when validation fails', async () => {
        // Execute
        const result = await workflowRunCancelHandler(mockOrchestrator as unknown as any, {
          run_id: '', // Empty run_id
        });

        // Verify
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('workflow_run_cancel');
        }
        expect(mockOrchestrator.cancelWorkflowRun).not.toHaveBeenCalled();
      });

      it('should return error when execution record does not exist', async () => {
        // Setup
        const errorMessage = '工作流执行不存在';
        mockOrchestrator.cancelWorkflowRun.mockRejectedValue(new Error(errorMessage));

        // Execute
        const result = await workflowRunCancelHandler(mockOrchestrator as unknown as any, {
          run_id: '123e4567-e89b-12d3-a456-426614174000',
        });

        // Verify
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe(errorMessage);
        }
      });
    });
  });

  // ==================== workflow_run_list ====================
  describe('workflow_run_list', () => {
    describe('Schema Validation', () => {
      it('should validate empty object (no parameters)', () => {
        const result = workflowRunListSchema.safeParse({});
        expect(result.success).toBe(true);
      });

      it('should accept project_id parameter', () => {
        const validInput = { project_id: '123e4567-e89b-12d3-a456-426614174000' };
        const result = workflowRunListSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should accept limit parameter', () => {
        const validInput = { limit: 50 };
        const result = workflowRunListSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should accept both project_id and limit parameters', () => {
        const validInput = {
          project_id: '123e4567-e89b-12d3-a456-426614174000',
          limit: 10,
        };
        const result = workflowRunListSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject invalid project_id UUID format', () => {
        const invalidInput = { project_id: 'invalid-uuid' };
        const result = workflowRunListSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject limit less than 1', () => {
        const invalidInput = { limit: 0 };
        const result = workflowRunListSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject limit greater than 100', () => {
        const invalidInput = { limit: 101 };
        const result = workflowRunListSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('workflowRunListHandler', () => {
      it('should return success with execution history list', async () => {
        // Setup
        const mockRuns = [
          {
            id: 'run-1',
            workflow_id: 'wf-1',
            workflow_name: 'deploy',
            project_id: 'proj-1',
            params: {},
            status: 'completed' as WorkflowRunStatus,
            steps: [],
            started_at: new Date(Date.now() - 3600000),
            completed_at: new Date(),
          },
          {
            id: 'run-2',
            workflow_id: 'wf-2',
            workflow_name: 'test',
            project_id: 'proj-1',
            params: {},
            status: 'running' as WorkflowRunStatus,
            steps: [],
            started_at: new Date(),
          },
        ];
        mockOrchestrator.listWorkflowRuns.mockResolvedValue(mockRuns);

        // Execute
        const result = await workflowRunListHandler(mockOrchestrator as unknown as any, {});

        // Verify
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toHaveLength(2);
          expect(result.data[0].status).toBe('completed');
          expect(result.data[1].status).toBe('running');
        }
        expect(mockOrchestrator.listWorkflowRuns).toHaveBeenCalledWith(undefined, undefined);
      });

      it('should pass limit parameter to listWorkflowRuns', async () => {
        // Setup
        mockOrchestrator.listWorkflowRuns.mockResolvedValue([]);

        // Execute
        await workflowRunListHandler(mockOrchestrator as unknown as any, { limit: 10 });

        // Verify
        expect(mockOrchestrator.listWorkflowRuns).toHaveBeenCalledWith(undefined, 10);
      });

      it('should pass project_id parameter to listWorkflowRuns', async () => {
        // Setup
        const projectId = '123e4567-e89b-12d3-a456-426614174000';
        mockOrchestrator.listWorkflowRuns.mockResolvedValue([]);

        // Execute
        await workflowRunListHandler(mockOrchestrator as unknown as any, { project_id: projectId });

        // Verify
        expect(mockOrchestrator.listWorkflowRuns).toHaveBeenCalledWith(projectId, undefined);
      });

      it('should return error when validation fails', async () => {
        // Execute
        const result = await workflowRunListHandler(mockOrchestrator as unknown as any, {
          limit: -1, // Invalid limit
        });

        // Verify
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('workflow_run_list');
        }
        expect(mockOrchestrator.listWorkflowRuns).not.toHaveBeenCalled();
      });

      it('should return error when listWorkflowRuns throws', async () => {
        // Setup
        const errorMessage = '数据库查询失败';
        mockOrchestrator.listWorkflowRuns.mockRejectedValue(new Error(errorMessage));

        // Execute
        const result = await workflowRunListHandler(mockOrchestrator as unknown as any, {});

        // Verify
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe(errorMessage);
        }
      });
    });
  });
});
