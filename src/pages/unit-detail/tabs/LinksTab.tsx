// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Section } from '@/components/styled';
import { EmptyLinks } from '@/pages/unit-detail/components/empty-links/EmptyLinks';
import {
  LinkRow,
  LinksTable,
} from '@/pages/unit-detail/components/links-table/LinksTable.tsx';
import { Direction } from '@/types/enums';

export interface ILinksTabProps {
  selectedTab: number;
  linkRows: Array<LinkRow>;
  onLinkAction?: () => void;
}

export const LINKS_TAB_ID = 3;

/**
 * LinksTab is a container component that conditionally renders the LinksTable.
 * It manages visibility based on the selected tab and only renders content
 * when there are links to display.
 */
export const LinksTab = ({ selectedTab, linkRows, onLinkAction }: ILinksTabProps) => {
  return (
    <Section
      $display={selectedTab === LINKS_TAB_ID}
      $direction={Direction.FadeIn}
      $width='100%'
    >
      {selectedTab === LINKS_TAB_ID &&
        (linkRows.length > 0 ? (
          <LinksTable rows={linkRows} onLinkAction={onLinkAction} />
        ) : (
          <EmptyLinks />
        ))}
    </Section>
  );
};
