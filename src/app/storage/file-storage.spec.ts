import {
  DIAGRAM_EXTENSIONS,
  LEGACY_EXTENSIONS,
  UNTITLED_NAME,
  diagramFileName,
} from './file-storage';

describe('diagram file names', () => {
  it('uses the double extension that sets diagrams apart from other YAML files', () => {
    expect(DIAGRAM_EXTENSIONS).toEqual(['.saga.yaml']);
    expect(LEGACY_EXTENSIONS).toEqual(['.yaml', '.yml']);
    expect(UNTITLED_NAME).toBe('untitled.saga.yaml');
  });

  describe('diagramFileName', () => {
    it.each([
      ['order', 'order.saga.yaml'],
      ['order.saga.yaml', 'order.saga.yaml'],
      ['order.yaml', 'order.saga.yaml'],
      ['order.yml', 'order.saga.yaml'],
      ['Order Saga', 'Order Saga.saga.yaml'],
      ['payment.v2', 'payment.v2.saga.yaml'],
      ['my.saga', 'my.saga.saga.yaml'],
    ])('turns %j into %j', (name, expected) => {
      expect(diagramFileName(name)).toBe(expected);
    });

    it('keeps the name when it already has the extension, in any case', () => {
      expect(diagramFileName('ORDER.SAGA.YAML')).toBe('ORDER.SAGA.YAML');
      expect(diagramFileName('  order.saga.yaml  ')).toBe('order.saga.yaml');
    });

    it('is idempotent', () => {
      for (const name of ['a', 'a.yaml', 'a.saga.yaml', 'a.b.c']) {
        expect(diagramFileName(diagramFileName(name))).toBe(diagramFileName(name));
      }
    });

    it('falls back to the untitled name when nothing is left', () => {
      expect(diagramFileName('')).toBe(UNTITLED_NAME);
      expect(diagramFileName('   ')).toBe(UNTITLED_NAME);
      expect(diagramFileName('.yaml')).toBe('.yaml.saga.yaml'); // a file called ".yaml" is a name
      expect(diagramFileName('...')).toBe(UNTITLED_NAME);
    });
  });
});
