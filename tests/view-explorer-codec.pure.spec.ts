// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Saving and loading views: every seeded ViewDef survives save → load, group
 * levels keep their order through `Column.GroupBy`, annotations over 1024
 * characters are refused, the `d=` URL parameter round-trips, and the
 * changes list says what changed in plain words.
 */
import type { FilterRead, ViewRead } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import {
  ANNOTATION_VALUE_MAX,
  COLUMN_WIDTHS_ANNOTATION,
  GROUP_BY_ANNOTATION_KEY,
  LAYOUT_ANNOTATION,
  LEGACY_VIEW_TARGET_ANNOTATION,
  MATRIX_AXES_ANNOTATION,
  decodeColumns,
  fitColumnsAnnotation,
  fitsAnnotation,
  hiddenLensKey,
} from '../src/pages/x/view-explorer/model/annotations';
import { autoName, describeLens } from '../src/pages/x/view-explorer/model/auto-name';
import { defaultViewDef } from '../src/pages/x/view-explorer/model/fields';
import type { ViewDef } from '../src/pages/x/view-explorer/model/types';
import {
  DRAFT_PARAM_MAX,
  columnsForSave,
  decodeDraftParam,
  diffViewDefs,
  encodeDraftParam,
  groupByOfSaved,
  viewDefFromSaved,
  viewDefToSave,
  viewDefsEqual,
} from '../src/pages/x/view-explorer/model/view-codec';
import { idGen, lens, seedViews } from './fixtures/view-explorer-model-views';

/** What the server would give back after the save: the fields written, annotations without nulls. */
function savedAndReadBack(def: ViewDef): { view: ViewRead; filter: FilterRead } {
  const saved = viewDefToSave(def);
  if (!saved.ok) throw new Error(saved.error);
  const annotations = Object.fromEntries(
    Object.entries(saved.annotations).filter((e): e is [string, string] => e[1] !== null),
  );
  const view: ViewRead = {
    Slug: 'v',
    Of: saved.view.Of,
    Columns: saved.view.Columns ?? undefined,
    GroupBy: saved.view.GroupBy ?? undefined,
    OrderBy: saved.view.OrderBy ?? undefined,
    OrderByDirection: saved.view.OrderByDirection ?? undefined,
    Annotations: annotations,
  };
  const filter: FilterRead = {
    Slug: 'v-filter',
    From: saved.filter.From,
    Where: saved.filter.Where ?? undefined,
    WhereData: saved.filter.WhereData ?? undefined,
    ResourceType: saved.filter.ResourceType ?? undefined,
  };
  return { view, filter };
}

test.describe('save -> load', () => {
  for (const { name, def } of seedViews()) {
    test(`${name} survives`, () => {
      const { view, filter } = savedAndReadBack(def);
      const loaded = viewDefFromSaved(view, filter, idGen());
      expect(loaded.warnings).toEqual([]);
      expect(viewDefsEqual(loaded.def, def)).toBe(true);
    });
  }

  test('ResourceType and WhereData are kept for Units only', () => {
    const unit: ViewDef = {
      ...defaultViewDef('Unit'),
      resourceType: 'apps/v1/Deployment',
      whereData: 'spec.replicas > 1',
    };
    const back = viewDefFromSaved(
      savedAndReadBack(unit).view,
      savedAndReadBack(unit).filter,
      idGen(),
    ).def;
    expect(back).toMatchObject({
      resourceType: 'apps/v1/Deployment',
      whereData: 'spec.replicas > 1',
    });
    const space = viewDefToSave({
      ...defaultViewDef('Space'),
      resourceType: 'x',
      whereData: 'y',
    });
    expect(space.ok && space.filter).toMatchObject({
      From: 'Space',
      ResourceType: null,
      WhereData: null,
    });
  });
});

test.describe('group levels', () => {
  test('Column.GroupBy order is the level order', () => {
    const def: ViewDef = {
      ...defaultViewDef('Unit'),
      groupBy: ['Space', 'Labels.app', 'Target'],
      columns: [{ name: 'Slug' }, { name: 'Target' }],
    };
    const cols = columnsForSave(def);
    expect(cols.map((c) => [c.Name, !!c.GroupBy])).toEqual([
      ['Slug', false],
      ['Space', false],
      ['UpdatedAt', false],
      ['Labels.app', true],
      ['Target', true],
    ]);
    // Without the annotation (a View saved elsewhere), native fields give the same order.
    const view: ViewRead = { Slug: 'v', GroupBy: 'Space', Columns: cols };
    expect(groupByOfSaved(view)).toEqual(['Space', 'Labels.app', 'Target']);
  });

  test("the Units page's group-by annotation wins over native fields", () => {
    const view: ViewRead = {
      Slug: 'v',
      GroupBy: 'Space',
      Annotations: { [GROUP_BY_ANNOTATION_KEY]: 'Target, ToolchainType' },
    };
    expect(groupByOfSaved(view)).toEqual(['Target', 'ToolchainType']);
  });

  test('saved column properties (such as a data path) are kept', () => {
    const def: ViewDef = {
      ...defaultViewDef('Unit'),
      columns: [{ name: 'Replicas' }],
      sort: null,
    };
    const cols = columnsForSave(def, [
      { Name: 'Replicas', ColumnType: 'DataPath', GroupBy: true },
    ]);
    expect(cols).toEqual([{ Name: 'Replicas', ColumnType: 'DataPath' }]);
  });
});

test.describe('annotations', () => {
  test('defaults are cleared with null; owned keys are always present', () => {
    const saved = viewDefToSave(defaultViewDef('Unit'));
    if (!saved.ok) throw new Error(saved.error);
    expect(saved.annotations[LAYOUT_ANNOTATION]).toBeNull();
    expect(saved.annotations[MATRIX_AXES_ANNOTATION]).toBeNull();
    expect(saved.annotations[GROUP_BY_ANNOTATION_KEY]).toBeNull();
    expect(saved.annotations[LEGACY_VIEW_TARGET_ANNOTATION]).toBeNull();
    for (let n = 1; n <= 8; n++) expect(saved.annotations[hiddenLensKey(n)]).toBeNull();
    expect(saved.annotations[COLUMN_WIDTHS_ANNOTATION]).toBe(
      'Slug,Space,Target,ToolchainType,HeadRevisionNum,Status,UpdatedAt',
    );
  });

  test('hidden lenses are saved one per key with their position', () => {
    const def: ViewDef = {
      ...defaultViewDef('Unit'),
      lenses: [
        lens({ kind: 'field', field: 'Space', op: 'is', values: ['a'] }),
        lens({ kind: 'status', status: 'unreleased' }, false),
        lens({ kind: 'field', field: 'Labels.app', op: 'is', values: ['x'] }),
      ],
    };
    const saved = viewDefToSave(def);
    expect(saved.ok && saved.annotations[hiddenLensKey(1)]).toBe(
      '1:HeadRevisionNum > LastReleasedRevisionNum AND TargetID IS NOT NULL',
    );
    expect(saved.ok && saved.filter.Where).toBe("Space.Slug = 'a' AND Labels.app = 'x'");
  });

  test('more than 8 hidden lenses, or one over 1024 characters, is refused', () => {
    const many: ViewDef = {
      ...defaultViewDef('Unit'),
      lenses: Array.from({ length: 9 }, (_, i) =>
        lens({ kind: 'field', field: 'Labels.app', op: 'is', values: [`v${i}`] }, false),
      ),
    };
    const r1 = viewDefToSave(many);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toContain('at most 8 hidden filters');
    const long: ViewDef = {
      ...defaultViewDef('Unit'),
      lenses: [
        lens(
          {
            kind: 'field',
            field: 'Labels.app',
            op: 'is',
            values: Array.from({ length: 120 }, (_, i) => `value-${i}`),
          },
          false,
        ),
      ],
    };
    const r2 = viewDefToSave(long);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toContain('too long');
  });

  test('column widths that do not fit are dropped, then the annotation itself', () => {
    const cols = (n: number, width?: number) =>
      Array.from({ length: n }, (_, i) => ({ name: `Labels.key-number-${i}`, width }));
    const withWidths = fitColumnsAnnotation(cols(20, 140));
    expect(withWidths?.length).toBeLessThanOrEqual(ANNOTATION_VALUE_MAX);
    expect(withWidths).toContain(':140');
    const namesOnly = fitColumnsAnnotation(cols(45, 140));
    expect(namesOnly).not.toBeNull();
    expect(namesOnly).not.toContain(':140');
    expect(fitColumnsAnnotation(cols(60, 140))).toBeNull();
    expect(decodeColumns('Slug:220,Space,Target:140')).toEqual([
      { name: 'Slug', width: 220 },
      { name: 'Space' },
      { name: 'Target', width: 140 },
    ]);
  });

  test('without the column annotation, visible columns come from View.Columns', () => {
    const view: ViewRead = {
      Slug: 'v',
      Columns: [{ Name: 'Slug' }, { Name: 'Space' }, { Name: 'Target', GroupBy: true }],
      GroupBy: 'Space',
      Annotations: {},
    };
    const loaded = viewDefFromSaved(view, { Slug: 'f', From: 'Unit' }, idGen()).def;
    expect(loaded.columns).toEqual([{ name: 'Slug' }, { name: 'Space' }]);
    expect(loaded.groupBy).toEqual(['Space', 'Target']);
    expect(loaded.layout).toBe('table');
  });

  test('a Where the client cannot split becomes one custom lens, with a warning', () => {
    const loaded = viewDefFromSaved(
      { Slug: 'v' },
      { Slug: 'f', From: 'Unit', Where: "Slug = 'a' OR Slug = 'b'" },
      idGen(),
    );
    expect(loaded.def.lenses).toEqual([
      {
        id: expect.stringMatching(/^s-/),
        enabled: true,
        kind: 'custom',
        where: "Slug = 'a' OR Slug = 'b'",
      },
    ]);
    expect(loaded.warnings).toHaveLength(1);
  });

  test('the entity comes from Filter.From, View.Of, then the legacy annotation', () => {
    expect(viewDefFromSaved({ Slug: 'v', Of: 'Space' }, undefined, idGen()).def.entity).toBe(
      'Space',
    );
    expect(
      viewDefFromSaved({ Slug: 'v', Of: 'Unit' }, { Slug: 'f', From: 'Resource' }, idGen()).def
        .entity,
    ).toBe('Resource');
    expect(
      viewDefFromSaved(
        { Slug: 'v', Annotations: { [LEGACY_VIEW_TARGET_ANNOTATION]: 'Resource' } },
        undefined,
        idGen(),
      ).def.entity,
    ).toBe('Resource');
  });
});

test.describe('URL d= parameter', () => {
  for (const { name, def } of seedViews()) {
    test(`${name} round-trips`, () => {
      const param = encodeDraftParam(def);
      expect(param).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(param.length).toBeLessThan(DRAFT_PARAM_MAX);
      expect(decodeDraftParam(param)).toEqual(def);
    });
  }

  test('text outside ASCII survives', () => {
    const def: ViewDef = {
      ...defaultViewDef('Unit'),
      lenses: [
        lens({ kind: 'field', field: 'Labels.team', op: 'is', values: ['zürich-ünits'] }),
      ],
    };
    expect(decodeDraftParam(encodeDraftParam(def))).toEqual(def);
  });

  test('a broken or edited link is null', () => {
    expect(decodeDraftParam('not base64 at all!')).toBeNull();
    expect(
      decodeDraftParam(
        encodeDraftParam({ ...defaultViewDef('Unit'), entity: 'Bogus' } as unknown as ViewDef),
      ),
    ).toBeNull();
    expect(decodeDraftParam(btoa('{"entity":"Unit"}'))).toBeNull();
  });
});

test.describe('changes in plain words', () => {
  test('lens, grouping, sort, column and layout changes', () => {
    const a = lens({ kind: 'field', field: 'Space', op: 'is', values: ['a'] });
    const b = lens({ kind: 'status', status: 'unreleased' });
    const from: ViewDef = { ...defaultViewDef('Unit'), lenses: [a, b] };
    const to: ViewDef = {
      ...from,
      lenses: [
        { ...a, values: ['a', 'c'] },
        { ...b, enabled: false },
        lens({ kind: 'field', field: 'Labels.app', op: 'isNot', values: ['x'] }),
      ],
      groupBy: ['Space', 'Target'],
      sort: { column: 'Slug', dir: 'ASC' },
      columns: [...from.columns.filter((c) => c.name !== 'Status'), { name: 'Labels.app' }],
      layout: 'board',
    };
    expect(diffViewDefs(from, to)).toEqual([
      'Changed filter: Space is a → Space is any of a, c',
      'Hid filter: Status is Unreleased',
      'Added filter: app is not x',
      'Grouped by Space › Target',
      'Sorted by Unit, ascending',
      'Added column app',
      'Hid column Status',
      'Layout: board',
    ]);
    expect(diffViewDefs(from, from)).toEqual([]);
  });

  test('describeLens and autoName', () => {
    expect(
      describeLens(
        'Unit',
        lens({ kind: 'field', field: 'HeadRevisionNum', op: 'gte', values: ['3'] }),
      ),
    ).toBe('Head revision is at least 3');
    expect(describeLens('Unit', lens({ kind: 'custom', where: "Slug ~ 'a'" }))).toBe(
      "Custom WHERE: Slug ~ 'a'",
    );
    const lenses = [
      lens({ kind: 'field', field: 'Space', op: 'matches', values: ['payments-*'] }),
      lens({ kind: 'status', status: 'unreleased' }),
      lens({ kind: 'field', field: 'Target', op: 'notEmpty', values: [] }),
      lens({ kind: 'field', field: 'Labels.app', op: 'isNot', values: ['cart'] }),
      lens({ kind: 'status', status: 'released' }, false),
    ];
    expect(autoName('Unit', lenses)).toBe('payments-* · unreleased · has target · +1');
    expect(autoName('Unit', [])).toBe('');
  });
});

test.describe('annotation limits, links and positions', () => {
  test('annotation limit counts UTF-8 bytes, not characters', () => {
    const value = 'é'.repeat(700);
    expect(fitsAnnotation(value)).toBe(false);
    expect(fitsAnnotation('e'.repeat(1024))).toBe(true);
    const def: ViewDef = {
      ...defaultViewDef('Unit'),
      lenses: [
        lens({ kind: 'field', field: 'DisplayName', op: 'is', values: [value] }, false),
      ],
    };
    const saved = viewDefToSave(def);
    expect(saved.ok).toBe(false);
  });

  test('an edited d= link with an unknown status, op or width is null', () => {
    const def = defaultViewDef('Unit');
    const enc = (v: unknown) =>
      btoa(JSON.stringify(v)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(
      decodeDraftParam(
        enc({ ...def, lenses: [{ id: 'x', enabled: true, kind: 'status', status: 'bogus' }] }),
      ),
    ).toBeNull();
    expect(
      decodeDraftParam(
        enc({
          ...def,
          lenses: [
            {
              id: 'x',
              enabled: true,
              kind: 'field',
              field: 'Slug',
              op: 'bogus',
              values: ['a'],
            },
          ],
        }),
      ),
    ).toBeNull();
    expect(
      decodeDraftParam(enc({ ...def, columns: [{ name: 'Slug', width: 'wide' }] })),
    ).toBeNull();
    expect(
      decodeDraftParam(enc({ ...def, columns: [{ name: 'Slug', width: 200 }] })),
    ).not.toBeNull();
  });

  test('hidden lens positions count only the lenses that are saved', () => {
    const def: ViewDef = {
      ...defaultViewDef('Unit'),
      lenses: [
        lens({ kind: 'field', field: 'Slug', op: 'is', values: [] }),
        lens({ kind: 'field', field: 'Space', op: 'is', values: ['x'] }, false),
        lens({ kind: 'field', field: 'Target', op: 'is', values: ['t'] }),
      ],
    };
    const { view, filter } = savedAndReadBack(def);
    const back = viewDefFromSaved(view, filter, idGen()).def;
    expect(
      back.lenses.map((l) => (l.kind === 'field' ? `${l.field}:${l.enabled}` : l.kind)),
    ).toEqual(['Space:false', 'Target:true']);
  });

  test('a lens that cannot be written refuses the save', () => {
    const def: ViewDef = {
      ...defaultViewDef('Unit'),
      lenses: [lens({ kind: 'field', field: 'HeadRevisionNum', op: 'is', values: ['abc'] })],
    };
    const saved = viewDefToSave(def);
    expect(saved.ok).toBe(false);
  });
});

test.describe('lens ids of a saved view', () => {
  const view: ViewRead = {
    Slug: 'v',
    Annotations: { [hiddenLensKey(1)]: "1:Labels.app = 'x'" },
  };
  const filter: FilterRead = {
    Slug: 'f',
    From: 'Unit',
    Where:
      "Space.Slug LIKE 'pay%' AND HeadRevisionNum > LastReleasedRevisionNum AND TargetID IS NOT NULL",
  };

  test('loading the same view twice gives the same ids', () => {
    const a = viewDefFromSaved(view, filter, idGen('first')).def.lenses.map((l) => l.id);
    const b = viewDefFromSaved(view, filter, idGen('second')).def.lenses.map((l) => l.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(3);
  });

  test('a draft from a link lists only real changes against a fresh load', () => {
    const baseline = viewDefFromSaved(view, filter, idGen('a')).def;
    const space = baseline.lenses.find((l) => l.kind === 'field' && l.enabled);
    const hidden = baseline.lenses.find((l) => !l.enabled);
    if (!space || space.kind !== 'field' || !hidden) throw new Error('unexpected lenses');
    const draft: ViewDef = {
      ...baseline,
      lenses: baseline.lenses.map((l) =>
        l.id === space.id
          ? { ...space, values: ['checkout*'] }
          : l.id === hidden.id
            ? { ...l, enabled: true }
            : l,
      ),
    };
    const fromLink = decodeDraftParam(encodeDraftParam(draft));
    if (!fromLink) throw new Error('link did not decode');
    const fresh = viewDefFromSaved(view, filter, idGen('b')).def;
    expect(diffViewDefs(fresh, fromLink)).toEqual([
      'Changed filter: Space matches pay* → Space matches checkout*',
      'Showed filter: app is x',
    ]);
  });

  test('a hidden lens has the id it would have if shown', () => {
    const shown = viewDefFromSaved(
      { Slug: 'v' },
      { Slug: 'f', From: 'Unit', Where: "Labels.app = 'x'" },
      idGen('c'),
    ).def;
    const hidden = viewDefFromSaved(
      { Slug: 'v', Annotations: { [hiddenLensKey(1)]: "0:Labels.app = 'x'" } },
      { Slug: 'f', From: 'Unit' },
      idGen('d'),
    ).def;
    expect(hidden.lenses[0].id).toBe(shown.lenses[0].id);
  });

  test('duplicate conditions still get unique ids', () => {
    const def = viewDefFromSaved(
      { Slug: 'v' },
      { Slug: 'f', From: 'Unit', Where: "Slug = 'a' AND Slug = 'a' AND Slug  =  'a'" },
      idGen('e'),
    ).def;
    expect(new Set(def.lenses.map((l) => l.id)).size).toBe(3);
  });
});

test('the default Spaces matrix uses low-cardinality axes, not the Space name', () => {
  expect(defaultViewDef('Space').matrix).toEqual({ rows: 'Labels.team', cols: 'Labels.env' });
});

test('a data-path column keeps its definition through load and a save without the old columns', () => {
  const replicas = {
    Name: 'Replicas',
    ColumnType: 'DataPath',
    DataType: 'int',
    ColumnSource: { DataPath: 'spec.replicas' },
  } as const;
  const view: ViewRead = {
    Slug: 'v',
    Columns: [{ Name: 'Slug' }, replicas],
    Annotations: { [COLUMN_WIDTHS_ANNOTATION]: 'Slug,Replicas:90' },
  };
  const def = viewDefFromSaved(view, { Slug: 'f', From: 'Unit' }, idGen()).def;
  // Save as new, Duplicate and Pin as draft save a def with no previous View.
  const saved = viewDefToSave(def);
  if (!saved.ok) throw new Error(saved.error);
  expect(saved.view.Columns?.find((c) => c.Name === 'Replicas')).toEqual(replicas);
  // The definition travels in a link too.
  const back = decodeDraftParam(encodeDraftParam(def));
  expect(back && viewDefToSave(back).ok && viewDefsEqual(back, def)).toBe(true);
});

test('a hidden data-path column (a group level or the sort only) keeps its definition', () => {
  const replicas = {
    Name: 'Replicas',
    ColumnType: 'DataPath',
    ColumnSource: { DataPath: 'spec.replicas' },
  } as const;
  const cpu = { Name: 'Cpu', ColumnType: 'DataExpression', DataType: 'string' } as const;
  const view: ViewRead = {
    Slug: 'v',
    GroupBy: 'Space',
    OrderBy: 'Cpu',
    OrderByDirection: 'DESC',
    Columns: [{ Name: 'Slug' }, { Name: 'Space' }, cpu, { ...replicas, GroupBy: true }],
    Annotations: {
      [COLUMN_WIDTHS_ANNOTATION]: 'Slug,Space',
      [GROUP_BY_ANNOTATION_KEY]: 'Space,Replicas',
    },
  };
  const def = viewDefFromSaved(view, { Slug: 'f', From: 'Unit' }, idGen()).def;
  expect(def.columns.map((c) => c.name)).toEqual(['Slug', 'Space']);
  const saved = viewDefToSave(def);
  if (!saved.ok) throw new Error(saved.error);
  expect(saved.view.Columns?.find((c) => c.Name === 'Replicas')).toEqual({
    ...replicas,
    GroupBy: true,
  });
  expect(saved.view.Columns?.find((c) => c.Name === 'Cpu')).toEqual(cpu);
  // Shown again later, the column still has its definition.
  const shown = viewDefToSave({ ...def, columns: [...def.columns, { name: 'Cpu' }] });
  expect(shown.ok && shown.view.Columns?.find((c) => c.Name === 'Cpu')).toEqual(cpu);
  // And it survives a link.
  const back = decodeDraftParam(encodeDraftParam(def));
  expect(back && viewDefsEqual(back, def)).toBe(true);
});

test.describe('matrix sort', () => {
  const matrixDef = (matrix: ViewDef['matrix']): ViewDef => ({
    ...defaultViewDef('Unit'),
    layout: 'matrix',
    matrix,
  });

  test('sorts round-trip through the matrix-axes annotation', () => {
    for (const matrix of [
      { rows: 'Space', cols: 'Target', rowSort: { key: 'total', dir: 'DESC' } },
      { rows: 'Space', cols: 'Target', colSort: { key: 'unreleased', dir: 'ASC' } },
      {
        rows: 'Labels.app',
        cols: 'Target',
        rowSort: { key: 'name', dir: 'DESC' },
        colSort: { key: 'total', dir: 'ASC' },
      },
    ] as const) {
      const def = matrixDef({ ...matrix });
      const { view, filter } = savedAndReadBack(def);
      expect(viewDefFromSaved(view, filter, idGen()).def.matrix).toEqual(matrix);
    }
  });

  test('the written form: rows,cols then the sorts, trailing defaults dropped', () => {
    const write = (matrix: ViewDef['matrix']) => {
      const saved = viewDefToSave(matrixDef(matrix));
      if (!saved.ok) throw new Error(saved.error);
      return saved.annotations[MATRIX_AXES_ANNOTATION];
    };
    expect(write({ rows: 'Space', cols: 'Target' })).toBeNull();
    expect(
      write({ rows: 'Space', cols: 'Target', rowSort: { key: 'total', dir: 'DESC' } }),
    ).toBe('Space,Target;total:DESC');
    expect(
      write({ rows: 'Space', cols: 'Target', colSort: { key: 'total', dir: 'DESC' } }),
    ).toBe('Space,Target;name:ASC;total:DESC');
    expect(write({ rows: 'Labels.app', cols: 'Target' })).toBe('Labels.app,Target');
  });

  test('old annotations still load; unknown sort parts mean name order', () => {
    const load = (value: string) =>
      viewDefFromSaved(
        { Slug: 'v', Annotations: { [MATRIX_AXES_ANNOTATION]: value } },
        undefined,
        idGen(),
      ).def.matrix;
    expect(load('Space,Target')).toEqual({ rows: 'Space', cols: 'Target' });
    expect(load('Space,Target;bogus:UP;total:DESC')).toEqual({
      rows: 'Space',
      cols: 'Target',
      colSort: { key: 'total', dir: 'DESC' },
    });
    expect(load('Space,Target;name:ASC')).toEqual({ rows: 'Space', cols: 'Target' });
  });

  test('d= links carry the sorts; a bad sort is dropped, not the link', () => {
    const def = matrixDef({
      rows: 'Space',
      cols: 'Target',
      rowSort: { key: 'released', dir: 'DESC' },
    });
    expect(decodeDraftParam(encodeDraftParam(def))).toEqual(def);
    const bad = {
      ...def,
      matrix: {
        rows: 'Space',
        cols: 'Target',
        rowSort: { key: 'size', dir: 'DESC' },
        colSort: { key: 'total', dir: 'UP' },
      },
    };
    expect(decodeDraftParam(encodeDraftParam(bad as unknown as ViewDef))?.matrix).toEqual({
      rows: 'Space',
      cols: 'Target',
    });
  });

  test('the changes list says how the matrix is sorted', () => {
    const from = matrixDef({ rows: 'Space', cols: 'Target' });
    expect(
      diffViewDefs(
        from,
        matrixDef({ rows: 'Space', cols: 'Target', rowSort: { key: 'total', dir: 'DESC' } }),
      ),
    ).toEqual(['Matrix rows sorted by total, descending']);
    expect(
      diffViewDefs(
        from,
        matrixDef({
          rows: 'Space',
          cols: 'Target',
          colSort: { key: 'unreleased', dir: 'ASC' },
        }),
      ),
    ).toEqual(['Matrix columns sorted by Unreleased, ascending']);
    expect(
      diffViewDefs(
        matrixDef({ rows: 'Space', cols: 'Target', rowSort: { key: 'total', dir: 'DESC' } }),
        from,
      ),
    ).toEqual(['Matrix rows sorted by name']);
  });
});
