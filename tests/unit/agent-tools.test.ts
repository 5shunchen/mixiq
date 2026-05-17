import {
  agentCreateHandler,
  agentListHandler,
  agentInfoHandler,
  agentSwitchHandler,
  agentDeleteHandler,
  agentSetContextHandler,
  agentGetContextHandler,
  agentGetToolsHandler,
  agentGetHistoryHandler,
  agentCreateSchema,
  agentListSchema,
  agentInfoSchema,
  agentSwitchSchema,
  agentDeleteSchema,
  agentSetContextSchema,
  agentGetContextSchema,
  agentGetToolsSchema,
  agentGetHistorySchema,
} from '../../src/tools/agent-tools';
import type { AgentManager } from '../../src/managers/agent-manager';
import type { ProjectManager } from '../../src/managers/project-manager';
import type { AgentInstance, Message, Context } from '../../src/types';

// Mock AgentManager
const mockAgentManager = {
  createAgent: jest.fn(),
  listAgents: jest.fn(),
  getAgent: jest.fn(),
  switchAgent: jest.fn(),
  deleteAgent: jest.fn(),
  setContext: jest.fn(),
  getContext: jest.fn(),
  getHistory: jest.fn(),
  getAvailableTools: jest.fn(),
};

// Mock ProjectManager (only needed for agent_create)
const mockProjectManager = {};

const TEST_PROJECT_ID = '123e4567-e89b-12d3-a456-426614174000';
const TEST_AGENT_ID = '223e4567-e89b-12d3-a456-426614174001';

describe('Agent Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // Schema Validation Tests
  // ============================================================================

  describe('Schema Validation', () => {
    describe('agentCreateSchema', () => {
      it('应该验证有效的创建参数', () => {
        const validInput = {
          project_id: TEST_PROJECT_ID,
          agent_type: 'my-assistant',
        };
        const result = agentCreateSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('应该接受可选的 allowed_tools 和 config 参数', () => {
        const validInput = {
          project_id: TEST_PROJECT_ID,
          agent_type: 'my-assistant',
          allowed_tools: ['tool1', 'tool2'],
          config: { maxHistoryLength: 500, timeout: 30000 },
        };
        const result = agentCreateSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('应该拒绝空的 agent_type', () => {
        const invalidInput = { project_id: TEST_PROJECT_ID, agent_type: '' };
        const result = agentCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('应该拒绝超过长度限制的 agent_type', () => {
        const invalidInput = {
          project_id: TEST_PROJECT_ID,
          agent_type: 'a'.repeat(60), // 超过 50 字符限制
        };
        const result = agentCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('应该拒绝无效的 UUID 格式的 project_id', () => {
        const invalidInput = { project_id: 'invalid-uuid', agent_type: 'test' };
        const result = agentCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('应该拒绝非数组类型的 allowed_tools', () => {
        const invalidInput = {
          project_id: TEST_PROJECT_ID,
          agent_type: 'test',
          allowed_tools: 'not-an-array',
        };
        const result = agentCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('应该拒绝非对象类型的 config', () => {
        const invalidInput = {
          project_id: TEST_PROJECT_ID,
          agent_type: 'test',
          config: 'not-an-object',
        };
        const result = agentCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('应该拒绝缺少必填字段的输入', () => {
        const invalidInput = { agent_type: 'test' }; // 缺少 project_id
        const result = agentCreateSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('agentListSchema', () => {
      it('应该验证有效的 project_id', () => {
        const validInput = { project_id: TEST_PROJECT_ID };
        const result = agentListSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('应该拒绝无效的 UUID 格式', () => {
        const invalidInput = { project_id: 'invalid-uuid' };
        const result = agentListSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('应该拒绝空的 project_id', () => {
        const invalidInput = { project_id: '' };
        const result = agentListSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('应该拒绝缺少 project_id 的输入', () => {
        const invalidInput = {};
        const result = agentListSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('agentInfoSchema', () => {
      it('应该验证有效的 agent_id', () => {
        const validInput = { agent_id: TEST_AGENT_ID };
        const result = agentInfoSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('应该拒绝无效的 UUID 格式', () => {
        const invalidInput = { agent_id: 'invalid-uuid' };
        const result = agentInfoSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('应该拒绝缺少 agent_id 的输入', () => {
        const invalidInput = {};
        const result = agentInfoSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('agentSwitchSchema', () => {
      it('应该验证有效的 agent_id', () => {
        const validInput = { agent_id: TEST_AGENT_ID };
        const result = agentSwitchSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('应该拒绝无效的 UUID 格式', () => {
        const invalidInput = { agent_id: 'invalid-uuid' };
        const result = agentSwitchSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('应该拒绝缺少 agent_id 的输入', () => {
        const invalidInput = {};
        const result = agentSwitchSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('agentDeleteSchema', () => {
      it('应该验证有效的 agent_id', () => {
        const validInput = { agent_id: TEST_AGENT_ID };
        const result = agentDeleteSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('应该拒绝无效的 UUID 格式', () => {
        const invalidInput = { agent_id: 'invalid-uuid' };
        const result = agentDeleteSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('agentSetContextSchema', () => {
      it('应该验证有效的设置上下文参数', () => {
        const validInput = {
          agent_id: TEST_AGENT_ID,
          key: 'currentTask',
          value: 'test-task',
        };
        const result = agentSetContextSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('应该支持字符串类型的 value', () => {
        const input = { agent_id: TEST_AGENT_ID, key: 'strKey', value: 'stringValue' };
        const result = agentSetContextSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('应该支持数字类型的 value', () => {
        const input = { agent_id: TEST_AGENT_ID, key: 'numKey', value: 42 };
        const result = agentSetContextSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('应该支持对象类型的 value', () => {
        const input = { agent_id: TEST_AGENT_ID, key: 'objKey', value: { nested: 'value' } };
        const result = agentSetContextSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('应该支持数组类型的 value', () => {
        const input = { agent_id: TEST_AGENT_ID, key: 'arrKey', value: [1, 2, 3] };
        const result = agentSetContextSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('应该支持布尔类型的 value', () => {
        const input = { agent_id: TEST_AGENT_ID, key: 'boolKey', value: true };
        const result = agentSetContextSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('应该支持 null 值的 value', () => {
        const input = { agent_id: TEST_AGENT_ID, key: 'nullKey', value: null };
        const result = agentSetContextSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('应该拒绝空的 key', () => {
        const invalidInput = { agent_id: TEST_AGENT_ID, key: '', value: 'test' };
        const result = agentSetContextSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('应该拒绝超过长度限制的 key', () => {
        const invalidInput = {
          agent_id: TEST_AGENT_ID,
          key: 'k'.repeat(150), // 超过 100 字符限制
          value: 'test',
        };
        const result = agentSetContextSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('应该拒绝缺少 key 的输入', () => {
        const invalidInput = { agent_id: TEST_AGENT_ID, value: 'test' };
        const result = agentSetContextSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('应该接受 undefined 作为 value 的值', () => {
        const input = { agent_id: TEST_AGENT_ID, key: 'testKey', value: undefined };
        const result = agentSetContextSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    describe('agentGetContextSchema', () => {
      it('应该验证只有 agent_id 的输入', () => {
        const validInput = { agent_id: TEST_AGENT_ID };
        const result = agentGetContextSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('应该验证带可选 key 的输入', () => {
        const validInput = { agent_id: TEST_AGENT_ID, key: 'currentTask' };
        const result = agentGetContextSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('应该拒绝无效的 UUID 格式', () => {
        const invalidInput = { agent_id: 'invalid-uuid' };
        const result = agentGetContextSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('agentGetToolsSchema', () => {
      it('应该验证有效的 agent_id', () => {
        const validInput = { agent_id: TEST_AGENT_ID };
        const result = agentGetToolsSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('应该拒绝无效的 UUID 格式', () => {
        const invalidInput = { agent_id: 'invalid-uuid' };
        const result = agentGetToolsSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('agentGetHistorySchema', () => {
      it('应该验证只有 agent_id 的输入', () => {
        const validInput = { agent_id: TEST_AGENT_ID };
        const result = agentGetHistorySchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('应该验证带 limit 参数的输入', () => {
        const validInput = { agent_id: TEST_AGENT_ID, limit: 50 };
        const result = agentGetHistorySchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('应该拒绝非整数的 limit', () => {
        const invalidInput = { agent_id: TEST_AGENT_ID, limit: 50.5 };
        const result = agentGetHistorySchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('应该拒绝小于 1 的 limit', () => {
        const invalidInput = { agent_id: TEST_AGENT_ID, limit: 0 };
        const result = agentGetHistorySchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('应该拒绝大于 1000 的 limit', () => {
        const invalidInput = { agent_id: TEST_AGENT_ID, limit: 1500 };
        const result = agentGetHistorySchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('应该拒绝非数字类型的 limit', () => {
        const invalidInput = { agent_id: TEST_AGENT_ID, limit: '50' };
        const result = agentGetHistorySchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });
  });

  // ============================================================================
  // agentCreateHandler Tests
  // ============================================================================

  describe('agentCreateHandler', () => {
    it('应该成功创建智能体并返回正确的数据', async () => {
      const mockResult = {
        agent_id: TEST_AGENT_ID,
        token: 'test-token-123456',
        status: 'inactive' as const,
      };
      mockAgentManager.createAgent.mockReturnValue(mockResult);

      const result = await agentCreateHandler(
        mockAgentManager as unknown as AgentManager,
        mockProjectManager as unknown as ProjectManager,
        {
          project_id: TEST_PROJECT_ID,
          agent_type: 'test-assistant',
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agent_id).toBe(TEST_AGENT_ID);
        expect(result.data.token).toBe('test-token-123456');
        expect(result.data.status).toBe('inactive');
      }
      expect(mockAgentManager.createAgent).toHaveBeenCalledWith(
        TEST_PROJECT_ID,
        'test-assistant',
        undefined,
        undefined
      );
    });

    it('应该传递 allowed_tools 参数给 createAgent', async () => {
      mockAgentManager.createAgent.mockReturnValue({
        agent_id: TEST_AGENT_ID,
        token: 'token',
        status: 'inactive',
      });

      await agentCreateHandler(
        mockAgentManager as unknown as AgentManager,
        mockProjectManager as unknown as ProjectManager,
        {
          project_id: TEST_PROJECT_ID,
          agent_type: 'test-assistant',
          allowed_tools: ['tool1', 'tool2', 'tool3'],
        }
      );

      expect(mockAgentManager.createAgent).toHaveBeenCalledWith(
        TEST_PROJECT_ID,
        'test-assistant',
        ['tool1', 'tool2', 'tool3'],
        undefined
      );
    });

    it('应该传递 config 参数给 createAgent', async () => {
      const config = {
        maxHistoryLength: 2000,
        timeout: 60000,
        metadata: { owner: 'test-user' },
      };
      mockAgentManager.createAgent.mockReturnValue({
        agent_id: TEST_AGENT_ID,
        token: 'token',
        status: 'inactive',
      });

      await agentCreateHandler(
        mockAgentManager as unknown as AgentManager,
        mockProjectManager as unknown as ProjectManager,
        {
          project_id: TEST_PROJECT_ID,
          agent_type: 'test-assistant',
          config,
        }
      );

      expect(mockAgentManager.createAgent).toHaveBeenCalledWith(
        TEST_PROJECT_ID,
        'test-assistant',
        undefined,
        config
      );
    });

    it('应该同时传递 allowed_tools 和 config 参数', async () => {
      mockAgentManager.createAgent.mockReturnValue({
        agent_id: TEST_AGENT_ID,
        token: 'token',
        status: 'inactive',
      });

      await agentCreateHandler(
        mockAgentManager as unknown as AgentManager,
        mockProjectManager as unknown as ProjectManager,
        {
          project_id: TEST_PROJECT_ID,
          agent_type: 'test-assistant',
          allowed_tools: ['tool1'],
          config: { maxHistoryLength: 500 },
        }
      );

      expect(mockAgentManager.createAgent).toHaveBeenCalledWith(
        TEST_PROJECT_ID,
        'test-assistant',
        ['tool1'],
        { maxHistoryLength: 500 }
      );
    });

    it('参数校验失败时应该返回错误', async () => {
      const result = await agentCreateHandler(
        mockAgentManager as unknown as AgentManager,
        mockProjectManager as unknown as ProjectManager,
        {
          project_id: 'invalid-uuid', // 无效的 UUID
          agent_type: 'test',
        }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('agent_create');
        expect(result.error).toContain('参数校验失败');
      }
      expect(mockAgentManager.createAgent).not.toHaveBeenCalled();
    });

    it('缺少必填字段时应该返回错误', async () => {
      const result = await agentCreateHandler(
        mockAgentManager as unknown as AgentManager,
        mockProjectManager as unknown as ProjectManager,
        {
          agent_type: 'test', // 缺少 project_id
        }
      );

      expect(result.success).toBe(false);
      expect(mockAgentManager.createAgent).not.toHaveBeenCalled();
    });

    it('createAgent 抛出错误时应该返回错误信息', async () => {
      const errorMessage = 'Database connection failed';
      mockAgentManager.createAgent.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      const result = await agentCreateHandler(
        mockAgentManager as unknown as AgentManager,
        mockProjectManager as unknown as ProjectManager,
        {
          project_id: TEST_PROJECT_ID,
          agent_type: 'test-assistant',
        }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });

    it('应该优雅地处理非 Error 类型的抛出值', async () => {
      mockAgentManager.createAgent.mockImplementation(() => {
        throw 'String error message';
      });

      const result = await agentCreateHandler(
        mockAgentManager as unknown as AgentManager,
        mockProjectManager as unknown as ProjectManager,
        {
          project_id: TEST_PROJECT_ID,
          agent_type: 'test-assistant',
        }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('String error message');
      }
    });
  });

  // ============================================================================
  // agentListHandler Tests
  // ============================================================================

  describe('agentListHandler', () => {
    it('应该成功列出项目下的所有智能体', async () => {
      const mockAgents: AgentInstance[] = [
        {
          id: TEST_AGENT_ID,
          project_id: TEST_PROJECT_ID,
          agent_type: 'agent-1',
          token: 'token1',
          allowed_tools: [],
          status: 'active',
          context: { conversationHistory: [], metadata: {} },
          history: [],
          audit_logs: [],
          config: {},
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: '323e4567-e89b-12d3-a456-426614174002',
          project_id: TEST_PROJECT_ID,
          agent_type: 'agent-2',
          token: 'token2',
          allowed_tools: ['tool1'],
          status: 'inactive',
          context: { conversationHistory: [], metadata: {} },
          history: [],
          audit_logs: [],
          config: {},
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];
      mockAgentManager.listAgents.mockReturnValue(mockAgents);

      const result = await agentListHandler(
        mockAgentManager as unknown as AgentManager,
        { project_id: TEST_PROJECT_ID }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].agent_type).toBe('agent-1');
        expect(result.data[1].agent_type).toBe('agent-2');
      }
      expect(mockAgentManager.listAgents).toHaveBeenCalledWith(TEST_PROJECT_ID);
    });

    it('项目没有智能体时应该返回空数组', async () => {
      mockAgentManager.listAgents.mockReturnValue([]);

      const result = await agentListHandler(
        mockAgentManager as unknown as AgentManager,
        { project_id: TEST_PROJECT_ID }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });

    it('参数校验失败时应该返回错误', async () => {
      const result = await agentListHandler(
        mockAgentManager as unknown as AgentManager,
        { project_id: 'invalid-uuid' }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('agent_list');
      }
      expect(mockAgentManager.listAgents).not.toHaveBeenCalled();
    });

    it('listAgents 抛出错误时应该返回错误信息', async () => {
      const errorMessage = 'Failed to query agents';
      mockAgentManager.listAgents.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      const result = await agentListHandler(
        mockAgentManager as unknown as AgentManager,
        { project_id: TEST_PROJECT_ID }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });
  });

  // ============================================================================
  // agentInfoHandler Tests
  // ============================================================================

  describe('agentInfoHandler', () => {
    it('应该成功获取智能体详情', async () => {
      const mockAgent: AgentInstance = {
        id: TEST_AGENT_ID,
        project_id: TEST_PROJECT_ID,
        agent_type: 'test-assistant',
        token: 'test-token',
        allowed_tools: ['tool1', 'tool2'],
        status: 'active',
        context: {
          conversationHistory: [],
          metadata: {},
          currentTask: 'test-task',
        },
        history: [],
        audit_logs: [],
        config: { maxHistoryLength: 1000 },
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockAgentManager.getAgent.mockReturnValue(mockAgent);

      const result = await agentInfoHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: TEST_AGENT_ID }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(TEST_AGENT_ID);
        expect(result.data.agent_type).toBe('test-assistant');
        expect(result.data.status).toBe('active');
        expect(result.data.allowed_tools).toEqual(['tool1', 'tool2']);
        expect(result.data.context.currentTask).toBe('test-task');
      }
      expect(mockAgentManager.getAgent).toHaveBeenCalledWith(TEST_AGENT_ID);
    });

    it('参数校验失败时应该返回错误', async () => {
      const result = await agentInfoHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: 'invalid-uuid' }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('agent_info');
      }
      expect(mockAgentManager.getAgent).not.toHaveBeenCalled();
    });

    it('智能体不存在时应该返回错误', async () => {
      const errorMessage = 'Agent not found';
      mockAgentManager.getAgent.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      const result = await agentInfoHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: TEST_AGENT_ID }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });
  });

  // ============================================================================
  // agentSwitchHandler Tests
  // ============================================================================

  describe('agentSwitchHandler', () => {
    it('应该成功切换智能体', async () => {
      const mockAgent: AgentInstance = {
        id: TEST_AGENT_ID,
        project_id: TEST_PROJECT_ID,
        agent_type: 'test-assistant',
        token: 'token',
        allowed_tools: [],
        status: 'active',
        context: { conversationHistory: [], metadata: {} },
        history: [],
        audit_logs: [],
        config: {},
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockAgentManager.switchAgent.mockImplementation(() => {});
      mockAgentManager.getAgent.mockReturnValue(mockAgent);

      const result = await agentSwitchHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: TEST_AGENT_ID }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agent_id).toBe(TEST_AGENT_ID);
        expect(result.data.status).toBe('active');
        expect(result.data.switched_at).toBeInstanceOf(Date);
      }
      expect(mockAgentManager.switchAgent).toHaveBeenCalledWith(TEST_AGENT_ID);
      expect(mockAgentManager.getAgent).toHaveBeenCalledWith(TEST_AGENT_ID);
    });

    it('参数校验失败时应该返回错误', async () => {
      const result = await agentSwitchHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: 'invalid-uuid' }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('agent_switch');
      }
      expect(mockAgentManager.switchAgent).not.toHaveBeenCalled();
    });

    it('切换不存在的智能体时应该返回错误', async () => {
      const errorMessage = 'Agent does not exist';
      mockAgentManager.switchAgent.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      const result = await agentSwitchHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: TEST_AGENT_ID }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });
  });

  // ============================================================================
  // agentDeleteHandler Tests
  // ============================================================================

  describe('agentDeleteHandler', () => {
    it('应该成功删除智能体', async () => {
      mockAgentManager.deleteAgent.mockReturnValue(true);

      const result = await agentDeleteHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: TEST_AGENT_ID }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agent_id).toBe(TEST_AGENT_ID);
        expect(result.data.deleted).toBe(true);
      }
      expect(mockAgentManager.deleteAgent).toHaveBeenCalledWith(TEST_AGENT_ID);
    });

    it('删除不存在的智能体时应该返回 deleted: false', async () => {
      mockAgentManager.deleteAgent.mockReturnValue(false);

      const result = await agentDeleteHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: TEST_AGENT_ID }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deleted).toBe(false);
      }
    });

    it('参数校验失败时应该返回错误', async () => {
      const result = await agentDeleteHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: 'invalid-uuid' }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('agent_delete');
      }
      expect(mockAgentManager.deleteAgent).not.toHaveBeenCalled();
    });

    it('deleteAgent 抛出错误时应该返回错误信息', async () => {
      const errorMessage = 'Database error during deletion';
      mockAgentManager.deleteAgent.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      const result = await agentDeleteHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: TEST_AGENT_ID }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });
  });

  // ============================================================================
  // agentSetContextHandler Tests
  // ============================================================================

  describe('agentSetContextHandler', () => {
    it('应该成功设置字符串类型的上下文值', async () => {
      mockAgentManager.setContext.mockImplementation(() => {});

      const result = await agentSetContextHandler(
        mockAgentManager as unknown as AgentManager,
        {
          agent_id: TEST_AGENT_ID,
          key: 'currentTask',
          value: 'test-task-value',
        }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.key).toBe('currentTask');
        expect(result.data.updated_at).toBeInstanceOf(Date);
      }
      expect(mockAgentManager.setContext).toHaveBeenCalledWith(
        TEST_AGENT_ID,
        'currentTask',
        'test-task-value'
      );
    });

    it('应该成功设置数字类型的上下文值', async () => {
      mockAgentManager.setContext.mockImplementation(() => {});

      const result = await agentSetContextHandler(
        mockAgentManager as unknown as AgentManager,
        {
          agent_id: TEST_AGENT_ID,
          key: 'retryCount',
          value: 3,
        }
      );

      expect(result.success).toBe(true);
      expect(mockAgentManager.setContext).toHaveBeenCalledWith(
        TEST_AGENT_ID,
        'retryCount',
        3
      );
    });

    it('应该成功设置对象类型的上下文值', async () => {
      const objectValue = {
        taskName: 'deploy',
        status: 'running',
        progress: 75,
      };
      mockAgentManager.setContext.mockImplementation(() => {});

      const result = await agentSetContextHandler(
        mockAgentManager as unknown as AgentManager,
        {
          agent_id: TEST_AGENT_ID,
          key: 'deployInfo',
          value: objectValue,
        }
      );

      expect(result.success).toBe(true);
      expect(mockAgentManager.setContext).toHaveBeenCalledWith(
        TEST_AGENT_ID,
        'deployInfo',
        objectValue
      );
    });

    it('应该成功设置布尔类型的上下文值', async () => {
      mockAgentManager.setContext.mockImplementation(() => {});

      const result = await agentSetContextHandler(
        mockAgentManager as unknown as AgentManager,
        {
          agent_id: TEST_AGENT_ID,
          key: 'isProcessing',
          value: true,
        }
      );

      expect(result.success).toBe(true);
      expect(mockAgentManager.setContext).toHaveBeenCalledWith(
        TEST_AGENT_ID,
        'isProcessing',
        true
      );
    });

    it('应该成功设置数组类型的上下文值', async () => {
      const arrayValue = ['item1', 'item2', 'item3'];
      mockAgentManager.setContext.mockImplementation(() => {});

      const result = await agentSetContextHandler(
        mockAgentManager as unknown as AgentManager,
        {
          agent_id: TEST_AGENT_ID,
          key: 'selectedItems',
          value: arrayValue,
        }
      );

      expect(result.success).toBe(true);
      expect(mockAgentManager.setContext).toHaveBeenCalledWith(
        TEST_AGENT_ID,
        'selectedItems',
        arrayValue
      );
    });

    it('应该成功设置 null 值的上下文', async () => {
      mockAgentManager.setContext.mockImplementation(() => {});

      const result = await agentSetContextHandler(
        mockAgentManager as unknown as AgentManager,
        {
          agent_id: TEST_AGENT_ID,
          key: 'nullValue',
          value: null,
        }
      );

      expect(result.success).toBe(true);
      expect(mockAgentManager.setContext).toHaveBeenCalledWith(
        TEST_AGENT_ID,
        'nullValue',
        null
      );
    });

    it('参数校验失败时应该返回错误', async () => {
      const result = await agentSetContextHandler(
        mockAgentManager as unknown as AgentManager,
        {
          agent_id: TEST_AGENT_ID,
          key: '', // 空 key
          value: 'test',
        }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('agent_set_context');
      }
      expect(mockAgentManager.setContext).not.toHaveBeenCalled();
    });

    it('setContext 抛出错误时应该返回错误信息', async () => {
      const errorMessage = 'Failed to set context';
      mockAgentManager.setContext.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      const result = await agentSetContextHandler(
        mockAgentManager as unknown as AgentManager,
        {
          agent_id: TEST_AGENT_ID,
          key: 'testKey',
          value: 'testValue',
        }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });
  });

  // ============================================================================
  // agentGetContextHandler Tests
  // ============================================================================

  describe('agentGetContextHandler', () => {
    it('应该成功获取全部上下文', async () => {
      const mockContext: Context = {
        conversationHistory: [],
        metadata: {},
        currentTask: 'deploy-service',
        workspaceState: { modifiedFiles: ['file1.ts', 'file2.ts'] },
      };
      mockAgentManager.getContext.mockReturnValue(mockContext);

      const result = await agentGetContextHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: TEST_AGENT_ID }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currentTask).toBe('deploy-service');
        expect(result.data.workspaceState).toEqual({
          modifiedFiles: ['file1.ts', 'file2.ts'],
        });
        expect(result.data.conversationHistory).toEqual([]);
      }
      expect(mockAgentManager.getContext).toHaveBeenCalledWith(TEST_AGENT_ID, undefined);
    });

    it('应该成功获取指定 key 的上下文值', async () => {
      mockAgentManager.getContext.mockReturnValue('deploy-service');

      const result = await agentGetContextHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: TEST_AGENT_ID, key: 'currentTask' }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ currentTask: 'deploy-service' });
      }
      expect(mockAgentManager.getContext).toHaveBeenCalledWith(TEST_AGENT_ID, 'currentTask');
    });

    it('key 不存在时应该返回 undefined', async () => {
      mockAgentManager.getContext.mockReturnValue(undefined);

      const result = await agentGetContextHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: TEST_AGENT_ID, key: 'nonExistentKey' }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ nonExistentKey: undefined });
      }
    });

    it('参数校验失败时应该返回错误', async () => {
      const result = await agentGetContextHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: 'invalid-uuid' }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('agent_get_context');
      }
      expect(mockAgentManager.getContext).not.toHaveBeenCalled();
    });

    it('getContext 抛出错误时应该返回错误信息', async () => {
      const errorMessage = 'Context retrieval failed';
      mockAgentManager.getContext.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      const result = await agentGetContextHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: TEST_AGENT_ID }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });
  });

  // ============================================================================
  // agentGetToolsHandler Tests
  // ============================================================================

  describe('agentGetToolsHandler', () => {
    it('应该成功获取可用工具列表', async () => {
      const mockAgent: AgentInstance = {
        id: TEST_AGENT_ID,
        project_id: TEST_PROJECT_ID,
        agent_type: 'test',
        token: 'token',
        allowed_tools: ['agent_create', 'agent_list', 'execute_command', 'git_status'],
        status: 'active',
        context: { conversationHistory: [], metadata: {} },
        history: [],
        audit_logs: [],
        config: {},
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockAgentManager.getAgent.mockReturnValue(mockAgent);

      const result = await agentGetToolsHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: TEST_AGENT_ID }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tools).toHaveLength(4);
        expect(result.data.tools).toContain('agent_create');
        expect(result.data.tools).toContain('execute_command');
      }
      expect(mockAgentManager.getAgent).toHaveBeenCalledWith(TEST_AGENT_ID);
    });

    it('智能体没有绑定工具时应该返回空数组', async () => {
      const mockAgent: AgentInstance = {
        id: TEST_AGENT_ID,
        project_id: TEST_PROJECT_ID,
        agent_type: 'test',
        token: 'token',
        allowed_tools: [],
        status: 'active',
        context: { conversationHistory: [], metadata: {} },
        history: [],
        audit_logs: [],
        config: {},
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockAgentManager.getAgent.mockReturnValue(mockAgent);

      const result = await agentGetToolsHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: TEST_AGENT_ID }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tools).toEqual([]);
      }
    });

    it('参数校验失败时应该返回错误', async () => {
      const result = await agentGetToolsHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: 'invalid-uuid' }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('agent_get_tools');
      }
      expect(mockAgentManager.getAgent).not.toHaveBeenCalled();
    });

    it('getAgent 抛出错误时应该返回错误信息', async () => {
      const errorMessage = 'Agent not found';
      mockAgentManager.getAgent.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      const result = await agentGetToolsHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: TEST_AGENT_ID }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });
  });

  // ============================================================================
  // agentGetHistoryHandler Tests
  // ============================================================================

  describe('agentGetHistoryHandler', () => {
    it('应该成功获取完整的对话历史', async () => {
      const mockHistory: Message[] = [
        {
          id: 'msg1',
          role: 'user',
          content: 'Hello, how are you?',
          timestamp: new Date(),
        },
        {
          id: 'msg2',
          role: 'assistant',
          content: 'I am fine, thank you!',
          timestamp: new Date(),
        },
        {
          id: 'msg3',
          role: 'user',
          content: 'What can you do?',
          timestamp: new Date(),
        },
      ];
      mockAgentManager.getHistory.mockReturnValue(mockHistory);

      const result = await agentGetHistoryHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: TEST_AGENT_ID }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.history).toHaveLength(3);
        expect(result.data.history[0].role).toBe('user');
        expect(result.data.history[1].role).toBe('assistant');
      }
      expect(mockAgentManager.getHistory).toHaveBeenCalledWith(TEST_AGENT_ID, undefined);
    });

    it('应该成功获取带 limit 参数的历史记录', async () => {
      mockAgentManager.getHistory.mockReturnValue([]);

      await agentGetHistoryHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: TEST_AGENT_ID, limit: 10 }
      );

      expect(mockAgentManager.getHistory).toHaveBeenCalledWith(TEST_AGENT_ID, 10);
    });

    it('没有对话历史时应该返回空数组', async () => {
      mockAgentManager.getHistory.mockReturnValue([]);

      const result = await agentGetHistoryHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: TEST_AGENT_ID }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.history).toEqual([]);
      }
    });

    it('参数校验失败时应该返回错误', async () => {
      const result = await agentGetHistoryHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: TEST_AGENT_ID, limit: -1 } // 无效的 limit
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('agent_get_history');
      }
      expect(mockAgentManager.getHistory).not.toHaveBeenCalled();
    });

    it('getHistory 抛出错误时应该返回错误信息', async () => {
      const errorMessage = 'History retrieval failed';
      mockAgentManager.getHistory.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      const result = await agentGetHistoryHandler(
        mockAgentManager as unknown as AgentManager,
        { agent_id: TEST_AGENT_ID }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(errorMessage);
      }
    });
  });
});
