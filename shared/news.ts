import { z } from "zod";

export const categories = [
  "general",
  "business",
  "technology",
  "science",
  "health",
  "sports",
  "entertainment",
] as const;
export const categorySchema = z.enum(categories);
export type Category = z.infer<typeof categorySchema>;
export const categoryLabels: Record<Category, string> = {
  general: "Top stories",
  business: "Business",
  technology: "Technology",
  science: "Science",
  health: "Health",
  sports: "Sports",
  entertainment: "Culture",
};

export const articleSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.url(),
  imageUrl: z.url().nullable(),
  source: z.string(),
  publishedAt: z.string().nullable(),
});
export type Article = z.infer<typeof articleSchema>;
export const newsResponseSchema = z.object({
  category: categorySchema,
  articles: z.array(articleSchema),
  fetchedAt: z.string(),
  expiresAt: z.string(),
  stale: z.boolean(),
  demo: z.boolean(),
});
export type NewsResponse = z.infer<typeof newsResponseSchema>;
