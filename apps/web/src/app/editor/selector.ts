/**
 * A CSS attribute selector, `[name="value"]`, for any value: the backslash is escaped as well as the
 * quote (escaping only the quote lets a value that ends in a backslash close the string early), and
 * a line break, which a quoted string cannot hold, becomes its escape.
 */
export function attributeSelector(name: string, value: string): string {
  const escaped = value.replace(/[\\"]/g, '\\$&').replace(/\n/g, '\\a ');
  return `[${name}="${escaped}"]`;
}
