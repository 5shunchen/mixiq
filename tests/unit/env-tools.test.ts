import {
  envListSchema,
  envCreateSchema,
  envInfoSchema,
  envDeploySchema,
  envRollbackSchema,
  envDeploymentHistorySchema,
  envGetLogsSchema,
  envHealthCheckSchema,
  envListHandler,
  envCreateHandler,
  envInfoHandler,
  envDeployHandler,
  envRollbackHandler,
  envDeploymentHistoryHandler,
  envGetLogsHandler,
  envHealthCheckHandler,
} from '../../src/tools/env-tools';
import type { EnvManager } from '../../src/managers/env-manager';
import type { ProjectManager } from '../../src/managers/project-manager';
import type { Environment, Deployment, SSHServer } from '../../src/types';

// Mock EnvManager
const mockEnvManager = {
  listEnvironments: jest.fn(),
  createEnvironment: jest.fn(),
  getEnvironmentInfo: jest.fn(),
  deployEnvironment: jest.fn(),
  rollbackDeployment: jest.fn(),
  getDeploymentHistory: jest.fn(),
  getEnvironmentLogs: jest.fn(),
  checkEnvironmentHealth: jest.fn(),
};

// Mock ProjectManager (not heavily used in env-tools, but needed for signatures)
const mockProjectManager = {} as ProjectManager;

// Test data constants
const TEST_PROJECT_ID = '123e4567-e89b-12d3-a456-426614174000';
const TEST_ENV_NAME = 'production';
const TEST_DEPLOYMENT_ID = '987e6543-e21b-43d3-f654-426614174999';

const TEST_SERVERS: SSHServer[] = [
  {
    host: '192.168.1.1',
    port: 22,
    username: 'deploy',
    privateKeyPath: '/home/user/.ssh/id_rsa',
  },
];

const TEST_ENVIRONMENTS: Environment[] = [
  {
    id: 'env-1',
    project_id: TEST_PROJECT_ID,
    name: TEST_ENV_NAME,
    servers: TEST_SERVERS,
    config: {},
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 'env-2',
    project_id: TEST_PROJECT_ID,
    name: 'staging',
    servers: TEST_SERVERS,
    config: {},
    created_at: new Date(),
    updated_at: new Date(),
  },
];

const TEST_DEPLOYMENTS: Deployment[] = [
  {
    id: TEST_DEPLOYMENT_ID,
    project_id: TEST_PROJECT_ID,
    env_name: TEST_ENV_NAME,
    branch: 'main',
    status: 'success',
    commit_sha: 'abc123',
    output: 'Deploy successful',
    created_at: new Date(),
    updated_at: new Date(),
  },
];

describe('Environment Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ========================================================================
  // Schema Validation Tests
  // ========================================================================

  describe('Schema Validation', () => {
    describe('envListSchema', () => {
      it('should validate empty object (use current project)', () => {
        const result = envListSchema.safeParse({});
        expect(result.success).toBe(true);
      });

      it('should validate valid project_id', () => {
        const result = envListSchema.safeParse({ project_id: TEST_PROJECT_ID });
        expect(result.success).toBe(true);
      });

      it('should reject invalid project_id format', () => {
        const result = envListSchema.safeParse({ project_id: 'invalid-uuid' });
        expect(result.success).toBe(false);
      });
    });

    describe('envCreateSchema', () => {
      it('should validate complete environment configuration', () => {
        const validInput = {
          name: TEST_ENV_NAME,
          servers: TEST_SERVERS,
          project_id: TEST_PROJECT_ID,
          config: { buildCommand: 'npm run build' },
        };
        const result = envCreateSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject missing name field', () => {
        const invalidInput = {
          servers: TEST_SERVERS,
        };
        const result = envCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject empty name', () => {
        const invalidInput = {
          name: '',
          servers: TEST_SERVERS,
        };
        const result = envCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject name with special characters', () => {
        const invalidInput = {
          name: 'prod@env!',
          servers: TEST_SERVERS,
        };
        const result = envCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject name starting with invalid character', () => {
        const invalidInput = {
          name: '-production',
          servers: TEST_SERVERS,
        };
        const result = envCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject missing servers field', () => {
        const invalidInput = {
          name: TEST_ENV_NAME,
        };
        const result = envCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject empty servers array', () => {
        const invalidInput = {
          name: TEST_ENV_NAME,
          servers: [],
        };
        const result = envCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject non-array servers value', () => {
        const invalidInput = {
          name: TEST_ENV_NAME,
          servers: 'not-an-array',
        };
        const result = envCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject invalid server configuration (missing host)', () => {
        const invalidInput = {
          name: TEST_ENV_NAME,
          servers: [{ port: 22, username: 'deploy', privateKeyPath: '/path' }],
        };
        const result = envCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject invalid server configuration (invalid port)', () => {
        const invalidInput = {
          name: TEST_ENV_NAME,
          servers: [{ host: '192.168.1.1', port: 99999, username: 'deploy', privateKeyPath: '/path' }],
        };
        const result = envCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject invalid server configuration (port zero)', () => {
        const invalidInput = {
          name: TEST_ENV_NAME,
          servers: [{ host: '192.168.1.1', port: 0, username: 'deploy', privateKeyPath: '/path' }],
        };
        const result = envCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject invalid hostname format', () => {
        const invalidInput = {
          name: TEST_ENV_NAME,
          servers: [{ host: '-invalid-host', port: 22, username: 'deploy', privateKeyPath: '/path' }],
        };
        const result = envCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should accept config as optional field', () => {
        const validInput = {
          name: TEST_ENV_NAME,
          servers: TEST_SERVERS,
        };
        const result = envCreateSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject invalid project_id', () => {
        const invalidInput = {
          name: TEST_ENV_NAME,
          servers: TEST_SERVERS,
          project_id: 'invalid',
        };
        const result = envCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('envInfoSchema', () => {
      it('should validate valid env_name without project_id', () => {
        const result = envInfoSchema.safeParse({ env_name: TEST_ENV_NAME });
        expect(result.success).toBe(true);
      });

      it('should validate valid env_name with project_id', () => {
        const result = envInfoSchema.safeParse({
          env_name: TEST_ENV_NAME,
          project_id: TEST_PROJECT_ID,
        });
        expect(result.success).toBe(true);
      });

      it('should reject missing env_name', () => {
        const result = envInfoSchema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('should reject empty env_name', () => {
        const result = envInfoSchema.safeParse({ env_name: '' });
        expect(result.success).toBe(false);
      });
    });

    describe('envDeploySchema', () => {
      it('should validate minimal deploy parameters', () => {
        const validInput = {
          env_name: TEST_ENV_NAME,
          branch: 'main',
        };
        const result = envDeploySchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should validate complete deploy parameters', () => {
        const validInput = {
          env_name: TEST_ENV_NAME,
          branch: 'feature/new-ui',
          project_id: TEST_PROJECT_ID,
          force: true,
        };
        const result = envDeploySchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject missing env_name', () => {
        const invalidInput = { branch: 'main' };
        const result = envDeploySchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject missing branch', () => {
        const invalidInput = { env_name: TEST_ENV_NAME };
        const result = envDeploySchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject empty branch', () => {
        const invalidInput = { env_name: TEST_ENV_NAME, branch: '' };
        const result = envDeploySchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject non-boolean force value', () => {
        const invalidInput = {
          env_name: TEST_ENV_NAME,
          branch: 'main',
          force: 'yes',
        };
        const result = envDeploySchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('envRollbackSchema', () => {
      it('should validate rollback with only env_name (auto rollback)', () => {
        const validInput = { env_name: TEST_ENV_NAME };
        const result = envRollbackSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should validate rollback with target deployment_id', () => {
        const validInput = {
          env_name: TEST_ENV_NAME,
          deployment_id: TEST_DEPLOYMENT_ID,
        };
        const result = envRollbackSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should validate rollback with project_id', () => {
        const validInput = {
          env_name: TEST_ENV_NAME,
          project_id: TEST_PROJECT_ID,
        };
        const result = envRollbackSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject missing env_name', () => {
        const result = envRollbackSchema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('should reject invalid deployment_id format', () => {
        const invalidInput = {
          env_name: TEST_ENV_NAME,
          deployment_id: 'not-a-uuid',
        };
        const result = envRollbackSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('envDeploymentHistorySchema', () => {
      it('should validate minimal history query', () => {
        const validInput = { env_name: TEST_ENV_NAME };
        const result = envDeploymentHistorySchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should validate history query with limit', () => {
        const validInput = {
          env_name: TEST_ENV_NAME,
          limit: 50,
        };
        const result = envDeploymentHistorySchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should validate history query with project_id', () => {
        const validInput = {
          env_name: TEST_ENV_NAME,
          project_id: TEST_PROJECT_ID,
        };
        const result = envDeploymentHistorySchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject missing env_name', () => {
        const result = envDeploymentHistorySchema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('should reject limit less than 1', () => {
        const invalidInput = { env_name: TEST_ENV_NAME, limit: 0 };
        const result = envDeploymentHistorySchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject limit greater than 100', () => {
        const invalidInput = { env_name: TEST_ENV_NAME, limit: 101 };
        const result = envDeploymentHistorySchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject non-numeric limit', () => {
        const invalidInput = { env_name: TEST_ENV_NAME, limit: 'many' };
        const result = envDeploymentHistorySchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('envGetLogsSchema', () => {
      it('should validate minimal logs query', () => {
        const validInput = { env_name: TEST_ENV_NAME };
        const result = envGetLogsSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should validate complete logs query with all parameters', () => {
        const validInput = {
          env_name: TEST_ENV_NAME,
          service: 'api',
          lines: 500,
          filter: 'ERROR',
          project_id: TEST_PROJECT_ID,
        };
        const result = envGetLogsSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject missing env_name', () => {
        const result = envGetLogsSchema.safeParse({ service: 'api' });
        expect(result.success).toBe(false);
      });

      it('should reject lines less than 1', () => {
        const invalidInput = { env_name: TEST_ENV_NAME, lines: 0 };
        const result = envGetLogsSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject lines greater than 5000', () => {
        const invalidInput = { env_name: TEST_ENV_NAME, lines: 5001 };
        const result = envGetLogsSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject non-numeric lines', () => {
        const invalidInput = { env_name: TEST_ENV_NAME, lines: 'all' };
        const result = envGetLogsSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject non-string service', () => {
        const invalidInput = { env_name: TEST_ENV_NAME, service: 123 };
        const result = envGetLogsSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject non-string filter', () => {
        const invalidInput = { env_name: TEST_ENV_NAME, filter: 123 };
        const result = envGetLogsSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('envHealthCheckSchema', () => {
      it('should validate health check with env_name only', () => {
        const validInput = { env_name: TEST_ENV_NAME };
        const result = envHealthCheckSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should validate health check with project_id', () => {
        const validInput = {
          env_name: TEST_ENV_NAME,
          project_id: TEST_PROJECT_ID,
        };
        const result = envHealthCheckSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should reject missing env_name', () => {
        const result = envHealthCheckSchema.safeParse({});
        expect(result.success).toBe(false);
      });
    });
  });

  // ========================================================================
  // envListHandler Tests
  // ========================================================================

  describe('envListHandler', () => {
    it('should return success with environment list for current project', async () => {
      // Setup
      mockEnvManager.listEnvironments.mockResolvedValue(TEST_ENVIRONMENTS);

      // Execute
      const result = await envListHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        {}
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].name).toBe(TEST_ENV_NAME);
        expect(result.data[1].name).toBe('staging');
      }
      expect(mockEnvManager.listEnvironments).toHaveBeenCalledWith(undefined);
    });

    it('should return success with environment list for specified project', async () => {
      // Setup
      mockEnvManager.listEnvironments.mockResolvedValue(TEST_ENVIRONMENTS);

      // Execute
      const result = await envListHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { project_id: TEST_PROJECT_ID }
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
      }
      expect(mockEnvManager.listEnvironments).toHaveBeenCalledWith(TEST_PROJECT_ID);
    });

    it('should return empty array when no environments exist', async () => {
      // Setup
      mockEnvManager.listEnvironments.mockResolvedValue([]);

      // Execute
      const result = await envListHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { project_id: TEST_PROJECT_ID }
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });

    it('should return error when validation fails (invalid project_id)', async () => {
      // Execute
      const result = await envListHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { project_id: 'invalid-uuid' }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('env_list');
        expect(result.error).toContain('参数校验失败');
      }
      expect(mockEnvManager.listEnvironments).not.toHaveBeenCalled();
    });

    it('should return error when manager throws an error', async () => {
      // Setup
      const errorMessage = 'Database connection failed';
      mockEnvManager.listEnvironments.mockRejectedValue(new Error(errorMessage));

      // Execute
      const result = await envListHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { project_id: TEST_PROJECT_ID }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });

    it('should handle non-Error throw values gracefully', async () => {
      // Setup
      mockEnvManager.listEnvironments.mockRejectedValue('String error');

      // Execute
      const result = await envListHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { project_id: TEST_PROJECT_ID }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('String error');
      }
    });
  });

  // ========================================================================
  // envCreateHandler Tests
  // ========================================================================

  describe('envCreateHandler', () => {
    it('should return success when environment is created', async () => {
      // Setup
      const mockResult = { env_name: TEST_ENV_NAME, created: true };
      mockEnvManager.createEnvironment.mockResolvedValue(mockResult);

      // Execute
      const result = await envCreateHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        {
          name: TEST_ENV_NAME,
          servers: TEST_SERVERS,
        }
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.env_name).toBe(TEST_ENV_NAME);
        expect(result.data.created).toBe(true);
      }
      expect(mockEnvManager.createEnvironment).toHaveBeenCalledWith(
        TEST_ENV_NAME,
        TEST_SERVERS,
        undefined,
        undefined
      );
    });

    it('should pass all parameters including project_id and config to manager', async () => {
      // Setup
      const config = { buildCommand: 'npm run build', deployScript: './deploy.sh' };
      mockEnvManager.createEnvironment.mockResolvedValue({
        env_name: TEST_ENV_NAME,
        created: true,
      });

      // Execute
      const result = await envCreateHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        {
          name: TEST_ENV_NAME,
          servers: TEST_SERVERS,
          project_id: TEST_PROJECT_ID,
          config,
        }
      );

      // Verify
      expect(result.success).toBe(true);
      expect(mockEnvManager.createEnvironment).toHaveBeenCalledWith(
        TEST_ENV_NAME,
        TEST_SERVERS,
        TEST_PROJECT_ID,
        config
      );
    });

    it('should return error when name is missing', async () => {
      // Execute
      const result = await envCreateHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { servers: TEST_SERVERS } as { name: string; servers: SSHServer[] }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('env_create');
        expect(result.error).toContain('参数校验失败');
      }
      expect(mockEnvManager.createEnvironment).not.toHaveBeenCalled();
    });

    it('should return error when servers is missing', async () => {
      // Execute
      const result = await envCreateHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { name: TEST_ENV_NAME } as { name: string; servers: SSHServer[] }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('env_create');
      }
      expect(mockEnvManager.createEnvironment).not.toHaveBeenCalled();
    });

    it('should return error when servers array is empty', async () => {
      // Execute
      const result = await envCreateHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { name: TEST_ENV_NAME, servers: [] }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('至少需要配置一台服务器');
      }
      expect(mockEnvManager.createEnvironment).not.toHaveBeenCalled();
    });

    it('should return error when server configuration is invalid', async () => {
      // Execute
      const result = await envCreateHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        {
          name: TEST_ENV_NAME,
          servers: [{ host: '', port: 22, username: 'deploy', privateKeyPath: '/path' }],
        }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('主机地址');
      }
      expect(mockEnvManager.createEnvironment).not.toHaveBeenCalled();
    });

    it('should return error when environment already exists', async () => {
      // Setup
      const errorMessage = `环境 "${TEST_ENV_NAME}" 已存在`;
      mockEnvManager.createEnvironment.mockRejectedValue(new Error(errorMessage));

      // Execute
      const result = await envCreateHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        {
          name: TEST_ENV_NAME,
          servers: TEST_SERVERS,
        }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });

    it('should return error when project_id is invalid', async () => {
      // Execute
      const result = await envCreateHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        {
          name: TEST_ENV_NAME,
          servers: TEST_SERVERS,
          project_id: 'invalid-uuid',
        }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('UUID');
      }
      expect(mockEnvManager.createEnvironment).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // envInfoHandler Tests
  // ========================================================================

  describe('envInfoHandler', () => {
    it('should return success with environment details', async () => {
      // Setup
      const mockResult = {
        ...TEST_ENVIRONMENTS[0],
        current_deployment: TEST_DEPLOYMENTS[0],
        status: 'running',
      };
      mockEnvManager.getEnvironmentInfo.mockResolvedValue(mockResult);

      // Execute
      const result = await envInfoHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME }
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe(TEST_ENV_NAME);
        expect(result.data.status).toBe('running');
        expect(result.data.current_deployment).toBeDefined();
        expect(result.data.current_deployment?.branch).toBe('main');
      }
      expect(mockEnvManager.getEnvironmentInfo).toHaveBeenCalledWith(
        TEST_ENV_NAME,
        undefined
      );
    });

    it('should pass project_id to manager when provided', async () => {
      // Setup
      mockEnvManager.getEnvironmentInfo.mockResolvedValue({
        ...TEST_ENVIRONMENTS[0],
        status: 'idle',
      });

      // Execute
      const result = await envInfoHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME, project_id: TEST_PROJECT_ID }
      );

      // Verify
      expect(result.success).toBe(true);
      expect(mockEnvManager.getEnvironmentInfo).toHaveBeenCalledWith(
        TEST_ENV_NAME,
        TEST_PROJECT_ID
      );
    });

    it('should return environment without current deployment when none exists', async () => {
      // Setup
      mockEnvManager.getEnvironmentInfo.mockResolvedValue({
        ...TEST_ENVIRONMENTS[0],
        status: 'idle',
      });

      // Execute
      const result = await envInfoHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME }
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.current_deployment).toBeUndefined();
        expect(result.data.status).toBe('idle');
      }
    });

    it('should return error when env_name is missing', async () => {
      // Execute
      const result = await envInfoHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        {} as { env_name: string }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('env_info');
        expect(result.error).toContain('参数校验失败');
      }
      expect(mockEnvManager.getEnvironmentInfo).not.toHaveBeenCalled();
    });

    it('should return error when environment does not exist', async () => {
      // Setup
      const errorMessage = `环境 "nonexistent" 不存在`;
      mockEnvManager.getEnvironmentInfo.mockRejectedValue(new Error(errorMessage));

      // Execute
      const result = await envInfoHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: 'nonexistent' }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });

    it('should return error when project_id is invalid', async () => {
      // Execute
      const result = await envInfoHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME, project_id: 'invalid-uuid' }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('UUID');
      }
      expect(mockEnvManager.getEnvironmentInfo).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // envDeployHandler Tests
  // ========================================================================

  describe('envDeployHandler', () => {
    const mockHealthCheck = { healthy: true, details: {} };

    it('should return success with deployment details', async () => {
      // Setup
      const mockResult = {
        deployment_id: TEST_DEPLOYMENT_ID,
        status: 'success' as const,
        health_check_result: mockHealthCheck,
      };
      mockEnvManager.deployEnvironment.mockResolvedValue(mockResult);

      // Execute
      const result = await envDeployHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME, branch: 'main' }
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deployment_id).toBe(TEST_DEPLOYMENT_ID);
        expect(result.data.status).toBe('success');
        expect(result.data.health_check_result.healthy).toBe(true);
      }
      expect(mockEnvManager.deployEnvironment).toHaveBeenCalledWith(
        TEST_ENV_NAME,
        'main',
        undefined,
        undefined
      );
    });

    it('should pass force option to manager when true', async () => {
      // Setup
      mockEnvManager.deployEnvironment.mockResolvedValue({
        deployment_id: TEST_DEPLOYMENT_ID,
        status: 'success' as const,
        health_check_result: mockHealthCheck,
      });

      // Execute
      const result = await envDeployHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME, branch: 'feature/test', force: true }
      );

      // Verify
      expect(result.success).toBe(true);
      expect(mockEnvManager.deployEnvironment).toHaveBeenCalledWith(
        TEST_ENV_NAME,
        'feature/test',
        undefined,
        true
      );
    });

    it('should pass all parameters including project_id to manager', async () => {
      // Setup
      mockEnvManager.deployEnvironment.mockResolvedValue({
        deployment_id: TEST_DEPLOYMENT_ID,
        status: 'deploying' as const,
        health_check_result: mockHealthCheck,
      });

      // Execute
      const result = await envDeployHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        {
          env_name: TEST_ENV_NAME,
          branch: 'hotfix/security',
          project_id: TEST_PROJECT_ID,
          force: false,
        }
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('deploying');
      }
      expect(mockEnvManager.deployEnvironment).toHaveBeenCalledWith(
        TEST_ENV_NAME,
        'hotfix/security',
        TEST_PROJECT_ID,
        false
      );
    });

    it('should return error when env_name is missing', async () => {
      // Execute
      const result = await envDeployHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { branch: 'main' } as { env_name: string; branch: string }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('env_deploy');
        expect(result.error).toContain('参数校验失败');
      }
      expect(mockEnvManager.deployEnvironment).not.toHaveBeenCalled();
    });

    it('should return error when branch is missing', async () => {
      // Execute
      const result = await envDeployHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME } as { env_name: string; branch: string }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('分支名称');
      }
      expect(mockEnvManager.deployEnvironment).not.toHaveBeenCalled();
    });

    it('should return error when deployment fails', async () => {
      // Setup
      const errorMessage = '构建失败: npm run build exited with code 1';
      mockEnvManager.deployEnvironment.mockRejectedValue(new Error(errorMessage));

      // Execute
      const result = await envDeployHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME, branch: 'main' }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });

    it('should return error when health check fails during deployment', async () => {
      // Setup
      const errorMessage = '健康检查失败: 服务未响应';
      mockEnvManager.deployEnvironment.mockRejectedValue(new Error(errorMessage));

      // Execute
      const result = await envDeployHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME, branch: 'main' }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });

    it('should return error when project_id is invalid', async () => {
      // Execute
      const result = await envDeployHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME, branch: 'main', project_id: 'invalid-uuid' }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('UUID');
      }
      expect(mockEnvManager.deployEnvironment).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // envRollbackHandler Tests
  // ========================================================================

  describe('envRollbackHandler', () => {
    it('should return success when auto rollback (to previous version)', async () => {
      // Setup
      const mockResult = {
        deployment_id: TEST_DEPLOYMENT_ID,
        status: 'success' as const,
      };
      mockEnvManager.rollbackDeployment.mockResolvedValue(mockResult);

      // Execute
      const result = await envRollbackHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME }
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deployment_id).toBe(TEST_DEPLOYMENT_ID);
        expect(result.data.status).toBe('success');
      }
      expect(mockEnvManager.rollbackDeployment).toHaveBeenCalledWith(
        TEST_ENV_NAME,
        undefined,
        undefined
      );
    });

    it('should return success when rolling back to specific deployment_id', async () => {
      // Setup
      const targetDeploymentId = '111e2222-e33b-444d-f555-666614174999';
      mockEnvManager.rollbackDeployment.mockResolvedValue({
        deployment_id: targetDeploymentId,
        status: 'pending' as const,
      });

      // Execute
      const result = await envRollbackHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME, deployment_id: targetDeploymentId }
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deployment_id).toBe(targetDeploymentId);
        expect(result.data.status).toBe('pending');
      }
      expect(mockEnvManager.rollbackDeployment).toHaveBeenCalledWith(
        TEST_ENV_NAME,
        targetDeploymentId,
        undefined
      );
    });

    it('should pass project_id to manager when provided', async () => {
      // Setup
      mockEnvManager.rollbackDeployment.mockResolvedValue({
        deployment_id: TEST_DEPLOYMENT_ID,
        status: 'success' as const,
      });

      // Execute
      const result = await envRollbackHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME, project_id: TEST_PROJECT_ID }
      );

      // Verify
      expect(result.success).toBe(true);
      expect(mockEnvManager.rollbackDeployment).toHaveBeenCalledWith(
        TEST_ENV_NAME,
        undefined,
        TEST_PROJECT_ID
      );
    });

    it('should return error when env_name is missing', async () => {
      // Execute
      const result = await envRollbackHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        {} as { env_name: string }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('env_rollback');
        expect(result.error).toContain('参数校验失败');
      }
      expect(mockEnvManager.rollbackDeployment).not.toHaveBeenCalled();
    });

    it('should return error when no previous versions exist', async () => {
      // Setup
      const errorMessage = '没有可回滚的历史版本';
      mockEnvManager.rollbackDeployment.mockRejectedValue(new Error(errorMessage));

      // Execute
      const result = await envRollbackHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });

    it('should return error when target deployment does not exist', async () => {
      // Setup
      const errorMessage = '指定的部署记录不存在';
      mockEnvManager.rollbackDeployment.mockRejectedValue(new Error(errorMessage));
      const validButNonexistentId = '11112222-3333-4444-5555-666666666666';

      // Execute
      const result = await envRollbackHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME, deployment_id: validButNonexistentId }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });

    it('should return error when target deployment is not successful', async () => {
      // Setup
      const errorMessage = '只能回滚到成功的部署版本';
      mockEnvManager.rollbackDeployment.mockRejectedValue(new Error(errorMessage));

      // Execute
      const result = await envRollbackHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME, deployment_id: TEST_DEPLOYMENT_ID }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });

    it('should return error when deployment_id format is invalid', async () => {
      // Execute
      const result = await envRollbackHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME, deployment_id: 'invalid-uuid' }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('UUID');
      }
      expect(mockEnvManager.rollbackDeployment).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // envDeploymentHistoryHandler Tests
  // ========================================================================

  describe('envDeploymentHistoryHandler', () => {
    it('should return success with deployment history', async () => {
      // Setup
      mockEnvManager.getDeploymentHistory.mockResolvedValue(TEST_DEPLOYMENTS);

      // Execute
      const result = await envDeploymentHistoryHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME }
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].branch).toBe('main');
        expect(result.data[0].status).toBe('success');
      }
      expect(mockEnvManager.getDeploymentHistory).toHaveBeenCalledWith(
        TEST_ENV_NAME,
        undefined,
        undefined
      );
    });

    it('should pass limit parameter to manager', async () => {
      // Setup
      const manyDeployments = [...TEST_DEPLOYMENTS, ...TEST_DEPLOYMENTS];
      mockEnvManager.getDeploymentHistory.mockResolvedValue(manyDeployments);

      // Execute
      const result = await envDeploymentHistoryHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME, limit: 50 }
      );

      // Verify
      expect(result.success).toBe(true);
      expect(mockEnvManager.getDeploymentHistory).toHaveBeenCalledWith(
        TEST_ENV_NAME,
        undefined,
        50
      );
    });

    it('should pass project_id parameter to manager', async () => {
      // Setup
      mockEnvManager.getDeploymentHistory.mockResolvedValue(TEST_DEPLOYMENTS);

      // Execute
      const result = await envDeploymentHistoryHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME, project_id: TEST_PROJECT_ID }
      );

      // Verify
      expect(result.success).toBe(true);
      expect(mockEnvManager.getDeploymentHistory).toHaveBeenCalledWith(
        TEST_ENV_NAME,
        TEST_PROJECT_ID,
        undefined
      );
    });

    it('should return empty array when no deployments exist', async () => {
      // Setup
      mockEnvManager.getDeploymentHistory.mockResolvedValue([]);

      // Execute
      const result = await envDeploymentHistoryHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME }
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
    });

    it('should return error when env_name is missing', async () => {
      // Execute
      const result = await envDeploymentHistoryHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        {} as { env_name: string }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('env_deployment_history');
        expect(result.error).toContain('参数校验失败');
      }
      expect(mockEnvManager.getDeploymentHistory).not.toHaveBeenCalled();
    });

    it('should return error when limit is out of range', async () => {
      // Execute
      const result = await envDeploymentHistoryHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME, limit: 101 }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('limit');
      }
      expect(mockEnvManager.getDeploymentHistory).not.toHaveBeenCalled();
    });

    it('should return error when manager throws an error', async () => {
      // Setup
      const errorMessage = 'Database query failed';
      mockEnvManager.getDeploymentHistory.mockRejectedValue(new Error(errorMessage));

      // Execute
      const result = await envDeploymentHistoryHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });
  });

  // ========================================================================
  // envGetLogsHandler Tests
  // ========================================================================

  describe('envGetLogsHandler', () => {
    const mockLogLines = ['[INFO] Server started', '[ERROR] Connection failed', '[INFO] Request processed'];

    it('should return success with log lines', async () => {
      // Setup
      mockEnvManager.getEnvironmentLogs.mockResolvedValue({ log_lines: mockLogLines });

      // Execute
      const result = await envGetLogsHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME }
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.log_lines).toHaveLength(3);
        expect(result.data.log_lines).toContain('[ERROR] Connection failed');
      }
      expect(mockEnvManager.getEnvironmentLogs).toHaveBeenCalledWith(
        TEST_ENV_NAME,
        undefined,
        100, // default value
        undefined,
        undefined
      );
    });

    it('should pass service parameter to manager', async () => {
      // Setup
      mockEnvManager.getEnvironmentLogs.mockResolvedValue({ log_lines: mockLogLines });

      // Execute
      const result = await envGetLogsHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME, service: 'api-server' }
      );

      // Verify
      expect(result.success).toBe(true);
      expect(mockEnvManager.getEnvironmentLogs).toHaveBeenCalledWith(
        TEST_ENV_NAME,
        'api-server',
        100, // default value
        undefined,
        undefined
      );
    });

    it('should pass lines parameter to manager', async () => {
      // Setup
      mockEnvManager.getEnvironmentLogs.mockResolvedValue({ log_lines: mockLogLines });

      // Execute
      const result = await envGetLogsHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME, lines: 500 }
      );

      // Verify
      expect(result.success).toBe(true);
      expect(mockEnvManager.getEnvironmentLogs).toHaveBeenCalledWith(
        TEST_ENV_NAME,
        undefined,
        500,
        undefined,
        undefined
      );
    });

    it('should pass filter parameter to manager', async () => {
      // Setup
      mockEnvManager.getEnvironmentLogs.mockResolvedValue({ log_lines: mockLogLines });

      // Execute
      const result = await envGetLogsHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME, filter: 'ERROR' }
      );

      // Verify
      expect(result.success).toBe(true);
      expect(mockEnvManager.getEnvironmentLogs).toHaveBeenCalledWith(
        TEST_ENV_NAME,
        undefined,
        100, // default value
        'ERROR',
        undefined
      );
    });

    it('should pass all parameters including project_id to manager', async () => {
      // Setup
      mockEnvManager.getEnvironmentLogs.mockResolvedValue({ log_lines: mockLogLines });

      // Execute
      const result = await envGetLogsHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        {
          env_name: TEST_ENV_NAME,
          service: 'worker',
          lines: 200,
          filter: 'WARN',
          project_id: TEST_PROJECT_ID,
        }
      );

      // Verify
      expect(result.success).toBe(true);
      expect(mockEnvManager.getEnvironmentLogs).toHaveBeenCalledWith(
        TEST_ENV_NAME,
        'worker',
        200,
        'WARN',
        TEST_PROJECT_ID
      );
    });

    it('should return empty log_lines when no logs are available', async () => {
      // Setup
      mockEnvManager.getEnvironmentLogs.mockResolvedValue({ log_lines: [] });

      // Execute
      const result = await envGetLogsHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME }
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.log_lines).toHaveLength(0);
      }
    });

    it('should return error when env_name is missing', async () => {
      // Execute
      const result = await envGetLogsHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        {} as { env_name: string }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('env_get_logs');
        expect(result.error).toContain('参数校验失败');
      }
      expect(mockEnvManager.getEnvironmentLogs).not.toHaveBeenCalled();
    });

    it('should return error when lines is out of range', async () => {
      // Execute
      const result = await envGetLogsHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME, lines: 5001 }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('lines');
      }
      expect(mockEnvManager.getEnvironmentLogs).not.toHaveBeenCalled();
    });

    it('should return error when manager throws an error', async () => {
      // Setup
      const errorMessage = 'SSH connection to server failed';
      mockEnvManager.getEnvironmentLogs.mockRejectedValue(new Error(errorMessage));

      // Execute
      const result = await envGetLogsHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });
  });

  // ========================================================================
  // envHealthCheckHandler Tests
  // ========================================================================

  describe('envHealthCheckHandler', () => {
    it('should return success with healthy=true when all servers are healthy', async () => {
      // Setup
      const mockDetails = {
        totalServers: 1,
        healthyServers: 1,
        message: '所有服务器健康检查通过',
        servers: [{ host: '192.168.1.1', reachable: true, responseTime: 45 }],
      };
      const mockResult = {
        healthy: true,
        details: mockDetails,
      };
      mockEnvManager.checkEnvironmentHealth.mockResolvedValue(mockResult);

      // Execute
      const result = await envHealthCheckHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME }
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.healthy).toBe(true);
        const details = result.data.details as typeof mockDetails;
        expect(details.totalServers).toBe(1);
        expect(details.healthyServers).toBe(1);
      }
      expect(mockEnvManager.checkEnvironmentHealth).toHaveBeenCalledWith(
        TEST_ENV_NAME,
        undefined
      );
    });

    it('should return success with healthy=false when servers are unhealthy', async () => {
      // Setup
      const mockDetails = {
        totalServers: 2,
        healthyServers: 1,
        message: '1 台服务器健康检查失败',
        servers: [
          { host: '192.168.1.1', reachable: true, serviceRunning: true, responseTime: 45 },
          { host: '192.168.1.2', reachable: false, error: 'Connection refused', responseTime: 5000 },
        ],
      };
      const mockResult = {
        healthy: false,
        details: mockDetails,
      };
      mockEnvManager.checkEnvironmentHealth.mockResolvedValue(mockResult);

      // Execute
      const result = await envHealthCheckHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME }
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.healthy).toBe(false);
        const details = result.data.details as typeof mockDetails;
        expect(details.totalServers).toBe(2);
        expect(details.healthyServers).toBe(1);
      }
    });

    it('should pass project_id to manager when provided', async () => {
      // Setup
      mockEnvManager.checkEnvironmentHealth.mockResolvedValue({
        healthy: true,
        details: {},
      });

      // Execute
      const result = await envHealthCheckHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME, project_id: TEST_PROJECT_ID }
      );

      // Verify
      expect(result.success).toBe(true);
      expect(mockEnvManager.checkEnvironmentHealth).toHaveBeenCalledWith(
        TEST_ENV_NAME,
        TEST_PROJECT_ID
      );
    });

    it('should return error when env_name is missing', async () => {
      // Execute
      const result = await envHealthCheckHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        {} as { env_name: string }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('env_health_check');
        expect(result.error).toContain('参数校验失败');
      }
      expect(mockEnvManager.checkEnvironmentHealth).not.toHaveBeenCalled();
    });

    it('should return error when environment does not exist', async () => {
      // Setup
      const errorMessage = `环境 "nonexistent" 不存在`;
      mockEnvManager.checkEnvironmentHealth.mockRejectedValue(new Error(errorMessage));

      // Execute
      const result = await envHealthCheckHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: 'nonexistent' }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });

    it('should return error when project_id is invalid', async () => {
      // Execute
      const result = await envHealthCheckHandler(
        mockEnvManager as unknown as EnvManager,
        mockProjectManager,
        { env_name: TEST_ENV_NAME, project_id: 'invalid-uuid' }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('UUID');
      }
      expect(mockEnvManager.checkEnvironmentHealth).not.toHaveBeenCalled();
    });
  });
});
