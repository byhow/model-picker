import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  SUPPORTED_AGENTS,
  isSupportedAgent,
  defaultSkillsManifest,
  resolveProjectAgentSkillsDir,
  resolveGlobalAgentSkillsDir,
  resolveAgentSkillsDir,
  resolveModelPickerSkillsStateDir,
  resolveModelPickerSkillsManifestPath,
} from './skills';

describe('skills', () => {
  describe('SUPPORTED_AGENTS', () => {
    test('contains expected agents', () => {
      expect(SUPPORTED_AGENTS).toEqual([
        'amp',
        'opencode',
        'claude-code',
        'codex',
        'cursor',
      ]);
    });
  });

  describe('isSupportedAgent', () => {
    test.each(['amp', 'opencode', 'claude-code', 'codex', 'cursor'] as const)(
      'returns true for %s',
      (agent) => {
        expect(isSupportedAgent(agent)).toBe(true);
      },
    );

    test.each(['unknown', 'gemini', '', 'AMP', 'Claude-Code'])(
      'returns false for %s',
      (value) => {
        expect(isSupportedAgent(value)).toBe(false);
      },
    );
  });

  describe('defaultSkillsManifest', () => {
    test('returns correct structure', () => {
      const manifest = defaultSkillsManifest();
      expect(manifest).toEqual({
        version: 1,
        updatedAt: new Date(0).toISOString(),
        installs: [],
      });
    });
  });

  describe('resolveProjectAgentSkillsDir', () => {
    const cwd = '/test/project';

    test('claude-code uses .claude/skills', () => {
      expect(resolveProjectAgentSkillsDir('claude-code', cwd)).toBe(
        join(resolve(cwd), '.claude', 'skills'),
      );
    });

    test.each(['amp', 'opencode', 'codex', 'cursor'] as const)(
      '%s uses .agents/skills',
      (agent) => {
        expect(resolveProjectAgentSkillsDir(agent, cwd)).toBe(
          join(resolve(cwd), '.agents', 'skills'),
        );
      },
    );
  });

  describe('resolveGlobalAgentSkillsDir', () => {
    let origXdg: string | undefined;
    let origAppdata: string | undefined;
    let origPlatform: PropertyDescriptor | undefined;

    beforeEach(() => {
      origXdg = process.env.XDG_CONFIG_HOME;
      origAppdata = process.env.APPDATA;
      origPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      delete process.env.XDG_CONFIG_HOME;
      delete process.env.APPDATA;
    });

    afterEach(() => {
      if (origXdg !== undefined) process.env.XDG_CONFIG_HOME = origXdg;
      else delete process.env.XDG_CONFIG_HOME;
      if (origAppdata !== undefined) process.env.APPDATA = origAppdata;
      else delete process.env.APPDATA;
      if (origPlatform) Object.defineProperty(process, 'platform', origPlatform);
    });

    test('amp resolves to global agents config dir', () => {
      const result = resolveGlobalAgentSkillsDir('amp');
      expect(result).toBe(
        join(homedir(), '.config', 'agents', 'skills'),
      );
    });

    test('opencode resolves to global opencode config dir', () => {
      const result = resolveGlobalAgentSkillsDir('opencode');
      expect(result).toBe(
        join(homedir(), '.config', 'opencode', 'skills'),
      );
    });

    test('codex resolves to ~/.codex/skills', () => {
      expect(resolveGlobalAgentSkillsDir('codex')).toBe(
        join(homedir(), '.codex', 'skills'),
      );
    });

    test('cursor resolves to ~/.cursor/skills', () => {
      expect(resolveGlobalAgentSkillsDir('cursor')).toBe(
        join(homedir(), '.cursor', 'skills'),
      );
    });

    test('claude-code resolves to ~/.claude/skills', () => {
      expect(resolveGlobalAgentSkillsDir('claude-code')).toBe(
        join(homedir(), '.claude', 'skills'),
      );
    });

    test('amp with XDG_CONFIG_HOME uses xdg path', () => {
      process.env.XDG_CONFIG_HOME = '/custom/config';
      expect(resolveGlobalAgentSkillsDir('amp')).toBe(
        join('/custom/config', 'agents', 'skills'),
      );
    });

    test('opencode with XDG_CONFIG_HOME uses xdg path', () => {
      process.env.XDG_CONFIG_HOME = '/custom/config';
      expect(resolveGlobalAgentSkillsDir('opencode')).toBe(
        join('/custom/config', 'opencode', 'skills'),
      );
    });
  });

  describe('resolveAgentSkillsDir', () => {
    const cwd = '/test/project';

    test('project scope delegates to resolveProjectAgentSkillsDir', () => {
      expect(resolveAgentSkillsDir('amp', 'project', cwd)).toBe(
        resolveProjectAgentSkillsDir('amp', cwd),
      );
    });

    test('global scope delegates to resolveGlobalAgentSkillsDir', () => {
      expect(resolveAgentSkillsDir('amp', 'global')).toBe(
        resolveGlobalAgentSkillsDir('amp'),
      );
    });
  });

  describe('resolveModelPickerSkillsStateDir', () => {
    test('project scope uses .model-picker/skills under cwd', () => {
      const cwd = '/test/project';
      expect(resolveModelPickerSkillsStateDir('project', cwd)).toBe(
        join(resolve(cwd), '.model-picker', 'skills'),
      );
    });

    test('global scope uses config dir / skills', () => {
      const result = resolveModelPickerSkillsStateDir('global');
      expect(result).toEndWith(join('skills'));
      expect(result).toContain('model-picker');
    });
  });

  describe('resolveModelPickerSkillsManifestPath', () => {
    test('project scope ends with manifest.json', () => {
      const cwd = '/test/project';
      expect(resolveModelPickerSkillsManifestPath('project', cwd)).toBe(
        join(resolveModelPickerSkillsStateDir('project', cwd), 'manifest.json'),
      );
    });

    test('global scope ends with manifest.json', () => {
      expect(resolveModelPickerSkillsManifestPath('global')).toBe(
        join(resolveModelPickerSkillsStateDir('global'), 'manifest.json'),
      );
    });
  });
});
