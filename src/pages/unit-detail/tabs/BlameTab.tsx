// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useSearchParams } from 'react-router-dom';

import { Section } from '@/components/styled';
import { Direction } from '@/types/enums';

import { BlameTable } from '../components/blame/BlameTable';
import { UNIT_DETAIL_TAB, readBlamePath } from '../unitDetailHrefs';

export interface IBlameTabProps {
  spaceId: string;
  unitId: string;
  selectedTab: number;
}

/** What set each field of the Unit, when and why, and actions on the fields selected. */
export const BlameTab = ({ spaceId, unitId, selectedTab }: IBlameTabProps) => {
  const [searchParams] = useSearchParams();
  const shown = selectedTab === UNIT_DETAIL_TAB.blame;
  return (
    <Section $display={shown} $direction={Direction.FadeIn} $width='100%'>
      {shown && <BlameTable spaceId={spaceId} unitId={unitId} initialPath={readBlamePath(searchParams)} />}
    </Section>
  );
};
