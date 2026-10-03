import * as path from 'node:path';
import { relativePosix, resolveSource } from './paths';

describe('relativePosix', () => {
  it('names a file next to the diagram by its name', () => {
    expect(relativePosix(path.resolve('/a/b'), path.resolve('/a/b/Order.cs'))).toBe('Order.cs');
  });

  it('goes up and down with slashes', () => {
    expect(relativePosix(path.resolve('/a/docs'), path.resolve('/a/src/Sagas/Order.cs'))).toBe(
      '../src/Sagas/Order.cs',
    );
  });
});

describe('resolveSource', () => {
  it('is the inverse of relativePosix', () => {
    const dir = path.resolve('/a/docs');
    const file = path.resolve('/a/src/Sagas/Order.cs');
    expect(resolveSource(dir, relativePosix(dir, file))).toBe(file);
  });
});
