import {
  executeRemoteHandler,
  syncCodeHandler,
  executeRemoteSchema,
  syncCodeSchema,
} from '../../src/tools/execute-tools';
import { SecurityError } from '../../src/utils/security';
import type { SSHExecutor } from '../../src/ssh/ssh-executor';

// Mock SSHExecutor
const mockExecutor = {
  execute: jest.fn(),
  syncFiles: jest.fn(),
};

describe('Execute Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Schema Validation', () => {
    describe('executeRemoteSchema', () => {
      it('should validate valid execute parameters', () => {
        const validInput = {
          server: {
            host: '192.168.1.1',
            port: 22,
            username: 'admin',
            private_key_path: '/path/to/key',
          },
          command: 'ls -la',
          work_dir: '/home/admin',
        };
        const result = executeRemoteSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should accept hostname as valid host parameter', () => {
        const validInput = {
          server: {
            host: 'server.example.com',
            username: 'admin',
          },
          command: 'echo "hello"',
        };
        const result = executeRemoteSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should use default port when not provided', () => {
        const input = {
          server: {
            host: '192.168.1.1',
            username: 'admin',
          },
          command: 'ls',
        };
        const result = executeRemoteSchema.safeParse(input);
        expect(result.success).toBe(true);
      });

      it('should reject missing server parameter', () => {
        const invalidInput = {
          command: 'ls -la',
        };
        const result = executeRemoteSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject missing command parameter', () => {
        const invalidInput = {
          server: {
            host: '192.168.1.1',
            username: 'admin',
          },
        };
        const result = executeRemoteSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject empty command', () => {
        const invalidInput = {
          server: {
            host: '192.168.1.1',
            username: 'admin',
          },
          command: '',
        };
        const result = executeRemoteSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject invalid host format', () => {
        const invalidInput = {
          server: {
            host: '@invalid-host',
            username: 'admin',
          },
          command: 'ls',
        };
        const result = executeRemoteSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject invalid port numbers', () => {
        const invalidInputs = [
          { server: { host: '192.168.1.1', username: 'admin', port: 0 }, command: 'ls' },
          { server: { host: '192.168.1.1', username: 'admin', port: 65536 }, command: 'ls' },
          { server: { host: '192.168.1.1', username: 'admin', port: -1 }, command: 'ls' },
        ];
        for (const input of invalidInputs) {
          const result = executeRemoteSchema.safeParse(input);
          expect(result.success).toBe(false);
        }
      });

      it('should reject work_dir with path traversal', () => {
        const invalidInput = {
          server: {
            host: '192.168.1.1',
            username: 'admin',
          },
          command: 'ls',
          work_dir: '../etc/passwd',
        };
        const result = executeRemoteSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });

    describe('syncCodeSchema', () => {
      it('should validate valid sync parameters', () => {
        const validInput = {
          server: {
            host: '192.168.1.1',
            port: 22,
            username: 'admin',
          },
          local_path: '/local/path',
          remote_path: '/remote/path',
          direction: 'local-to-remote' as const,
        };
        const result = syncCodeSchema.safeParse(validInput);
        expect(result.success).toBe(true);
      });

      it('should accept both sync directions', () => {
        const directions = ['local-to-remote', 'remote-to-local'] as const;
        for (const direction of directions) {
          const input = {
            server: { host: '192.168.1.1', username: 'admin' },
            local_path: '/local',
            remote_path: '/remote',
            direction,
          };
          const result = syncCodeSchema.safeParse(input);
          expect(result.success).toBe(true);
        }
      });

      it('should reject missing local_path', () => {
        const invalidInput = {
          server: { host: '192.168.1.1', username: 'admin' },
          remote_path: '/remote/path',
          direction: 'local-to-remote' as const,
        };
        const result = syncCodeSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject missing remote_path', () => {
        const invalidInput = {
          server: { host: '192.168.1.1', username: 'admin' },
          local_path: '/local/path',
          direction: 'local-to-remote' as const,
        };
        const result = syncCodeSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject invalid direction', () => {
        const invalidInput = {
          server: { host: '192.168.1.1', username: 'admin' },
          local_path: '/local',
          remote_path: '/remote',
          direction: 'invalid-direction',
        };
        const result = syncCodeSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject path traversal in local_path', () => {
        const invalidInput = {
          server: { host: '192.168.1.1', username: 'admin' },
          local_path: '../etc',
          remote_path: '/remote',
          direction: 'local-to-remote' as const,
        };
        const result = syncCodeSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });

      it('should reject path traversal in remote_path', () => {
        const invalidInput = {
          server: { host: '192.168.1.1', username: 'admin' },
          local_path: '/local',
          remote_path: '../etc',
          direction: 'local-to-remote' as const,
        };
        const result = syncCodeSchema.safeParse(invalidInput);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('executeRemoteHandler', () => {
    it('should return success with execution result when command succeeds', async () => {
      // Setup
      const mockResult = {
        stdout: 'file1.txt\nfile2.txt',
        stderr: '',
        exitCode: 0,
      };
      mockExecutor.execute.mockResolvedValue(mockResult);

      // Execute
      const result = await executeRemoteHandler(
        mockExecutor as unknown as SSHExecutor,
        {
          server: {
            host: '192.168.1.1',
            port: 22,
            username: 'admin',
          },
          command: 'ls -la',
        }
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.stdout).toBe(mockResult.stdout);
        expect(result.data.stderr).toBe('');
        expect(result.data.exitCode).toBe(0);
      }
      expect(mockExecutor.execute).toHaveBeenCalledWith(
        {
          host: '192.168.1.1',
          port: 22,
          username: 'admin',
          privateKeyPath: '',
        },
        'ls -la',
        undefined
      );
    });

    it('should pass work_dir to execute when provided', async () => {
      // Setup
      mockExecutor.execute.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      // Execute
      await executeRemoteHandler(
        mockExecutor as unknown as SSHExecutor,
        {
          server: { host: '192.168.1.1', username: 'admin' },
          command: 'ls -la',
          work_dir: '/home/admin',
        }
      );

      // Verify
      expect(mockExecutor.execute).toHaveBeenCalledWith(
        expect.any(Object),
        'ls -la',
        '/home/admin'
      );
    });

    it('should pass private_key_path to server config when provided', async () => {
      // Setup
      mockExecutor.execute.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      // Execute
      await executeRemoteHandler(
        mockExecutor as unknown as SSHExecutor,
        {
          server: {
            host: '192.168.1.1',
            username: 'admin',
            private_key_path: '/home/admin/.ssh/id_rsa',
          },
          command: 'ls',
        }
      );

      // Verify
      const serverArg = (mockExecutor.execute as jest.Mock).mock.calls[0][0];
      expect(serverArg.privateKeyPath).toBe('/home/admin/.ssh/id_rsa');
    });

    it('should return error when validation fails', async () => {
      // Execute
      const result = await executeRemoteHandler(
        mockExecutor as unknown as SSHExecutor,
        {
          server: { host: '192.168.1.1', username: 'admin' },
          command: '', // Empty command is invalid
        }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('execute_remote');
      }
      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });

    it('should return error when executor throws SecurityError for dangerous command', async () => {
      // Setup
      const securityError = new SecurityError('Dangerous command detected');
      mockExecutor.execute.mockRejectedValue(securityError);

      // Execute
      const result = await executeRemoteHandler(
        mockExecutor as unknown as SSHExecutor,
        {
          server: { host: '192.168.1.1', username: 'admin' },
          command: 'rm -rf /',
        }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Dangerous command detected');
      }
    });

    it('should return error when executor throws connection error', async () => {
      // Setup
      mockExecutor.execute.mockRejectedValue(new Error('Connection refused'));

      // Execute
      const result = await executeRemoteHandler(
        mockExecutor as unknown as SSHExecutor,
        {
          server: { host: '192.168.1.1', username: 'admin' },
          command: 'ls -la',
        }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Connection refused');
      }
    });

    it('should return non-zero exit codes as success with error info in stderr', async () => {
      // Setup
      const mockResult = {
        stdout: '',
        stderr: 'Command not found',
        exitCode: 127,
      };
      mockExecutor.execute.mockResolvedValue(mockResult);

      // Execute
      const result = await executeRemoteHandler(
        mockExecutor as unknown as SSHExecutor,
        {
          server: { host: '192.168.1.1', username: 'admin' },
          command: 'nonexistent-command',
        }
      );

      // Verify - handler returns success: true with exitCode included
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.exitCode).toBe(127);
        expect(result.data.stderr).toBe('Command not found');
      }
    });
  });

  describe('syncCodeHandler', () => {
    it('should return success with synced files when sync succeeds', async () => {
      // Setup
      const mockResult = {
        synced_files: ['file1.txt', 'file2.txt', 'subdir/file3.txt'],
        errors: [],
      };
      mockExecutor.syncFiles.mockResolvedValue(mockResult);

      // Execute
      const result = await syncCodeHandler(
        mockExecutor as unknown as SSHExecutor,
        {
          server: {
            host: '192.168.1.1',
            port: 22,
            username: 'admin',
          },
          local_path: '/local/project',
          remote_path: '/remote/project',
          direction: 'local-to-remote',
        }
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.synced_files).toHaveLength(3);
        expect(result.data.errors).toHaveLength(0);
      }
      expect(mockExecutor.syncFiles).toHaveBeenCalledWith(
        {
          host: '192.168.1.1',
          port: 22,
          username: 'admin',
          privateKeyPath: '',
        },
        '/local/project',
        '/remote/project',
        'local-to-remote'
      );
    });

    it('should handle remote-to-local direction correctly', async () => {
      // Setup
      mockExecutor.syncFiles.mockResolvedValue({ synced_files: ['file.txt'], errors: [] });

      // Execute
      await syncCodeHandler(
        mockExecutor as unknown as SSHExecutor,
        {
          server: { host: '192.168.1.1', username: 'admin' },
          local_path: '/local',
          remote_path: '/remote',
          direction: 'remote-to-local',
        }
      );

      // Verify
      expect(mockExecutor.syncFiles).toHaveBeenCalledWith(
        expect.any(Object),
        '/local',
        '/remote',
        'remote-to-local'
      );
    });

    it('should return success with errors when some files fail to sync', async () => {
      // Setup
      const mockResult = {
        synced_files: ['success.txt'],
        errors: ['Failed to sync error.txt: Permission denied'],
      };
      mockExecutor.syncFiles.mockResolvedValue(mockResult);

      // Execute
      const result = await syncCodeHandler(
        mockExecutor as unknown as SSHExecutor,
        {
          server: { host: '192.168.1.1', username: 'admin' },
          local_path: '/local',
          remote_path: '/remote',
          direction: 'local-to-remote',
        }
      );

      // Verify
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.synced_files).toHaveLength(1);
        expect(result.data.errors).toHaveLength(1);
      }
    });

    it('should return error when validation fails (path traversal)', async () => {
      // Execute
      const result = await syncCodeHandler(
        mockExecutor as unknown as SSHExecutor,
        {
          server: { host: '192.168.1.1', username: 'admin' },
          local_path: '../etc',
          remote_path: '/remote',
          direction: 'local-to-remote',
        }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('sync_code');
      }
      expect(mockExecutor.syncFiles).not.toHaveBeenCalled();
    });

    it('should return error when syncFiles throws connection error', async () => {
      // Setup
      mockExecutor.syncFiles.mockRejectedValue(new Error('SSH connection failed'));

      // Execute
      const result = await syncCodeHandler(
        mockExecutor as unknown as SSHExecutor,
        {
          server: { host: '192.168.1.1', username: 'admin' },
          local_path: '/local',
          remote_path: '/remote',
          direction: 'local-to-remote',
        }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('SSH connection failed');
      }
    });

    it('should handle non-Error throw values gracefully', async () => {
      // Setup
      mockExecutor.syncFiles.mockRejectedValue('Sync failed: timeout');

      // Execute
      const result = await syncCodeHandler(
        mockExecutor as unknown as SSHExecutor,
        {
          server: { host: '192.168.1.1', username: 'admin' },
          local_path: '/local',
          remote_path: '/remote',
          direction: 'local-to-remote',
        }
      );

      // Verify
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Sync failed: timeout');
      }
    });
  });
});
