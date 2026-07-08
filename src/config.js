const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { validateConfig } = require('./validator');

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.config', 'ssm-tui', 'config.yml');

function formatDisplayPath(filePath) {
  const home = os.homedir();
  if (filePath.startsWith(home)) {
    return `~${filePath.slice(home.length)}`;
  }

  return filePath;
}

function parseScalar(value) {
  const trimmed = value.trim();

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseSimpleYaml(content) {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  const root = {};
  let currentKey = null;
  let currentItem = null;
  let arrayIndent = null;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const lineNumber = index + 1;

    if (!rawLine.trim() || rawLine.trim().startsWith('#')) {
      continue;
    }

    if (rawLine.includes('\t')) {
      throw new Error(`タブ文字は使用できません。line ${lineNumber}`);
    }

    const indent = rawLine.match(/^ */)[0].length;
    const line = rawLine.trim();

    if (indent === 0) {
      const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (!match) {
        throw new Error(`不正な行です。line ${lineNumber}`);
      }

      const key = match[1];
      const value = match[2];

      if (key !== 'instances') {
        throw new Error(`未知のルートキーです。line ${lineNumber}`);
      }

      if (value !== '') {
        throw new Error(`instances は配列で定義してください。line ${lineNumber}`);
      }

      root.instances = [];
      currentKey = key;
      currentItem = null;
      arrayIndent = null;
      continue;
    }

    if (currentKey !== 'instances' || !Array.isArray(root.instances)) {
      throw new Error(`instances の定義が不正です。line ${lineNumber}`);
    }

    if (line.startsWith('-')) {
      const itemText = line.slice(1).trim();

      if (arrayIndent === null) {
        arrayIndent = indent;
      }

      if (indent !== arrayIndent) {
        throw new Error(`instances の配列構造が不正です。line ${lineNumber}`);
      }

      currentItem = {};
      root.instances.push(currentItem);

      if (itemText) {
        const inlineMatch = itemText.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
        if (!inlineMatch) {
          throw new Error(`不正な項目です。line ${lineNumber}`);
        }

        currentItem[inlineMatch[1]] = parseScalar(inlineMatch[2]);
      }

      continue;
    }

    if (!currentItem) {
      throw new Error(`instances の要素が不正です。line ${lineNumber}`);
    }

    if (indent <= arrayIndent) {
      throw new Error(`instances の要素が不正です。line ${lineNumber}`);
    }

    const propertyMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!propertyMatch) {
      throw new Error(`不正な項目です。line ${lineNumber}`);
    }

    currentItem[propertyMatch[1]] = parseScalar(propertyMatch[2]);
  }

  return root;
}

async function loadConfig(configPath = DEFAULT_CONFIG_PATH) {
  let content;

  try {
    content = await fs.readFile(configPath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      const notFound = new Error('設定ファイルが見つかりません。');
      notFound.code = 'CONFIG_NOT_FOUND';
      notFound.displayPath = formatDisplayPath(configPath);
      notFound.example = [
        'instances:',
        '  - name: develop-web-1',
        '    instance_id: i-xxxxxxxxxxxxxxxxx',
        '    group: develop',
        '    description: 開発環境 Web サーバー',
        '    aws_profile: default',
        '    region: ap-northeast-1',
      ].join('\n');
      throw notFound;
    }

    throw error;
  }

  let parsed;

  try {
    parsed = parseSimpleYaml(content);
  } catch (error) {
    const parseError = new Error('設定ファイルの読み込みに失敗しました。');
    parseError.code = 'CONFIG_PARSE_ERROR';
    parseError.displayPath = formatDisplayPath(configPath);
    parseError.cause = error;
    throw parseError;
  }

  const validation = validateConfig(parsed);
  if (!validation.ok) {
    const validationError = new Error(validation.errors.join('\n'));
    validationError.code = 'CONFIG_VALIDATION_ERROR';
    throw validationError;
  }

  return validation.config;
}

module.exports = {
  DEFAULT_CONFIG_PATH,
  loadConfig,
  parseSimpleYaml,
  formatDisplayPath,
};
