/**
 * 本の Markdown と表紙画像を書き出す共通処理
 * （getBook.ts から使う）
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const BOOKS_DIR = 'src/content/books';
export const COVERS_DIR = 'src/assets/books';

export type BookStatus = 'read' | 'reading' | 'unread';

// ---------- ISBN の変換 ----------

/** ハイフンや空白を取り除いて、ISBN の形式かを確認する */
export const normalizeIsbn = (value: string) => {
  const isbn = value.replace(/[-\s]/g, '').toUpperCase();
  if (!/^(\d{9}[\dX]|\d{13})$/.test(isbn)) {
    throw new Error(`ISBN の形式が正しくありません: ${value}`);
  }
  return isbn;
};

/** ISBN-10 を ISBN-13 に変換する */
export const toIsbn13 = (isbn: string) => {
  if (isbn.length === 13) return isbn;
  const core = `978${isbn.slice(0, 9)}`;
  const sum = [...core].reduce(
    (acc, digit, i) => acc + Number(digit) * (i % 2 === 0 ? 1 : 3),
    0,
  );
  return `${core}${(10 - (sum % 10)) % 10}`;
};

/** ISBN-13（978始まり）を ISBN-10 に変換する。変換できなければ undefined */
export const toIsbn10 = (isbn13: string) => {
  if (!isbn13.startsWith('978')) return undefined;
  const core = isbn13.slice(3, 12);
  const sum = [...core].reduce(
    (acc, digit, i) => acc + Number(digit) * (10 - i),
    0,
  );
  const check = (11 - (sum % 11)) % 11;
  return `${core}${check === 10 ? 'X' : check}`;
};

/** 本の ISBN-10 は Amazon の商品ID（ASIN）と同じなので、購入リンクに使える */
export const amazonUrl = (isbn13: string) => {
  const isbn10 = toIsbn10(isbn13);
  return isbn10 ? `https://www.amazon.co.jp/dp/${isbn10}` : undefined;
};

// ---------- 画像 ----------

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface CoverImage {
  data: Buffer;
  ext: string;
}

/** 画像をダウンロードする。画像でなければ undefined */
export const downloadImage = async (
  url: string,
): Promise<CoverImage | undefined> => {
  try {
    const res = await fetch(url);
    const type = res.headers.get('content-type')?.split(';')[0] ?? '';
    if (!res.ok || !EXTENSIONS[type]) return undefined;
    const data = Buffer.from(await res.arrayBuffer());
    // 極端に小さい画像は「画像なし」のダミーとみなす
    if (data.length < 1000) return undefined;
    return { data, ext: EXTENSIONS[type] };
  } catch {
    return undefined;
  }
};

// ---------- Markdown ----------

/** YAML の文字列として安全に書き出す（JSON の文字列は YAML としても有効） */
const yamlString = (value: string) => JSON.stringify(value);

/** 日付を YYYY-MM-DD にする（ローカル時刻） */
export const formatDate = (date: Date = new Date()) =>
  date.toLocaleDateString('sv-SE');

export interface BookFields {
  title: string;
  authors: string[];
  isbn13: string;
  publisher?: string;
  publishedDate?: string;
  status: BookStatus;
  readDate?: Date;
  recordedDate?: Date;
  link?: string;
  /** 感想（Markdown の本文） */
  body?: string;
}

const buildMarkdown = (book: BookFields, coverFile?: string) => {
  const frontmatter = [
    '---',
    `title: ${yamlString(book.title)}`,
    `authors: [${book.authors.map(yamlString).join(', ')}]`,
    `isbn: ${yamlString(book.isbn13)}`,
    book.publisher && `publisher: ${yamlString(book.publisher)}`,
    book.publishedDate && `publishedDate: ${yamlString(book.publishedDate)}`,
    `status: ${book.status}`,
    book.readDate && `readDate: ${formatDate(book.readDate)}`,
    book.recordedDate && `recordedDate: ${formatDate(book.recordedDate)}`,
    coverFile
      ? `cover: ${yamlString(`../../assets/books/${coverFile}`)}`
      : '# cover: "../../assets/books/ファイル名.jpg"',
    'categories: []',
    '# rating: 4',
    book.link && `link: ${yamlString(book.link)}`,
    '---',
  ].filter(Boolean);
  const body = book.body?.trim() || '<!-- ここに感想を書く -->';
  return `${frontmatter.join('\n')}\n\n${body}\n`;
};

/** 本の Markdown のパス */
export const bookPath = (isbn13: string) =>
  path.join(BOOKS_DIR, `${isbn13}.md`);

/** 本のファイルがすでにあるか */
export const bookExists = (isbn13: string) => existsSync(bookPath(isbn13));

/** 表紙と Markdown を書き出す。戻り値は保存した表紙のファイル名 */
export const saveBook = async (book: BookFields, cover?: CoverImage) => {
  let coverFile: string | undefined;
  if (cover) {
    coverFile = `${book.isbn13}.${cover.ext}`;
    await mkdir(COVERS_DIR, { recursive: true });
    await writeFile(path.join(COVERS_DIR, coverFile), cover.data);
  }
  await mkdir(BOOKS_DIR, { recursive: true });
  await writeFile(bookPath(book.isbn13), buildMarkdown(book, coverFile));
  return coverFile;
};
