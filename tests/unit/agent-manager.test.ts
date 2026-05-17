// Setup mocks BEFORE importing any modules

// Mock logger module
jest.mock('../../src/utils/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
  default: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Mock security utils
jest.mock('../../src/utils/security', () => ({
  SecurityUtils: {
    redactObject: jest.fn((obj) => obj),
  },
}));

// Mock database module to prevent real initialization
jest.mock('../../src/db/database', () => {
  const originalModule = jest.requireActual('../../src/db/database');

  const mockDbInstance = {
    query: jest.fn().mockReturnValue([]),
    execute: jest.fn(),
    init: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    insert: jest.fn(),
    transaction: jest.fn(),
    close: jest.fn(),
    getRawInstance: jest.fn(),
    connectPostgres: jest.fn(),
  };

  return {
    ...originalModule,
    MixIQDatabase: jest.fn().mockImplementation(() => mockDbInstance),
    db: mockDbInstance,
  };
});

// Now import the modules after mocks are setup
import { AgentManager, AgentManagerError } from '../../src/managers/agent-manager';
import { RecordNotFoundError, DatabaseError, MixIQDatabase } from '../../src/db/database';
import { AgentStatus, TABLE_NAMES } from '../../src/types';

describe('AgentManager', () => {
  let mockDb: jest.Mocked<MixIQDatabase>;
  let agentManager: AgentManager;

  const validProjectId = '123e4567-e89b-12d3-a456-426614174000';
  const validAgentId = '123e4567-e89b-12d3-a456-426614174001';
  const agentType = 'deploy-agent';

  const createMockAgent = (overrides = {}) => ({
    id: validAgentId,
    project_id: validProjectId,
    agent_type: agentType,
    token: 'test-token-123',
    allowed_tools: [] as string[],
    status: 'inactive' as AgentStatus,
    context: { conversationHistory: [], metadata: {} },
    history: [] as any[],
    audit_logs: [] as any[],
    config: { maxHistoryLength: 1000 },
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  });

  const mockAgent = createMockAgent();

  beforeEach(() => {
    jest.clearAllMocks();

    // Create fresh mock database
    mockDb = {
      query: jest.fn().mockReturnValue([]),
      execute: jest.fn(),
      init: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      insert: jest.fn(),
      transaction: jest.fn(),
      close: jest.fn(),
      getRawInstance: jest.fn(),
      connectPostgres: jest.fn(),
    } as unknown as jest.Mocked<MixIQDatabase>;

    // Inject mock db into AgentManager
    agentManager = new AgentManager(mockDb);
  });

  describe('1. AgentManager 实例化测试', () => {
    it('应该成功创建 AgentManager 实例', () => {
      expect(agentManager).toBeInstanceOf(AgentManager);
    });
  });

  describe('2. createAgent 方法测试', () => {
    it('成功创建智能体', () => {
      mockDb.query.mockReturnValueOnce([]);

      const result = agentManager.createAgent(validProjectId, agentType);

      expect(result.agent_id).toBeDefined();
      expect(result.token).toBeDefined();
      expect(result.status).toBe('inactive');
      expect(mockDb.execute).toHaveBeenCalled();
    });

    it('带 allowed_tools 参数创建', () => {
      const allowedTools = ['git.clone', 'project.deploy'];
      mockDb.query.mockReturnValueOnce([]);

      const result = agentManager.createAgent(validProjectId, agentType, allowedTools);

      expect(result.agent_id).toBeDefined();
    });

    it('带 config 参数创建', () => {
      const config = {
        maxHistoryLength: 500,
        timeout: 30000,
        metadata: { owner: 'test-user' },
      };
      mockDb.query.mockReturnValueOnce([]);

      const result = agentManager.createAgent(validProjectId, agentType, [], config);

      expect(result.agent_id).toBeDefined();
    });

    it('参数校验失败', () => {
      expect(() => {
        agentManager.createAgent('invalid-uuid', agentType);
      }).toThrow(AgentManagerError);

      expect(() => {
        agentManager.createAgent(validProjectId, '');
      }).toThrow(AgentManagerError);
    });
  });

  describe('3. getAgent 方法测试', () => {
    it('成功获取智能体', () => {
      mockDb.query.mockReturnValueOnce([mockAgent]);

      const result = agentManager.getAgent(validAgentId);

      expect(result.id).toBe(validAgentId);
      expect(result.agent_type).toBe(agentType);
    });

    it('智能体不存在处理', () => {
      mockDb.query.mockReturnValueOnce([]);

      expect(() => {
        agentManager.getAgent(validAgentId);
      }).toThrow(RecordNotFoundError);
    });
  });

  describe('4. listAgents 方法测试', () => {
    it('列出所有智能体', () => {
      const agents = [
        mockAgent,
        createMockAgent({ id: 'agent-2', agent_type: 'build-agent' }),
      ];
      mockDb.query.mockReturnValueOnce(agents);

      const result = agentManager.listAgents(validProjectId);

      expect(result).toHaveLength(2);
    });

    it('空列表处理', () => {
      mockDb.query.mockReturnValueOnce([]);

      const result = agentManager.listAgents(validProjectId);

      expect(result).toEqual([]);
    });
  });

  describe('5. updateAgent 方法测试', () => {
    it('更新智能体状态', () => {
      let callCount = 0;
      mockDb.query.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return [mockAgent]; // First getAgent
        return [{ ...mockAgent, status: 'active' }]; // Second getAgent
      });

      const result = agentManager.updateAgent(validAgentId, { status: 'active' });

      expect(result.status).toBe('active');
    });

    it('更新 allowed_tools 列表', () => {
      const newTools = ['new.tool1', 'new.tool2'];
      let callCount = 0;
      mockDb.query.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return [mockAgent]; // First getAgent
        return [{ ...mockAgent, allowed_tools: newTools }]; // Second getAgent
      });

      const result = agentManager.updateAgent(validAgentId, { allowedTools: newTools });

      expect(result.allowed_tools).toEqual(newTools);
    });

    it('更新 config', () => {
      const newConfig = { maxHistoryLength: 2000, timeout: 60000 };
      let callCount = 0;
      mockDb.query.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return [mockAgent]; // First getAgent
        return [{ ...mockAgent, config: newConfig }]; // Second getAgent
      });

      const result = agentManager.updateAgent(validAgentId, { config: newConfig });

      expect(result.config.maxHistoryLength).toBe(2000);
    });
  });

  describe('6. deleteAgent 方法测试', () => {
    it('删除智能体', () => {
      mockDb.query.mockReturnValueOnce([mockAgent]);

      const result = agentManager.deleteAgent(validAgentId);

      expect(result).toBe(true);
    });

    it('删除不存在的智能体', () => {
      mockDb.query.mockImplementationOnce(() => {
        throw new RecordNotFoundError('Agent not found', TABLE_NAMES.AGENT_INSTANCES);
      });

      const result = agentManager.deleteAgent(validAgentId);

      expect(result).toBe(false);
    });
  });

  describe('7. switchAgent 方法测试', () => {
    it('成功切换智能体', () => {
      // switchAgent calls getAgent once
      mockDb.query.mockReturnValueOnce([mockAgent]);

      agentManager.switchAgent(validAgentId);

      // getCurrentAgent calls getAgent again
      mockDb.query.mockReturnValueOnce([mockAgent]);
      const current = agentManager.getCurrentAgent();
      expect(current).not.toBeNull();
      expect(current?.id).toBe(validAgentId);
    });

    it('切换不存在的智能体', () => {
      mockDb.query.mockImplementationOnce(() => {
        throw new RecordNotFoundError('Agent not found');
      });

      expect(() => {
        agentManager.switchAgent(validAgentId);
      }).toThrow(AgentManagerError);
    });
  });

  describe('8. getCurrentAgent 方法测试', () => {
    it('没有当前智能体的情况', () => {
      const result = agentManager.getCurrentAgent();
      expect(result).toBeNull();
    });

    it('获取当前活动智能体', () => {
      // switchAgent
      mockDb.query.mockReturnValueOnce([mockAgent]);
      agentManager.switchAgent(validAgentId);

      // getCurrentAgent
      mockDb.query.mockReturnValueOnce([mockAgent]);
      const result = agentManager.getCurrentAgent();

      expect(result).not.toBeNull();
      expect(result?.id).toBe(validAgentId);
    });
  });

  describe('9. setContext 方法测试', () => {
    it('设置上下文键值对', () => {
      mockDb.query.mockReturnValueOnce([mockAgent]);

      agentManager.setContext(validAgentId, 'testKey', 'testValue');

      expect(mockDb.execute).toHaveBeenCalled();
    });

    it('复杂对象类型的 value', () => {
      mockDb.query.mockReturnValueOnce([mockAgent]);

      const complexValue = {
        nested: {
          array: [1, 2, 3],
          obj: { key: 'value' },
        },
      };

      agentManager.setContext(validAgentId, 'complexKey', complexValue);

      expect(mockDb.execute).toHaveBeenCalled();
    });
  });

  describe('10. getContext 方法测试', () => {
    it('获取全部上下文', () => {
      const agentWithContext = createMockAgent({
        context: {
          conversationHistory: [],
          metadata: { owner: 'test' },
          customKey: 'customValue',
        },
      });
      mockDb.query.mockReturnValueOnce([agentWithContext]);

      const result = agentManager.getContext(validAgentId);

      expect(result.customKey).toBe('customValue');
      expect(result.metadata.owner).toBe('test');
    });

    it('获取单个 key 的值', () => {
      const agentWithContext = createMockAgent({
        context: {
          conversationHistory: [],
          metadata: {},
          testKey: 'testValue',
        },
      });
      mockDb.query.mockReturnValueOnce([agentWithContext]);

      const result = agentManager.getContext(validAgentId, 'testKey');

      expect(result).toBe('testValue');
    });
  });

  describe('11. clearContext 方法测试', () => {
    it('清空上下文', () => {
      mockDb.query.mockReturnValueOnce([mockAgent]);

      agentManager.clearContext(validAgentId);

      expect(mockDb.execute).toHaveBeenCalled();
    });
  });

  describe('12. appendToHistory 方法测试', () => {
    it('添加消息到对话历史', () => {
      mockDb.query.mockReturnValueOnce([mockAgent]);

      const message = {
        role: 'user' as const,
        content: 'Hello, world!',
      };

      agentManager.appendToHistory(validAgentId, message);

      expect(mockDb.execute).toHaveBeenCalled();
    });

    it('消息格式验证', () => {
      mockDb.query.mockReturnValueOnce([mockAgent]);

      const message = {
        role: 'assistant' as const,
        content: 'I can help you!',
        toolCallId: 'tool-123',
        toolName: 'git.status',
      };

      agentManager.appendToHistory(validAgentId, message);

      expect(mockDb.execute).toHaveBeenCalled();
    });
  });

  describe('13. getHistory 方法测试', () => {
    it('获取对话历史', () => {
      const agentWithHistory = createMockAgent({
        history: [
          { id: 'msg-1', role: 'user', content: 'Hello', timestamp: new Date() },
          { id: 'msg-2', role: 'assistant', content: 'Hi there!', timestamp: new Date() },
        ],
      });
      mockDb.query.mockReturnValueOnce([agentWithHistory]);

      const result = agentManager.getHistory(validAgentId);

      expect(result).toHaveLength(2);
    });

    it('limit 参数处理', () => {
      const agentWithHistory = createMockAgent({
        history: Array.from({ length: 10 }, (_, i) => ({
          id: `msg-${i}`,
          role: 'user',
          content: `message ${i}`,
          timestamp: new Date(),
        })),
      });
      mockDb.query.mockReturnValueOnce([agentWithHistory]);

      const result = agentManager.getHistory(validAgentId, 3);

      expect(result).toHaveLength(3);
    });
  });

  describe('14. getAvailableTools 方法测试', () => {
    it('获取可用工具列表', () => {
      const agentWithTools = createMockAgent({
        allowed_tools: ['git.clone', 'project.deploy', 'env.config'],
      });
      mockDb.query.mockReturnValueOnce([agentWithTools]);

      const result = agentManager.getAvailableTools(validAgentId);

      expect(result).toEqual(['git.clone', 'project.deploy', 'env.config']);
    });

    it('无允许工具的情况', () => {
      mockDb.query.mockReturnValueOnce([mockAgent]);

      const result = agentManager.getAvailableTools(validAgentId);

      expect(result).toEqual([]);
    });
  });

  describe('15. bindTool / unbindTool 方法测试', () => {
    it('绑定工具', () => {
      mockDb.query.mockReturnValueOnce([mockAgent]);

      agentManager.bindTool(validAgentId, 'new.tool');

      expect(mockDb.execute).toHaveBeenCalled();
    });

    it('解绑工具', () => {
      const agentWithTools = createMockAgent({
        allowed_tools: ['tool1', 'tool2', 'tool3'],
      });
      mockDb.query.mockReturnValueOnce([agentWithTools]);

      agentManager.unbindTool(validAgentId, 'tool2');

      expect(mockDb.execute).toHaveBeenCalled();
    });

    it('重复绑定处理', () => {
      const agentWithTool = createMockAgent({
        allowed_tools: ['already.bound'],
      });
      mockDb.query.mockReturnValueOnce([agentWithTool]);

      agentManager.bindTool(validAgentId, 'already.bound');

      expect(mockDb.execute).not.toHaveBeenCalled();
    });
  });

  describe('16. logAction 方法测试', () => {
    it('记录操作审计日志', () => {
      mockDb.query.mockReturnValueOnce([mockAgent]);

      agentManager.logAction(validAgentId, 'test_action', { detail: 'value' });

      expect(mockDb.execute).toHaveBeenCalled();
    });
  });

  describe('17. getAuditLog 方法测试', () => {
    it('获取审计日志', () => {
      const agentWithLogs = createMockAgent({
        audit_logs: [
          { id: 'log-1', agent_id: validAgentId, action: 'agent_created', timestamp: new Date() },
          { id: 'log-2', agent_id: validAgentId, action: 'status_updated', timestamp: new Date() },
        ],
      });
      mockDb.query.mockReturnValueOnce([agentWithLogs]);

      const result = agentManager.getAuditLog(validAgentId);

      expect(result).toHaveLength(2);
    });

    it('limit 参数处理', () => {
      const agentWithLogs = createMockAgent({
        audit_logs: Array.from({ length: 10 }, (_, i) => ({
          id: `log-${i}`,
          agent_id: validAgentId,
          action: `action_${i}`,
          timestamp: new Date(),
        })),
      });
      mockDb.query.mockReturnValueOnce([agentWithLogs]);

      const result = agentManager.getAuditLog(validAgentId, 5);

      expect(result).toHaveLength(5);
    });
  });

  describe('18. getAgentStatus / updateAgentStatus 方法测试', () => {
    it('获取和更新智能体状态', () => {
      mockDb.query
        .mockReturnValueOnce([createMockAgent({ status: 'active' })])
        .mockReturnValueOnce([mockAgent]);

      const status = agentManager.getAgentStatus(validAgentId);
      expect(status).toBe('active');

      const updated = agentManager.updateAgentStatus(validAgentId, 'paused');
      expect(updated).toBe('paused');
    });

    it('状态枚举验证 (inactive, active, paused, error)', () => {
      const statuses: AgentStatus[] = ['inactive', 'active', 'paused', 'error'];

      statuses.forEach((status) => {
        mockDb.query.mockClear();
        mockDb.query.mockReturnValueOnce([mockAgent]);

        const result = agentManager.updateAgentStatus(validAgentId, status);
        expect(result).toBe(status);
      });
    });
  });

  describe('19. 错误处理测试', () => {
    it('数据库错误处理', () => {
      mockDb.query.mockImplementationOnce(() => {
        throw new DatabaseError('Database connection failed');
      });

      expect(() => {
        agentManager.getAgent(validAgentId);
      }).toThrow(AgentManagerError);
    });

    it('无效参数处理', () => {
      expect(() => {
        agentManager.getAgent('not-a-uuid');
      }).toThrow(AgentManagerError);
    });

    it('自定义错误类测试', () => {
      mockDb.query.mockImplementationOnce(() => {
        throw new Error('Test error');
      });

      try {
        agentManager.getAgent(validAgentId);
        fail('Expected AgentManagerError');
      } catch (error) {
        expect(error).toBeInstanceOf(AgentManagerError);
        const agentError = error as AgentManagerError;
        expect(agentError.agentId).toBe(validAgentId);
        expect(agentError.message).toContain('Test error');
      }
    });
  });

  describe('JSON 字段序列化/反序列化测试', () => {
    it('应该正确处理无效的 JSON 字符串', () => {
      const agentWithInvalidJson = {
        ...mockAgent,
        allowed_tools: 'not valid json',
        context: 'not valid json',
        config: 'not valid json',
      };
      mockDb.query.mockReturnValueOnce([agentWithInvalidJson]);

      const result = agentManager.getAgent(validAgentId);

      expect(Array.isArray(result.allowed_tools)).toBe(true);
      expect(typeof result.context).toBe('object');
      expect(typeof result.config).toBe('object');
    });
  });
});
