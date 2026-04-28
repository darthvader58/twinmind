import { z } from 'zod';

export const SuggestionTypeSchema = z.enum([
  'summary',
  'follow_up_question',
  'tangential_discussion',
  'answer',
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

const ExtractedNodeSchema = z.object({
  label: z.string().min(1).max(120),
  display: z.string().min(1).max(160),
});

const ExtractedSeedSchema = ExtractedNodeSchema.extend({
  related_to: z.string().max(160).optional().default(''),
  why: z.string().max(280).optional().default(''),
});

export const ExtractResponseSchema = z.object({
  entities: z.array(ExtractedNodeSchema).default([]),
  claims: z.array(ExtractedNodeSchema).default([]),
  open_questions: z.array(ExtractedNodeSchema).default([]),
  tangent_seeds: z.array(ExtractedSeedSchema).default([]),
});

export type ExtractedNode = z.infer<typeof ExtractedNodeSchema>;
export type ExtractedSeed = z.infer<typeof ExtractedSeedSchema>;
export type ExtractResponse = z.infer<typeof ExtractResponseSchema>;

export const TopicNodeKindSchema = z.enum([
  'entity',
  'claim',
  'open_question',
  'tangent_seed',
]);

export const TopicGraphNodeWireSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(160),
  display: z.string().min(1).max(200),
  kind: TopicNodeKindSchema,
  firstMentionedAtMs: z.number().int().nonnegative(),
  lastMentionedAtMs: z.number().int().nonnegative(),
  covered: z.boolean(),
  relatedLabels: z.array(z.string().max(160)).default([]),
});

export type TopicGraphNodeWire = z.infer<typeof TopicGraphNodeWireSchema>;
