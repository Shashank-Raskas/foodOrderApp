// Policy text splitter: LangChain's RecursiveCharacterTextSplitter, measured in (approximate) tokens.
// It tries the coarsest separator first (paragraphs), re-splits any piece still too long with the
// next one (lines → sentences → words), then merges pieces back up to chunkSize, carrying
// chunkOverlap of the previous chunk's tail into the next. Natural units (a paragraph, a list,
// a table) therefore stay whole whenever they fit, and sentences are cut only as a last resort.

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { POLICY_CHUNK, approxTokens } from '../config.js';

export function createPolicySplitter(options = POLICY_CHUNK) {
  return new RecursiveCharacterTextSplitter({
    chunkSize: options.maxTokens,
    chunkOverlap: options.overlapTokens,
    separators: options.separators,
    // Sizes are in tokens, not characters, because the embedding model's limit is in tokens
    lengthFunction: approxTokens,
  });
}
