declare const process: { argv: string[] } | undefined;
import { buildBundle } from '@ledra/bundle';
import { createReadOnlyRepository } from '@ledra/core';
import { SAMPLE_ENTITIES } from '@ledra/sample-data';
import { searchEntities, type SearchQueryInput } from '@ledra/search';
import { validateEntities } from '@ledra/validator';

export const appName = '@ledra/cli';

export type CliCommand = 'validate' | 'build' | 'serve' | 'inspect' | 'export';

export const runLedraCli = (args: readonly string[]): string => {
  const [command, ...rest] = args;
  const repository = createReadOnlyRepository(SAMPLE_ENTITIES);

  switch (command as CliCommand | undefined) {
    case 'validate': {
      const result = validateEntities(repository.listEntities());
      return JSON.stringify({ result, diagnostics: repository.diagnostics() }, null, 2);
    }
    case 'build': {
      const bundle = buildBundle(repository);
      return JSON.stringify({ bundle, diagnostics: repository.diagnostics() }, null, 2);
    }
    case 'serve':
      return 'serve mode is read-only and scheduled after validate/build.';
    case 'inspect': {
      const query = rest.join(' ');
      let parsedQuery: SearchQueryInput = query;

      if (query.trim().startsWith('{')) {
        try {
          parsedQuery = JSON.parse(query) as SearchQueryInput;
        } catch {
          parsedQuery = query;
        }
      }

      return JSON.stringify(searchEntities(parsedQuery, repository), null, 2);
    }
    case 'export':
      return JSON.stringify(buildBundle(repository), null, 2);
    default:
      return 'Usage: ledra <validate|build|serve|inspect|export>';
  }
};

if (typeof process !== 'undefined' && process.argv[1]) {
  const args = process.argv.slice(2);
  // CLI intentionally keeps repository access read-only.
  console.log(runLedraCli(args));
}
