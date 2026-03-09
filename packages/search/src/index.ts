import type { ReadOnlyRepository } from '@ledra/core';
import type { EntityRecord, RegistryGraph, RelationRecord } from '@ledra/types';

export const packageName = '@ledra/search';

export type SearchAttributeFilter = {
  field: string;
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

const isRepository = (value: RegistryGraph | ReadOnlyRepository): value is ReadOnlyRepository =>
  typeof value === 'object' &&
  value !== null &&
  'graph' in value &&
  typeof value.graph === 'function';

const toGraph = (value: RegistryGraph | ReadOnlyRepository): RegistryGraph =>
  isRepository(value) ? value.graph() : value;

const entityOrder = (left: EntityRecord, right: EntityRecord): number => {
  const typeCompare = left.type.localeCompare(right.type);
  if (typeCompare !== 0) {
    return typeCompare;
  }

  return left.id.localeCompare(right.id);
};

const toNormalizedString = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase();

const normalizeStructuredQuery = (query: SearchQueryInput): StructuredSearchQuery => {
  if (typeof query !== 'string') {
    return {
      ...(query.text?.trim() ? { text: query.text.trim() } : {}),
      ...(query.type?.trim() ? { type: query.type.trim() } : {}),
      ...(query.relatedTo?.trim() ? { relatedTo: query.relatedTo.trim() } : {}),
      ...(query.relationType?.trim() ? { relationType: query.relationType.trim() } : {}),
      ...(query.attributes?.length ? { attributes: query.attributes } : {})
    };
  }

  const trimmed = query.trim();
  if (!trimmed) {
    return {};
  }

  const tokens = trimmed.split(/\s+/u);
  const attributes: SearchAttributeFilter[] = [];
  const textParts: string[] = [];
  let type: string | undefined;
  let relatedTo: string | undefined;
  let relationType: string | undefined;

  for (const token of tokens) {
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

    const exactMatch = token.match(/^([^=~\s]+)=([^\s]+)$/u);
    if (exactMatch?.[1] && exactMatch[2]) {
      attributes.push({ field: exactMatch[1], operator: '=', value: exactMatch[2] });
      continue;
    }

    const partialMatch = token.match(/^([^=~\s]+)~([^\s]+)$/u);
    if (partialMatch?.[1] && partialMatch[2]) {
      attributes.push({ field: partialMatch[1], operator: '~', value: partialMatch[2] });
      continue;
    }

    textParts.push(token);
  }

  return {
    ...(textParts.length > 0 ? { text: textParts.join(' ') } : {}),
    ...(type?.trim() ? { type: type.trim() } : {}),
    ...(relatedTo?.trim() ? { relatedTo: relatedTo.trim() } : {}),
    ...(relationType?.trim() ? { relationType: relationType.trim() } : {}),
    ...(attributes.length > 0 ? { attributes } : {})
  };
};

const getFieldValues = (entity: EntityRecord, field: string): readonly string[] => {
  switch (field) {
    case 'id':
      return [entity.id];
    case 'type':
      return [entity.type];
    case 'title':
      return [entity.title];
    case 'summary':
      return [entity.summary ?? ''];
    case 'tags':
      return entity.tags;
    default: {
      if (field.startsWith('attributes.')) {
        const attributeKey = field.slice('attributes.'.length);
        const value = (entity.attributes as Record<string, unknown>)[attributeKey];
        if (Array.isArray(value)) {
          return value.map((entry) => String(entry));
        }

        return [String(value ?? '')];
      }

      const value = (entity.attributes as Record<string, unknown>)[field];
      if (Array.isArray(value)) {
        return value.map((entry) => String(entry));
      }

      return [String(value ?? '')];
    }
  }
};

const matchesAttribute = (entity: EntityRecord, filter: SearchAttributeFilter): boolean => {
  const haystacks = getFieldValues(entity, filter.field).map((value) => toNormalizedString(value));
  const needle = toNormalizedString(filter.value);

  if (!needle) {
    return true;
  }

  return filter.operator === '='
    ? haystacks.some((haystack) => haystack === needle)
    : haystacks.some((haystack) => haystack.includes(needle));
};

const buildRelatedEntityIds = (
  relations: readonly RelationRecord[],
  relatedTo: string,
  relationType: string
): ReadonlySet<string> => {
  const normalizedRelationType = relationType.toLowerCase();
  const normalizedRelatedTo = relatedTo.toLowerCase();

  return new Set(
    relations.flatMap((relation) => {
      if (normalizedRelationType && relation.type.toLowerCase() !== normalizedRelationType) {
        return [];
      }

      if (relation.source.id.toLowerCase() === normalizedRelatedTo) {
        return [relation.target.id.toLowerCase()];
      }

      if (relation.target.id.toLowerCase() === normalizedRelatedTo) {
        return [relation.source.id.toLowerCase()];
      }

      return [];
    })
  );
};

export const searchEntities = (
  query: SearchQueryInput,
  source: RegistryGraph | ReadOnlyRepository
): readonly EntityRecord[] => {
  const graph = toGraph(source);
  const normalizedQuery = normalizeStructuredQuery(query);

  const text = normalizedQuery.text ? normalizedQuery.text.toLowerCase() : '';
  const type = normalizedQuery.type ? normalizedQuery.type.toLowerCase() : '';
  const relatedTo = normalizedQuery.relatedTo ? normalizedQuery.relatedTo.toLowerCase() : '';
  const relationType = normalizedQuery.relationType
    ? normalizedQuery.relationType.toLowerCase()
    : '';
  const attributes = normalizedQuery.attributes ?? [];
  const relatedEntityIds = relatedTo
    ? buildRelatedEntityIds(graph.relations, relatedTo, relationType)
    : undefined;

  return [...graph.entities]
    .filter((entity) => {
      if (type && entity.type.toLowerCase() !== type) {
        return false;
      }

      if (relatedTo && relatedEntityIds && !relatedEntityIds.has(entity.id.toLowerCase())) {
        return false;
      }

      if (!attributes.every((filter) => matchesAttribute(entity, filter))) {
        return false;
      }

      if (!text) {
        return true;
      }

      const searchParts = [
        entity.id,
        entity.type,
        entity.title,
        entity.summary ?? '',
        ...entity.tags,
        ...Object.values(entity.attributes).map((value) => String(value ?? ''))
      ];

      return searchParts.some((part) => part.toLowerCase().includes(text));
    })
    .sort(entityOrder);
};
