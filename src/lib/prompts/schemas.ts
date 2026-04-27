import { z } from 'zod';

export const SuggestionTypeSchema = z.enum([
  'question_to_ask',
  'talking_point',
  'answer',
  'fact_check',
  'clarifying_info',
]);

export const SuggestionInputSchema = z.object({
  type: SuggestionTypeSchema,
  preview: z.string().min(1).max(280),
});

export const SuggestionsResponseSchema = z.object({
  suggestions: z.array(SuggestionInputSchema).length(3),
});

export type SuggestionInput = z.infer<typeof SuggestionInputSchema>;
export type SuggestionsResponse = z.infer<typeof SuggestionsResponseSchema>;
