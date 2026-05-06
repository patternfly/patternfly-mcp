import { resolve, dirname } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { memo } from './server.caching';
import { log } from './logger';

interface AiHelpersSkill {
  name: string;
  plugin: string;
  description: string;
  content: string;
}

interface AiHelpersSkillsData {
  version: string;
  generated: string;
  meta: {
    totalSkills: number;
    source: string;
  };
  skills: AiHelpersSkill[];
}

const SKILLS_URL = 'https://raw.githubusercontent.com/patternfly/ai-helpers/main/dist/skills.json';

const FETCH_TIMEOUT_MS = 10_000;

const CACHE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.cache');

const CACHE_FILE = resolve(CACHE_DIR, 'aiHelpers.skills.json');

const isValidSkillsData = (data: unknown): data is AiHelpersSkillsData =>
  Boolean(data) && typeof data === 'object' && Array.isArray((data as AiHelpersSkillsData).skills);

const readCachedSkills = async (): Promise<AiHelpersSkillsData | undefined> => {
  try {
    const raw = await readFile(CACHE_FILE, 'utf-8');
    const data = JSON.parse(raw);

    if (isValidSkillsData(data)) {
      return data;
    }
  } catch {
    // No cache file or invalid — expected on first run
  }

  return undefined;
};

const writeCachedSkills = async (data: AiHelpersSkillsData): Promise<void> => {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(data), 'utf-8');
  } catch (error) {
    log.warn(`Failed to write skills cache: ${error instanceof Error ? error.message : error}`);
  }
};

const fetchSkillsData = async (): Promise<AiHelpersSkillsData> => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(SKILLS_URL, { signal: controller.signal });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as AiHelpersSkillsData;

    if (!isValidSkillsData(data)) {
      throw new Error('Invalid skills data shape');
    }

    log.info(`Loaded ${data.skills.length} ai-helpers skills from GitHub (generated ${data.generated})`);

    await writeCachedSkills(data);

    return data;
  } catch (error) {
    log.warn(`Failed to fetch ai-helpers skills from GitHub: ${error instanceof Error ? error.message : error}`);

    const cached = await readCachedSkills();

    if (cached) {
      log.info(`Using cached skills data (generated ${cached.generated})`);

      return cached;
    }

    log.warn('No cached skills available — skills will be empty until GitHub is reachable');

    return { version: '0', generated: '', meta: { totalSkills: 0, source: 'none' }, skills: [] };
  }
};

const fetchSkillsDataMemo = memo(fetchSkillsData, {
  cacheLimit: 1,
  expire: 5 * 60 * 1000,
  cacheErrors: false
});

/**
 * Returns all ai-helpers skills, fetched from GitHub with disk cache fallback.
 */
const getAiHelpersSkills = async (): Promise<AiHelpersSkill[]> => {
  const data = await fetchSkillsDataMemo();

  return data.skills;
};

/**
 * Returns the full SKILL.md content for a given skill name.
 *
 * @param name - The skill name to look up.
 */
const getAiHelpersSkillContent = async (name: string): Promise<string | undefined> => {
  const data = await fetchSkillsDataMemo();
  const skill = data.skills.find(
    (entry: AiHelpersSkill) => entry.name.toLowerCase() === name.toLowerCase()
  );

  return skill?.content;
};

export { getAiHelpersSkills, getAiHelpersSkillContent, type AiHelpersSkill };
