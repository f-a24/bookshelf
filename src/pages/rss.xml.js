import rss from '@astrojs/rss';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';
import { bookUrl, getSortedBooks } from '../lib/books';

export async function GET(context) {
  const books = await getSortedBooks();
  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site,
    // リンク末尾に / を付けない（#book-xxx/ になるのを防ぐ）
    trailingSlash: false,
    // 読了した本だけを配信する
    items: books
      .filter(book => book.data.status === 'read' && book.data.readDate)
      .map(book => ({
        title: book.data.title,
        description: `${book.data.authors.join('、')}『${book.data.title}』`,
        pubDate: book.data.readDate,
        link: bookUrl(book.id),
      })),
  });
}
