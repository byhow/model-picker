import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  addSkillsFromSource,
  formatSkillInstallMethod,
  formatSkillInstallScope,
  isSymlink,
  listInstalledSkills,
  removeInstalledSkills,
  resolveInstalledPath,
} from './skills';

describe('skills unit tests', () => {
  async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), 'skills-unit-test-'));
    try {
      return await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async function createSkillRepo(dir: string, skills: Array<{ name: string; description: string }>) {
    for (const skill of skills) {
      const skillDir = join(dir, skill.name);
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, 'SKILL.md'),
        `---
name: ${skill.name}
description: ${skill.description}
---

# ${skill.name}
`,
      );
    }
  }

  test('isSymlink returns true for symlinks', async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, 'target');
      const link = join(dir, 'link');
      await mkdir(target, { recursive: true });
      await Bun.$`ln -s ${target} ${link}`;

      expect(await isSymlink(link)).toBe(true);
      expect(await isSymlink(target)).toBe(false);
      expect(await isSymlink(join(dir, 'nonexistent'))).toBe(false);
    });
  });

  test('resolveInstalledPath resolves symlinks', async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, 'target');
      const link = join(dir, 'link');
      await mkdir(target, { recursive: true });
      await Bun.$`ln -s ${target} ${link}`;

      const resolved = await resolveInstalledPath(link);
      // On macOS, /var is a symlink to /private/var, so paths may differ
      expect(resolved.endsWith('/target')).toBe(true);
      expect(await isSymlink(link)).toBe(true);
    });
  });

  test('addSkillsFromSource lists skills without installing', async () => {
    await withTempDir(async (dir) => {
      const sourceDir = join(dir, 'source');
      await createSkillRepo(sourceDir, [
        { name: 'skill-one', description: 'First skill' },
        { name: 'skill-two', description: 'Second skill' },
      ]);

      const result = await addSkillsFromSource(sourceDir, {
        agents: ['opencode'],
        list: true,
      });

      expect(result.discoveredSkills.length).toBe(2);
      expect(result.discoveredSkills.some((s) => s.name === 'skill-one')).toBe(true);
      expect(result.discoveredSkills.some((s) => s.name === 'skill-two')).toBe(true);
      expect(result.installedRecords.length).toBe(0);
    });
  });

  test('addSkillsFromSource installs selected skills', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      await createSkillRepo(sourceDir, [
        { name: 'test-skill', description: 'A test skill' },
      ]);

      const result = await addSkillsFromSource(sourceDir, {
        agents: ['opencode'],
        skills: ['test-skill'],
        copy: true,
      });

      expect(result.installedRecords.length).toBe(1);
      expect(result.installedRecords[0]!.skill).toBe('test-skill');
      expect(result.installedRecords[0]!.agents).toContain('opencode');
      expect(result.installedRecords[0]!.scope).toBe('project');
      expect(result.installedRecords[0]!.method).toBe('copy');
      expect(result.installedRecords[0]!.sourceType).toBe('local');
      // sourceCommit will be undefined if source is not a git repo
      expect(result.installedRecords[0]!.resolvedSource).toBe(sourceDir);
    });
  });

  test('addSkillsFromSource with --all installs all skills', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      await createSkillRepo(sourceDir, [
        { name: 'skill-a', description: 'Skill A' },
        { name: 'skill-b', description: 'Skill B' },
      ]);

      const result = await addSkillsFromSource(sourceDir, {
        agents: ['opencode'],
        all: true,
        copy: true,
      });

      expect(result.installedRecords.length).toBe(2);
      expect(result.selectedSkills.length).toBe(2);
    });
  });

  test('addSkillsFromSource rejects --all and --skill together', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      await createSkillRepo(sourceDir, [{ name: 'test-skill', description: 'Test' }]);

      expect(
        addSkillsFromSource(sourceDir, {
          agents: ['opencode'],
          all: true,
          skills: ['test-skill'],
        }),
      ).rejects.toThrow('Use either --all or --skill, not both.');
    });
  });

  test('listInstalledSkills returns empty for fresh directory', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const result = await listInstalledSkills();

      expect(result.items.length).toBe(0);
      expect(result.manifestPaths.length).toBe(2); // project + global
    });
  });

  test('listInstalledSkills with global returns only global', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const result = await listInstalledSkills({ global: true });

      expect(result.items.length).toBe(0);
      expect(result.manifestPaths.length).toBe(1);
    });
  });

  test('removeInstalledSkills requires --skill or --all', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      expect(removeInstalledSkills({})).rejects.toThrow(
        'Provide at least one skill via --skill (or use --all).',
      );
    });
  });

  test('removeInstalledSkills rejects --all and --skill together', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      expect(
        removeInstalledSkills({
          all: true,
          skills: ['test-skill'],
        }),
      ).rejects.toThrow('Use either --all or --skill, not both.');
    });
  });

  test('removeInstalledSkills removes skill from all agents', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      await createSkillRepo(sourceDir, [{ name: 'test-skill', description: 'Test' }]);

      // First install
      await addSkillsFromSource(sourceDir, {
        agents: ['opencode', 'amp'],
        skills: ['test-skill'],
        copy: true,
      });

      // Then remove
      const result = await removeInstalledSkills({
        skills: ['test-skill'],
      });

      expect(result.removedRecords.length).toBe(1);
      expect(result.removedRecords[0]!.skill).toBe('test-skill');
      expect(result.removedRecords[0]!.removedAgents).toContain('opencode');
      expect(result.removedRecords[0]!.removedAgents).toContain('amp');
      expect(result.remainingRecords.length).toBe(0);
    });
  });

  test('removeInstalledSkills removes skill from specific agents', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      await createSkillRepo(sourceDir, [{ name: 'test-skill', description: 'Test' }]);

      // First install for two agents
      await addSkillsFromSource(sourceDir, {
        agents: ['opencode', 'amp'],
        skills: ['test-skill'],
        copy: true,
      });

      // Remove from only one agent
      const result = await removeInstalledSkills({
        skills: ['test-skill'],
        agents: ['opencode'],
      });

      expect(result.removedRecords.length).toBe(1);
      expect(result.removedRecords[0]!.removedAgents).toContain('opencode');
      expect(result.removedRecords[0]!.remainingAgents).toContain('amp');
      expect(result.remainingRecords.length).toBe(1);
      expect(result.remainingRecords[0]!.agents).toContain('amp');
      expect(result.remainingRecords[0]!.agents).not.toContain('opencode');
    });
  });

  test('removeInstalledSkills with --all removes all skills', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      await createSkillRepo(sourceDir, [
        { name: 'skill-a', description: 'Skill A' },
        { name: 'skill-b', description: 'Skill B' },
      ]);

      // Install both
      await addSkillsFromSource(sourceDir, {
        agents: ['opencode'],
        all: true,
        copy: true,
      });

      // Remove all
      const result = await removeInstalledSkills({ all: true });

      expect(result.removedRecords.length).toBe(2);
      expect(result.remainingRecords.length).toBe(0);
    });
  });

  test('removeInstalledSkills errors on non-existent skill', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      expect(
        removeInstalledSkills({
          skills: ['non-existent'],
        }),
      ).rejects.toThrow('No installed skills matched: non-existent');
    });
  });

  test('removeInstalledSkills errors when agent not installed', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      await createSkillRepo(sourceDir, [{ name: 'test-skill', description: 'Test' }]);

      // Install for opencode only
      await addSkillsFromSource(sourceDir, {
        agents: ['opencode'],
        skills: ['test-skill'],
        copy: true,
      });

      // Try to remove for amp (not installed)
      expect(
        removeInstalledSkills({
          skills: ['test-skill'],
          agents: ['amp'],
        }),
      ).rejects.toThrow('Matched skills are not installed for target agents: amp');
    });
  });

  test('addSkillsFromSource stores sourceType as local for local paths', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      await createSkillRepo(sourceDir, [{ name: 'local-skill', description: 'Local skill' }]);

      const result = await addSkillsFromSource(sourceDir, {
        agents: ['opencode'],
        skills: ['local-skill'],
        copy: true,
      });

      expect(result.installedRecords[0]!.sourceType).toBe('local');
      expect(result.installedRecords[0]!.resolvedSource).toBe(sourceDir);
    });
  });

  test('addSkillsFromSource handles skill name validation', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      const badSkillDir = join(sourceDir, 'BadName');
      await mkdir(badSkillDir, { recursive: true });
      await writeFile(
        join(badSkillDir, 'SKILL.md'),
        `---
name: BadName
description: Invalid name.
---
`,
      );

      expect(
        addSkillsFromSource(sourceDir, {
          agents: ['opencode'],
          list: true,
        }),
      ).rejects.toThrow('name must use lowercase letters');
    });
  });

  test('addSkillsFromSource handles missing skill', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      await createSkillRepo(sourceDir, [{ name: 'exists', description: 'Exists' }]);

      expect(
        addSkillsFromSource(sourceDir, {
          agents: ['opencode'],
          skills: ['does-not-exist'],
          copy: true,
        }),
      ).rejects.toThrow('Unknown skill "does-not-exist"');
    });
  });

  test('addSkillsFromSource supports symlink method', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      await createSkillRepo(sourceDir, [{ name: 'linked-skill', description: 'Linked' }]);

      const result = await addSkillsFromSource(sourceDir, {
        agents: ['opencode'],
        skills: ['linked-skill'],
        copy: false, // use symlink
      });

      expect(result.method).toBe('symlink');
      expect(result.installedRecords[0]!.method).toBe('symlink');
    });
  });

  test('addSkillsFromSource with global scope', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      await createSkillRepo(sourceDir, [{ name: 'global-skill', description: 'Global skill' }]);

      const result = await addSkillsFromSource(sourceDir, {
        agents: ['opencode'],
        skills: ['global-skill'],
        global: true,
        copy: true,
      });

      expect(result.scope).toBe('global');
      expect(result.installedRecords[0]!.scope).toBe('global');
    });
  });

  test('addSkillsFromSource captures sourceCommit in git repo', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      await createSkillRepo(sourceDir, [{ name: 'git-skill', description: 'Git skill' }]);

      // Initialize git repo and make a commit
      await Bun.$`cd ${sourceDir} && git init`;
      await Bun.$`cd ${sourceDir} && git config user.email "test@test.com"`;
      await Bun.$`cd ${sourceDir} && git config user.name "Test"`;
      await Bun.$`cd ${sourceDir} && git add .`;
      await Bun.$`cd ${sourceDir} && git commit -m "Initial"`;

      const result = await addSkillsFromSource(sourceDir, {
        agents: ['opencode'],
        skills: ['git-skill'],
        copy: true,
      });

      expect(result.installedRecords[0]!.sourceCommit).toBeDefined();
      expect(result.installedRecords[0]!.sourceCommit?.length).toBe(40); // SHA-1 hash
    });
  });

  test('addSkillsFromSource with multiple skills by name', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      await createSkillRepo(sourceDir, [
        { name: 'skill-one', description: 'One' },
        { name: 'skill-two', description: 'Two' },
      ]);

      const result = await addSkillsFromSource(sourceDir, {
        agents: ['opencode'],
        skills: ['skill-one', 'skill-two'],
        copy: true,
      });

      expect(result.installedRecords.length).toBe(2);
    });
  });

  test('removeInstalledSkills with global scope', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      await createSkillRepo(sourceDir, [{ name: 'global-skill', description: 'Global' }]);

      // Install globally
      await addSkillsFromSource(sourceDir, {
        agents: ['opencode'],
        skills: ['global-skill'],
        global: true,
        copy: true,
      });

      // Remove globally
      const result = await removeInstalledSkills({
        skills: ['global-skill'],
        global: true,
      });

      expect(result.scope).toBe('global');
      expect(result.removedRecords.length).toBe(1);
    });
  });

  test('removeInstalledSkills with --all and no skills installed returns error', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);

      await expect(
        removeInstalledSkills({ all: true }),
      ).rejects.toThrow('No installed skills found in project scope');
    });
  });

  test('addSkillsFromSource validates empty source', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);

      await expect(
        addSkillsFromSource('', {
          agents: ['opencode'],
          list: true,
        }),
      ).rejects.toThrow('A source is required');
    });
  });

  test('addSkillsFromSource handles skill with long description', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      const longDescription = 'A'.repeat(1000);
      await createSkillRepo(sourceDir, [
        { name: 'long-desc-skill', description: longDescription },
      ]);

      const result = await addSkillsFromSource(sourceDir, {
        agents: ['opencode'],
        skills: ['long-desc-skill'],
        copy: true,
      });

      expect(result.installedRecords.length).toBe(1);
    });
  });

  test('addSkillsFromSource rejects skill with too long description', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      const tooLongDesc = 'A'.repeat(1025);
      const skillDir = join(sourceDir, 'bad-skill');
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, 'SKILL.md'),
        `---
name: bad-skill
description: ${tooLongDesc}
---
`,
      );

      await expect(
        addSkillsFromSource(sourceDir, {
          agents: ['opencode'],
          list: true,
        }),
      ).rejects.toThrow('description must be between 1 and 1024 characters');
    });
  });

  test('addSkillsFromSource rejects skill with no description', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      const skillDir = join(sourceDir, 'no-desc');
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, 'SKILL.md'),
        `---
name: no-desc
---
`,
      );

      await expect(
        addSkillsFromSource(sourceDir, {
          agents: ['opencode'],
          list: true,
        }),
      ).rejects.toThrow('frontmatter.description is required');
    });
  });

  test('addSkillsFromSource handles skills in subdirectory', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source', 'skills');
      await createSkillRepo(sourceDir, [{ name: 'nested-skill', description: 'Nested' }]);

      const result = await addSkillsFromSource(join(dir, 'source'), {
        agents: ['opencode'],
        skills: ['nested-skill'],
        copy: true,
      });

      expect(result.installedRecords.length).toBe(1);
      expect(result.installedRecords[0]!.skill).toBe('nested-skill');
    });
  });

  test('addSkillsFromSource handles skills with metadata', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      const skillDir = join(sourceDir, 'meta-skill');
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, 'SKILL.md'),
        `---
name: meta-skill
description: Skill with metadata
license: MIT
compatibility: node >= 18
metadata:
  internal: false
  category: testing
allowed-tools: read write
---

# Meta Skill
`,
      );

      const result = await addSkillsFromSource(sourceDir, {
        agents: ['opencode'],
        skills: ['meta-skill'],
        copy: true,
      });

      expect(result.installedRecords.length).toBe(1);
    });
  });

  test('addSkillsFromSource rejects invalid metadata type', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      const skillDir = join(sourceDir, 'bad-meta');
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, 'SKILL.md'),
        `---
name: bad-meta
description: Bad metadata
metadata:
  key: 123
---
`,
      );

      await expect(
        addSkillsFromSource(sourceDir, {
          agents: ['opencode'],
          list: true,
        }),
      ).rejects.toThrow('metadata.key must be a string or boolean');
    });
  });

  test('addSkillsFromSource handles YAML parsing errors gracefully', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      const skillDir = join(sourceDir, 'bad-yaml');
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, 'SKILL.md'),
        `---
name: [invalid
  yaml: syntax
---
`,
      );

      await expect(
        addSkillsFromSource(sourceDir, {
          agents: ['opencode'],
          list: true,
        }),
      ).rejects.toThrow('invalid YAML frontmatter');
    });
  });

  test('addSkillsFromSource handles missing frontmatter delimiter', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      const skillDir = join(sourceDir, 'no-delim');
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, 'SKILL.md'),
        `name: no-delim
description: Missing delimiter
`,
      );

      await expect(
        addSkillsFromSource(sourceDir, {
          agents: ['opencode'],
          list: true,
        }),
      ).rejects.toThrow('SKILL.md must start with YAML frontmatter');
    });
  });

  test('addSkillsFromSource handles unclosed frontmatter', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      const skillDir = join(sourceDir, 'unclosed');
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, 'SKILL.md'),
        `---
name: unclosed
description: No closing delimiter
`,
      );

      await expect(
        addSkillsFromSource(sourceDir, {
          agents: ['opencode'],
          list: true,
        }),
      ).rejects.toThrow('frontmatter is not properly closed');
    });
  });

  test('addSkillsFromSource handles allowed-tools validation', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      const skillDir = join(sourceDir, 'bad-tools');
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, 'SKILL.md'),
        `---
name: bad-tools
description: Bad allowed-tools
allowed-tools: 123
---
`,
      );

      await expect(
        addSkillsFromSource(sourceDir, {
          agents: ['opencode'],
          list: true,
        }),
      ).rejects.toThrow('allowed-tools must be a space-delimited string');
    });
  });

  test('addSkillsFromSource handles compatibility validation', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      const skillDir = join(sourceDir, 'bad-compat');
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, 'SKILL.md'),
        `---
name: bad-compat
description: Bad compatibility
compatibility: ${'a'.repeat(501)}
---
`,
      );

      await expect(
        addSkillsFromSource(sourceDir, {
          agents: ['opencode'],
          list: true,
        }),
      ).rejects.toThrow('compatibility must be a string between 1 and 500 characters');
    });
  });

  test('addSkillsFromSource handles name with consecutive hyphens', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      const skillDir = join(sourceDir, 'bad--name');
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, 'SKILL.md'),
        `---
name: bad--name
description: Bad name
---
`,
      );

      await expect(
        addSkillsFromSource(sourceDir, {
          agents: ['opencode'],
          list: true,
        }),
      ).rejects.toThrow('name cannot contain consecutive hyphens');
    });
  });

  test('addSkillsFromSource handles name not matching directory', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      const skillDir = join(sourceDir, 'wrong-dir');
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, 'SKILL.md'),
        `---
name: different-name
description: Wrong directory name
---
`,
      );

      await expect(
        addSkillsFromSource(sourceDir, {
          agents: ['opencode'],
          list: true,
        }),
      ).rejects.toThrow('name must match parent directory');
    });
  });

  test('addSkillsFromSource handles name with invalid characters', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      const skillDir = join(sourceDir, 'invalid_name');
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, 'SKILL.md'),
        `---
name: invalid_name
description: Invalid characters
---
`,
      );

      await expect(
        addSkillsFromSource(sourceDir, {
          agents: ['opencode'],
          list: true,
        }),
      ).rejects.toThrow('name must use lowercase letters, numbers, and hyphens only');
    });
  });

  test('addSkillsFromSource handles wildcard selection with *', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      await createSkillRepo(sourceDir, [
        { name: 'skill-a', description: 'A' },
        { name: 'skill-b', description: 'B' },
      ]);

      const result = await addSkillsFromSource(sourceDir, {
        agents: ['opencode'],
        skills: ['*'],
        copy: true,
      });

      expect(result.installedRecords.length).toBe(2);
    });
  });

  test('addSkillsFromSource handles whitespace-only skill names', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      await createSkillRepo(sourceDir, [{ name: 'only-skill', description: 'Only' }]);

      const result = await addSkillsFromSource(sourceDir, {
        agents: ['opencode'],
        skills: ['   ', 'only-skill'],
        copy: true,
      });

      expect(result.installedRecords.length).toBe(1);
    });
  });

  test('addSkillsFromSource deduplicates discovered skills', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      // Create same skill in multiple locations
      await createSkillRepo(join(sourceDir, 'skills'), [
        { name: 'dup-skill', description: 'Duplicate' },
      ]);
      await createSkillRepo(join(sourceDir, '.agents', 'skills'), [
        { name: 'dup-skill', description: 'Duplicate' },
      ]);

      const result = await addSkillsFromSource(sourceDir, {
        agents: ['opencode'],
        skills: ['dup-skill'],
        copy: true,
      });

      // Should only install once despite being found in multiple paths
      expect(result.installedRecords.length).toBe(1);
    });
  });

  test('addSkillsFromSource handles agent deduplication', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      await createSkillRepo(sourceDir, [{ name: 'dedup-test', description: 'Test' }]);

      // amp and opencode share the same target directory
      const result = await addSkillsFromSource(sourceDir, {
        agents: ['amp', 'opencode', 'amp'], // duplicate amp
        skills: ['dedup-test'],
        copy: true,
      });

      expect(result.installedRecords.length).toBe(1);
      expect(result.installedRecords[0]!.agents.length).toBe(2);
    });
  });

  test('removeInstalledSkills handles removing all agents from a skill', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      await createSkillRepo(sourceDir, [{ name: 'multi-agent', description: 'Multi' }]);

      // Install for multiple agents
      await addSkillsFromSource(sourceDir, {
        agents: ['opencode', 'amp', 'codex'],
        skills: ['multi-agent'],
        copy: true,
      });

      // Remove from all agents by not specifying --agent
      const result = await removeInstalledSkills({
        skills: ['multi-agent'],
      });

      expect(result.removedRecords.length).toBe(1);
      expect(result.removedRecords[0]!.remainingAgents.length).toBe(0);
      expect(result.remainingRecords.length).toBe(0);
    });
  });

  test('formatSkillInstallScope formats correctly', () => {
    expect(formatSkillInstallScope('global')).toBe('global');
    expect(formatSkillInstallScope('project')).toBe('project');
  });

  test('formatSkillInstallMethod formats correctly', () => {
    expect(formatSkillInstallMethod('copy')).toBe('copy');
    expect(formatSkillInstallMethod('symlink')).toBe('symlink');
  });

  test('addSkillsFromSource handles empty agents array', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      await createSkillRepo(sourceDir, [{ name: 'test-skill', description: 'Test' }]);

      // Create a config with preferredAgents
      const configDir = join(dir, '.config', 'model-picker');
      await mkdir(configDir, { recursive: true });
      await writeFile(
        join(configDir, 'config.json'),
        JSON.stringify({
          skills: {
            preferredAgents: ['opencode'],
          },
        }),
      );

      process.env.MODEL_PICKER_CONFIG_DIR = configDir;

      const result = await addSkillsFromSource(sourceDir, {
        skills: ['test-skill'],
        copy: true,
      });

      expect(result.installedRecords.length).toBe(1);
      expect(result.installedRecords[0]!?.agents).toContain('opencode');

      delete process.env.MODEL_PICKER_CONFIG_DIR;
    });
  });

  test('addSkillsFromSource handles all supported agents', async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const sourceDir = join(dir, 'source');
      await createSkillRepo(sourceDir, [{ name: 'all-agents', description: 'All agents test' }]);

      const result = await addSkillsFromSource(sourceDir, {
        agents: ['amp', 'opencode', 'codex', 'cursor', 'claude-code'],
        skills: ['all-agents'],
        copy: true,
      });

      expect(result.installedRecords.length).toBe(1);
      expect(result.installedRecords[0]!?.agents.length).toBe(5);
    });
  });
});
