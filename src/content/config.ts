import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    author: z.string(),
    date: z.coerce.date().optional(),
    assetsDir: z.string().optional(),
  }),
});

export const collections = { blog };
