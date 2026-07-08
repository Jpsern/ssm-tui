# ssm-tui 仕様書

## 1. 目的

`ssm-tui` は、EC2 インスタンスへ AWS Systems Manager Session Manager 経由で接続するための対話式 CLI ツールである。

現在、EC2 サーバーへ接続する際に以下のようなコマンドを毎回手入力している。

```bash
aws ssm start-session --target i-xxxxxxxxxxxxxxxxx
```

インスタンス ID を毎回確認・入力するのは手間がかかり、入力ミスの可能性もある。

本ツールでは、接続先の表示名とインスタンス ID などを YAML 設定ファイルに登録しておき、ユーザーが一覧から接続先名を選択するだけで `aws ssm start-session` を実行できるようにする。

---

## 2. 想定ユーザー

### 現時点

* 個人利用
* macOS 上で利用する
* AWS CLI と Session Manager Plugin はセットアップ済みである前提

### 将来的な展開

* 展開は Git リポジトリを clone して利用する
* npm パッケージとして外部公開する予定はない

---

## 3. 実装方針

* 実装言語: Node.js
* UI: 対話式 CLI
* 設定ファイル形式: YAML
* 設定ファイルパス: `~/.config/ssm-tui/config.yml`
* 配布方法: 社内 Git リポジトリを clone して利用
* 主な処理: 設定ファイルを読み込み、接続先一覧を表示し、選択された接続先に対して `aws ssm start-session` を実行する

---

## 4. スコープ

### 4.1 MVPで実装すること

* YAML 設定ファイルを読み込む
* `instances` 配列から接続先一覧を生成する
* 接続先を対話式に選択できる
* 接続前に確認プロンプトを表示する
* `group` が `production` または `prod` の場合、警告を表示する
* 選択した接続先に対して `aws ssm start-session --target <instance_id>` を実行する
* `aws_profile` が指定されている場合、AWS CLI 実行時に `AWS_PROFILE` を設定する
* `region` が指定されている場合、AWS CLI 実行時に `AWS_REGION` を設定する
* 設定ファイルが存在しない場合、分かりやすいエラーメッセージを表示する
* 設定ファイルの形式が不正な場合、分かりやすいエラーメッセージを表示する
* `name` または `instance_id` が未指定の接続先がある場合、エラーにする
* AWS CLI が見つからない場合、分かりやすいエラーメッセージを表示する

### 4.2 MVPでは実装しないこと

* 設定ファイルの自動生成
* 接続先の追加・編集・削除機能
* 接続履歴の保存
* 接続先の検索機能
* `group` による絞り込み機能
* フルスクリーンの高度な TUI
* npm レジストリへの公開
* AWS SDK を使った EC2 インスタンス一覧の自動取得
* AWS 認証情報の管理
* AWS CLI / Session Manager Plugin のインストール

---

## 5. 設定ファイル仕様

### 5.1 ファイルパス

設定ファイルは以下に配置する。

```bash
~/.config/ssm-tui/config.yml
```

### 5.2 設定例

```yaml
instances:
  - name: develop-web-1
    instance_id: i-xxxxxxxxxxxxxxxxx
    group: develop
    description: 開発環境 Web サーバー
    aws_profile: default
    region: ap-northeast-1

  - name: staging-web-1
    instance_id: i-yyyyyyyyyyyyyyyyy
    group: staging
    description: ステージング Web サーバー
    aws_profile: staging
    region: ap-northeast-1
```

### 5.3 ルート項目

| 項目          | 型     |  必須 | 説明                |
| ----------- | ----- | --: | ----------------- |
| `instances` | array | yes | 接続先 EC2 インスタンスの一覧 |

### 5.4 `instances` の項目

| 項目            | 型      |  必須 | 説明                                                 |
| ------------- | ------ | --: | -------------------------------------------------- |
| `name`        | string | yes | TUI 上に表示する接続先名                                     |
| `instance_id` | string | yes | `aws ssm start-session --target` に渡す EC2 インスタンス ID |
| `group`       | string |  no | 接続先の分類。例: `develop`, `staging`, `production`       |
| `description` | string |  no | 接続先の説明                                             |
| `aws_profile` | string |  no | AWS CLI 実行時に利用する profile                           |
| `region`      | string |  no | AWS CLI 実行時に利用する region                            |

### 5.5 バリデーション

以下の場合はエラーとして処理する。

* 設定ファイルが存在しない
* YAML としてパースできない
* `instances` が存在しない
* `instances` が配列ではない
* `instances` が空である
* `instances` の各要素に `name` が存在しない
* `instances` の各要素に `instance_id` が存在しない
* `name` が空文字である
* `instance_id` が空文字である

---

## 6. UI仕様

### 6.1 起動時

ツールを起動すると、設定ファイルを読み込み、接続先一覧を表示する。

表示例:

```text
? 接続先を選択してください
❯ develop-web-1  開発環境 Web サーバー
  staging-web-1  ステージング Web サーバー
```

`description` が存在する場合は、接続先名の横に補足表示する。

`description` が存在しない場合は、`name` のみ表示する。

表示例:

```text
? 接続先を選択してください
❯ develop-web-1
  staging-web-1
```

### 6.2 接続前確認

接続先を選択した後、接続前に確認プロンプトを表示する。

表示例:

```text
以下の接続先に接続します。

Name: develop-web-1
Instance ID: i-xxxxxxxxxxxxxxxxx
Group: develop
Description: 開発環境 Web サーバー
Profile: default
Region: ap-northeast-1

接続しますか？ (y/N)
```

ユーザーが `y` または `Y` を入力した場合のみ接続を実行する。

それ以外の場合は接続せず終了する。

### 6.3 production 警告

選択した接続先の `group` が以下のいずれかの場合、通常の確認メッセージよりも強い警告を表示する。

* `production`
* `prod`

表示例:

```text
WARNING: production 環境への接続です。

Name: production-web-1
Instance ID: i-zzzzzzzzzzzzzzzzz
Group: production
Description: 本番環境 Web サーバー
Profile: production
Region: ap-northeast-1

本当に接続しますか？ (y/N)
```

`group` の比較は小文字化して判定する。

たとえば、`Production`, `PROD` も警告対象にする。

---

## 7. コマンド実行仕様

### 7.1 基本コマンド

接続時は以下のコマンドを実行する。

```bash
aws ssm start-session --target <instance_id>
```

例:

```bash
aws ssm start-session --target i-xxxxxxxxxxxxxxxxx
```

### 7.2 `aws_profile` の扱い

設定ファイルに `aws_profile` が指定されている場合、AWS CLI 実行時の環境変数として `AWS_PROFILE` を設定する。

概念例:

```bash
AWS_PROFILE=staging aws ssm start-session --target i-yyyyyyyyyyyyyyyyy
```

`aws_profile` が未指定の場合は、現在のシェル環境または AWS CLI の default profile に任せる。

### 7.3 `region` の扱い

設定ファイルに `region` が指定されている場合、AWS CLI 実行時の環境変数として `AWS_REGION` を設定する。

概念例:

```bash
AWS_REGION=ap-northeast-1 aws ssm start-session --target i-yyyyyyyyyyyyyyyyy
```

`aws_profile` と `region` の両方が指定されている場合は、両方を環境変数として設定する。

概念例:

```bash
AWS_PROFILE=staging AWS_REGION=ap-northeast-1 aws ssm start-session --target i-yyyyyyyyyyyyyyyyy
```

### 7.4 実装上の注意

Node.js から外部コマンドを実行する際は、`child_process.spawn` を使う。

理由:

* SSM セッションは対話的な標準入出力を必要とする
* `stdio: 'inherit'` を指定して、現在のターミナルをそのまま AWS CLI に渡す
* シェル文字列を組み立てて実行するより安全である

実装イメージ:

```js
spawn('aws', ['ssm', 'start-session', '--target', instance.instance_id], {
  stdio: 'inherit',
  env: {
    ...process.env,
    AWS_PROFILE: instance.aws_profile ?? process.env.AWS_PROFILE,
    AWS_REGION: instance.region ?? process.env.AWS_REGION,
  },
});
```

ただし、`aws_profile` や `region` が未指定の場合は、不要な `undefined` を `env` に入れないようにする。

---

## 8. エラー処理

### 8.1 設定ファイルが存在しない場合

以下のようなエラーメッセージを表示して終了する。

```text
設定ファイルが見つかりません。

以下のパスに設定ファイルを作成してください。

~/.config/ssm-tui/config.yml

設定例:

instances:
  - name: develop-web-1
    instance_id: i-xxxxxxxxxxxxxxxxx
    group: develop
    description: 開発環境 Web サーバー
    aws_profile: default
    region: ap-northeast-1
```

終了コードは `1` とする。

### 8.2 YAML パースエラー

```text
設定ファイルの読み込みに失敗しました。
YAML の形式が正しいか確認してください。

File: ~/.config/ssm-tui/config.yml
```

終了コードは `1` とする。

### 8.3 必須項目が不足している場合

```text
設定ファイルの内容が不正です。

instances[0].name は必須です。
instances[0].instance_id は必須です。
```

複数のエラーがある場合は、可能な範囲でまとめて表示する。

終了コードは `1` とする。

### 8.4 AWS CLI が見つからない場合

```text
aws コマンドが見つかりません。

AWS CLI がインストールされているか確認してください。
```

終了コードは `1` とする。

### 8.5 ユーザーが接続をキャンセルした場合

```text
接続をキャンセルしました。
```

終了コードは `0` とする。

### 8.6 `aws ssm start-session` が失敗した場合

AWS CLI のエラー出力をそのまま表示する。

ツール側では独自に握りつぶさない。

終了コードは AWS CLI の終了コードに合わせる。

---

## 9. ディレクトリ構成

想定する初期構成は以下。

```text
ssm-tui/
  package.json
  package-lock.json
  README.md
  spec.md
  src/
    index.js
    config.js
    validator.js
    selector.js
    aws.js
  examples/
    config.yml
```

### 9.1 各ファイルの役割

| ファイル                  | 役割                         |
| --------------------- | -------------------------- |
| `package.json`        | npm scripts、依存パッケージ、bin 定義 |
| `README.md`           | 利用方法、セットアップ方法              |
| `spec.md`             | 本仕様書                       |
| `src/index.js`        | エントリーポイント                  |
| `src/config.js`       | 設定ファイルの読み込み                |
| `src/validator.js`    | 設定内容のバリデーション               |
| `src/selector.js`     | 接続先選択と確認プロンプト              |
| `src/aws.js`          | AWS CLI 実行処理               |
| `examples/config.yml` | 設定ファイル例                    |

---

## 10. package.json 仕様

### 10.1 scripts

最低限、以下を用意する。

```json
{
  "scripts": {
    "start": "node src/index.js"
  }
}
```

必要に応じて、以下も追加してよい。

```json
{
  "scripts": {
    "start": "node src/index.js",
    "lint": "eslint ."
  }
}
```

### 10.2 bin

`npm link` で `ssm-tui` コマンドとして実行できるようにする。

```json
{
  "bin": {
    "ssm-tui": "./src/index.js"
  }
}
```

`src/index.js` の先頭には shebang を付ける。

```js
#!/usr/bin/env node
```

---

## 11. 利用方法

### 11.1 初回セットアップ

```bash
git clone <社内リポジトリURL>
cd ssm-tui
npm install
npm link
```

### 11.2 設定ファイル作成

```bash
mkdir -p ~/.config/ssm-tui
cp examples/config.yml ~/.config/ssm-tui/config.yml
```

設定ファイルを編集する。

```bash
vi ~/.config/ssm-tui/config.yml
```

### 11.3 実行

```bash
ssm-tui
```

または、リポジトリ内で直接実行する。

```bash
npm run start
```

---

## 12. README に記載する内容

README には最低限、以下を記載する。

* ツールの概要
* 前提条件

  * Node.js
  * AWS CLI
  * Session Manager Plugin
  * AWS 認証情報が設定済みであること
* インストール方法
* 設定ファイルの作成方法
* 設定ファイルの例
* 実行方法
* production 警告について
* よくあるエラー

  * 設定ファイルがない
  * AWS CLI がない
  * AWS 認証に失敗する
  * SSM 接続に失敗する

---

## 13. 受け入れ条件

以下を満たすこと。

### 13.1 正常系

* `~/.config/ssm-tui/config.yml` を読み込める
* 設定ファイル内の `instances` が一覧表示される
* `description` がある場合、一覧上に補足表示される
* 接続先を選択できる
* 接続前に確認プロンプトが表示される
* `y` または `Y` を入力した場合のみ接続が開始される
* 選択した `instance_id` を使って `aws ssm start-session --target <instance_id>` が実行される
* `aws_profile` が指定されている場合、AWS CLI 実行時に `AWS_PROFILE` が設定される
* `region` が指定されている場合、AWS CLI 実行時に `AWS_REGION` が設定される
* `group` が `production` または `prod` の場合、警告表示になる

### 13.2 キャンセル

* 確認プロンプトで `y` または `Y` 以外を入力した場合、接続せず終了する
* キャンセル時の終了コードは `0` である

### 13.3 異常系

* 設定ファイルがない場合、分かりやすいエラーを表示して終了する
* YAML として不正な場合、分かりやすいエラーを表示して終了する
* `instances` が存在しない場合、分かりやすいエラーを表示して終了する
* `instances` が空の場合、分かりやすいエラーを表示して終了する
* `name` がない接続先がある場合、分かりやすいエラーを表示して終了する
* `instance_id` がない接続先がある場合、分かりやすいエラーを表示して終了する
* `aws` コマンドが存在しない場合、分かりやすいエラーを表示して終了する

---

## 14. 将来拡張候補

MVP 完了後、必要に応じて以下を検討する。

* 接続先検索
* `group` による絞り込み
* 接続履歴の表示
* 最近使った接続先を上に表示
* 設定ファイルのパスを CLI オプションで指定
* `--config <path>` オプション
* `--profile <profile>` オプション
* `--region <region>` オプション
* `--no-confirm` オプション
* AWS SDK による EC2 インスタンス一覧取得
* タグ情報をもとにした接続先自動生成
* Session Manager 以外の接続方式対応
* チーム共通設定ファイルと個人設定ファイルの分離

---

## 15. 実装時の注意

* AWS 認証情報や秘密情報は設定ファイルに書かない
* 設定ファイルには EC2 インスタンス ID、表示名、profile、region 程度のみを記載する
* AWS CLI の標準出力・標準エラーは基本的にそのまま表示する
* `aws ssm start-session` は対話的なコマンドなので、`stdio: 'inherit'` を使う
* コマンド文字列を shell 経由で組み立てて実行しない
* `instance_id` などの値をログに過剰出力しない
* 本番環境への接続は必ず警告表示する
* MVP では機能を増やしすぎず、接続先選択と SSM 接続に集中する

