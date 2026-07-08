# ssm-tui

AWS Systems Manager Session Manager で EC2 に接続するための対話式 CLI です。

## 前提条件

- Node.js
- AWS CLI
- Session Manager Plugin
- AWS 認証情報が設定済みであること

## インストール

```bash
npm install
npm link
```

## 設定ファイル

設定ファイルは `~/.config/ssm-tui/config.yml` に置きます。

```bash
mkdir -p ~/.config/ssm-tui
cp examples/config.yml ~/.config/ssm-tui/config.yml
```

設定例:

```yaml
instances:
  - name: develop-web-1
    instance_id: i-xxxxxxxxxxxxxxxxx
    group: develop
    description: 開発環境 Web サーバー
    aws_profile: default
    region: ap-northeast-1
```

## 実行

```bash
ssm-tui
```

または:

```bash
npm run start
```

## 使い方

- `↑↓` または `j/k` で接続先を移動
- `Enter` で選択
- `Ctrl-C` でキャンセル
- 本番系の `group` は確認時に強めの警告を表示

## production 警告

`group` が `production` または `prod` の場合、接続前に強い警告を表示します。

## よくあるエラー

- 設定ファイルがない: `~/.config/ssm-tui/config.yml` を作成してください
- AWS CLI がない: `aws` コマンドが PATH にあるか確認してください
- AWS 認証に失敗する: AWS の認証情報と profile 設定を確認してください
- SSM 接続に失敗する: 対象インスタンス、IAM 権限、Session Manager の状態を確認してください
