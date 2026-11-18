import { readdirSync } from 'fs';
import { join, relative } from 'path';

import { SCREENS } from './registry';

function routeFiles(dir: string, root = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path, root);
    if (!entry.name.endsWith('.tsx') || entry.name.startsWith('_layout')) return [];
    return [relative(root, path).replace(/\\/g, '/').replace(/\.tsx$/, '')];
  });
}

test('every route is listed in the screen registry with its Figma status', () => {
  const onDisk = routeFiles(join(__dirname, '..', 'app')).sort();
  const registered = SCREENS.map((screen) => screen.route).sort();
  expect(registered).toEqual(onDisk);
});

test('figma-built screens name the Figma screen they follow', () => {
  for (const screen of SCREENS.filter((s) => s.design === 'figma')) {
    expect(screen.figma).toBeTruthy();
  }
});
