import { describe, expect, test } from 'bun:test';
import { access, lstat, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCli, withLocalSkillsFixture, withTempDir } from './cli-test-lib';

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

// Skip integration tests that spawn bun subprocess in CI
// where bun path may not be available
const describeCI = isCI ? describe.skip : describe;

describeCI('skills command', () => {
  test('lists skills from a local source without installing', async () => {
    await withLocalSkillsFixture(async ({ source, env }) => {
      const result = await runCli(['skills', 'add', source, '--list'], { env });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Discovered 2 skill(s):');
      expect(result.stdout).toContain('react-best-practices');
      expect(result.stdout).toContain('web-design-guidelines');
      expect(result.stdout).not.toContain('internal-only-skill');
    });
  });

  test('installs selected skills for project-scoped shared agent paths', async () => {
    await withLocalSkillsFixture(async ({ dir, source, env }) => {
      const result = await runCli(
        [
          'skills',
          'add',
          source,
          '--skill',
          'react-best-practices',
          '--agent',
          'opencode',
          '--agent',
          'amp',
        ],
        {
          env,
          cwd: dir,
        },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Installed 1 skill(s)');

      const skillPath = join(dir, '.agents', 'skills', 'react-best-practices');
      const skillList = await runCli(['skills', 'list', '--json'], {
        env,
        cwd: dir,
      });

      expect(skillList.exitCode).toBe(0);
      const payload = JSON.parse(skillList.stdout) as {
        items: Array<{ record: { skill: string; targetPaths: string[] } }>;
      };
      expect(payload.items.some((entry) => entry.record.skill === 'react-best-practices')).toBe(true);
      expect(
        payload.items.some((entry) =>
          entry.record.targetPaths.some((targetPath) =>
            targetPath.endsWith('/.agents/skills/react-best-practices') ||
            targetPath.endsWith('\\.agents\\skills\\react-best-practices') ||
            targetPath === skillPath,
          ),
        ),
      ).toBe(true);
    });
  });

  test('supports --all to install every discovered skill', async () => {
    await withLocalSkillsFixture(async ({ dir, source, env }) => {
      const result = await runCli(
        ['skills', 'add', source, '--all', '--agent', 'amp', '--copy'],
        {
          env,
          cwd: dir,
        },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Installed 2 skill(s)');

      const skillList = await runCli(['skills', 'list', '--json'], {
        env,
        cwd: dir,
      });
      expect(skillList.exitCode).toBe(0);
      const payload = JSON.parse(skillList.stdout) as {
        items: Array<{ record: { skill: string } }>;
      };
      expect(payload.items.some((entry) => entry.record.skill === 'react-best-practices')).toBe(true);
      expect(payload.items.some((entry) => entry.record.skill === 'web-design-guidelines')).toBe(true);
    });
  });

  test('supports global installs with explicit HOME override', async () => {
    await withLocalSkillsFixture(async ({ dir, source, env }) => {
      const result = await runCli(
        [
          'skills',
          'add',
          source,
          '--skill',
          'web-design-guidelines',
          '--agent',
          'claude-code',
          '--global',
          '--copy',
        ],
        {
          env,
          cwd: dir,
        },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('global scope');

      const globalList = await runCli(['skills', 'list', '--global', '--json'], {
        env,
        cwd: dir,
      });
      expect(globalList.exitCode).toBe(0);
      const payload = JSON.parse(globalList.stdout) as {
        items: Array<{ scope: string; record: { skill: string; method: string; agents: string[] } }>;
      };
      expect(
        payload.items.some(
          (entry) =>
            entry.scope === 'global' &&
            entry.record.skill === 'web-design-guidelines' &&
            entry.record.method === 'copy' &&
            entry.record.agents.includes('claude-code'),
        ),
      ).toBe(true);
    });
  });

  test('returns helpful error for unsupported agent values', async () => {
    await withLocalSkillsFixture(async ({ source, env }) => {
      const result = await runCli(
        ['skills', 'add', source, '--agent', 'unknown-agent', '--skill', 'react-best-practices'],
        { env },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unsupported agent "unknown-agent"');
    });
  });

  test('refuses remote installs in non-interactive mode without --yes', async () => {
    await withLocalSkillsFixture(async ({ env }) => {
      const result = await runCli(
        [
          'skills',
          'add',
          'vercel-labs/agent-skills',
          '--skill',
          'react-best-practices',
          '--agent',
          'amp',
        ],
        { env },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Refusing remote install');
      expect(result.stderr).toContain('--yes');
    });
  });

  test('rejects ambiguous selection when both --all and --skill are provided', async () => {
    await withLocalSkillsFixture(async ({ source, env }) => {
      const result = await runCli(
        [
          'skills',
          'add',
          source,
          '--all',
          '--skill',
          'react-best-practices',
          '--agent',
          'amp',
        ],
        { env },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Use either --all or --skill, not both.');
    });
  });

  test('validates skill frontmatter rules and surfaces errors', async () => {
    await withTempDir(async (tempDir) => {
      const sourceDir = join(tempDir, 'invalid-skills');
      const invalidSkillDir = join(sourceDir, 'skills', 'Bad-Name');
      await mkdir(invalidSkillDir, { recursive: true });
      await Bun.write(
        join(invalidSkillDir, 'SKILL.md'),
        `---
name: Bad-Name
description: Invalid skill naming.
---

# Invalid
`,
      );

      const result = await runCli(
        ['skills', 'add', sourceDir, '--list'],
        {
          env: {
            MODEL_PICKER_CONFIG_DIR: join(tempDir, 'config'),
            HOME: tempDir,
          },
          cwd: tempDir,
        },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid skill');
      expect(result.stderr).toContain('name must use lowercase letters, numbers, and hyphens only');
    });
  });

  test('writes a manifest entry after install', async () => {
    await withLocalSkillsFixture(async ({ dir, source, env }) => {
      const install = await runCli(
        [
          'skills',
          'add',
          source,
          '--skill',
          'react-best-practices',
          '--agent',
          'codex',
          '--copy',
        ],
        {
          env,
          cwd: dir,
        },
      );

      expect(install.exitCode).toBe(0);

      const manifestPath = join(dir, '.model-picker', 'skills', 'manifest.json');
      const raw = await readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(raw) as {
        version: number;
        installs: Array<{
          skill: string;
          agents: string[];
          method: string;
          sourceType?: string;
          resolvedSource?: string;
        }>;
      };
      expect(manifest.version).toBe(1);
      expect(
        manifest.installs.some(
          (entry) =>
            entry.skill === 'react-best-practices' &&
            entry.method === 'copy' &&
            entry.agents.includes('codex'),
        ),
      ).toBe(true);
      expect(
        manifest.installs.some(
          (entry) =>
            entry.skill === 'react-best-practices' &&
            entry.sourceType === 'local' &&
            typeof entry.resolvedSource === 'string',
        ),
      ).toBe(true);
    });
  });

  test('removes a skill for only selected agents and keeps shared target path', async () => {
    await withLocalSkillsFixture(async ({ dir, source, env }) => {
      const install = await runCli(
        [
          'skills',
          'add',
          source,
          '--skill',
          'react-best-practices',
          '--agent',
          'amp',
          '--agent',
          'opencode',
          '--copy',
        ],
        {
          env,
          cwd: dir,
        },
      );
      expect(install.exitCode).toBe(0);

      const remove = await runCli(
        [
          'skills',
          'remove',
          '--skill',
          'react-best-practices',
          '--agent',
          'amp',
        ],
        {
          env,
          cwd: dir,
        },
      );

      expect(remove.exitCode).toBe(0);
      expect(remove.stdout).toContain('Removed 1 skill(s)');
      expect(remove.stdout).toContain('remaining: opencode');

      const skillPath = join(dir, '.agents', 'skills', 'react-best-practices');
      await expect(lstat(skillPath)).resolves.toBeDefined();

      const skillList = await runCli(['skills', 'list', '--json'], {
        env,
        cwd: dir,
      });
      expect(skillList.exitCode).toBe(0);
      const payload = JSON.parse(skillList.stdout) as {
        items: Array<{ record: { skill: string; agents: string[] } }>;
      };
      expect(
        payload.items.some(
          (entry) =>
            entry.record.skill === 'react-best-practices' &&
            entry.record.agents.includes('opencode') &&
            !entry.record.agents.includes('amp'),
        ),
      ).toBe(true);
    });
  });

  test('removes installed skills with positional skill argument', async () => {
    await withLocalSkillsFixture(async ({ dir, source, env }) => {
      const install = await runCli(
        [
          'skills',
          'add',
          source,
          '--skill',
          'react-best-practices',
          '--agent',
          'codex',
          '--copy',
        ],
        {
          env,
          cwd: dir,
        },
      );
      expect(install.exitCode).toBe(0);

      const remove = await runCli(
        ['skills', 'remove', 'react-best-practices'],
        {
          env,
          cwd: dir,
        },
      );

      expect(remove.exitCode).toBe(0);
      expect(remove.stdout).toContain('Removed 1 skill(s)');

      const skillPath = join(dir, '.agents', 'skills', 'react-best-practices');
      await expect(access(skillPath)).rejects.toThrow();

      const skillList = await runCli(['skills', 'list', '--json'], {
        env,
        cwd: dir,
      });
      expect(skillList.exitCode).toBe(0);
      const payload = JSON.parse(skillList.stdout) as {
        items: Array<{ record: { skill: string } }>;
      };
      expect(payload.items.some((entry) => entry.record.skill === 'react-best-practices')).toBe(false);
    });
  });

  test('requires --skill or --all for skills remove', async () => {
    await withLocalSkillsFixture(async ({ env }) => {
      const result = await runCli(['skills', 'remove'], { env });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Provide at least one skill via --skill (or use --all).');
    });
  });

  test('supports --all to remove all installed skills', async () => {
    await withLocalSkillsFixture(async ({ dir, source, env }) => {
      const install = await runCli(
        [
          'skills',
          'add',
          source,
          '--all',
          '--agent',
          'codex',
          '--copy',
        ],
        {
          env,
          cwd: dir,
        },
      );
      expect(install.exitCode).toBe(0);

      const remove = await runCli(['skills', 'remove', '--all'], {
        env,
        cwd: dir,
      });

      expect(remove.exitCode).toBe(0);
      expect(remove.stdout).toContain('Removed 2 skill(s)');

      const skillList = await runCli(['skills', 'list', '--json'], {
        env,
        cwd: dir,
      });
      expect(skillList.exitCode).toBe(0);
      const payload = JSON.parse(skillList.stdout) as {
        items: Array<{ record: { skill: string } }>;
      };
      expect(payload.items.length).toBe(0);
    });
  });

  test('rejects ambiguous selection when both --all and --skill provided on remove', async () => {
    await withLocalSkillsFixture(async ({ source, env, dir }) => {
      const install = await runCli(
        ['skills', 'add', source, '--skill', 'react-best-practices', '--agent', 'codex'],
        { env, cwd: dir },
      );
      expect(install.exitCode).toBe(0);

      const result = await runCli(
        ['skills', 'remove', '--all', '--skill', 'react-best-practices'],
        { env, cwd: dir },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Use either --all or --skill, not both.');
    });
  });

  test('supports global remove with --global flag', async () => {
    await withLocalSkillsFixture(async ({ dir, source, env }) => {
      const install = await runCli(
        [
          'skills',
          'add',
          source,
          '--skill',
          'react-best-practices',
          '--agent',
          'codex',
          '--global',
          '--copy',
        ],
        {
          env,
          cwd: dir,
        },
      );
      expect(install.exitCode).toBe(0);

      const globalList = await runCli(['skills', 'list', '--global', '--json'], {
        env,
        cwd: dir,
      });
      expect(globalList.exitCode).toBe(0);
      const beforePayload = JSON.parse(globalList.stdout) as {
        items: Array<{ record: { skill: string } }>;
      };
      expect(beforePayload.items.length).toBe(1);

      const remove = await runCli(
        ['skills', 'remove', '--skill', 'react-best-practices', '--global'],
        {
          env,
          cwd: dir,
        },
      );

      expect(remove.exitCode).toBe(0);
      expect(remove.stdout).toContain('global scope');

      const afterList = await runCli(['skills', 'list', '--global', '--json'], {
        env,
        cwd: dir,
      });
      expect(afterList.exitCode).toBe(0);
      const afterPayload = JSON.parse(afterList.stdout) as {
        items: Array<{ record: { skill: string } }>;
      };
      expect(afterPayload.items.length).toBe(0);
    });
  });

  test('allows remote install with --yes flag in non-interactive mode', async () => {
    await withTempDir(async (tempDir) => {
      const result = await runCli(
        [
          'skills',
          'add',
          'vercel-labs/agent-skills',
          '--skill',
          'react-best-practices',
          '--agent',
          'amp',
          '--yes',
          '--list',
        ],
        {
          env: {
            MODEL_PICKER_CONFIG_DIR: join(tempDir, 'config'),
            HOME: tempDir,
          },
          cwd: tempDir,
        },
      );

      // Should either succeed (if remote source available) or fail with a different error
      // But it should NOT fail with "Refusing remote install"
      expect(result.stderr).not.toContain('Refusing remote install');
    });
  });

  test('stores sourceCommit and sourceRef in manifest for local git sources', async () => {
    await withTempDir(async (tempDir) => {
      const skillsDir = join(tempDir, 'skills-repo', 'my-skill');
      await mkdir(skillsDir, { recursive: true });
      await Bun.write(
        join(skillsDir, 'SKILL.md'),
        `---
name: my-skill
description: A test skill with commit tracking.
---

# My Skill
`,
      );

      // Initialize git repo
      const initResult = await new Promise<{ code: number; stdout: string; stderr: string }>(
        (resolve) => {
          const proc = Bun.spawn({
            cmd: ['git', 'init'],
            cwd: join(tempDir, 'skills-repo'),
            stdout: 'pipe',
            stderr: 'pipe',
          });
          Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
          ]).then(([stdout, stderr]) => {
            proc.exited.then((code) => resolve({ code, stdout, stderr }));
          });
        },
      );
      expect(initResult.code).toBe(0);

      // Configure git user
      await new Promise<void>((resolve) => {
        Bun.spawn({
          cmd: ['git', 'config', 'user.email', 'test@test.com'],
          cwd: join(tempDir, 'skills-repo'),
        }).exited.then(() => resolve());
      });
      await new Promise<void>((resolve) => {
        Bun.spawn({
          cmd: ['git', 'config', 'user.name', 'Test'],
          cwd: join(tempDir, 'skills-repo'),
        }).exited.then(() => resolve());
      });

      // Add and commit
      await new Promise<void>((resolve) => {
        Bun.spawn({
          cmd: ['git', 'add', '.'],
          cwd: join(tempDir, 'skills-repo'),
        }).exited.then(() => resolve());
      });
      await new Promise<void>((resolve) => {
        Bun.spawn({
          cmd: ['git', 'commit', '-m', 'Initial commit'],
          cwd: join(tempDir, 'skills-repo'),
        }).exited.then(() => resolve());
      });

      const install = await runCli(
        [
          'skills',
          'add',
          join(tempDir, 'skills-repo'),
          '--skill',
          'my-skill',
          '--agent',
          'codex',
          '--copy',
        ],
        {
          env: {
            MODEL_PICKER_CONFIG_DIR: join(tempDir, 'config'),
            HOME: tempDir,
          },
          cwd: tempDir,
        },
      );

      expect(install.exitCode).toBe(0);

      const manifestPath = join(tempDir, '.model-picker', 'skills', 'manifest.json');
      const raw = await readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(raw) as {
        installs: Array<{
          skill: string;
          sourceType?: string;
          sourceCommit?: string;
          sourceRef?: string;
        }>;
      };

      const entry = manifest.installs.find((e) => e.skill === 'my-skill');
      expect(entry).toBeDefined();
      expect(entry?.sourceType).toBe('local');
      expect(entry?.sourceCommit).toBeDefined();
      expect(entry?.sourceCommit?.length).toBeGreaterThan(0);
    });
  });

  test('supports multiple comma-separated skills in --skill flag', async () => {
    await withLocalSkillsFixture(async ({ dir, source, env }) => {
      const result = await runCli(
        [
          'skills',
          'add',
          source,
          '--skill',
          'react-best-practices,web-design-guidelines',
          '--agent',
          'codex',
        ],
        {
          env,
          cwd: dir,
        },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Installed 2 skill(s)');

      const skillList = await runCli(['skills', 'list', '--json'], {
        env,
        cwd: dir,
      });
      expect(skillList.exitCode).toBe(0);
      const payload = JSON.parse(skillList.stdout) as {
        items: Array<{ record: { skill: string } }>;
      };
      expect(payload.items.some((entry) => entry.record.skill === 'react-best-practices')).toBe(true);
      expect(payload.items.some((entry) => entry.record.skill === 'web-design-guidelines')).toBe(true);
    });
  });

  test('supports multiple comma-separated agents in --agent flag', async () => {
    await withLocalSkillsFixture(async ({ dir, source, env }) => {
      const result = await runCli(
        [
          'skills',
          'add',
          source,
          '--skill',
          'react-best-practices',
          '--agent',
          'amp,opencode,codex',
        ],
        {
          env,
          cwd: dir,
        },
      );

      expect(result.exitCode).toBe(0);

      const skillList = await runCli(['skills', 'list', '--json'], {
        env,
        cwd: dir,
      });
      expect(skillList.exitCode).toBe(0);
      const payload = JSON.parse(skillList.stdout) as {
        items: Array<{ record: { skill: string; agents: string[] } }>;
      };
      const entry = payload.items.find((e) => e.record.skill === 'react-best-practices');
      expect(entry).toBeDefined();
      expect(entry?.record.agents).toContain('amp');
      expect(entry?.record.agents).toContain('opencode');
      expect(entry?.record.agents).toContain('codex');
    });
  });

  test('removes non-existent skill returns appropriate error', async () => {
    await withLocalSkillsFixture(async ({ env, dir }) => {
      const result = await runCli(['skills', 'remove', '--skill', 'non-existent-skill'], {
        env,
        cwd: dir,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('No installed skills matched: non-existent-skill');
    });
  });

  test('lists both project and global scoped skills by default', async () => {
    await withLocalSkillsFixture(async ({ dir, source, env }) => {
      // Install a project-scoped skill
      await runCli(
        ['skills', 'add', source, '--skill', 'react-best-practices', '--agent', 'amp'],
        { env, cwd: dir },
      );

      // Install a global-scoped skill
      await runCli(
        ['skills', 'add', source, '--skill', 'web-design-guidelines', '--agent', 'amp', '--global'],
        { env, cwd: dir },
      );

      const list = await runCli(['skills', 'list', '--json'], {
        env,
        cwd: dir,
      });

      expect(list.exitCode).toBe(0);
      const payload = JSON.parse(list.stdout) as {
        items: Array<{ scope: string; record: { skill: string } }>;
      };

      expect(payload.items.length).toBe(2);
      expect(payload.items.some((e) => e.scope === 'project' && e.record.skill === 'react-best-practices')).toBe(true);
      expect(payload.items.some((e) => e.scope === 'global' && e.record.skill === 'web-design-guidelines')).toBe(true);
    });
  });
});
