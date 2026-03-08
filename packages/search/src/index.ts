import { createReadOnlyRepository, type ReadOnlyRepository } from '@ledra/core';
import type { EntityRecord } from '@ledra/types';

export const packageName = '@ledra/search';

type SearchAttributeFilter = {
  field: keyof EntityRecord | string;
  operator: '=' | '~';
  value: string;
};

export type StructuredSearchQuery = {
  text?: string;
  type?: string;
  attributes?: readonly SearchAttributeFilter[];
  relatedTo?: string;
  relationType?: string;
};

export type SearchQueryInput = string | StructuredSearchQuery;

const entityOrder = (left: EntityRecord, right: EntityRecord): number => {
  const typeCompare = left.type.localeCompare(right.type);
  if (typeCompare !== 0) {
    return typeCompare;
  }

  const idCompare = left.id.localeCompare(right.id);
  if (idCompare !== 0) {
    return idCompare;
  }

  return left.title.localeCompare(right.title);
};

const toNormalizedString = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const normalizeStructuredQuery = (query: SearchQueryInput): StructuredSearchQuery => {
  if (typeof query !== 'string') {
    const normalized: StructuredSearchQuery = {};

    if (query.text?.trim()) {
      normalized.text = query.text.trim();
    }
    if (query.type?.trim()) {
      normalized.type = query.type.trim();
    }
    if (query.relatedTo?.trim()) {
      normalized.relatedTo = query.relatedTo.trim();
    }
    if (query.relationType?.trim()) {
      normalized.relationType = query.relationType.trim();
    }
    if (query.attributes?.length) {
      normalized.attributes = query.attributes
        .map((filter) => ({
          ...filter,
          field: filter.field.trim(),
          value: filter.value.trim()
        }))
        .filter((filter) => filter.field.length > 0);
    }

    return normalized;
  }

  const trimmed = query.trim();
  if (!trimmed) {
    return {};
  }

  const tokenized = trimmed.split(/\s+/);
  const attributes: SearchAttributeFilter[] = [];
  let textParts: string[] = [];
  let type: string | undefined;
  let relatedTo: string | undefined;
  let relationType: string | undefined;

  for (const token of tokenized) {
    if (token.startsWith('type=')) {
      type = token.slice('type='.length);
      continue;
    }

    if (token.startsWith('relatedTo=')) {
      relatedTo = token.slice('relatedTo='.length);
      continue;
    }

    if (token.startsWith('relationType=')) {
      relationType = token.slice('relationType='.length);
      continue;
    }

    const exactMatch = token.match(/^([^=~\s]+)=([^\s]+)$/);
    if (exactMatch?.[1] && exactMatch[2]) {
      attributes.push({ field: exactMatch[1], operator: '=', value: exactMatch[2] });
      continue;
    }

    const partialMatch = token.match(/^([^=~\s]+)~([^\s]+)$/);
    if (partialMatch?.[1] && partialMatch[2]) {
      attributes.push({ field: partialMatch[1], operator: '~', value: partialMatch[2] });
      continue;
    }

    textParts.push(token);
  }

  const parsed: StructuredSearchQuery = {};
  const text = textParts.join(' ').trim();

  if (text) {
    parsed.text = text;
  }
  if (type?.trim()) {
    parsed.type = type.trim();
  }
  if (relatedTo?.trim()) {
    parsed.relatedTo = relatedTo.trim();
  }
  if (relationType?.trim()) {
    parsed.relationType = relationType.trim();
  }
  if (attributes.length > 0) {
    parsed.attributes = attributes;
  }

  return parsed;
};

const matchesAttribute = (entity: EntityRecord, filter: SearchAttributeFilter): boolean => {
  const haystack = toNormalizedString((entity as Record<string, unknown>)[filter.field]);
  const needle = toNormalizedString(filter.value);

  if (!needle) {
    return true;
  }

  if (filter.operator === '=') {
    return haystack === needle;
  }

  return haystack.includes(needle);
};

export const searchEntities = (
  query: SearchQueryInput,
  repository: ReadOnlyRepository = createReadOnlyRepository()
): readonly EntityRecord[] => {
  const normalizedQuery = normalizeStructuredQuery(query);

  const text = normalizedQuery.text ? normalizedQuery.text.toLowerCase() : '';
  const type = normalizedQuery.type ? normalizedQuery.type.toLowerCase() : '';
  const relatedTo = normalizedQuery.relatedTo ? normalizedQuery.relatedTo.toLowerCase() : '';
  const relationType = normalizedQuery.relationType ? normalizedQuery.relationType.toLowerCase() : '';
  const attributes = normalizedQuery.attributes ?? [];

  const filtered = repository.listEntities().filter((entity) => {
    if (type && entity.type.toLowerCase() !== type) {
      return false;
    }

    if (
      relatedTo &&
      !entity.relations.some(
        (relation) =>
          relation.targetId.toLowerCase() === relatedTo &&
          (!relationType || relation.type.toLowerCase() === relationType)
      )
    ) {
      return false;
    }

    if (!attributes.every((attribute) => matchesAttribute(entity, attribute))) {
      return false;
    }

    if (!text) {
      return true;
    }

    const haystacks = [entity.id, entity.title, entity.summary ?? '', ...entity.tags];
    return haystacks.some((part) => part.toLowerCase().includes(text));
  });

  return [...filtered].sort(entityOrder);
};
