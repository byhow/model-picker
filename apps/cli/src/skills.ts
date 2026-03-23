import { spawn } from 'node:child_process';
import {
  access,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { parse } from 'yaml';
import {
  defaultSkillsManifest,
  isSupportedAgent,
  loadModelPickerConfig,
  resolveAgentSkillsDir,
  resolveModelPickerSkillsManifestPath,
  resolveModelPickerSkillsStateDir,
  saveModelPickerConfig,
  type InstalledSkillRecord,
  type SkillFrontmatter,
  type SkillInstallMethod,
  type SkillInstallScope,
  type SkillsManifest,
  type SupportedAgent,
} from './user-config';

const SKILL_DISCOVERY_PATHS = [
  '.',
  'skills',
  '.agents/skills',
  '.agent/skills',
  '.claude/skills',
  '.augment/skills',
];

const ALLOWED_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export interface SkillsAddOptions {
  agents?: string | string[];
  skills?: string | string[];
  all?: boolean;
  global?: boolean;
  copy?: boolean;
  list?: boolean;
  yes?: boolean;
}

export interface SkillsListOptions {
  global?: boolean;
}

export interface DiscoveredSkill {
  name: string;
  description: string;
  dir: string;
  skillMdPath: string;
  frontmatter: SkillFrontmatter;
  source: string;
}

export interface SkillsAddResult {
  source: string;
  selectedAgents: SupportedAgent[];
  selectedSkills: DiscoveredSkill[];
  discoveredSkills: DiscoveredSkill[];
  scope: SkillInstallScope;
  method: SkillInstallMethod;
  manifestPath: string;
  installedRecords: InstalledSkillRecord[];
}

export interface SkillsListItem {
  scope: SkillInstallScope;
  record: InstalledSkillRecord;
}

export interface SkillsListResult {
  items: SkillsListItem[];
  manifestPaths: string[];
}

export interface SkillsRemoveOptions {
  skills?: string | string[];
  agents?: string | string[];
  global?: boolean;
  all?: boolean;
}

export interface RemovedSkillRecord {
  skill: string;
  removedAgents: SupportedAgent[];
  remainingAgents: SupportedAgent[];
  removedPaths: string[];
}

export interface SkillsRemoveResult {
  scope: SkillInstallScope;
  manifestPath: string;
  removedRecords: RemovedSkillRecord[];
  remainingRecords: InstalledSkillRecord[];
}

interface SourceResolution {
  type: 'local' | 'remote';
  resolvedPath: string;
  sourceId: string;
  sourceRef?: string;
  branch?: string;
  subPath?: string;
  commitHash?: string;
}

class SkillsValidationError extends Error {}

function envEnabled(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

function supportsInternalSkills(): boolean {
  return envEnabled(process.env.INSTALL_INTERNAL_SKILLS);
}

function normalizeCsvList(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : [value];
  const unique = new Set<string>();

  for (const entry of values) {
    if (typeof entry !== 'string') {
      continue;
    }

    for (const segment of entry.split(',')) {
      const normalized = segment.trim();
      if (normalized) {
        unique.add(normalized);
      }
    }
  }

  return [...unique];
}

function normalizeSourceId(source: string): string {
  return source
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[\/:@]+/g, '_')
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 160);
}

function parseGitHubTreeSource(source: string): SourceResolution | null {
  const match = source.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)$/i,
  );

  if (!match) {
    return null;
  }

  const owner = match[1];
  const repo = match[2];
  const branch = match[3];
  const subPath = match[4];

  if (!owner || !repo || !branch || !subPath) {
    return null;
  }

  return {
    type: 'remote',
    resolvedPath: `https://github.com/${owner}/${repo}.git`,
    sourceId: `${owner}/${repo}`,
    sourceRef: `${branch}:${subPath}`,
    branch,
    subPath,
  };
}

function parseShorthandSource(source: string): SourceResolution | null {
  const match = source.match(
    /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:@([^:]+))?(?::(.+))?$/,
  );
  if (!match) {
    return null;
  }

  const owner = match[1];
  const repo = match[2];
  const branch = match[3]?.trim();
  const subPath = match[4]?.trim();

  if (!owner || !repo) {
    return null;
  }

  const sourceRef = branch
    ? subPath
      ? `${branch}:${subPath}`
      : branch
    : subPath
      ? `HEAD:${subPath}`
      : undefined;

  return {
    type: 'remote',
    resolvedPath: `https://github.com/${owner}/${repo}.git`,
    sourceId: `${owner}/${repo}`,
    sourceRef,
    branch,
    subPath,
  };
}

function isLikelyRemoteSource(source: string): boolean {
  const trimmed = source.trim();
  if (!trimmed) {
    return false;
  }

  if (
    /^https?:\/\//i.test(trimmed) ||
    /^git@/i.test(trimmed) ||
    parseGitHubTreeSource(trimmed) ||
    parseShorthandSource(trimmed)
  ) {
    return true;
  }

  return trimmed.endsWith('.git');
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: 'pipe',
      env: process.env,
    });

    const stderrChunks: Buffer[] = [];
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(Buffer.from(chunk));
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
      reject(new Error(stderr || `${command} ${args.join(' ')} exited with code ${code ?? 1}`));
    });
  });
}

async function runCommandWithOutput(command: string, args: string[]): Promise<string> {
  return await new Promise<string>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: 'pipe',
      env: process.env,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(Buffer.from(chunk));
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise(Buffer.concat(stdoutChunks).toString('utf8').trim());
        return;
      }

      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
      reject(new Error(stderr || `${command} ${args.join(' ')} exited with code ${code ?? 1}`));
    });
  });
}

async function resolveGitCommit(path: string): Promise<string | undefined> {
  try {
    const output = await runCommandWithOutput('git', ['-C', path, 'rev-parse', '--verify', 'HEAD']);
    return output || undefined;
  } catch {
    return undefined;
  }
}

async function cloneRepository(
  gitUrl: string,
  destination: string,
  branch?: string,
): Promise<void> {
  const args = ['clone', '--depth', '1'];
  if (branch) {
    args.push('--branch', branch);
  }
  args.push(gitUrl, destination);

  await runCommand('git', args);
}

async function discoverSkillMdFiles(root: string): Promise<string[]> {
  const discovered = new Set<string>();

  for (const candidate of SKILL_DISCOVERY_PATHS) {
    const candidatePath = resolve(root, candidate);
    if (!(await pathExists(candidatePath))) {
      continue;
    }

    const stats = await lstat(candidatePath);
    if (stats.isFile() && basename(candidatePath) === 'SKILL.md') {
      discovered.add(candidatePath);
      continue;
    }

    if (!stats.isDirectory()) {
      continue;
    }

    const directSkillMd = join(candidatePath, 'SKILL.md');
    if (await pathExists(directSkillMd)) {
      discovered.add(directSkillMd);
    }

    const entries = await readdir(candidatePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const nestedSkillMd = join(candidatePath, entry.name, 'SKILL.md');
      if (await pathExists(nestedSkillMd)) {
        discovered.add(nestedSkillMd);
      }
    }
  }

  if (discovered.size > 0) {
    return [...discovered];
  }

  const fallback = await walkForSkillMd(root);
  return fallback;
}

async function walkForSkillMd(root: string): Promise<string[]> {
  const results: string[] = [];
  const queue: string[] = [root];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') {
        continue;
      }

      const absolute = join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolute);
        continue;
      }

      if (entry.isFile() && entry.name === 'SKILL.md') {
        results.push(absolute);
      }
    }
  }

  return results;
}

function splitFrontmatter(content: string): { yaml: string; body: string } {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0 || lines[0]?.trim() !== '---') {
    throw new Error('SKILL.md must start with YAML frontmatter delimited by ---');
  }

  let delimiterIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if ((lines[index] ?? '').trim() === '---') {
      delimiterIndex = index;
      break;
    }
  }

  if (delimiterIndex <= 0) {
    throw new Error('SKILL.md frontmatter is not properly closed with ---');
  }

  return {
    yaml: lines.slice(1, delimiterIndex).join('\n'),
    body: lines.slice(delimiterIndex + 1).join('\n'),
  };
}

function assertValidName(name: string, dirName: string): void {
  if (name.length < 1 || name.length > 64) {
    throw new Error('name must be between 1 and 64 characters');
  }

  if (!ALLOWED_NAME_PATTERN.test(name)) {
    throw new Error('name must use lowercase letters, numbers, and hyphens only');
  }

  if (name.includes('--')) {
    throw new Error('name cannot contain consecutive hyphens');
  }

  if (name !== dirName) {
    throw new Error(`name must match parent directory (${dirName})`);
  }
}

function assertValidDescription(description: string): void {
  if (description.length < 1 || description.length > 1024) {
    throw new Error('description must be between 1 and 1024 characters');
  }
}

function validateFrontmatter(
  frontmatter: unknown,
  skillDirName: string,
): SkillFrontmatter {
  if (!frontmatter || typeof frontmatter !== 'object') {
    throw new Error('frontmatter must be a YAML object');
  }

  const record = frontmatter as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const description = typeof record.description === 'string' ? record.description.trim() : '';

  if (!name) {
    throw new Error('frontmatter.name is required');
  }

  if (!description) {
    throw new Error('frontmatter.description is required');
  }

  assertValidName(name, skillDirName);
  assertValidDescription(description);

  if (
    record.compatibility !== undefined &&
    (typeof record.compatibility !== 'string' ||
      record.compatibility.length < 1 ||
      record.compatibility.length > 500)
  ) {
    throw new Error('compatibility must be a string between 1 and 500 characters');
  }

  if (record['allowed-tools'] !== undefined && typeof record['allowed-tools'] !== 'string') {
    throw new Error('allowed-tools must be a space-delimited string');
  }

  const metadata = record.metadata;
  if (metadata !== undefined) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new Error('metadata must be an object of string/boolean values');
    }

    for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
      if (typeof value !== 'string' && typeof value !== 'boolean') {
        throw new Error(`metadata.${key} must be a string or boolean`);
      }
    }
  }

  return {
    name,
    description,
    license: typeof record.license === 'string' ? record.license.trim() : undefined,
    compatibility:
      typeof record.compatibility === 'string' ? record.compatibility.trim() : undefined,
    metadata:
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? (metadata as Record<string, string | boolean>)
        : undefined,
    'allowed-tools':
      typeof record['allowed-tools'] === 'string'
        ? record['allowed-tools'].trim()
        : undefined,
  };
}

async function parseSkill(skillMdPath: string, source: string): Promise<DiscoveredSkill> {
  const content = await readFile(skillMdPath, 'utf8');
  const { yaml } = splitFrontmatter(content);
  let parsedYaml: unknown;
  try {
    parsedYaml = parse(yaml);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SkillsValidationError(`invalid YAML frontmatter (${message})`);
  }

  const skillDir = dirname(skillMdPath);
  const skillDirName = basename(skillDir);
  const frontmatter = validateFrontmatter(parsedYaml, skillDirName);

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    dir: skillDir,
    skillMdPath,
    frontmatter,
    source,
  };
}

function isInternalSkill(skill: DiscoveredSkill): boolean {
  const metadata = skill.frontmatter.metadata;
  return Boolean(metadata && metadata.internal === true);
}

async function discoverSkills(root: string, source: string): Promise<DiscoveredSkill[]> {
  const skillMdFiles = await discoverSkillMdFiles(root);
  const discovered: DiscoveredSkill[] = [];

  for (const skillMdPath of skillMdFiles) {
    try {
      const parsed = await parseSkill(skillMdPath, source);
      if (!supportsInternalSkills() && isInternalSkill(parsed)) {
        continue;
      }
      discovered.push(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new SkillsValidationError(`Invalid skill at ${skillMdPath}: ${message}`);
    }
  }

  const deduped = new Map<string, DiscoveredSkill>();
  for (const skill of discovered) {
    if (!deduped.has(skill.name)) {
      deduped.set(skill.name, skill);
    }
  }

  return [...deduped.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function selectSkills(discovered: DiscoveredSkill[], requested: string[]): DiscoveredSkill[] {
  if (requested.length === 0) {
    return discovered;
  }

  const normalizedRequested = requested.map((name) => name.trim()).filter(Boolean);
  if (normalizedRequested.length === 0) {
    return discovered;
  }

  if (normalizedRequested.includes('*')) {
    return discovered;
  }

  const byName = new Map(discovered.map((skill) => [skill.name, skill]));
  const selected: DiscoveredSkill[] = [];

  for (const requestedName of normalizedRequested) {
    const skill = byName.get(requestedName);
    if (!skill) {
      throw new Error(
        `Unknown skill "${requestedName}". Use --list to view available skills from this source.`,
      );
    }
    selected.push(skill);
  }

  return selected;
}

function parseAgents(value: string | string[] | undefined): string[] {
  return normalizeCsvList(value).map((entry) => entry.trim().toLowerCase());
}

function parseSkills(value: string | string[] | undefined): string[] {
  return normalizeCsvList(value).map((entry) => entry.trim());
}

function targetAgentsFromConfig(config: Awaited<ReturnType<typeof loadModelPickerConfig>>): SupportedAgent[] {
  const preferred = config.skills?.preferredAgents ?? [];
  return preferred.filter((agent): agent is SupportedAgent => isSupportedAgent(agent));
}

function dedupe<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function assertAgents(values: string[]): SupportedAgent[] {
  const parsed: SupportedAgent[] = [];
  for (const value of values) {
    if (!isSupportedAgent(value)) {
      throw new Error(
        `Unsupported agent "${value}". Supported values: amp, opencode, claude-code, codex, cursor.`,
      );
    }
    parsed.push(value);
  }

  return dedupe(parsed);
}

async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function safeReadManifest(
  scope: SkillInstallScope,
  cwd: string,
): Promise<SkillsManifest> {
  const path = resolveModelPickerSkillsManifestPath(scope, cwd);

  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as SkillsManifest;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.installs)) {
      return defaultSkillsManifest();
    }
    return parsed;
  } catch {
    return defaultSkillsManifest();
  }
}

async function writeManifest(
  scope: SkillInstallScope,
  cwd: string,
  manifest: SkillsManifest,
): Promise<string> {
  const path = resolveModelPickerSkillsManifestPath(scope, cwd);
  await ensureDirectory(dirname(path));
  await writeFile(path, JSON.stringify(manifest, null, 2), 'utf8');
  return path;
}

async function ensureSourceCheckout(
  source: string,
  scope: SkillInstallScope,
  cwd: string,
): Promise<{ checkoutPath: string; sourceResolution: SourceResolution; cleanupPath?: string }> {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error('A source is required (owner/repo, URL, or local path).');
  }

  const maybeLocal = resolve(cwd, trimmed);
  if (await pathExists(maybeLocal)) {
    const localCommit = await resolveGitCommit(maybeLocal);
    return {
      checkoutPath: maybeLocal,
      sourceResolution: {
        type: 'local',
        resolvedPath: maybeLocal,
        sourceId: normalizeSourceId(trimmed),
        commitHash: localCommit,
      },
      cleanupPath: undefined,
    };
  }

  const treeSource = parseGitHubTreeSource(trimmed);
  const shorthand = parseShorthandSource(trimmed);

  const resolvedRemote = treeSource
    ? treeSource
    : shorthand
      ? shorthand
      : {
          type: 'remote' as const,
          resolvedPath: trimmed,
          sourceId: normalizeSourceId(trimmed),
        };

  const stateDir = resolveModelPickerSkillsStateDir(scope, cwd);
  const sourcesDir = join(stateDir, 'sources');
  await ensureDirectory(sourcesDir);

  const ephemeralSourceDir = join(
    sourcesDir,
    `${normalizeSourceId(
      resolvedRemote.branch
        ? `${resolvedRemote.sourceId}@${resolvedRemote.branch}`
        : resolvedRemote.sourceId,
    )}-${Date.now().toString(36)}`,
  );
  await cloneRepository(resolvedRemote.resolvedPath, ephemeralSourceDir, resolvedRemote.branch);
  const remoteCommit = await resolveGitCommit(ephemeralSourceDir);

  const checkoutPath = resolvedRemote.subPath
    ? join(ephemeralSourceDir, resolvedRemote.subPath)
    : ephemeralSourceDir;

  if (!(await pathExists(checkoutPath))) {
    await rm(ephemeralSourceDir, { recursive: true, force: true });
    throw new Error(`Source path not found after clone: ${checkoutPath}`);
  }

  return {
    checkoutPath,
    sourceResolution: {
      ...resolvedRemote,
      sourceId: normalizeSourceId(
        resolvedRemote.branch
          ? `${resolvedRemote.sourceId}@${resolvedRemote.branch}`
          : resolvedRemote.sourceId,
      ),
      commitHash: remoteCommit,
    },
    cleanupPath: ephemeralSourceDir,
  };
}

function resolveSkillTargetPaths(
  skillName: string,
  agents: SupportedAgent[],
  scope: SkillInstallScope,
  cwd: string,
): string[] {
  const uniqueTargets = new Set<string>();
  for (const agent of agents) {
    const targetDir = resolveAgentSkillsDir(agent, scope, cwd);
    uniqueTargets.add(join(targetDir, skillName));
  }

  return [...uniqueTargets].sort((left, right) => left.localeCompare(right));
}

async function installSkillDirectory(
  sourceDir: string,
  destinationDir: string,
  method: SkillInstallMethod,
): Promise<'symlink' | 'copy'> {
  await ensureDirectory(dirname(destinationDir));
  await rm(destinationDir, { recursive: true, force: true });

  if (method === 'copy') {
    await cp(sourceDir, destinationDir, { recursive: true });
    return 'copy';
  }

  try {
    await symlink(sourceDir, destinationDir, 'dir');
    return 'symlink';
  } catch {
    await cp(sourceDir, destinationDir, { recursive: true });
    return 'copy';
  }
}

function describeScope(global?: boolean): SkillInstallScope {
  return global ? 'global' : 'project';
}

export async function addSkillsFromSource(
  source: string,
  options: SkillsAddOptions = {},
): Promise<SkillsAddResult> {
  const cwd = process.cwd();
  const scope = describeScope(options.global);
  const method: SkillInstallMethod = options.copy ? 'copy' : 'symlink';
  const config = await loadModelPickerConfig();

  const requestedAgents = parseAgents(options.agents);
  const selectedAgents =
    requestedAgents.length > 0
      ? assertAgents(requestedAgents)
      : targetAgentsFromConfig(config).length > 0
        ? targetAgentsFromConfig(config)
        : [config.defaults?.agent].filter(
            (agent): agent is SupportedAgent => Boolean(agent && isSupportedAgent(agent)),
          );

  if (selectedAgents.length === 0 && !options.list) {
    throw new Error(
      'No target agents configured. Pass --agent (for example: --agent opencode --agent amp).',
    );
  }

  if (options.all && parseSkills(options.skills).length > 0) {
    throw new Error('Use either --all or --skill, not both.');
  }

  if (
    !options.yes &&
    !options.list &&
    !process.stdin.isTTY &&
    isLikelyRemoteSource(source)
  ) {
    throw new Error(
      `Refusing remote install from "${source}" in non-interactive mode without --yes. Re-run with --yes once you trust this source.`,
    );
  }

  const { checkoutPath, sourceResolution, cleanupPath } = await ensureSourceCheckout(
    source,
    scope,
    cwd,
  );

  try {
    const discovered = await discoverSkills(checkoutPath, source);
    if (discovered.length === 0) {
      throw new Error(`No valid skills found in source: ${source}`);
    }

    if (options.list) {
      return {
        source,
        selectedAgents,
        selectedSkills: discovered,
        discoveredSkills: discovered,
        scope,
        method,
        manifestPath: resolveModelPickerSkillsManifestPath(scope, cwd),
        installedRecords: [],
      };
    }

    const requestedSkills = options.all ? ['*'] : parseSkills(options.skills);
    const selectedSkills = selectSkills(discovered, requestedSkills);
    const uniqueAgentTargets = new Map<string, SupportedAgent[]>();

    for (const agent of selectedAgents) {
      const target = resolveAgentSkillsDir(agent, scope, cwd);
      const existing = uniqueAgentTargets.get(target) ?? [];
      existing.push(agent);
      uniqueAgentTargets.set(target, dedupe(existing));
    }

    const manifest = await safeReadManifest(scope, cwd);
    const installedRecords: InstalledSkillRecord[] = [];
    const effectiveMethodPerRecord: SkillInstallMethod[] = [];

    for (const skill of selectedSkills) {
      const targetPaths: string[] = [];
      let effectiveMethod: SkillInstallMethod = method;

      for (const [targetDir] of uniqueAgentTargets) {
        await ensureDirectory(targetDir);
        const destination = join(targetDir, skill.name);
        const installedAs = await installSkillDirectory(skill.dir, destination, method);
        if (installedAs === 'copy') {
          effectiveMethod = 'copy';
        }
        targetPaths.push(destination);
      }

      const record: InstalledSkillRecord = {
        skill: skill.name,
        source,
        sourceType: sourceResolution.type,
        resolvedSource: sourceResolution.resolvedPath,
        sourceRef: sourceResolution.sourceRef,
        sourceCommit: sourceResolution.commitHash,
        scope,
        method: effectiveMethod,
        agents: selectedAgents,
        installedAt: new Date().toISOString(),
        targetPaths,
      };

      manifest.installs = manifest.installs.filter(
        (existing) => !(existing.skill === record.skill && existing.scope === record.scope),
      );
      manifest.installs.push(record);
      installedRecords.push(record);
      effectiveMethodPerRecord.push(effectiveMethod);
    }

    manifest.updatedAt = new Date().toISOString();
    const manifestPath = await writeManifest(scope, cwd, manifest);

    if (selectedAgents.length > 0) {
      await saveModelPickerConfig({
        ...config,
        skills: {
          ...config.skills,
          preferredAgents: selectedAgents,
          lastUsedSource: source,
        },
        defaults: {
          ...config.defaults,
          installScope: scope,
          installMethod:
            method === 'copy' || effectiveMethodPerRecord.includes('copy')
              ? 'copy'
              : 'symlink',
        },
      });
    }

    return {
      source,
      selectedAgents,
      selectedSkills,
      discoveredSkills: discovered,
      scope,
      method,
      manifestPath,
      installedRecords,
    };
  } finally {
    if (cleanupPath) {
      await rm(cleanupPath, { recursive: true, force: true });
    }
  }
}

async function loadManifestEntries(
  scope: SkillInstallScope,
  cwd: string,
): Promise<SkillsListItem[]> {
  const manifest = await safeReadManifest(scope, cwd);
  return manifest.installs.map((record) => ({ scope, record }));
}

export async function listInstalledSkills(
  options: SkillsListOptions = {},
): Promise<SkillsListResult> {
  const cwd = process.cwd();

  if (options.global) {
    const items = await loadManifestEntries('global', cwd);
    return {
      items,
      manifestPaths: [resolveModelPickerSkillsManifestPath('global', cwd)],
    };
  }

  const [projectItems, globalItems] = await Promise.all([
    loadManifestEntries('project', cwd),
    loadManifestEntries('global', cwd),
  ]);

  return {
    items: [...projectItems, ...globalItems],
    manifestPaths: [
      resolveModelPickerSkillsManifestPath('project', cwd),
      resolveModelPickerSkillsManifestPath('global', cwd),
    ],
  };
}

export async function removeInstalledSkills(
  options: SkillsRemoveOptions = {},
): Promise<SkillsRemoveResult> {
  const cwd = process.cwd();
  const scope = describeScope(options.global);
  const requestedSkills = parseSkills(options.skills);
  const removeAll = Boolean(options.all);

  if (removeAll && requestedSkills.length > 0) {
    throw new Error('Use either --all or --skill, not both.');
  }

  if (!removeAll && requestedSkills.length === 0) {
    throw new Error('Provide at least one skill via --skill (or use --all).');
  }

  const requestedAgents = parseAgents(options.agents);
  const selectedAgents =
    requestedAgents.length > 0 ? assertAgents(requestedAgents) : undefined;

  const skillsFilter = removeAll ? null : new Set(requestedSkills);
  const manifest = await safeReadManifest(scope, cwd);
  const nextRecords: InstalledSkillRecord[] = [];
  const removedRecords: RemovedSkillRecord[] = [];

  let matchedSkill = false;
  let matchedAgent = false;

  for (const record of manifest.installs) {
    if (skillsFilter && !skillsFilter.has(record.skill)) {
      nextRecords.push(record);
      continue;
    }

    matchedSkill = true;
    const agentsToRemove = selectedAgents
      ? record.agents.filter((agent) => selectedAgents.includes(agent))
      : [...record.agents];

    if (agentsToRemove.length === 0) {
      nextRecords.push(record);
      continue;
    }

    matchedAgent = true;
    const remainingAgents = record.agents.filter(
      (agent) => !agentsToRemove.includes(agent),
    );
    const previousPaths = dedupe(record.targetPaths);
    const remainingPaths =
      remainingAgents.length > 0
        ? resolveSkillTargetPaths(record.skill, remainingAgents, scope, cwd)
        : [];
    const removedPaths = previousPaths.filter(
      (path) => !remainingPaths.includes(path),
    );

    for (const targetPath of removedPaths) {
      await rm(targetPath, { recursive: true, force: true });
    }

    removedRecords.push({
      skill: record.skill,
      removedAgents: agentsToRemove,
      remainingAgents,
      removedPaths,
    });

    if (remainingAgents.length === 0) {
      continue;
    }

    nextRecords.push({
      ...record,
      agents: remainingAgents,
      targetPaths: remainingPaths,
    });
  }

  if (removedRecords.length === 0) {
    if (!matchedSkill) {
      throw new Error(
        removeAll
          ? `No installed skills found in ${scope} scope.`
          : `No installed skills matched: ${requestedSkills.join(', ')}.`,
      );
    }

    if (selectedAgents && !matchedAgent) {
      throw new Error(
        `Matched skills are not installed for target agents: ${selectedAgents.join(', ')}.`,
      );
    }

    throw new Error('No skills were removed.');
  }

  manifest.installs = nextRecords;
  manifest.updatedAt = new Date().toISOString();
  const manifestPath = await writeManifest(scope, cwd, manifest);

  return {
    scope,
    manifestPath,
    removedRecords,
    remainingRecords: nextRecords,
  };
}

export async function isSymlink(path: string): Promise<boolean> {
  try {
    const stats = await lstat(path);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

export async function resolveInstalledPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}

export function formatSkillInstallScope(scope: SkillInstallScope): string {
  return scope === 'global' ? 'global' : 'project';
}

export function formatSkillInstallMethod(method: SkillInstallMethod): string {
  return method === 'copy' ? 'copy' : 'symlink';
}
