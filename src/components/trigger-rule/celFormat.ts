// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Lays out a CEL expression for reading: a bracketed group that fits the width stays on one line,
 * and one that does not breaks after its opening bracket, with one element per line, indented.
 * A long chain of && or || breaks before each operator, and a long conditional before its ? and
 * its :. Only the layout changes: the tokens, string literals included, are kept as written. An
 * expression that does not tokenize, or whose brackets do not balance, is returned as it is.
 */
export const formatCel = (expression: string, width = 80): string => {
  const tokens = tokenize(expression);
  if (!tokens) return expression;
  const tree = parseGroups(tokens);
  if (!tree) return expression;
  return joinOpeners(layout(tree, 0, width)).join('\n');
};

const OPENERS = new Set(['(', '[', '{']);

/**
 * Brackets that open one inside another, each alone on its line, as an expression wrapped for a
 * check's result is, join onto the first one's line: `[ ( (` rather than three lines saying nothing.
 */
const joinOpeners = (lines: string[]): string[] => {
  const out: string[] = [];
  for (const line of lines) {
    const last = out[out.length - 1];
    if (last !== undefined && /^\s*[([{](\s[([{])*$/.test(last) && OPENERS.has(line.trim())) {
      out[out.length - 1] = `${last} ${line.trim()}`;
    } else {
      out.push(line);
    }
  }
  return out;
};

type Token = { kind: 'string' | 'word' | 'op' | 'open' | 'close' | 'comma'; text: string };
type Node = Token | Group;
interface Group {
  open: string;
  close: string;
  elements: Node[][];
}

const isGroup = (node: Node): node is Group => 'elements' in node;

const OPERATORS = [
  '&&',
  '||',
  '==',
  '!=',
  '<=',
  '>=',
  '.?',
  '<',
  '>',
  '+',
  '-',
  '*',
  '/',
  '%',
  '!',
  '?',
  ':',
  '.',
];
const CLOSE: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

const tokenize = (source: string): Token[] | undefined => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    // A string, raw or bytes prefixed, single or triple quoted.
    const prefix = /^[rRbB]{0,2}(?='|")/.exec(source.slice(i))?.[0] ?? '';
    const quoteAt = i + prefix.length;
    if (source[quoteAt] === "'" || source[quoteAt] === '"') {
      const quote = source.startsWith(source[quoteAt].repeat(3), quoteAt)
        ? source[quoteAt].repeat(3)
        : source[quoteAt];
      const raw = /r/i.test(prefix);
      let j = quoteAt + quote.length;
      while (j < source.length && !source.startsWith(quote, j))
        j += !raw && source[j] === '\\' ? 2 : 1;
      if (j >= source.length) return undefined;
      tokens.push({ kind: 'string', text: source.slice(i, j + quote.length) });
      i = j + quote.length;
      continue;
    }
    if (c in CLOSE) {
      tokens.push({ kind: 'open', text: c });
      i++;
      continue;
    }
    if (c === ')' || c === ']' || c === '}') {
      tokens.push({ kind: 'close', text: c });
      i++;
      continue;
    }
    if (c === ',') {
      tokens.push({ kind: 'comma', text: c });
      i++;
      continue;
    }
    // A number, its decimal point and exponent included, or an identifier.
    const word = /^(\d+(\.\d+)?([eE][+-]?\d+)?[uU]?|[A-Za-z_][A-Za-z0-9_]*)/.exec(
      source.slice(i),
    )?.[0];
    if (word) {
      tokens.push({ kind: 'word', text: word });
      i += word.length;
      continue;
    }
    const op = OPERATORS.find((o) => source.startsWith(o, i));
    if (!op) return undefined;
    tokens.push({ kind: 'op', text: op });
    i += op.length;
  }
  return tokens;
};

/** Nests the tokens into bracketed groups split at their commas. The whole is a () group. */
const parseGroups = (tokens: Token[]): Group | undefined => {
  const root: Group = { open: '', close: '', elements: [[]] };
  const stack: Group[] = [root];
  for (const token of tokens) {
    const top = stack[stack.length - 1];
    if (token.kind === 'open') {
      const group: Group = { open: token.text, close: CLOSE[token.text], elements: [[]] };
      top.elements[top.elements.length - 1].push(group);
      stack.push(group);
    } else if (token.kind === 'close') {
      if (stack.length === 1 || top.close !== token.text) return undefined;
      // A trailing comma leaves an empty last element.
      if (top.elements.length > 1 && top.elements[top.elements.length - 1].length === 0)
        top.elements.pop();
      stack.pop();
    } else if (token.kind === 'comma') {
      top.elements.push([]);
    } else {
      top.elements[top.elements.length - 1].push(token);
    }
  }
  return stack.length === 1 ? root : undefined;
};

/** Whether the operator at index i of a sequence is binary, by what comes before it. */
const isBinary = (sequence: Node[], i: number): boolean => {
  const before = sequence[i - 1];
  return !!before && (isGroup(before) || before.kind === 'word' || before.kind === 'string');
};

const NO_SPACE = new Set(['.', '.?']);

/**
 * Each node of a sequence with the space before it on one line. In a {} group, the first : of an
 * element separates its key, and takes no space before it.
 */
const pieces = (sequence: Node[], inMap: boolean): { space: string; node: Node }[] => {
  let keyColonSeen = false;
  return sequence.map((node, i) => {
    const before = sequence[i - 1];
    if (i === 0) return { space: '', node };
    const afterGlue =
      !isGroup(before) &&
      (NO_SPACE.has(before.text) || (before.kind === 'op' && !isBinary(sequence, i - 1)));
    if (isGroup(node)) {
      // A call's or an index's bracket follows what it applies to.
      const applies =
        !isGroup(before) &&
        (before.kind === 'word' || before.kind === 'string') &&
        node.open !== '{';
      return { space: applies || afterGlue || isGroup(before) ? '' : ' ', node };
    }
    if (node.kind !== 'op') return { space: afterGlue ? '' : ' ', node };
    if (NO_SPACE.has(node.text)) return { space: '', node };
    if (node.text === ':' && inMap && !keyColonSeen) {
      keyColonSeen = true;
      return { space: '', node };
    }
    return { space: isBinary(sequence, i) || !afterGlue ? ' ' : '', node };
  });
};

const nodeText = (node: Node): string => (isGroup(node) ? flatGroup(node) : node.text);

const flatSequence = (sequence: Node[], inMap: boolean): string =>
  pieces(sequence, inMap)
    .map(({ space, node }) => space + nodeText(node))
    .join('');

const flatGroup = (group: Group): string =>
  group.open +
  group.elements.map((element) => flatSequence(element, group.open === '{')).join(', ') +
  group.close;

/** The indices of a sequence's top-level binary operators of a kind. */
const operatorsAt = (sequence: Node[], texts: string[]): number[] =>
  sequence.flatMap((node, i) =>
    !isGroup(node) && node.kind === 'op' && texts.includes(node.text) && isBinary(sequence, i)
      ? [i]
      : [],
  );

/** The lines of a sequence starting at column indent, broken where it does not fit. */
const layoutSequence = (
  sequence: Node[],
  indent: number,
  width: number,
  inMap: boolean,
): string[] => {
  const pad = ' '.repeat(indent);
  const flat = flatSequence(sequence, inMap);
  if (indent + flat.length <= width) return [pad + flat];
  // A conditional breaks before its ? and its :; a chain before each || or &&. A map's key colon
  // is not a conditional's.
  for (const ops of [['?', ':'], ['||'], ['&&']]) {
    let at = operatorsAt(sequence, ops);
    if (inMap && ops.includes(':'))
      at = at.filter((i) => sequence.slice(0, i).some((n) => !isGroup(n) && n.text === '?'));
    if (at.length === 0) continue;
    const lines: string[] = [];
    let start = 0;
    for (const end of [...at, sequence.length]) {
      const lead = start === 0 ? '' : `${(sequence[start - 1] as Token).text} `;
      const partLines = layoutSequence(
        sequence.slice(start, end),
        indent + (start === 0 ? 0 : 2) + lead.length,
        width,
        false,
      );
      if (lead) partLines[0] = ' '.repeat(indent + 2) + lead + partLines[0].trimStart();
      lines.push(...partLines);
      start = end + 1;
    }
    return lines;
  }
  // Otherwise the groups in it that do not fit break; what precedes a group stays on its line.
  const lines: string[] = [];
  let line = pad;
  for (const { space, node } of pieces(sequence, inMap)) {
    const text = nodeText(node);
    const lead = line === pad ? '' : space;
    if (!isGroup(node) || line.length + lead.length + text.length <= width) {
      line += lead + text;
      continue;
    }
    const groupLines = brokenGroup(node, indent, width);
    lines.push(line + lead + node.open, ...groupLines.slice(1, -1));
    line = groupLines[groupLines.length - 1];
  }
  lines.push(line);
  return lines;
};

/** A group on one line at indent when it fits there, else broken. */
const layoutGroup = (group: Group, indent: number, width: number): string[] => {
  const flat = flatGroup(group);
  return indent + flat.length <= width
    ? [' '.repeat(indent) + flat]
    : brokenGroup(group, indent, width);
};

/** A group broken after its opening bracket, one element per line, its close on its own line. */
const brokenGroup = (group: Group, indent: number, width: number): string[] => {
  const pad = ' '.repeat(indent);
  const lines = [pad + group.open];
  group.elements.forEach((element, i) => {
    const elementLines = layoutSequence(element, indent + 2, width, group.open === '{');
    if (i < group.elements.length - 1) elementLines[elementLines.length - 1] += ',';
    lines.push(...elementLines);
  });
  lines.push(pad + group.close);
  return lines;
};

const layout = (root: Group, indent: number, width: number): string[] =>
  root.elements.length === 1
    ? layoutSequence(root.elements[0], indent, width, false)
    : layoutGroup(root, indent, width);
