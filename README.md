# AdQuiz

ゲームの節目に出る「インタースティシャル広告パロディ」風のクイズ画面。中身は小2〜4年の計算・漢字問題。
依存なし・単一ファイル（`ad-quiz.js`）で、どのゲームにも差し込めます。

## 使い方（最小）

```html
<script src="ad-quiz.js"></script>
<script>
  // ゴール・ラウンド終了など「節目」で呼ぶ。3回に1回だけ広告が出る
  AdQuiz.tick({ onClose: r => { if (r.correct) giveReward(); } });
</script>
```

広告が出ている間はゲームを止めたいので、`onShow` / `onClose` に一時停止と再開を書きます。

```js
AdQuiz.configure({
  grade: [2, 3],          // 出題する学年
  everyN: 3,              // tick() 3回に1回
  onShow:  () => game.pause(),
  onClose: () => game.resume()
});
```

直接出したいときは Promise で受け取れます。

```js
const r = await AdQuiz.show();   // r = { answered, correct, tries, ms }
if (r.correct) giveReward();
```

## ゲームごとの組み込みで決めること

| 決めること | 目安 |
|---|---|
| どこで `tick()` を呼ぶか | ゴール後、ステージクリア後、ゲームオーバー後など |
| ごほうび | `onClose` の `r.correct` / `r.tries` で分岐（1回で正解なら多め、など） |
| 一時停止 | `onShow` / `onClose` で自分のゲームループを止める |
| 頻度 | `everyN`（回数）と `minIntervalSec`（最低間隔）の併用が安全 |

### 読み込めなくてもゲームを動かす

オフラインや CDN 障害でも壊れないよう、広告は「あれば出す」にしておきます。

```js
const hasAd = typeof AdQuiz !== 'undefined';
if (hasAd) AdQuiz.tick({ onClose });
```

### 広告の裏にタップを通さない

広告は pointer / touch / mouse / click / key イベントをオーバーレイ側で止めます（`window` や `document` のバブリング側リスナーには届きません）。
`capture: true` で `window` に付けたリスナーは止められないので、その場合は `onShow` で自分のゲーム側を無効にしてください。

## 設定（`AdQuiz.configure({...})` または `AdQuiz.create({...})`）

| キー | 既定 | 説明 |
|---|---|---|
| `grade` | `[2, 3]` | 出題学年。1〜4。漢字は1〜3年のデータ、4年は計算のみ |
| `kinds` | `['calc','kanjiRead','kanjiWrite']` | 問題の種類 |
| `everyN` | `3` | `tick()` を何回呼ぶごとに出すか |
| `minIntervalSec` | `0` | 前回の広告からの最低間隔（秒） |
| `skipAfterSec` | `5` | ✕が押せるようになるまでの秒数（答えれば即押せる） |
| `customRatio` | `0.3` | 手作り問題があるとき、それを出す確率 |
| `sound` | `true` | 効果音 |
| `gameId` | `null` | このゲームの識別子（例 `'hockey'`）。手作り問題の `games` との照合に使う |
| `zIndex` | `99999` | 重なり順 |
| `container` | `document.body` | 広告を入れる要素 |
| `problemProvider` | `null` | `() => 問題` を返すと内蔵の問題の代わりに使う |
| `onShow` / `onClose` | `null` | 表示時・終了時のフック（`onClose` は結果を受け取る） |
| `text` | 日本語（ひらがな） | 文言の上書き。英語版なども作れる |

## メソッド

| メソッド | 説明 |
|---|---|
| `tick(opts?)` | 節目で呼ぶ。広告を出したら `true`。`opts.onClose(result)` が使える |
| `show(opts?)` | 直接出す。`Promise<result>`。`opts.problem` で問題を指定できる |
| `dismiss()` | 出ている広告を強制的に閉じる（ゲームオーバー時など） |
| `reset()` | `tick()` のカウンターを0に戻す |
| `isShowing()` | 表示中か |
| `addProblems(arr)` | 手作り問題を追加。新しく追加できた件数を返す（同じ問題の二重追加は無視） |
| `loadProblems(url \| [url, ...])` | JSON を読み込んで手作り問題に追加。複数URL可。失敗したURLは0件扱いで、例外は出さない。追加できた合計件数を返す |
| `addKanji(arr)` | 漢字を追加 `{k:'港', y:'みなと', g:3}` |
| `addAds(arr)` / `setAds(arr)` | 広告の見た目を追加／差し替え `{brand, catch, cta, c1, c2, icon}` |
| `create(opts)` | 別設定の独立インスタンスを作る |

## 手作り問題

`{ q, choices, answer }` の配列。`answer` は `choices` のどれかと一致している必要があります（合わないものは無視されます）。
`label` を付けると、問題の見出しを変えられます。

### ゲームごとの出し分け（v1.1.0）

問題に `games` を書くと、そのゲームでだけ出ます。書かない問題は全ゲーム共通です。

```json
[
  { "q": "ミコトの すきな のりものは？", "choices": ["でんしゃ", "バス"], "answer": "でんしゃ" },
  { "q": "ホッケーの パックは いくつ？", "choices": ["1こ", "2こ"], "answer": "1こ", "games": ["hockey"] }
]
```

ゲーム側で `AdQuiz.configure({ gameId: 'hockey' })` と指定すると、1問目（共通）と2問目（hockey 用）が出ます。
`gameId` を指定しないと、`games` つきの問題は出ません。
`games` は文字列の配列でなければならず、それ以外の形は不正な問題として無視されます。

```json
[
  { "q": "パパの すきな たべものは？", "choices": ["カレー", "すし", "ラーメン"], "answer": "カレー" }
]
```

読み込みは、起動時に `AdQuiz.loadProblems('./problems.json')` のように行います。
ゲーム横断で管理するなら、データ専用リポジトリ（例 `ad-quiz-problems`）に置いて、全ゲームがそのURLを読みます（下の「問題データの置き場所」）。
問題文は `textContent` で表示するので、`<` などが入っていても安全です。

## 読み込み方とバージョン管理

- **コピーして使う**: `ad-quiz.js` をゲームのリポジトリに置く。いちばん単純だが、ゲームごとに版がずれる。
- **CDN で読む**: このリポジトリにタグ（例 `v1.0.0`）を付け、jsDelivr などでバージョンを固定して読む。
  `https://cdn.jsdelivr.net/gh/<ユーザー>/<リポジトリ>@1.1.0/ad-quiz.js`
  更新しても、古いゲームは固定した版のまま壊れない。`@1` と書くと `1.x.x` の最新に自動で追従する。

ライブラリ本体にはゲーム固有の設定を書かず、ゲーム側から `configure` / `addProblems` で渡すのが前提です。

## 問題データの置き場所（ゲーム横断で管理する場合）

```
ad-quiz           ← コード（タグで版管理）
ad-quiz-problems  ← problems.json（頻繁に更新。コードに触れない）
各ゲーム          ← 起動時に両方を読み込む
```

データ用リポジトリは、ゲームと同じ GitHub + Vercel の流れで公開できます。別ドメインから読むので、リポジトリ直下に `vercel.json` を置いて CORS を許可します。

```json
{ "headers": [{ "source": "/(.*)", "headers": [{ "key": "Access-Control-Allow-Origin", "value": "*" }] }] }
```

ゲーム側は URL を渡すだけです。

```js
AdQuiz.configure({ gameId: 'hockey' });
AdQuiz.loadProblems('https://ad-quiz-problems.vercel.app/problems.json');
```

読み込みに失敗しても、広告クイズは内蔵の問題だけで動き続けます。

## 更新履歴

- **1.1.0**: 問題の `games` と設定の `gameId` による出し分け、`loadProblems` に複数URL、同じ問題の二重追加を無視
- **1.0.0**: 初版

## テスト

```
npm install
npm test
```

jsdom で、問題生成（答えの正しさ・選択肢の重複・負の数）、表示から正解・閉じるまで、イベントの遮断、`tick` の頻度制御、手作り問題の検証、`games` / `gameId` の出し分け、複数URLとオフライン時の `loadProblems` を確認します。

## ファイル

- `ad-quiz.js` — 本体
- `demo.html` — 動作確認用のダミーゲーム
- `problems.sample.json` — 手作り問題の例
- `test.js` / `package.json` — テスト
