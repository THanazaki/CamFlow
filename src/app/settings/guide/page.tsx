import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '使い方ガイド',
}

const SECTIONS = [
  { id: 'flow', title: '全体の流れ' },
  { id: 'account', title: 'サインイン' },
  { id: 'dashboard', title: 'ダッシュボード' },
  { id: 'wishlist', title: '撮影したいモデルを控える' },
  { id: 'reservation', title: '予約を管理する' },
  { id: 'shoot', title: '撮影を確定する' },
  { id: 'data', title: '撮影後にデータを登録する' },
  { id: 'archive', title: '過去の撮影を登録する' },
  { id: 'search', title: '過去の撮影を一覧・検索・編集する' },
  { id: 'stats', title: '過去の撮影実績を見る' },
  { id: 'models', title: 'モデルと撮影会を確認する' },
  { id: 'sync', title: 'オフラインと同期' },
  { id: 'limits', title: '現在できないこと' },
]

/**
 * 使い方ガイド。現在の実装でできる操作だけを説明する。
 * データを読まない静的なページ。画面の操作が変わったらここも直すこと。
 */
export default function GuidePage() {
  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">使い方ガイド</h1>
        <p className="text-muted mt-1 text-sm">
          CamFlow で現在できることを、撮影の流れに沿って説明します。
        </p>
      </header>

      <nav aria-label="目次" className="bg-surface border-border rounded-lg border p-5">
        <h2 className="text-sm font-medium">目次</h2>
        <ol className="mt-2 grid gap-x-6 text-sm sm:grid-cols-2 sm:gap-y-1">
          {SECTIONS.map((s, i) => (
            <li key={s.id}>
              {/* 素の <a> だとルーターの履歴に載らず、後で「戻る」と別画面の中身のままになる */}
              {/* スマホでは押せる範囲を1行ぶんに広げる */}
              <ScreenLink href={`#${s.id}`} className="block py-2 sm:inline sm:py-0">
                {i + 1}. {s.title}
              </ScreenLink>
            </li>
          ))}
        </ol>
      </nav>

      <Section id="flow">
        <p>撮影は、次の順番で登録していきます。</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <ScreenLink href="/reservations/new">予約情報入力</ScreenLink>
            ：申し込みたい撮影を登録する
          </li>
          <li>
            <ScreenLink href="/reservations/schedule">予約スケジュール</ScreenLink>
            ：受付開始までの残り時間を確認して申し込む
          </li>
          <li>
            <ScreenLink href="/shoots/confirm">確定撮影情報入力</ScreenLink>
            ：予約が取れたら、撮影の日時や場所を確定する
          </li>
          <li>
            <ScreenLink href="/shoots/info">確定撮影情報</ScreenLink>
            ：撮影後に、データの保存先URLを登録する
          </li>
        </ol>
        <p>
          この流れを通していない過去の撮影は、
          <ScreenLink href="/archives/new">過去撮影登録</ScreenLink>
          からまとめて登録できます。
        </p>
      </Section>

      <Section id="account">
        <ul className="list-disc space-y-1 pl-5">
          <li>メールアドレスとパスワードでサインインします。</li>
          <li>
            初めて使うときは「新規登録」タブから登録します。パスワードは8文字以上です。確認メールが届いたら、メール内のリンクを開いてからサインインしてください。
          </li>
        </ul>
        <Note>
          サインアウトすると、この端末に保存されたデータは削除されます。画面左下（スマホでは画面上部）に「未送信」の件数が出ているときは、同期が済んでからサインアウトしてください。
        </Note>
      </Section>

      <Section id="dashboard">
        <p>
          <ScreenLink href="/">ダッシュボード</ScreenLink>
          では、対応が必要なものを確認できます。各カードに表示されるのは5件までです。
        </p>
        <Definitions
          items={[
            ['予約リマインド', '可否がまだ決まっていない予約。撮影日を過ぎたものは「可否未決」と表示されます。'],
            [
              '料金リマインド',
              '確定した撮影の撮影料。支払方法が「当日」なら撮影日の撮影開始時刻、「事前」なら支払日に合わせて表示されます。撮影が終わると消えます。',
            ],
            [
              '撮影リマインド',
              '確定した撮影のうち、保存先が未登録のもの。撮影日時の前は「撮影前」、過ぎると「データ未登録」と表示され、保存先を登録すると消えます。',
            ],
            ['直近の撮影済みデータ', '過去撮影登録で登録した撮影など。最大10件です。'],
          ]}
        />
      </Section>

      <Section id="wishlist">
        <p>
          <ScreenLink href="/reservations/wishlist">撮影希望モデル登録</ScreenLink>
          で、撮影してみたいモデルを控えておけます。登録したものはフォームの下に新しい順で並びます。予約とはまだ連動しません。
        </p>
        <Definitions
          items={[
            ['必須', 'モデル名'],
            ['任意', '撮影会名、モデルアカウント（X、Instagram）、衣装系オプション、撮影方法オプション'],
          ]}
        />
        <ul className="list-disc space-y-1 pl-5">
          <li>同じモデルを、撮影会やオプションを変えて複数登録できます。</li>
          <li>
            モデルアカウントはモデルマスタに保存され、確定撮影情報のモデル欄にも表示されます。空欄のまま登録しても、保存済みのアカウントは消えません。
          </li>
        </ul>
      </Section>

      <Section id="reservation">
        <Step title="予約を登録する">
          <p>
            <ScreenLink href="/reservations/new">予約情報入力</ScreenLink>
            で次の項目を入力し、「予約を登録」を押します。登録すると予約スケジュールに移動します。
          </p>
          <Definitions
            items={[
              ['必須', '撮影区分、モデル名、撮影日、予約開始日時、予約種類、申込先'],
              [
                '任意',
                '撮影会名、撮影コンセプト、場所、撮影料、支払方法、支払日、衣装系オプション、撮影方法オプション、メモ',
              ],
            ]}
          />
          <FieldNotes />
          <p>
            支払方法は「当日」「事前」「予約時」から選びます。支払日の欄は「事前」のときだけ表示されます。入力した撮影料、支払方法、オプションは、予約を確定するときに引き継がれます。「予約時」は「支払済み」として引き継がれます。
          </p>
          <p>申込先は予約種類によって変わります。</p>
          <Definitions
            items={[
              ['予約ページ', '予約ページのURL'],
              ['メール', '予約先のメールアドレス'],
              ['DM', 'DMの送付先アカウント'],
            ]}
          />
        </Step>
        <Step title="受付開始を確認して申し込む">
          <p>
            <ScreenLink href="/reservations/schedule">予約スケジュール</ScreenLink>
            には、可否が決まっていない予約が受付開始の早い順に並びます。
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>受付開始までの残り時間が1秒ごとに更新されます。残り1時間を切ると色が変わります。</li>
            <li>受付開始を過ぎると「受付中」と表示されます。</li>
            <li>
              予約種類が予約ページなら「予約ページを開く」、メールなら「メールで申込」のリンクから申し込めます。DMは送付先が表示されます。
            </li>
            <li>撮影料、支払方法、オプションは、入力したものだけ表示されます。</li>
          </ul>
        </Step>
      </Section>

      <Section id="shoot">
        <p>
          予約が取れたら、
          <ScreenLink href="/shoots/confirm">確定撮影情報入力</ScreenLink>
          で撮影の内容を確定します。
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            「予約から選ぶ」で該当する予約を選びます。内容が引き継がれ、登録するとその予約は確定になり、予約スケジュールから消えます。
          </li>
          <li>足りない項目を入力して「撮影を確定」を押します。</li>
        </ol>
        <Definitions
          items={[
            ['必須', '撮影区分、モデル名、場所区分、撮影日、開始時刻、終了時刻'],
            [
              '任意',
              '撮影会名、撮影コンセプト、場所、集合場所、集合時刻、撮影料、支払方法、支払日、衣装系オプション、撮影方法オプション、メモ',
            ],
          ]}
        />
        <FieldNotes />
        <ul className="list-disc space-y-1 pl-5">
          <li>予約を通していない撮影は、「予約から選ぶ」を選ばずに入力すれば直接登録できます。</li>
          <li>集合場所の欄は、場所区分が屋外のときだけ表示されます。</li>
          <li>終了時刻は開始時刻より後にしてください。</li>
          <li>
            撮影料の支払方法は「当日」「事前」「支払済み」から選びます。支払日の欄は「事前」のときだけ表示されます。
          </li>
        </ul>
      </Section>

      <Section id="data">
        <p>
          <ScreenLink href="/shoots/info">確定撮影情報</ScreenLink>
          には、確定した撮影が撮影日の新しい順に並びます。撮影が終わったら、データの保存先URLを入力して「保存先を登録」を押します。
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            撮影料、衣装系オプション、撮影方法オプションは、確定後もここで変更できます。変更したら「撮影料とオプションを保存」を押します。
          </li>
          <li>保存先のURLは、撮影の終了時刻を過ぎるまで入力できません。</li>
          <li>URLは「追加」で最大10個まで増やせます。空欄は保存されません。</li>
          <li>撮影済みで保存先が未登録のものは、画面上部に件数が表示されます。</li>
        </ul>
        <Definitions
          items={[
            ['撮影前', '撮影の開始時刻がまだ先'],
            ['撮影中', '開始時刻を過ぎていて、撮影が終わっていない'],
            ['データ未登録', '撮影が終わっていて、保存先が未登録'],
            ['データ登録済み', '保存先を登録済み'],
          ]}
        />
      </Section>

      <Section id="archive">
        <p>
          予約や確定の入力を通していない過去の撮影は、
          <ScreenLink href="/archives/new">過去撮影登録</ScreenLink>
          から撮影済みとして登録します。
        </p>
        <Definitions
          items={[
            ['必須', '撮影区分、モデル名、場所区分、撮影日'],
            ['任意', '撮影会名、撮影コンセプト、場所、ストレージURL（最大10個）、メモ'],
          ]}
        />
        <FieldNotes />
        <ul className="list-disc space-y-1 pl-5">
          <li>撮影日には今日以前の日付を入力してください。</li>
          <li>時刻、集合場所、モデル料は入力しません。</li>
        </ul>
      </Section>

      <Section id="search">
        <p>
          <ScreenLink href="/archives/list">過去撮影一覧</ScreenLink>
          では、撮影日を過ぎた確定済みの撮影と、過去撮影登録で登録した撮影を、撮影日の新しい順にすべて確認できます。
        </p>
        <p>
          <ScreenLink href="/archives/search">撮影情報検索</ScreenLink>
          では、同じ撮影を条件で絞り込んで探せます。
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            撮影会名、モデル名、撮影日（いつから、いつまで）、撮影場所を入力して「検索」を押すと、条件に合う撮影が表示されます。条件が空なら、すべての撮影が表示されます。
          </li>
          <li>「詳細」で登録内容をすべて確認できます。</li>
          <li>「編集」で登録内容を変更できます。ストレージのURLもここで変更できます。</li>
          <li>撮影日を過ぎていない確定済みの撮影は、検索には表示されません。</li>
        </ul>
      </Section>

      <Section id="stats">
        <p>
          <ScreenLink href="/stats/history">過去撮影情報</ScreenLink>
          では、撮影情報検索で探せる撮影の実績を集計して確認できます。
        </p>
        <Definitions
          items={[
            ['モデル別情報', 'モデル名、撮影回数、初撮影日、最新撮影日'],
            ['撮影会別情報', '撮影会名、撮影モデル数、初利用日、最新利用日'],
          ]}
        />
        <p>撮影会別情報には、撮影会名を入力した撮影だけが集計されます。</p>
      </Section>

      <Section id="models">
        <p>
          <ScreenLink href="/masters/models">モデルマスタ</ScreenLink>
          で、登録されているモデルの名前と所属を確認できます。「詳細」で全項目を確認し、「編集」で読み、別名義、所属、アカウント、連絡先、メモなどを変更できます（IDは変更できません）。
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            所属は「所属を追加」で増やせます。1つを「メイン」に選ぶと、一覧にはメインの所属が表示されます。予約などで入力した撮影会名がどれかの所属と一致すれば、同じモデルとして扱われます。
          </li>
          <li>別名義は「別名義を追加」で、改名前の名前や別の活動名を登録できます。</li>
        </ul>
        <p>
          モデルは、予約情報入力、確定撮影情報入力、過去撮影登録で、モデル名と撮影会名の組み合わせが新しいときに自動で登録されます。所属には撮影会名が入り、撮影会名が空なら「フリー」になります。撮影会ごとに同じ名前の別人がいるため、撮影会が違えば同じ名前でも別のモデルとして登録されます。
        </p>
        <p>
          登録されると「新規モデルが登録されました。モデルマスタを編集しますか？」と表示されます。「OK」を押すと、そのモデルの編集画面が開きます。各画面のモデル名の欄には、登録済みのモデルが候補として表示されます。
        </p>
        <p>
          <ScreenLink href="/masters/organizers">撮影会マスタ</ScreenLink>
          で、登録されている撮影会の名前と拠点を確認できます。撮影会も、各画面で撮影会名を入力すると自動で登録されます。「詳細」で全項目を確認し、「編集」で名前、読み、拠点、URL、連絡先、メモなどを変更できます（IDは変更できません）。撮影会名を変えると、その撮影会を所属に持つモデルの所属も新しい名前に変わります。登録済みの撮影のタイトルは変わりません。
        </p>
      </Section>

      <Section id="sync">
        <p>
          オフラインでも予約や撮影を登録できます。入力した内容はまず端末に保存され、通信が戻ると自動で送信されます。
        </p>
        <p>同期の状態は、画面左下（スマホでは画面上部）に表示されます。</p>
        <Definitions
          items={[
            ['同期済み', 'すべての変更を送信済み'],
            ['未送信 ○件', 'まだ送信していない変更がある。「同期」ですぐに送信できます'],
            ['オフライン', '通信できない状態。未送信の変更は端末に残ります'],
            ['送信失敗 ○件', '送信できなかった変更がある。「再送」でやり直せます'],
          ]}
        />
      </Section>

      <Section id="limits">
        <p>次の操作は、現在のバージョンではまだできません。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            予約の編集、予約や撮影の削除（撮影の内容は、撮影日を過ぎていれば撮影情報検索の「編集」で変更できます。撮影日より前は、確定撮影情報で撮影料、オプション、保存先URLだけ変更できます）
          </li>
          <li>落選やキャンセルの記録</li>
          <li>モデル料の入力と支払いの記録</li>
          <li>撮影希望モデルの編集・削除</li>
          <li>モデルマスタからのモデルの新規登録と削除</li>
          <li>撮影会マスタからの撮影会の新規登録と削除</li>
          <li>
            メニューで「準備中」と表示されている画面の利用（予約成否分析、予約可否情報、撮影料積算、ロケ地・スタジオマスタ、通知設定、アカウント設定）
          </li>
        </ul>
        <Note>
          入力を間違えた予約は修正できないため、登録前に内容をご確認ください。
        </Note>
      </Section>
    </div>
  )
}

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  const index = SECTIONS.findIndex((s) => s.id === id)
  return (
    <section
      id={id}
      className="bg-surface border-border scroll-mt-36 space-y-3 rounded-lg border p-5 text-sm leading-relaxed lg:scroll-mt-6"
    >
      <h2 className="text-base font-semibold">
        {index + 1}. {SECTIONS[index].title}
      </h2>
      {children}
    </section>
  )
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-medium">{title}</h3>
      {children}
    </div>
  )
}

function ScreenLink({
  href,
  className = '',
  children,
}: {
  href: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`text-navy-600 dark:text-navy-200 underline underline-offset-2 ${className}`}
    >
      {children}
    </Link>
  )
}

function Definitions({ items }: { items: [string, string][] }) {
  return (
    <dl className="border-border divide-border divide-y rounded-md border">
      {items.map(([term, description]) => (
        <div key={term} className="gap-3 px-3 py-2 sm:flex">
          <dt className="shrink-0 font-medium sm:w-40">{term}</dt>
          <dd className="text-muted min-w-0">{description}</dd>
        </div>
      ))}
    </dl>
  )
}

/** 撮影区分によるモデル名の扱い。入力画面で共通 */
function FieldNotes() {
  return <p>撮影区分がセッション・大撮のときは、モデル名の欄は表示されず、入力は不要です。</p>
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
      {children}
    </p>
  )
}
