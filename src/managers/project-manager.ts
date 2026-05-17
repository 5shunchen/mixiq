import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Logger } from '../utils/logger';
import { validate, validatePath, ValidationError, z } from '../utils/validator';
import {
  Project,
  Environment,
  AgentInstance,
  GitRemote,
  TABLE_NAMES,
  UpdateInput,
} from '../types';
import { MixIQDatabase, RecordNotFoundError, DatabaseError } from '../db/database';

/**
 * 项目初始化结果
 */
export interface InitProjectResult {
  project_id: string;
  workspace_path: string;
}

/**
 * 项目详细信息（包含关联数据）
 */
export interface ProjectDetail extends Project {
  environments: Environment[];
  active_agents: AgentInstance[];
}

/**
 * 项目更新输入
 */
export type ProjectUpdateInput = UpdateInput<Project>;

/**
 * 项目名称校验 Schema
 */
const ProjectNameSchema = z
  .string({
    required_error: '项目名称不能为空',
    invalid_type_error: '项目名称必须是字符串类型',
  })
  .min(1, '项目名称长度不能小于 1')
  .max(255, '项目名称长度不能大于 255')
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    '项目名称只能包含字母、数字、下划线和连字符'
  );

/**
 * 项目管理器
 * 负责项目的生命周期管理和上下文切换
 */
export class ProjectManager {
  private readonly db: MixIQDatabase;
  private readonly logger: Logger;
  private currentProjectId: string | null = null;

  /**
   * 构造函数
   * @param database 数据库实例
   */
  constructor(database: MixIQDatabase) {
    this.db = database;
    this.logger = new Logger('project-manager');
  }

  /**
   * 获取项目工作空间路径
   * @param projectName 项目名称
   * @returns 工作空间路径
   */
  private getWorkspacePath(projectName: string): string {
    const homeDir = os.homedir();
    return path.join(homeDir, '.mixiq', 'projects', projectName);
  }

  /**
   * 校验项目名称唯一性
   * @param name 项目名称
   * @throws ValidationError 如果项目名称已存在
   */
  private async validateProjectNameUniqueness(name: string): Promise<void> {
    try {
      const existingProjects = this.db.findAll(TABLE_NAMES.PROJECTS, {
        where: { name } as Partial<Project>,
      });

      if (existingProjects.length > 0) {
        throw new ValidationError(`项目名称 "${name}" 已存在`, [
          { field: 'name', message: '项目名称已存在' },
        ]);
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DatabaseError(
        `校验项目名称唯一性失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 初始化新项目
   * @param name 项目名称
   * @param template 项目模板（预留参数，暂未实现）
   * @param gitUrl Git 仓库地址（预留参数，暂未实现）
   * @returns 项目初始化结果
   */
  public async initProject(
    name: string,
    template?: string,
    gitUrl?: string
  ): Promise<InitProjectResult> {
    try {
      this.logger.info('开始初始化项目', { name, template, gitUrl });

      // 校验项目名称
      const validatedName = validate(ProjectNameSchema, name, '项目名称校验失败');

      // 校验项目名称唯一性
      await this.validateProjectNameUniqueness(validatedName);

      // 计算并校验工作空间路径
      const workspacePath = this.getWorkspacePath(validatedName);
      validatePath(workspacePath);

      // 创建工作空间目录
      await fs.mkdir(workspacePath, { recursive: true });
      this.logger.info('工作空间目录已创建', { workspacePath });

      // 准备 Git 远程配置
      const gitRemotes: GitRemote[] = gitUrl
        ? [{ name: 'origin', url: gitUrl }]
        : [];

      // 插入数据库记录
      const project = this.db.insert(TABLE_NAMES.PROJECTS, {
        name: validatedName,
        workspace_path: workspacePath,
        git_remotes: gitRemotes,
      });

      this.logger.info('项目初始化成功', { projectId: project.id });

      return {
        project_id: project.id,
        workspace_path: project.workspace_path,
      };
    } catch (error) {
      this.logger.error('项目初始化失败', error instanceof Error ? error : undefined, {
        name,
      });
      throw error;
    }
  }

  /**
   * 切换当前项目
   * @param projectId 项目 ID
   * @returns 项目完整信息
   * @throws RecordNotFoundError 如果项目不存在
   */
  public async switchProject(projectId: string): Promise<ProjectDetail> {
    try {
      this.logger.info('切换项目', { projectId });

      // 校验项目存在
      const projectInfo = await this.getProjectInfo(projectId);

      // 设置当前上下文项目
      this.currentProjectId = projectId;

      this.logger.info('项目切换成功', { projectId });

      return projectInfo;
    } catch (error) {
      this.logger.error('切换项目失败', error instanceof Error ? error : undefined, {
        projectId,
      });
      throw error;
    }
  }

  /**
   * 获取项目信息
   * @param projectId 项目 ID，如果不传则返回当前项目
   * @returns 项目详细信息（包含关联数据）
   * @throws ValidationError 如果未传入 projectId 且无当前选中项目
   * @throws RecordNotFoundError 如果项目不存在
   */
  public async getProjectInfo(projectId?: string): Promise<ProjectDetail> {
    try {
      // 确定要查询的项目 ID
      const targetProjectId = projectId || this.currentProjectId;

      if (!targetProjectId) {
        throw new ValidationError('未指定项目 ID，且没有当前选中的项目', [
          { field: 'projectId', message: '项目 ID 不能为空' },
        ]);
      }

      // 查询项目基本信息
      const project = this.db.findById(TABLE_NAMES.PROJECTS, targetProjectId);

      if (!project) {
        throw new RecordNotFoundError(
          `项目不存在: ${targetProjectId}`,
          TABLE_NAMES.PROJECTS,
          targetProjectId
        );
      }

      // 关联查询环境列表
      const environments = this.db.findAll(TABLE_NAMES.ENVIRONMENTS, {
        where: { project_id: targetProjectId } as Partial<Environment>,
      });

      // 关联查询活跃的 Agent 实例
      const activeAgents = this.db.findAll(TABLE_NAMES.AGENT_INSTANCES, {
        where: {
          project_id: targetProjectId,
          status: 'active',
        } as Partial<unknown>,
      });

      return {
        ...project,
        environments,
        active_agents: activeAgents,
      };
    } catch (error) {
      this.logger.error('获取项目信息失败', error instanceof Error ? error : undefined, {
        projectId,
      });
      throw error;
    }
  }

  /**
   * 列出所有项目
   * @returns 项目列表
   */
  public async listProjects(): Promise<Project[]> {
    try {
      this.logger.debug('获取项目列表');

      const projects = this.db.findAll(TABLE_NAMES.PROJECTS);

      return projects;
    } catch (error) {
      this.logger.error('获取项目列表失败', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * 更新项目信息
   * @param projectId 项目 ID
   * @param updates 更新内容
   * @returns 更新后的项目信息
   * @throws RecordNotFoundError 如果项目不存在
   */
  public async updateProject(
    projectId: string,
    updates: ProjectUpdateInput
  ): Promise<Project> {
    try {
      this.logger.info('更新项目信息', { projectId, updates });

      // 如果更新名称，校验名称格式和唯一性
      if (updates.name !== undefined) {
        const validatedName = validate(ProjectNameSchema, updates.name, '项目名称校验失败');
        const existingProjects = this.db.findAll(TABLE_NAMES.PROJECTS, {
          where: { name: validatedName } as Partial<Project>,
        });

        if (existingProjects.length > 0 && existingProjects[0].id !== projectId) {
          throw new ValidationError(`项目名称 "${validatedName}" 已存在`, [
            { field: 'name', message: '项目名称已存在' },
          ]);
        }
      }

      // 如果更新工作空间路径，校验路径
      if (updates.workspace_path !== undefined) {
        validatePath(updates.workspace_path);
        // 确保目录存在
        await fs.mkdir(updates.workspace_path, { recursive: true });
      }

      // 执行更新
      const updatedProject = this.db.update(TABLE_NAMES.PROJECTS, projectId, updates);

      this.logger.info('项目信息更新成功', { projectId });

      return updatedProject;
    } catch (error) {
      this.logger.error('更新项目信息失败', error instanceof Error ? error : undefined, {
        projectId,
      });
      throw error;
    }
  }

  /**
   * 删除项目
   * @param projectId 项目 ID
   * @param deleteWorkspace 是否删除工作空间目录，默认 false
   * @returns 是否删除成功
   * @throws RecordNotFoundError 如果项目不存在
   */
  public async deleteProject(
    projectId: string,
    deleteWorkspace = false
  ): Promise<boolean> {
    try {
      this.logger.info('删除项目', { projectId, deleteWorkspace });

      // 获取项目信息（确认项目存在）
      const project = this.db.findById(TABLE_NAMES.PROJECTS, projectId);

      if (!project) {
        throw new RecordNotFoundError(
          `项目不存在: ${projectId}`,
          TABLE_NAMES.PROJECTS,
          projectId
        );
      }

      const workspacePath = project.workspace_path;

      // 数据库级联删除（通过外键 ON DELETE CASCADE）
      const deleted = this.db.delete(TABLE_NAMES.PROJECTS, projectId);

      if (!deleted) {
        throw new DatabaseError('项目删除失败');
      }

      // 如果需要，删除工作空间目录
      if (deleteWorkspace) {
        try {
          await fs.rm(workspacePath, { recursive: true, force: true });
          this.logger.info('工作空间目录已删除', { workspacePath });
        } catch (fsError) {
          this.logger.warn('工作空间目录删除失败', {
            workspacePath,
            error: fsError instanceof Error ? fsError.message : String(fsError),
          });
        }
      }

      // 如果删除的是当前项目，清空当前项目 ID
      if (this.currentProjectId === projectId) {
        this.currentProjectId = null;
      }

      this.logger.info('项目删除成功', { projectId });

      return true;
    } catch (error) {
      this.logger.error('删除项目失败', error instanceof Error ? error : undefined, {
        projectId,
      });
      throw error;
    }
  }

  /**
   * 获取当前选中的项目 ID
   * @returns 当前项目 ID，如果没有选中的项目则返回 null
   */
  public getCurrentProjectId(): string | null {
    return this.currentProjectId;
  }
}

export default ProjectManager;
