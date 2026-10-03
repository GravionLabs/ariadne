import { SyntaxNode } from './parser';

/** A call `fn(args)`: the function (a name, or `receiver.name`) and its argument expressions. */
export interface Call {
  node: SyntaxNode;
  /** `invocation_expression`'s function part. */
  fn: SyntaxNode;
  /** Name of the method called, without receiver and type arguments: `Publish` for `x.Publish<T>(…)`. */
  name: string;
  /** The receiver of `receiver.name(…)`, if any. */
  receiver: SyntaxNode | null;
  /** Explicit type arguments: `T` for `Publish<T>(…)`. */
  typeArgs: string[];
  args: SyntaxNode[];
}

export const line = (node: SyntaxNode): number => node.startPosition.row + 1;

/** The line a call is written on: its name, not the start of the chain it ends. */
export const callLine = (call: Call): number =>
  line(
    call.fn.type === 'member_access_expression'
      ? (call.fn.childForFieldName('name') ?? call.fn)
      : call.fn,
  );

/** The expressions of an argument list, without `name:` labels and `ref`/`out`. */
export function argumentsOf(list: SyntaxNode | null): SyntaxNode[] {
  if (!list) return [];
  return list.namedChildren
    .filter((c) => c.type === 'argument')
    .map((a) => a.namedChildren.at(-1))
    .filter((n): n is SyntaxNode => !!n);
}

/** The last identifier of a name: `Order` for `Order`, `a.Order`, `Order<T>`. */
export function lastName(node: SyntaxNode | null): string | null {
  if (!node) return null;
  switch (node.type) {
    case 'identifier':
      return node.text;
    case 'generic_name':
      return node.namedChildren.find((c) => c.type === 'identifier')?.text ?? null;
    case 'member_access_expression':
      return lastName(node.childForFieldName('name'));
    case 'qualified_name':
      return lastName(node.namedChildren.at(-1) ?? null);
    case 'parenthesized_expression':
      return lastName(node.namedChildren[0] ?? null);
    default:
      return null;
  }
}

export function typeArguments(node: SyntaxNode | null): string[] {
  const generic = node?.type === 'generic_name' ? node : null;
  const list = generic?.namedChildren.find((c) => c.type === 'type_argument_list');
  return list ? list.namedChildren.map((t) => lastName(t) ?? t.text) : [];
}

/** Reads an `invocation_expression`; `null` for anything else. */
export function callOf(node: SyntaxNode | null): Call | null {
  if (!node || node.type !== 'invocation_expression') return null;
  const fn = node.childForFieldName('function');
  if (!fn) return null;
  const member = fn.type === 'member_access_expression' ? fn : null;
  const named = member ? member.childForFieldName('name') : fn;
  const name = lastName(named);
  if (!name) return null;
  return {
    node,
    fn,
    name,
    receiver: member ? member.childForFieldName('expression') : null,
    typeArgs: typeArguments(named),
    args: argumentsOf(node.childForFieldName('arguments')),
  };
}

/** The body of a lambda (`x => body`), unwrapped when it is a block with one `return`. */
export function lambdaBody(node: SyntaxNode): SyntaxNode | null {
  if (node.type !== 'lambda_expression') return null;
  const body = node.childForFieldName('body');
  if (body?.type === 'block') {
    const statements = body.namedChildren.filter((c) => c.type !== 'comment');
    const only = statements.length === 1 ? statements[0] : null;
    if (only?.type === 'return_statement') return only.namedChildren[0] ?? null;
    if (only?.type === 'expression_statement') return only.namedChildren[0] ?? null;
    return null;
  }
  return body;
}

/** The names of a lambda's parameters: `x` for `x => …`, `a`, `b` for `(a, b) => …`. */
export function lambdaParameters(node: SyntaxNode): string[] {
  const params = node.childForFieldName('parameters');
  if (!params)
    return node.namedChildren.filter((c) => c.type === 'implicit_parameter').map((c) => c.text);
  if (params.type === 'implicit_parameter') return [params.text];
  return params.namedChildren.map((p) => p.childForFieldName('name')?.text ?? p.text);
}

/** Depth-first, in source order. */
export function* descendants(node: SyntaxNode): Generator<SyntaxNode> {
  for (const child of node.namedChildren) {
    yield child;
    yield* descendants(child);
  }
}
