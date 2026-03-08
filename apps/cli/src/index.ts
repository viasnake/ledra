declare const process: { argv: string[] } | undefined;
import { buildBundle } from '@ledra/bundle';
import { createReadOnlyRepository } from '@ledra/core';
import { searchEntities } from '@ledra/search';
import { validateEntities } from '@ledra/validator';

export const appName = '@ledra/cli';

export type CliCommand = 'validate' | 'build' | 'serve' | 'inspect' | 'export';

export const runLedraCli = (args: readonly string[]): string => {
  const [command, ...rest] = args;
  const repository = createReadOnlyRepository();

  switch (command as CliCommand | undefined) {
    case 'validate': {
      const result = validateEntities(repository.listEntities());
      return JSON.stringify(result, null, 2);
    }
    case 'build': {
      return JSON.stringify(buildBundle(repository), null, 2);
    }
    case 'serve':
      return 'serve mode is read-only and scheduled after validate/build.';
    case 'inspect': {
      const query = rest.join(' ');
      return JSON.stringify(searchEntities(query, repository), null, 2);
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
