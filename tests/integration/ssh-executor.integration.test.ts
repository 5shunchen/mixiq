/**
 * SSH 执行器集成测试
 * 使用真实服务器进行测试
 */
import { SSHExecutor } from '../../src/ssh/ssh-executor';
import { SSHConnectionPool } from '../../src/ssh/ssh-connection';
import type { ServerConfig } from '../../src/types';

const TEST_SERVER: ServerConfig = {
  id: 'test-server',
  name: 'Test Server',
  host: '47.253.194.181',
  port: 22,
  username: 'root',
  password: 'c@1234qwer@c',
};

describe('SSHExecutor - Integration Tests', () => {
  let executor: SSHExecutor;
  let pool: SSHConnectionPool;

  beforeAll(() => {
    pool = SSHConnectionPool.getInstance();
    executor = new SSHExecutor(pool);
  }, 60000);

  afterAll(async () => {
    await pool.closeAll();
  }, 30000);

  test('should connect to server and execute simple command', async () => {
    const result = await executor.execute(TEST_SERVER, 'echo "Hello MixIQ"');

    expect(result.stdout.trim()).toBe('Hello MixIQ');
    expect(result.exitCode).toBe(0);
  }, 60000);

  test('should get server information', async () => {
    const result = await executor.execute(TEST_SERVER, 'uname -a');

    console.log('Server OS:', result.stdout.trim());
    expect(result.exitCode).toBe(0);
  }, 60000);

  test('should check current directory', async () => {
    const result = await executor.execute(TEST_SERVER, 'pwd');

    console.log('Current directory:', result.stdout.trim());
    expect(result.exitCode).toBe(0);
  }, 60000);

  test('should check if git is installed', async () => {
    const result = await executor.execute(TEST_SERVER, 'git --version');

    console.log('Git version:', result.stdout.trim());
    expect(result.exitCode).toBe(0);
  }, 60000);

  test('should check if node is installed', async () => {
    const result = await executor.execute(TEST_SERVER, 'node --version');

    console.log('Node version:', result.stdout.trim());
    expect(result.exitCode).toBe(0);
  }, 60000);

  test('should list project files', async () => {
    const result = await executor.execute(TEST_SERVER, 'ls -la /root');

    console.log('Root directory contents:');
    console.log(result.stdout);
    expect(result.exitCode).toBe(0);
  }, 60000);

  test('should check for online-video-downloader project', async () => {
    const result = await executor.execute(TEST_SERVER, 'ls -la /root/online-video-downloader 2>&1 || echo "Directory not found"');

    console.log('Online Video Downloader status:');
    console.log(result.stdout);
  }, 60000);

  test('should check running processes', async () => {
    const result = await executor.execute(TEST_SERVER, 'ps aux | head -20');

    console.log('Running processes:');
    console.log(result.stdout);
    expect(result.exitCode).toBe(0);
  }, 60000);

  test('should block dangerous commands', async () => {
    await expect(executor.execute(TEST_SERVER, 'rm -rf /')).rejects.toThrow('危险命令');
  }, 60000);
});
