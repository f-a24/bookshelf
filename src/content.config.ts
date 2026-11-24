import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const books = defineCollection({
  // src/content/books/ 以下の Markdown を本1冊ずつとして読み込む
  loader: glob({ base: './src/content/books', pattern: '**/*.md' }),
  // frontmatter の型チェック
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      authors: z.array(z.string()),
      isbn: z.string(),
      publisher: z.string().optional(),
      // 発売日（Google Books の値をそのまま入れるので文字列）
      publishedDate: z.string().optional(),
      // 読書の状態（read: 読了 / reading: 読書中 / unread: 積読）
      status: z.enum(['read', 'reading', 'unread']).default('read'),
      // 読了日。読了していない本は空でよい
      readDate: z.coerce.date().optional(),
      // 最後に記録した日（読書中・積読の本の並び順に使う）
      recordedDate: z.coerce.date().optional(),
      // 表紙画像（src/assets/books/ のローカル画像）。ない場合はタイトル入りの本で表示
      cover: image().optional(),
      categories: z.array(z.string()).default([]),
      rating: z.number().int().min(1).max(5).optional(),
      // 購入リンク
      link: z.url().optional(),
    }),
});

export const collections = { books };
