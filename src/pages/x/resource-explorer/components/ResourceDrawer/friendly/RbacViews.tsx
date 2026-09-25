// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import {
  EmptyHint,
  FieldList,
  FriendlyViewProps,
  MiniTable,
  Section,
  asArray,
  asRecord,
  asScalar,
  asStringArray,
} from './helpers';

/** Role and ClusterRole: the policy rules table. */
export function RoleView({ doc }: FriendlyViewProps) {
  const rules = asArray(doc.rules);
  if (rules.length === 0) {
    return <EmptyHint text='This role grants no permissions.' />;
  }
  return (
    <Section title='Rules'>
      <MiniTable
        columns={['API Groups', 'Resources', 'Verbs', 'Resource Names']}
        rows={rules.map((r) => {
          const rule = asRecord(r);
          return [
            joinOrCore(asStringArray(rule?.apiGroups)),
            asStringArray(rule?.resources).join(', ') ||
              asStringArray(rule?.nonResourceURLs).join(', '),
            asStringArray(rule?.verbs).join(', '),
            asStringArray(rule?.resourceNames).join(', '),
          ];
        })}
      />
    </Section>
  );
}

/** Empty-string API group means the core group; render it readably. */
function joinOrCore(groups: string[]): string {
  return groups.map((g) => (g === '' ? '(core)' : g)).join(', ');
}

/** RoleBinding and ClusterRoleBinding: role reference plus subjects. */
export function RoleBindingView({ doc }: FriendlyViewProps) {
  const roleRef = asRecord(doc.roleRef);
  const subjects = asArray(doc.subjects);
  return (
    <>
      <Section title='Role Reference'>
        <FieldList
          fields={[
            { label: 'Kind', value: asScalar(roleRef?.kind) },
            { label: 'Name', value: asScalar(roleRef?.name) },
            { label: 'API Group', value: asScalar(roleRef?.apiGroup) },
          ]}
        />
      </Section>
      <Section title='Subjects'>
        {subjects.length === 0 && <EmptyHint text='No subjects bound.' />}
        <MiniTable
          columns={['Kind', 'Name', 'Namespace']}
          rows={subjects.map((s) => {
            const subject = asRecord(s);
            return [
              asScalar(subject?.kind) ?? '',
              asScalar(subject?.name) ?? '',
              asScalar(subject?.namespace) ?? '',
            ];
          })}
        />
      </Section>
    </>
  );
}
