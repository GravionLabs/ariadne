import { zipFiles } from './zip';

describe('zipFiles', () => {
  const files = [
    { name: 'A.cs', content: 'class A {}\n' },
    { name: 'Ünï.cs', content: 'class B { /* ✓ */ }\n' },
  ];

  it('starts with local headers and ends with the directory of both files', () => {
    const zip = zipFiles(files);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(zip.length - 22 + 10, true)).toBe(2);
  });

  it('is the same for the same files', () => {
    expect(zipFiles(files)).toEqual(zipFiles(structuredClone(files)));
  });

  it('stores the names and contents as UTF-8, unchanged', () => {
    const text = new TextDecoder().decode(zipFiles(files));
    expect(text).toContain('Ünï.cs');
    expect(text).toContain('class B { /* ✓ */ }');
  });
});
