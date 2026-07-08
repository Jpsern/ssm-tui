#!/usr/bin/env node

const { loadConfig } = require('./config');
const { selectInstance, confirmConnection, isCancellationError } = require('./selector');
const { runAwsStartSession, isAwsNotFoundError } = require('./aws');

async function main() {
  try {
    const config = await loadConfig();
    const instance = await selectInstance(config.instances);
    const confirmed = await confirmConnection(instance);

    if (!confirmed) {
      console.log('接続をキャンセルしました。');
      process.exit(0);
    }

    const code = await runAwsStartSession(instance);
    process.exit(code);
  } catch (error) {
    if (isCancellationError(error)) {
      console.log('接続をキャンセルしました。');
      process.exit(0);
    }

    if (isAwsNotFoundError(error)) {
      console.error('aws コマンドが見つかりません。\n');
      console.error('AWS CLI がインストールされているか確認してください。');
      process.exit(1);
    }

    if (error && error.code === 'CONFIG_NOT_FOUND') {
      console.error('設定ファイルが見つかりません。\n');
      console.error('以下のパスに設定ファイルを作成してください。\n');
      console.error(`${error.displayPath}\n`);
      console.error('設定例:\n');
      console.error(error.example);
      process.exit(1);
    }

    if (error && error.code === 'CONFIG_PARSE_ERROR') {
      console.error('設定ファイルの読み込みに失敗しました。');
      console.error('YAML の形式が正しいか確認してください。\n');
      console.error(`File: ${error.displayPath}`);
      process.exit(1);
    }

    if (error && error.code === 'CONFIG_VALIDATION_ERROR') {
      console.error('設定ファイルの内容が不正です。\n');
      console.error(error.message);
      process.exit(1);
    }

    if (error && typeof error.exitCode === 'number') {
      process.exit(error.exitCode);
    }

    const message = error && error.message ? error.message : '予期しないエラーが発生しました。';
    console.error(message);
    process.exit(1);
  }
}

main();
