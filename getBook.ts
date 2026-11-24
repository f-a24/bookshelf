/**
 * ISBN から本の情報を取得して、本棚に登録する
 *
 * 使い方: bun run book [ISBN] [--force]
 *   - src/content/books/{ISBN13}.md を作成する（状態は「読了」、読了日は今日）
 *   - 表紙を src/assets/books/{ISBN13}.{jpg|png|webp} に保存する
 *   - --force を付けると、既存のファイルを上書きする
 */
import {
  amazonUrl,
  bookExists,
  bookPath,
  downloadImage,
  normalizeIsbn,
  saveBook,
  toIsbn13,
} from './scripts/bookFile';

const args = process.argv.slice(2);
const force = args.includes('--force');
const input = args.find(arg => !arg.startsWith('--'));
const { API_KEY } = process.env;

// ---------- 書籍情報の取得 ----------

interface VolumeInfo {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  imageLinks?: Record<string, string>;
}

/** Google Books API から書籍情報を取得する */
const fetchVolumeInfo = async (isbn13: string): Promise<VolumeInfo> => {
  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  url.searchParams.set('q', `isbn:${isbn13}`);
  if (API_KEY) url.searchParams.set('key', API_KEY);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Books API エラー: ${res.status}`);

  const data = await res.json();
  if (!data.items?.length) throw new Error('書籍が見つかりませんでした');
  return data.items[0].volumeInfo;
};

// ---------- 表紙画像の取得 ----------

/** Google Books の表紙URLの中から、いちばん大きいものを選ぶ */
const pickGoogleCoverUrl = (links: Record<string, string> = {}) => {
  const url = ['extraLarge', 'large', 'medium', 'small', 'thumbnail']
    .map(size => links[size])
    .find(Boolean);
  // http を https に変え、ページめくりの効果（edge=curl）を外す
  return url?.replace(/^http:/, 'https:').replace(/&edge=curl/, '');
};

/**
 * 表紙を取得する。日本の本は国立国会図書館（NDL）の書影の方が
 * 大きくて確実なので、NDL → Google Books の順に試す
 */
const fetchCover = async (isbn13: string, info: VolumeInfo) => {
  const ndl = await downloadImage(
    `https://ndlsearch.ndl.go.jp/thumbnail/${isbn13}.jpg`,
  );
  if (ndl) return { ...ndl, source: '国立国会図書館' };

  const googleUrl = pickGoogleCoverUrl(info.imageLinks);
  if (googleUrl) {
    // fife=w800 を付けると、通常（幅128px程度）より大きい画像が返ってくる
    const google =
      (await downloadImage(`${googleUrl}&fife=w800`)) ??
      (await downloadImage(googleUrl));
    if (google) return { ...google, source: 'Google Books' };
  }

  return undefined;
};

// ---------- メイン処理 ----------

const main = async () => {
  if (!input) {
    console.error('使い方: bun run book [ISBN] [--force]');
    process.exit(1);
  }

  const isbn13 = toIsbn13(normalizeIsbn(input));

  if (bookExists(isbn13) && !force) {
    throw new Error(
      `${bookPath(isbn13)} はすでにあります（上書きする場合は --force を付けてください）`,
    );
  }

  const info = await fetchVolumeInfo(isbn13);
  const title = [info.title ?? '不明', info.subtitle].filter(Boolean).join(' ');
  const authors = info.authors ?? ['不明'];
  const cover = await fetchCover(isbn13, info);

  const coverFile = await saveBook(
    {
      title,
      authors,
      isbn13,
      publisher: info.publisher,
      publishedDate: info.publishedDate,
      status: 'read',
      readDate: new Date(),
      link: amazonUrl(isbn13),
    },
    cover,
  );

  console.log('📚 本棚に登録しました');
  console.log('タイトル  :', title);
  console.log('著者      :', authors.join(', '));
  console.log('発売日    :', info.publishedDate ?? '不明');
  console.log(
    '表紙      :',
    cover ? `${coverFile}（${cover.source}）` : '見つかりませんでした',
  );
  console.log('ファイル  :', bookPath(isbn13));
  console.log('→ カテゴリ・評価・感想を書き足してください');
};

main().catch(err => {
  console.error('エラー:', err.message);
  process.exit(1);
});
