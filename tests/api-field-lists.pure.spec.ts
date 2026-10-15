// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Every `select`, `include` and `orderBy` the UI passes to an API endpoint names
// fields the endpoint still has. They are plain strings to the compiler, so a
// field the API drops keeps type-checking, and the server then refuses the whole
// request: `field 'X' does not exist on entity type Unit`. Browser-free.
//
// The TypeScript checker finds each such property whose object is an argument of
// a generated endpoint, and resolves its value from literals and the constants
// it is built from. What each endpoint accepts comes from the generated client:
// the argument's documentation names the entity and lists the names an include
// or orderBy accepts, and the entity types list the fields. A value computed at
// run time cannot be checked here and is skipped.

import path from 'path';
import { fileURLToPath } from 'url';

import { expect, test } from '@playwright/test';
import ts from 'typescript';

const UI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type Param = 'select' | 'include' | 'orderBy';
const PARAMS: readonly string[] = ['select', 'include', 'orderBy'] satisfies Param[];

interface FieldList {
  where: string;
  param: Param;
  entity: string;
  /** Every string the value can take; a conditional value takes more than one. */
  values: string[];
  /** The names the endpoint's include accepts, for an `include`. */
  supported?: Set<string>;
  /** The generated client the endpoint is declared in, which declares the entity types too. */
  client: ts.SourceFile;
}

interface Scan {
  checker: ts.TypeChecker;
  lists: FieldList[];
  /** Where a value is computed at run time. */
  dynamic: string[];
  /** What a generated argument type, such as `ListAllUnitsApiArg`, documents about one of its parameters. */
  describe: (client: ts.SourceFile, argType: string, param: Param) => Endpoint | undefined;
}

interface Endpoint {
  entity: string;
  client: ts.SourceFile;
  supported?: Set<string>;
}

const SELECT_DOC = /^Select clause\b[\s\S]*? in the response for (\w+)\./;
const INCLUDE_DOC = /^Include clause\b[\s\S]*? in the response for (\w+)\./;
/**
 * The sentences an include's documentation lists the names it accepts in: the
 * entities a read expands, and the parts of a result an operation returns only
 * when named. The server's spec test holds every include to one of them.
 */
const INCLUDE_VALUES = [/Supported attributes for \w+ are ([^.]+)\./g, /Supported values: ([^.]+)\./g];
const ORDER_BY_VALUES = /Supported attributes for ordering (\w+): ([^.]+)\./;
/** An orderBy term's optional direction, ahead of the field. */
const ORDER_BY_DIRECTION = /^(?:asc|desc)\s*:\s*/i;

/** No value is resolved into more strings than this; past it, it counts as computed. */
const MAX_VALUES = 64;

function scan(): Scan {
  const config = ts.getParsedCommandLineOfConfigFile(path.join(UI, 'tsconfig.app.json'), undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    },
  });
  if (!config) throw new Error('tsconfig.app.json could not be read');
  const program = ts.createProgram({ rootNames: config.fileNames, options: config.options });
  const checker = program.getTypeChecker();
  const lists: FieldList[] = [];
  const dynamic: string[] = [];
  const src = path.join(UI, 'src') + path.sep;

  const at = (node: ts.Node) => {
    const sf = node.getSourceFile();
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
    return `${path.relative(UI, sf.fileName)}:${line + 1}`;
  };

  /** The strings an expression can evaluate to, or undefined when it is computed at run time. */
  const evaluate = (expr: ts.Expression): string[] | undefined => {
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return [expr.text];
    if (
      ts.isParenthesizedExpression(expr) ||
      ts.isAsExpression(expr) ||
      ts.isSatisfiesExpression(expr) ||
      ts.isNonNullExpression(expr)
    ) {
      return evaluate(expr.expression);
    }
    if (ts.isConditionalExpression(expr)) {
      const whenTrue = evaluate(expr.whenTrue);
      const whenFalse = evaluate(expr.whenFalse);
      return whenTrue && whenFalse ? cap([...whenTrue, ...whenFalse]) : undefined;
    }
    if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return concat(evaluate(expr.left), evaluate(expr.right));
    }
    if (ts.isTemplateExpression(expr)) {
      let values: string[] | undefined = [expr.head.text];
      for (const span of expr.templateSpans) {
        values = concat(concat(values, evaluate(span.expression)), [span.literal.text]);
      }
      return values;
    }
    if (ts.isIdentifier(expr) || ts.isPropertyAccessExpression(expr)) {
      return evaluateSymbol(checker.getSymbolAtLocation(expr));
    }
    return undefined;
  };

  const evaluateSymbol = (symbol: ts.Symbol | undefined): string[] | undefined => {
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    const decl = symbol?.valueDeclaration;
    if (!decl) return undefined;
    if (
      ts.isVariableDeclaration(decl) &&
      decl.initializer &&
      ts.getCombinedNodeFlags(decl) & ts.NodeFlags.Const
    ) {
      return evaluate(decl.initializer);
    }
    if (ts.isPropertyAssignment(decl)) return evaluate(decl.initializer);
    return undefined;
  };

  /** What the endpoint documents about one of its arguments, when the object is one. */
  const apiParam = (type: ts.Type, param: Param): Endpoint | undefined => {
    for (const member of type.isUnion() ? type.types : [type]) {
      const property = member.getProperty(param);
      if (!property) continue;
      const doc = ts.displayPartsToString(property.getDocumentationComment(checker)).trim();
      const client = property.declarations?.[0]?.getSourceFile();
      if (!client) continue;
      if (param === 'select') {
        const entity = SELECT_DOC.exec(doc)?.[1];
        if (entity) return { entity, client };
        continue;
      }
      if (param === 'orderBy') {
        const m = ORDER_BY_VALUES.exec(doc);
        if (m) return { entity: m[1], client, supported: new Set(m[2].split(',').map((name) => name.trim())) };
        continue;
      }
      const supported = new Set(
        INCLUDE_VALUES.flatMap((sentence) => [...doc.matchAll(sentence)])
          .flatMap((m) => m[1].split(','))
          .map((name) => name.trim())
          .filter(Boolean),
      );
      // An include that names parts of a result rather than related entities names no entity.
      const entity = INCLUDE_DOC.exec(doc)?.[1] ?? '';
      if (supported.size > 0) return { entity, client, supported };
    }
    return undefined;
  };

  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (!(ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))) continue;
        if (!ts.isIdentifier(property.name)) continue;
        const param = property.name.text;
        if (!PARAMS.includes(param)) continue;
        const type = checker.getContextualType(node);
        const endpoint = type && apiParam(type, param as Param);
        if (!endpoint) continue;
        const values = ts.isPropertyAssignment(property)
          ? evaluate(property.initializer)
          : evaluateSymbol(checker.getShorthandAssignmentValueSymbol(property));
        if (values) lists.push({ where: at(property), param: param as Param, values, ...endpoint });
        else dynamic.push(at(property));
      }
    }
    ts.forEachChild(node, visit);
  };

  for (const sf of program.getSourceFiles()) {
    if (sf.fileName.startsWith(src)) visit(sf);
  }
  const describe = (client: ts.SourceFile, argType: string, param: Param) => {
    const alias = findTypeAlias(client, argType);
    return alias && apiParam(checker.getTypeAtLocation(alias.name), param);
  };
  return { checker, lists, dynamic, describe };
}

function concat(left: string[] | undefined, right: string[] | undefined): string[] | undefined {
  if (!left || !right) return undefined;
  return cap(left.flatMap((l) => right.map((r) => l + r)));
}

function cap(values: string[]): string[] | undefined {
  return values.length > MAX_VALUES ? undefined : values;
}

function findTypeAlias(client: ts.SourceFile, name: string) {
  let alias: ts.TypeAliasDeclaration | undefined;
  const find = (node: ts.Node) => {
    if (alias) return;
    if (ts.isTypeAliasDeclaration(node) && node.name.text === name) alias = node;
    else ts.forEachChild(node, find);
  };
  find(client);
  return alias;
}

/** The properties of the type the generated client declares under `name`. */
function declaredFields(checker: ts.TypeChecker, client: ts.SourceFile, name: string) {
  const alias = findTypeAlias(client, name);
  return alias ? fieldsOf(checker, checker.getTypeAtLocation(alias.name)) : undefined;
}

function fieldsOf(checker: ts.TypeChecker, type: ts.Type): Map<string, ts.Type> {
  let t = checker.getNonNullableType(type);
  if (checker.isArrayType(t)) t = checker.getTypeArguments(t as ts.TypeReference)[0];
  return new Map(checker.getPropertiesOfType(t).map((p) => [p.name, checker.getTypeOfSymbol(p)]));
}

/** Why `field` cannot be selected on `entity`, or undefined when it can. */
function selectProblem(checker: ts.TypeChecker, list: FieldList, field: string): string | undefined {
  const { entity, client } = list;
  // The read type carries the server-set fields too, and they can be selected.
  const fields = declaredFields(checker, client, `${entity}Read`) ?? declaredFields(checker, client, entity);
  if (!fields) return `the generated client declares no type ${entity}`;
  const dot = field.indexOf('.');
  if (dot < 0) return fields.has(field) ? undefined : `${entity} has no field ${field}`;

  const prefix = field.slice(0, dot);
  const rest = field.slice(dot + 1);
  if (prefix === entity) return fields.has(rest) ? undefined : `${entity} has no field ${rest}`;
  // An entity the response expands, as in Space.Slug, or a struct embedded in the entity.
  const related =
    declaredFields(checker, client, `Extended${entity}Read`)?.get(prefix) ?? fields.get(prefix);
  if (!related) return `${entity} expands no entity ${prefix}`;
  return fieldsOf(checker, related).has(rest) ? undefined : `${prefix} has no field ${rest}`;
}

function problems(checker: ts.TypeChecker, list: FieldList): string[] {
  const found = new Set<string>();
  for (const value of list.values) {
    for (const term of value.split(',').map((f) => f.trim()).filter(Boolean)) {
      const field = list.param === 'orderBy' ? term.replace(ORDER_BY_DIRECTION, '') : term;
      const problem =
        list.param === 'select'
          ? selectProblem(checker, list, field)
          : list.supported && !list.supported.has(field)
            ? `does not accept ${field}; it accepts ${[...list.supported].join(', ')}`
            : undefined;
      if (problem) found.add(`${list.where}: ${list.param} ${problem}`);
    }
  }
  return [...found];
}

test.describe('select, include and orderBy field lists', () => {
  // The whole app is type-checked once, which takes a while.
  test.describe.configure({ timeout: 180_000 });

  let result: Scan;
  test.beforeAll(() => {
    result = scan();
  });

  test('every select, include and orderBy names fields its endpoint has', () => {
    const found = result.lists.flatMap((list) => problems(result.checker, list));
    expect(found).toEqual([]);
  });

  test('the scan reaches the field lists, so an empty result means something', () => {
    // A value resolved through a constant and a concatenation, on an endpoint
    // reached through a lazy query's trigger.
    const explorer = result.lists.find(
      (l) =>
        l.where.startsWith('src/pages/x/resource-explorer/hooks/useResourceRows.ts:') &&
        l.param === 'select' &&
        l.entity === 'Unit',
    );
    expect(explorer?.values[0]).toContain('LastReleasedRevisionNum');
    expect(result.lists.filter((l) => l.param === 'select').length).toBeGreaterThan(30);
    expect(result.lists.filter((l) => l.param === 'include').length).toBeGreaterThan(30);
    // An include of the parts of a result, which names no entity: a dry-run promotion's.
    const promote = result.lists.find(
      (l) => l.where.startsWith('src/pages/x/apps/change-order/useChangeOrderChanges.ts:') && l.param === 'include',
    );
    expect(promote?.supported).toEqual(new Set(['Mutations', 'Diff', 'ConfigData']));
  });

  test('a field the API does not have is caught', () => {
    const explorer = result.lists.find((l) => l.param === 'select' && l.entity === 'Unit')!;
    const stale = { ...explorer, values: ['UnitID,BridgeWorkerID,Space.Slug,Space.NoSuchField'] };
    expect(problems(result.checker, stale)).toEqual([
      `${explorer.where}: select Unit has no field BridgeWorkerID`,
      `${explorer.where}: select Space has no field NoSuchField`,
    ]);
    const include = result.lists.find((l) => l.param === 'include' && l.entity === 'Unit' && l.supported)!;
    expect(problems(result.checker, { ...include, values: ['SpaceID,BridgeWorkerID'] })).toEqual([
      expect.stringMatching(/: include does not accept BridgeWorkerID; it accepts .*SpaceID/),
    ]);
    const orderBy = result.describe(explorer.client, 'ListAllUnitsApiArg', 'orderBy');
    expect(orderBy?.entity).toBe('Unit');
    expect(orderBy?.supported).toContain('CreatedAt');
    const list = { ...orderBy!, where: 'here', param: 'orderBy' as const };
    expect(problems(result.checker, { ...list, values: ['DESC:CreatedAt, asc : Slug, BridgeWorkerID'] })).toEqual([
      expect.stringMatching(/^here: orderBy does not accept BridgeWorkerID; it accepts .*CreatedAt/),
    ]);
  });
});
