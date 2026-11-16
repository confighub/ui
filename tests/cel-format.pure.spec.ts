// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// formatCel lays out a CEL expression for reading without changing its tokens.
import { expect, test } from '@playwright/test';

import { formatCel } from '../src/components/trigger-rule/celFormat';

test('an expression that fits stays on one line, spaced as CEL is written', () => {
  expect(formatCel('r.spec.replicas>=2&&-1<2.5e3')).toBe('r.spec.replicas >= 2 && -1 < 2.5e3');
  expect(formatCel("{'a':1,?'b':c.?d}")).toBe("{'a': 1, ?'b': c.?d}");
  expect(formatCel('size(f) == 0 ? [] : f.map(a, a.Detail)')).toBe(
    'size(f) == 0 ? [] : f.map(a, a.Detail)',
  );
});

test('a chain that does not fit breaks before each operator, and a call before its arguments', () => {
  expect(
    formatCel(
      "r.kind != 'Deployment' || r.spec.template.spec.containers.all(c, has(c.resources) && has(c.resources.limits) && c.resources.limits.memory != '')",
      60,
    ),
  ).toBe(
    [
      "r.kind != 'Deployment'",
      '  || r.spec.template.spec.containers.all(',
      '       c,',
      '       has(c.resources)',
      '         && has(c.resources.limits)',
      "         && c.resources.limits.memory != ''",
      '     )',
    ].join('\n'),
  );
});

test('a conditional breaks before its ? and :, and a map one entry per line', () => {
  expect(
    formatCel(
      "!has(r.spec.containers) ? [{'Path': 'spec.containers', 'Detail': 'the pod has no containers'}] : []",
      50,
    ),
  ).toBe(
    [
      '!has(r.spec.containers)',
      '  ? [',
      '      {',
      "        'Path': 'spec.containers',",
      "        'Detail': 'the pod has no containers'",
      '      }',
      '    ]',
      '  : []',
    ].join('\n'),
  );
});

test('brackets, commas and operators inside strings are not layout', () => {
  expect(formatCel('\'a, (b) && c\' + "d [e]"', 10)).toBe('\'a, (b) && c\' + "d [e]"');
  expect(formatCel("r'x\\d' == '''y ' z'''")).toBe("r'x\\d' == '''y ' z'''");
});

test('an expression that does not tokenize or balance is shown as written', () => {
  expect(formatCel('has(r.spec')).toBe('has(r.spec');
  expect(formatCel("'unterminated")).toBe("'unterminated");
  expect(formatCel('a ) b')).toBe('a ) b');
});

test('brackets that open one inside another join onto one line', () => {
  expect(
    formatCel(
      "[((has(r.spec.containers) ? r.spec.containers.map(c, c.name) : ['none']))][0]",
      50,
    ),
  ).toBe(
    [
      '[ ( (',
      '      has(r.spec.containers)',
      '        ? r.spec.containers.map(c, c.name)',
      "        : ['none']",
      '    )',
      '  )',
      '][0]',
    ].join('\n'),
  );
});
