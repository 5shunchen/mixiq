import os from 'os';
import path from 'path';
import fs from 'fs';
import { MixIQDatabase, DatabaseError, RecordNotFoundError } from '../../src/db/database';
import { TABLE_NAMES, Project, Environment, AgentInstance } from '../../src/types';

describe('MixIQDatabase', () => {
  let db: MixIQDatabase;
  let testDbPath: string;

  // 每个测试前创建临时数据库
  beforeEach(() => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mixiq-test-'));
    testDbPath = path.join(tempDir, 'test.db');
    db = new MixIQDatabase({ dbPath: testDbPath });
    db.init();
  });

  // 每个测试后关闭数据库并清理
  afterEach(() => {
    db.close();
    const dir = path.dirname(testDbPath);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('初始化和表创建', () => {
    it('应该成功初始化数据库并创建所有表', () => {
      const tables = db.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      );
      const tableNames = tables.map(t => t.name);

      expect(tableNames).toContain(TABLE_NAMES.PROJECTS);
      expect(tableNames).toContain(TABLE_NAMES.ENVIRONMENTS);
      expect(tableNames).toContain(TABLE_NAMES.AGENT_INSTANCES);
      expect(tableNames).toContain(TABLE_NAMES.DEPLOYMENTS);
    });

    it('重复初始化不应报错', () => {
      expect(() => db.init()).not.toThrow();
    });

    it('未初始化时调用操作应该抛出错误', () => {
      const newDb = new MixIQDatabase({ dbPath: ':memory:' });
      expect(() => newDb.findAll(TABLE_NAMES.PROJECTS)).toThrow(DatabaseError);
    });
  });

  describe('insert 操作', () => {
    it('应该自动生成 UUID 和时间戳', () => {
      const projectData = {
        name: 'Test Project',
        workspace_path: '/path/to/workspace',
        git_remotes: [],
      };

      const result = db.insert(TABLE_NAMES.PROJECTS, projectData) as Project;

      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^[0-9a-f-]{36}$/); // UUID v4 格式
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
      expect(result.created_at.getTime()).toBeCloseTo(result.updated_at.getTime(), -2);
    });

    it('应该正确插入数据', () => {
      const projectData = {
        name: 'Test Project',
        workspace_path: '/path/to/workspace',
        git_remotes: [],
      };

      const result = db.insert(TABLE_NAMES.PROJECTS, projectData) as Project;

      expect(result.name).toBe(projectData.name);
      expect(result.workspace_path).toBe(projectData.workspace_path);
    });

    it('插入无效数据应该抛出错误', () => {
      const invalidData = {
        invalid_field: 'value',
      } as unknown as Omit<Project, 'id' | 'created_at' | 'updated_at'>;

      expect(() => db.insert(TABLE_NAMES.PROJECTS, invalidData)).toThrow(DatabaseError);
    });
  });

  describe('findById 操作', () => {
    it('应该根据 ID 正确查找记录', () => {
      const project = db.insert(TABLE_NAMES.PROJECTS, {
        name: 'Test Project',
        workspace_path: '/path/to/workspace',
        git_remotes: [],
      }) as Project;

      const found = db.findById(TABLE_NAMES.PROJECTS, project.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(project.id);
      expect(found?.name).toBe(project.name);
    });

    it('查找不存在的 ID 应该返回 null', () => {
      const result = db.findById(TABLE_NAMES.PROJECTS, 'non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('findAll 操作', () => {
    beforeEach(() => {
      // 插入测试数据
      for (let i = 1; i <= 5; i++) {
        db.insert(TABLE_NAMES.PROJECTS, {
          name: `Project ${i}`,
          workspace_path: `/path/${i}`,
          git_remotes: [],
        });
      }
    });

    it('应该返回所有记录', () => {
      const results = db.findAll(TABLE_NAMES.PROJECTS);
      expect(results).toHaveLength(5);
    });

    it('应该支持 WHERE 查询条件', () => {
      const results = db.findAll(TABLE_NAMES.PROJECTS, {
        where: { name: 'Project 1' } as Partial<Project>,
      });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Project 1');
    });

    it('应该支持排序', () => {
      const ascResults = db.findAll(TABLE_NAMES.PROJECTS, {
        orderBy: 'name' as keyof Project,
        orderDirection: 'ASC',
      });

      expect(ascResults[0].name).toBe('Project 1');
      expect(ascResults[4].name).toBe('Project 5');

      const descResults = db.findAll(TABLE_NAMES.PROJECTS, {
        orderBy: 'name' as keyof Project,
        orderDirection: 'DESC',
      });

      expect(descResults[0].name).toBe('Project 5');
      expect(descResults[4].name).toBe('Project 1');
    });

    it('应该支持分页（limit 和 offset）', () => {
      const page1 = db.findAll(TABLE_NAMES.PROJECTS, {
        orderBy: 'name' as keyof Project,
        orderDirection: 'ASC',
        limit: 2,
        offset: 0,
      });

      expect(page1).toHaveLength(2);
      expect(page1[0].name).toBe('Project 1');
      expect(page1[1].name).toBe('Project 2');

      const page2 = db.findAll(TABLE_NAMES.PROJECTS, {
        orderBy: 'name' as keyof Project,
        orderDirection: 'ASC',
        limit: 2,
        offset: 2,
      });

      expect(page2).toHaveLength(2);
      expect(page2[0].name).toBe('Project 3');
      expect(page2[1].name).toBe('Project 4');
    });

    it('默认应该按 created_at 降序排序', () => {
      // 清除已有数据重新插入确保时间顺序
      const results = db.findAll(TABLE_NAMES.PROJECTS);
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].created_at.getTime()).toBeGreaterThanOrEqual(
          results[i + 1].created_at.getTime()
        );
      }
    });
  });

  describe('update 操作', () => {
    it('应该更新记录并自动更新 updated_at', async () => {
      const project = db.insert(TABLE_NAMES.PROJECTS, {
        name: 'Old Name',
        workspace_path: '/old/path',
        git_remotes: [],
      }) as Project;

      // 等待一小段时间确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = db.update(
        TABLE_NAMES.PROJECTS,
        project.id,
        { name: 'New Name' }
      ) as Project;

      expect(updated.name).toBe('New Name');
      expect(updated.workspace_path).toBe(project.workspace_path);
      expect(updated.updated_at.getTime()).toBeGreaterThan(project.updated_at.getTime());
    });

    it('更新不存在的记录应该抛出 RecordNotFoundError', () => {
      expect(() =>
        db.update(TABLE_NAMES.PROJECTS, 'non-existent-id', { name: 'Test' })
      ).toThrow(RecordNotFoundError);
    });

    it('空的更新应该返回原记录', () => {
      const project = db.insert(TABLE_NAMES.PROJECTS, {
        name: 'Test Project',
        workspace_path: '/path/to/workspace',
        git_remotes: [],
      }) as Project;

      const updated = db.update(TABLE_NAMES.PROJECTS, project.id, {});

      expect(updated.name).toBe(project.name);
    });
  });

  describe('delete 操作', () => {
    it('应该删除记录', () => {
      const project = db.insert(TABLE_NAMES.PROJECTS, {
        name: 'Test Project',
        workspace_path: '/path/to/workspace',
        git_remotes: [],
      }) as Project;

      const result = db.delete(TABLE_NAMES.PROJECTS, project.id);
      const found = db.findById(TABLE_NAMES.PROJECTS, project.id);

      expect(result).toBe(true);
      expect(found).toBeNull();
    });

    it('删除不存在的记录应该返回 false', () => {
      const result = db.delete(TABLE_NAMES.PROJECTS, 'non-existent-id');
      expect(result).toBe(false);
    });

    it('应该支持外键级联删除', () => {
      const project = db.insert(TABLE_NAMES.PROJECTS, {
        name: 'Test Project',
        workspace_path: '/path/to/workspace',
        git_remotes: [],
      }) as Project;

      const env = db.insert(TABLE_NAMES.ENVIRONMENTS, {
        project_id: project.id,
        name: 'production',
        servers: [],
      }) as Environment;

      // 删除项目应该级联删除环境
      db.delete(TABLE_NAMES.PROJECTS, project.id);
      const foundEnv = db.findById(TABLE_NAMES.ENVIRONMENTS, env.id);

      expect(foundEnv).toBeNull();
    });
  });

  describe('事务支持', () => {
    it('应该成功提交事务', () => {
      const result = db.transaction(() => {
        const p1 = db.insert(TABLE_NAMES.PROJECTS, {
          name: 'Project 1',
          workspace_path: '/path/1',
          git_remotes: [],
        });
        const p2 = db.insert(TABLE_NAMES.PROJECTS, {
          name: 'Project 2',
          workspace_path: '/path/2',
          git_remotes: [],
        });
        return [p1, p2];
      });

      expect(result).toHaveLength(2);
      const all = db.findAll(TABLE_NAMES.PROJECTS);
      expect(all).toHaveLength(2);
    });

    it('应该正确回滚事务', () => {
      expect(() => {
        db.transaction(() => {
          db.insert(TABLE_NAMES.PROJECTS, {
            name: 'Project 1',
            workspace_path: '/path/1',
            git_remotes: [],
          });
          throw new Error('Rollback');
        });
      }).toThrow('Rollback');

      const all = db.findAll(TABLE_NAMES.PROJECTS);
      expect(all).toHaveLength(0);
    });
  });

  describe('JSON 字段序列化/反序列化', () => {
    it('应该正确序列化和反序列化 JSON 数组字段', () => {
      const gitRemotes = [
        { name: 'origin', url: 'https://github.com/user/repo.git' },
        { name: 'backup', url: 'https://gitlab.com/user/repo.git' },
      ];

      const project = db.insert(TABLE_NAMES.PROJECTS, {
        name: 'Test Project',
        workspace_path: '/path/to/workspace',
        git_remotes: gitRemotes,
      }) as Project;

      expect(Array.isArray(project.git_remotes)).toBe(true);
      expect(project.git_remotes).toHaveLength(2);
      expect(project.git_remotes[0].name).toBe('origin');
      expect(project.git_remotes[0].url).toBe(gitRemotes[0].url);

      // 重新查询验证
      const found = db.findById(TABLE_NAMES.PROJECTS, project.id) as Project;
      expect(found.git_remotes).toEqual(gitRemotes);
    });

    it('应该正确序列化和反序列化嵌套 JSON 对象', () => {
      const context = {
        currentTask: 'test task',
        conversationHistory: [
          { id: 'msg-1', role: 'user' as const, content: 'hello', timestamp: new Date() },
        ],
        workspaceState: { file1: 'modified' },
        metadata: { key: 'value' },
      };

      const project = db.insert(TABLE_NAMES.PROJECTS, {
        name: 'Test Project',
        workspace_path: '/path/to/workspace',
        git_remotes: [],
      }) as Project;

      const agent = db.insert(TABLE_NAMES.AGENT_INSTANCES, {
        project_id: project.id,
        agent_type: 'developer',
        token: 'test-token-123',
        allowed_tools: [],
        status: 'active',
        context: context,
        history: [],
        audit_logs: [],
        config: {},
      }) as AgentInstance;

      expect(typeof agent.context).toBe('object');
      expect(agent.context.currentTask).toBe('test task');
      expect(agent.context.conversationHistory).toHaveLength(1);
    });

    it('应该正确更新 JSON 字段', () => {
      const project = db.insert(TABLE_NAMES.PROJECTS, {
        name: 'Test Project',
        workspace_path: '/path/to/workspace',
        git_remotes: [{ name: 'origin', url: 'https://github.com/user/repo.git' }],
      }) as Project;

      const newRemotes = [
        { name: 'origin', url: 'https://github.com/user/repo.git' },
        { name: 'new', url: 'https://github.com/user/new.git' },
      ];

      const updated = db.update(TABLE_NAMES.PROJECTS, project.id, {
        git_remotes: newRemotes,
      }) as Project;

      expect(updated.git_remotes).toHaveLength(2);
      expect(updated.git_remotes[1].name).toBe('new');
    });
  });

  describe('日期字段处理', () => {
    it('应该将时间字符串正确转换为 Date 对象', () => {
      const project = db.insert(TABLE_NAMES.PROJECTS, {
        name: 'Test Project',
        workspace_path: '/path/to/workspace',
        git_remotes: [],
      }) as Project;

      expect(project.created_at).toBeInstanceOf(Date);
      expect(project.updated_at).toBeInstanceOf(Date);
      expect(project.created_at.toISOString()).toBeDefined();
    });
  });
});
