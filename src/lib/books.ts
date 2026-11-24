import { type CollectionEntry, getCollection } from 'astro:content';

type Book = CollectionEntry<'books'>;
export type BookStatus = Book['data']['status'];

/** 状態の表示名 */
export const STATUS_LABELS: Record<BookStatus, string> = {
  read: '読了',
  reading: '読書中',
  unread: '積読',
};

/** 並び順に使う日付（読了日 → 最終記録日の順に使う） */
export const sortDate = (book: Book) =>
  book.data.readDate ?? book.data.recordedDate ?? new Date(0);

/** 全書籍を、読了日（なければ最終記録日）の新しい順で取得する（RSS 用） */
export const getSortedBooks = async () =>
  (await getCollection('books')).toSorted(
    (a, b) => sortDate(b).valueOf() - sortDate(a).valueOf(),
  );

/**
 * 全書籍を、発売日の新しい順で取得する（本棚用）。
 * 発売日は「2026-05-26」「2026-05」「2026」のような文字列なので、文字列のまま比べる。
 * 発売日がない本は最後に置き、発売日が同じ本は読了日の新しい順にする
 */
export const getBooksByPublishedDate = async () =>
  (await getCollection('books')).toSorted((a, b) => {
    const dateA = a.data.publishedDate ?? '';
    const dateB = b.data.publishedDate ?? '';
    if (dateA !== dateB) return dateA < dateB ? 1 : -1;
    return sortDate(b).valueOf() - sortDate(a).valueOf();
  });

/** 状態ごとの冊数を数える */
export const countByStatus = (books: Book[]) => {
  const counts: Record<BookStatus, number> = { read: 0, reading: 0, unread: 0 };
  for (const book of books) counts[book.data.status]++;
  return counts;
};

/** カテゴリごとの冊数を数える（冊数の多い順。同数なら名前順） */
export const countByCategory = (books: Book[]) => {
  const counts = new Map<string, number>();
  for (const category of books.flatMap(book => book.data.categories)) {
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts].toSorted(
    ([nameA, countA], [nameB, countB]) =>
      countB - countA || nameA.localeCompare(nameB, 'ja'),
  );
};

/** その本のモーダルを開くURL（例: /#book-9784297113513） */
export const bookUrl = (id: string) => `/#book-${id}`;
