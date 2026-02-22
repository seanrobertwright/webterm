#!/usr/bin/env node

/**
 * Prepare the publish/ staging directory for npm publish.
 *
 * Steps:
 *   1. Clean publish/
 *   2. Run full build (shared → backend → frontend)
 *   3. Copy built artifacts into publish/
 *   4. Generate publish/package.json with runtime-only deps
 *   5. Copy README and bin entrypoint
 */

import { execSync } from 'child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publish = join(root, 'publish');

function run(cmd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

function step(label) {
  console.log(`\n--- ${label} ---`);
}

// 1. Clean
step('Cleaning publish/');
if (existsSync(publish)) {
  // Remove contents individually — the directory itself may be locked on Windows
  try {
    rmSync(publish, { recursive: true, force: true });
  } catch {
    // If the directory is locked, clear its contents instead
    const { readdirSync } = await import('fs');
    for (const entry of readdirSync(publish)) {
      try {
        rmSync(join(publish, entry), { recursive: true, force: true });
      } catch {
        // Skip entries that can't be removed (e.g., locked files)
      }
    }
  }
}
mkdirSync(publish, { recursive: true });

// 2. Build
step('Building all workspaces');
run('npm run build');

// 3. Copy backend dist
step('Copying backend');
cpSync(join(root, 'backend', 'dist'), join(publish, 'backend', 'dist'), {
  recursive: true,
});

// Also copy backend's schema.sql (needed for migrations at runtime)
const schemaSource = join(root, 'backend', 'src', 'db', 'schema.sql');
if (existsSync(schemaSource)) {
  const schemaDest = join(publish, 'backend', 'dist', 'backend', 'src', 'db');
  mkdirSync(schemaDest, { recursive: true });
  cpSync(schemaSource, join(schemaDest, 'schema.sql'));
}

// 4. Copy frontend dist
step('Copying frontend');
cpSync(join(root, 'frontend', 'dist'), join(publish, 'frontend', 'dist'), {
  recursive: true,
});

// 5. Copy shared (raw .ts files — backend dist already compiled them, but
//    keep the originals in case anything imports from shared at runtime)
step('Copying shared types');
cpSync(join(root, 'shared'), join(publish, 'shared'), {
  recursive: true,
  filter: (src) => !src.includes('node_modules'),
});

// 6. Copy CLI entry point
step('Copying CLI entry point');
mkdirSync(join(publish, 'bin'), { recursive: true });
cpSync(join(root, 'bin', 'webterm.js'), join(publish, 'bin', 'webterm.js'));

// 7. Generate publish/package.json
step('Generating package.json');
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const backendPkg = JSON.parse(
  readFileSync(join(root, 'backend', 'package.json'), 'utf-8')
);

const publishPkg = {
  name: '@lrilai/webterm',
  version: rootPkg.version,
  description:
    'Web-based terminal multiplexer — run multiple terminal sessions in the browser',
  type: 'module',
  bin: {
    webterm: 'bin/webterm.js',
  },
  files: ['bin/', 'backend/dist/', 'frontend/dist/', 'shared/'],
  engines: {
    node: '>=20.0.0',
  },
  dependencies: {
    '@lydell/node-pty': backendPkg.dependencies['@lydell/node-pty'],
    'better-sqlite3': backendPkg.dependencies['better-sqlite3'],
    ws: backendPkg.dependencies['ws'],
    uuid: backendPkg.dependencies['uuid'],
    open: backendPkg.dependencies['open'],
  },
  keywords: [
    'terminal',
    'multiplexer',
    'tmux',
    'web',
    'pty',
    'cli',
    'xterm',
  ],
  license: 'MIT',
  repository: {
    type: 'git',
    url: 'git+https://github.com/lrilai/webterm.git',
  },
};

writeFileSync(
  join(publish, 'package.json'),
  JSON.stringify(publishPkg, null, 2) + '\n'
);

// 8. Copy README
step('Copying README');
const readmeSrc = join(root, 'README.md');
if (existsSync(readmeSrc)) {
  cpSync(readmeSrc, join(publish, 'README.md'));
}

// Done
console.log('\n=== Publish package ready ===');
console.log(`  Directory: ${publish}`);
console.log('  To inspect:  npm run publish:dry');
console.log('  To publish:  cd publish && npm publish');
console.log('');
