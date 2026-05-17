import { z } from 'zod';
import { validate, PathSchema } from '../utils/validator';

// 使用类型断言来避免类型冲突
export type GitManager = unknown;

/**
 * 工具返回值类型
 */
export type ToolResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ==================== git_init ====================

export const gitInitSchema = z.object({
  workspace_path: PathSchema.describe('工作区目录路径'),
  git_url: z
    .string({
      invalid_type_error: 'Git 仓库地址必须是字符串类型',
    })
    .url('Git 仓库地址格式不正确')
    .optional()
    .describe('远程 Git 仓库地址（可选）'),
});

export type GitInitInput = z.infer<typeof gitInitSchema>;

export const git_init = {
  name: 'git_init',
  description: '初始化或关联 Git 仓库。如果目录不存在，将创建目录；如果提供了 git_url，则会关联远程仓库。',
  inputSchema: gitInitSchema.shape,
};

export async function gitInitHandler(
  manager: GitManager,
  input: unknown
): Promise<ToolResult<{ initialized: boolean; remote_configured: boolean }>> {
  try {
    const params = validate(gitInitSchema, input, 'git_init 参数校验失败');

    const managerImpl = manager as {
      initRepository: (
        workspacePath: string,
        gitUrl?: string
      ) => Promise<{ initialized: boolean; remote_configured: boolean }>;
    };
    const result = await managerImpl.initRepository(params.workspace_path, params.git_url);

    return {
      success: true,
      data: {
        initialized: result.initialized,
        remote_configured: result.remote_configured,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== git_clone ====================

export const gitCloneSchema = z.object({
  git_url: z
    .string({
      required_error: 'Git 仓库地址不能为空',
      invalid_type_error: 'Git 仓库地址必须是字符串类型',
    })
    .url('Git 仓库地址格式不正确')
    .describe('远程 Git 仓库地址'),
  target_path: PathSchema.describe('目标克隆路径'),
});

export type GitCloneInput = z.infer<typeof gitCloneSchema>;

export const git_clone = {
  name: 'git_clone',
  description: '克隆远程 Git 仓库到本地指定路径。',
  inputSchema: gitCloneSchema.shape,
};

export async function gitCloneHandler(
  manager: GitManager,
  input: unknown
): Promise<ToolResult<{ cloned: boolean; path: string }>> {
  try {
    const params = validate(gitCloneSchema, input, 'git_clone 参数校验失败');

    const managerImpl = manager as {
      cloneRepository: (
        gitUrl: string,
        targetPath: string
      ) => Promise<{ cloned: boolean; path: string }>;
    };
    const result = await managerImpl.cloneRepository(params.git_url, params.target_path);

    return {
      success: true,
      data: {
        cloned: result.cloned,
        path: result.path,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== git_status ====================

export const gitStatusSchema = z.object({
  workspace_path: PathSchema.describe('工作区目录路径'),
});

export type GitStatusInput = z.infer<typeof gitStatusSchema>;

export const git_status = {
  name: 'git_status',
  description: '获取 Git 工作区状态，包括当前分支、已暂存文件、已修改文件和未跟踪文件。',
  inputSchema: gitStatusSchema.shape,
};

export async function gitStatusHandler(
  manager: GitManager,
  input: unknown
): Promise<ToolResult<{ branch: string; staged: string[]; modified: string[]; untracked: string[] }>> {
  try {
    const params = validate(gitStatusSchema, input, 'git_status 参数校验失败');

    const managerImpl = manager as {
      getStatus: (
        workspacePath: string
      ) => Promise<{ branch: string; staged: string[]; modified: string[]; untracked: string[] }>;
    };
    const result = await managerImpl.getStatus(params.workspace_path);

    return {
      success: true,
      data: {
        branch: result.branch,
        staged: result.staged,
        modified: result.modified,
        untracked: result.untracked,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== git_branch_create ====================

export const gitBranchCreateSchema = z.object({
  workspace_path: PathSchema.describe('工作区目录路径'),
  branch_name: z
    .string({
      required_error: '分支名称不能为空',
      invalid_type_error: '分支名称必须是字符串类型',
    })
    .min(1, '分支名称长度不能小于 1')
    .max(255, '分支名称长度不能大于 255')
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9-_/.]*$/,
      '分支名称格式不正确，只能包含字母、数字、连字符、下划线、斜杠和点，且必须以字母或数字开头'
    )
    .describe('新分支名称'),
  from_branch: z
    .string({
      invalid_type_error: '源分支名称必须是字符串类型',
    })
    .optional()
    .describe('源分支名称（可选，默认使用当前分支）'),
});

export type GitBranchCreateInput = z.infer<typeof gitBranchCreateSchema>;

export const git_branch_create = {
  name: 'git_branch_create',
  description: '创建新的 Git 分支。可以基于指定的源分支创建，或基于当前分支创建。',
  inputSchema: gitBranchCreateSchema.shape,
};

export async function gitBranchCreateHandler(
  manager: GitManager,
  input: unknown
): Promise<ToolResult<{ branch_name: string; created: boolean }>> {
  try {
    const params = validate(gitBranchCreateSchema, input, 'git_branch_create 参数校验失败');

    const managerImpl = manager as {
      createBranch: (
        workspacePath: string,
        branchName: string,
        fromBranch?: string
      ) => Promise<{ branch_name: string; created: boolean }>;
    };
    const result = await managerImpl.createBranch(
      params.workspace_path,
      params.branch_name,
      params.from_branch
    );

    return {
      success: true,
      data: {
        branch_name: result.branch_name,
        created: result.created,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== git_branch_list ====================

export const gitBranchListSchema = z.object({
  workspace_path: PathSchema.describe('工作区目录路径'),
});

export type GitBranchListInput = z.infer<typeof gitBranchListSchema>;

export const git_branch_list = {
  name: 'git_branch_list',
  description: '获取所有本地和远程分支列表，并标识当前活动分支。',
  inputSchema: gitBranchListSchema.shape,
};

export async function gitBranchListHandler(
  manager: GitManager,
  input: unknown
): Promise<ToolResult<{ branches: string[]; current: string }>> {
  try {
    const params = validate(gitBranchListSchema, input, 'git_branch_list 参数校验失败');

    const managerImpl = manager as {
      listBranches: (
        workspacePath: string
      ) => Promise<{ branches: string[]; current: string }>;
    };
    const result = await managerImpl.listBranches(params.workspace_path);

    return {
      success: true,
      data: {
        branches: result.branches,
        current: result.current,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== git_checkout ====================

export const gitCheckoutSchema = z.object({
  workspace_path: PathSchema.describe('工作区目录路径'),
  branch_name: z
    .string({
      required_error: '分支名称不能为空',
      invalid_type_error: '分支名称必须是字符串类型',
    })
    .min(1, '分支名称长度不能小于 1')
    .max(255, '分支名称长度不能大于 255')
    .describe('要切换到的分支名称'),
});

export type GitCheckoutInput = z.infer<typeof gitCheckoutSchema>;

export const git_checkout = {
  name: 'git_checkout',
  description: '切换到指定的 Git 分支。',
  inputSchema: gitCheckoutSchema.shape,
};

export async function gitCheckoutHandler(
  manager: GitManager,
  input: unknown
): Promise<ToolResult<{ branch_name: string; switched: boolean }>> {
  try {
    const params = validate(gitCheckoutSchema, input, 'git_checkout 参数校验失败');

    const managerImpl = manager as {
      checkoutBranch: (
        workspacePath: string,
        branchName: string
      ) => Promise<{ branch_name: string; switched: boolean }>;
    };
    const result = await managerImpl.checkoutBranch(params.workspace_path, params.branch_name);

    return {
      success: true,
      data: {
        branch_name: result.branch_name,
        switched: result.switched,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== git_commit_and_push ====================

export const gitCommitAndPushSchema = z.object({
  workspace_path: PathSchema.describe('工作区目录路径'),
  message: z
    .string({
      required_error: '提交信息不能为空',
      invalid_type_error: '提交信息必须是字符串类型',
    })
    .min(1, '提交信息长度不能小于 1')
    .max(1000, '提交信息长度不能大于 1000')
    .describe('Git 提交信息'),
  files: z
    .array(
      z
        .string()
        .min(1, '文件路径长度不能小于 1')
        .refine((path) => !path.includes('..'), '文件路径不能包含目录遍历符 ".."')
    )
    .optional()
    .describe('要提交的文件路径列表（可选，默认提交所有变更）'),
  remote: z
    .string({
      invalid_type_error: '远程仓库名称必须是字符串类型',
    })
    .default('origin')
    .describe('远程仓库名称（默认：origin）'),
  branch: z
    .string({
      invalid_type_error: '远程分支名称必须是字符串类型',
    })
    .optional()
    .describe('远程分支名称（可选，默认使用当前分支）'),
});

export type GitCommitAndPushInput = z.infer<typeof gitCommitAndPushSchema>;

export const git_commit_and_push = {
  name: 'git_commit_and_push',
  description: '提交更改并推送到远程仓库。可以指定要提交的文件列表，或提交所有变更。',
  inputSchema: gitCommitAndPushSchema.shape,
};

export async function gitCommitAndPushHandler(
  manager: GitManager,
  input: unknown
): Promise<ToolResult<{ commit_hash: string; pushed: boolean }>> {
  try {
    const params = validate(gitCommitAndPushSchema, input, 'git_commit_and_push 参数校验失败');

    const managerImpl = manager as {
      commitAndPush: (
        workspacePath: string,
        message: string,
        files?: string[],
        remote?: string,
        branch?: string
      ) => Promise<{ commit_hash: string; pushed: boolean }>;
    };
    const result = await managerImpl.commitAndPush(
      params.workspace_path,
      params.message,
      params.files,
      params.remote,
      params.branch
    );

    return {
      success: true,
      data: {
        commit_hash: result.commit_hash,
        pushed: result.pushed,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== git_create_pr ====================

export const gitCreatePrSchema = z.object({
  workspace_path: PathSchema.describe('工作区目录路径'),
  title: z
    .string({
      required_error: 'PR 标题不能为空',
      invalid_type_error: 'PR 标题必须是字符串类型',
    })
    .min(1, 'PR 标题长度不能小于 1')
    .max(500, 'PR 标题长度不能大于 500')
    .describe('Pull Request 标题'),
  body: z
    .string({
      invalid_type_error: 'PR 描述必须是字符串类型',
    })
    .optional()
    .describe('Pull Request 描述（可选）'),
  base_branch: z
    .string({
      required_error: '目标分支不能为空',
      invalid_type_error: '目标分支必须是字符串类型',
    })
    .min(1, '目标分支长度不能小于 1')
    .describe('PR 目标分支'),
  head_branch: z
    .string({
      required_error: '源分支不能为空',
      invalid_type_error: '源分支必须是字符串类型',
    })
    .min(1, '源分支长度不能小于 1')
    .describe('PR 源分支'),
});

export type GitCreatePrInput = z.infer<typeof gitCreatePrSchema>;

export const git_create_pr = {
  name: 'git_create_pr',
  description: '在远程 Git 仓库平台（如 GitHub、GitLab）创建 Pull Request。',
  inputSchema: gitCreatePrSchema.shape,
};

export async function gitCreatePrHandler(
  manager: GitManager,
  input: unknown
): Promise<ToolResult<{ pr_url: string; pr_id: string }>> {
  try {
    const params = validate(gitCreatePrSchema, input, 'git_create_pr 参数校验失败');

    const managerImpl = manager as {
      createPullRequest: (
        workspacePath: string,
        title: string,
        body: string | undefined,
        baseBranch: string,
        headBranch: string
      ) => Promise<{ pr_url: string; pr_id: string }>;
    };
    const result = await managerImpl.createPullRequest(
      params.workspace_path,
      params.title,
      params.body,
      params.base_branch,
      params.head_branch
    );

    return {
      success: true,
      data: {
        pr_url: result.pr_url,
        pr_id: result.pr_id,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== git_review_pr ====================

export const gitReviewPrSchema = z.object({
  workspace_path: PathSchema.describe('工作区目录路径'),
  pr_id: z
    .string({
      required_error: 'PR ID 不能为空',
      invalid_type_error: 'PR ID 必须是字符串类型',
    })
    .min(1, 'PR ID 长度不能小于 1')
    .describe('Pull Request ID 或编号'),
});

export type GitReviewPrInput = z.infer<typeof gitReviewPrSchema>;

export const git_review_pr = {
  name: 'git_review_pr',
  description: '审查指定的 Pull Request，获取其审批状态和评论列表。',
  inputSchema: gitReviewPrSchema.shape,
};

export async function gitReviewPrHandler(
  manager: GitManager,
  input: unknown
): Promise<ToolResult<{ approved: boolean; comments: string[] }>> {
  try {
    const params = validate(gitReviewPrSchema, input, 'git_review_pr 参数校验失败');

    const managerImpl = manager as {
      reviewPullRequest: (
        workspacePath: string,
        prId: string
      ) => Promise<{ approved: boolean; comments: string[] }>;
    };
    const result = await managerImpl.reviewPullRequest(params.workspace_path, params.pr_id);

    return {
      success: true,
      data: {
        approved: result.approved,
        comments: result.comments,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ==================== 工具导出 ====================

export const gitTools = [
  {
    tool: git_init,
    handler: gitInitHandler,
  },
  {
    tool: git_clone,
    handler: gitCloneHandler,
  },
  {
    tool: git_status,
    handler: gitStatusHandler,
  },
  {
    tool: git_branch_create,
    handler: gitBranchCreateHandler,
  },
  {
    tool: git_branch_list,
    handler: gitBranchListHandler,
  },
  {
    tool: git_checkout,
    handler: gitCheckoutHandler,
  },
  {
    tool: git_commit_and_push,
    handler: gitCommitAndPushHandler,
  },
  {
    tool: git_create_pr,
    handler: gitCreatePrHandler,
  },
  {
    tool: git_review_pr,
    handler: gitReviewPrHandler,
  },
];

/**
 * 注册所有 Git 工具到工具注册表
 * @param toolRegistry 工具注册表实例
 * @param gitManager Git 管理器实例
 */
export function registerGitTools(
  toolRegistry: ToolRegistry,
  gitManager: GitManager
): void {
  for (const item of gitTools) {
    const handler = async (params: Record<string, unknown>) => {
      return item.handler(gitManager, params);
    };
    toolRegistry.registerTool(
      {
        name: item.tool.name,
        description: item.tool.description,
        inputSchema: {
          type: 'object' as const,
          properties: item.tool.inputSchema,
        },
      },
      handler
    );
  }
}

// 仅用于类型定义
class ToolRegistry {
  registerTool(_definition: unknown, _handler: unknown): void {}
}
