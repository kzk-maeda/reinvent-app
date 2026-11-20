# Cloudflareの基盤

Terraformで学習データ用のD1、字幕・生成音声ファイル用のR2、本人のメールアドレスだけを許可するCloudflare Accessを作成します。D1とR2にはTerraformによる誤削除を防ぐ設定があり、R2には公開URLを設定しません。Workersのカスタムドメインは、対応するWorkerを配置してから接続します。

## 基盤を準備する

Terraform 1.9以上と、同じCloudflareアカウントにある有効なDNSゾーン、R2、Zero Trust組織とログイン方式を用意します。専用の空きホスト名を使い、`terraform.tfvars.example`を`terraform.tfvars`にコピーして各ID、ホスト名、本人のメールアドレスを設定します。環境を分ける場合は、Worker名・ホスト名・Terraform stateを環境ごとに分けます。

CloudflareのAPIトークンは環境変数`CLOUDFLARE_API_TOKEN`に設定します。対象アカウントに絞り、D1、Workers R2 Storage、Access: Apps and Policiesを編集できる権限を付けます。カスタムドメイン接続とWorkerの配置にはWorkers Scriptsの編集権限も必要です。Terraform stateとplanにはメールアドレスやアカウント情報が含まれるため、アクセスを制限した保存先を使います。サンプル以外の変数ファイル、state、plan、生成したWrangler設定はGit管理の対象外です。

リポジトリのルートで実行します。

```sh
cp infra/cloudflare/terraform.tfvars.example infra/cloudflare/terraform.tfvars
# terraform.tfvars に実際の値を設定する
terraform -chdir=infra/cloudflare init
terraform -chdir=infra/cloudflare plan -out=foundation.tfplan
terraform -chdir=infra/cloudflare apply foundation.tfplan
```

初回は`attach_worker_hostname = false`で適用します。D1・R2・Accessだけが作成され、アプリのホスト名はまだWorkerに接続されません。

## Workerを配置してホスト名を接続する

現行のAPIはNode.jsとローカルSQLiteで動きます。公開にはWorkers用エントリーポイント、D1のデータアクセスとスキーマ、R2のファイル保存、音声セッションの停止と費用管理の移植が必要です。既存のローカル学習データを使う場合は、データ移行も別途行います。

移植後、Terraformの出力から設定を生成します。生成した設定は`cloudflare/worker.ts`を対象とし、`ASSETS`、`DB`、`MATERIALS`のバインディング、公開オリジン、AccessのAudienceを渡します。WorkerでAccess JWTの署名・発行元・Audienceを検証するために、発行元となるZero TrustのチームドメインもWorker側に設定します。`APP_PASSWORD`や`OPENAI_API_KEY`などのアプリの秘密情報はWranglerのSecretsで管理します。

```sh
terraform -chdir=infra/cloudflare output -json wrangler_config > wrangler.generated.json
npm ci
npm run build
npx wrangler@4.165.0 deploy --config wrangler.generated.json --dry-run
```

移植と検証が済んだWorkerは、同じコマンドから`--dry-run`を外して配置します。秘密情報を設定してから`attach_worker_hostname = true`に変更し、`terraform plan -out=domain.tfplan`と`terraform apply domain.tfplan`でホスト名を接続します。ルートはTerraformが管理します。生成設定では`workers.dev`とバージョンのプレビューURLを無効にし、カスタムドメイン側のプレビューも無効にしています。接続後は未認証のブラウザで画面と`/api/bootstrap`がAccessで保護され、許可した本人でアクセスできることを確認します。

Cloudflare Access下でPCの教材準備CLIを使う場合、ブラウザ用ログインとは別にサービス認証とCLI側の対応が必要です。現在の基盤は本人のブラウザ用のAccessポリシーを作成します。

## 検証

次のコマンドはCloudflareアカウントに変更を加えずに実行できます。テストはCloudflareプロバイダーを模擬し、初回のルート無効化、メールアドレスでの許可、ストレージのバインディング、接続後のドメイン設定を確認します。

```sh
terraform -chdir=infra/cloudflare fmt -check -recursive
terraform -chdir=infra/cloudflare init -backend=false -lockfile=readonly
terraform -chdir=infra/cloudflare validate
terraform -chdir=infra/cloudflare test
```

参考資料は[Cloudflare Terraform Provider](https://registry.terraform.io/providers/cloudflare/cloudflare/5.29.0/docs)、[Workersのカスタムドメイン](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)、[WorkersとCloudflare Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)を参照してください。
