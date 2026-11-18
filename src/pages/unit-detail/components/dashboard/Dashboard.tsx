// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

import { SettingsTabs } from '@/components/settings-tabs/SettingsTabs';
import { BorderedAccordion, Section } from '@/components/styled';
import { usePageHeight } from '@/hooks/usePageHeight';
import { ExtendedUnitRead, UnitRead } from '@confighub/rtk-query';
import { Direction } from '@/types/enums';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import { ReadmeMarkdown } from '@/pages/x/apps/ReadmePane';

import { ActionSidebar } from '../action-side-bar/ActionSideBar';

const Container = styled('div')`
  width: 100%;
`;

const Main = styled('div')`
  width: 70%;
  overflow-y: auto;
  background-color: hsla(215, 15%, 97%, 0.5);

  /* Scrollbar */
  ::-webkit-scrollbar {
    width: 5px;
  }

  /* Track */
  ::-webkit-scrollbar-track {
    background: hsla(215, 15%, 97%, 0.5);
    border-radius: 10px;
  }

  /* Handle */
  ::-webkit-scrollbar-thumb {
    background: #ccc;
    border-radius: 10px;
  }
`;

const Aside = styled('aside')`
  display: flex;
  flex-direction: column;
  width: 30%;
  padding: 0 1rem;
  height: 100%;
  overflow-y: auto;

  border-left: 1px solid rgba(224, 224, 224, 1);
  /* Scrollbar */
  ::-webkit-scrollbar {
    width: 5px;
  }

  /* Track */
  ::-webkit-scrollbar-track {
    background: white;
    border-radius: 10px;
  }

  /* Handle */
  ::-webkit-scrollbar-thumb {
    background: #ccc;
    border-radius: 10px;
  }
`;

const StickyTab = styled(Box)`
  position: sticky;
  top: 0;
  z-index: 1000;
  background-color: white;
  padding-top: 5px;
`;

const sectionOffset = 254;

const README_TAB = 1;

export interface DashboardProps {
  currentUnitExtended: ExtendedUnitRead;
  setRefresh: () => void;
  onApplyGateClicked: (gateName: string) => void;
  upstreamUnit?: UnitRead;
  onUpgrade: () => void;
  isFetchingUnit?: boolean;
  lastPollTimestamp?: number;
}

const sanitizeUrl = (url: string): string | null => {
  try {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return null;

    // If URL doesn't have a protocol, assume https://
    const urlWithProtocol = trimmedUrl.match(/^https?:\/\//i)
      ? trimmedUrl
      : `https://${trimmedUrl}`;

    // Validate the URL
    const urlObj = new URL(urlWithProtocol);

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return null;
    }

    return urlObj.href;
  } catch {
    return null;
  }
};

export const Dashboard = ({
  currentUnitExtended,
  setRefresh,
  onApplyGateClicked,
  upstreamUnit,
  onUpgrade,
  isFetchingUnit,
  lastPollTimestamp,
}: DashboardProps) => {
  // State
  const [selectedTab, setSelectedTab] = useState(0);

  const editorHeight = usePageHeight(sectionOffset);

  const unit = currentUnitExtended?.Unit || ({} as UnitRead);

  // Extract and sanitize URL- annotations from currentUnitExtended
  const urlAnnotations = Object.entries(currentUnitExtended?.Unit?.Annotations || {})
    .filter(([key]) => key.startsWith('URL-'))
    .map(([key, value]) => ({
      name: key.substring(4), // Remove 'URL-' prefix
      url: sanitizeUrl(value),
    }))
    .filter((link) => link.url !== null) as Array<{ name: string; url: string }>;

  // Extract Status- annotations
  const statusAnnotations = Object.entries(currentUnitExtended?.Unit?.Annotations || {})
    .filter(([key]) => key.startsWith('Status-'))
    .map(([key, value]) => ({
      key: key.substring(7), // Remove 'Status-' prefix
      value,
    }));

  // The Unit's Readme annotation, Markdown that its own tab renders when the Unit has one.
  const readme = currentUnitExtended?.Unit?.Annotations?.Readme?.trim() || undefined;
  // A poll can remove the annotation while its tab is open. The pane shows the first tab at once,
  // and the selection moves there too, so that the annotation coming back adds the tab without
  // switching to it.
  const activeTab = selectedTab === README_TAB && !readme ? 0 : selectedTab;
  useEffect(() => {
    if (!readme && selectedTab === README_TAB) setSelectedTab(0);
  }, [readme, selectedTab]);

  return (
    <Container>
      <BorderedAccordion expanded>
        <AccordionSummary>
          <Typography sx={{ pl: 1 }} variant='h6'>
            Dashboard
          </Typography>
          <Stack direction='row' spacing={1} alignItems='center' sx={{ pl: 1 }}>
            {statusAnnotations.map((status, index) => (
              <Chip
                key={index}
                label={`${status.key}: ${status.value}`}
                color='warning'
                size='small'
              />
            ))}
          </Stack>
        </AccordionSummary>
        <Divider />
        <AccordionDetails
          sx={{
            display: 'flex',
            flexDirection: 'row',
            borderBottomLeftRadius: '8px',
            borderBottomRightRadius: '8px',
            height: editorHeight,
            overflowY: 'none',
            padding: 0,
          }}
        >
          <Main
            sx={{
              backgroundColor: 'white',
              borderBottomLeftRadius: '8px',
              p: 2,
            }}
          >
            {(upstreamUnit?.HeadRevisionNum ?? 0) > (unit?.UpstreamRevisionNum ?? 0) && (
              <Alert
                severity='warning'
                sx={{
                  mb: 2,
                  alignItems: 'center',
                  '& .MuiAlert-action': {
                    alignItems: 'center',
                    paddingTop: 0,
                  },
                }}
                action={
                  <Button variant='contained' color='primary' size='small' onClick={onUpgrade}>
                    Upgrade
                  </Button>
                }
              >
                This unit needs an upgrade. The upstream unit has a newer revision available.
              </Alert>
            )}
            <ActionSidebar
              unit={currentUnitExtended}
              onApplyGateClicked={onApplyGateClicked}
              onRefresh={setRefresh}
              isFetchingUnit={isFetchingUnit}
              lastPollTimestamp={lastPollTimestamp}
            />
          </Main>
          <Aside>
            <StickyTab>
              <SettingsTabs
                tabs={['URLs', ...(readme ? ['Readme'] : [])]}
                onTabSelected={(tab: number) => setSelectedTab(tab)}
                defaultValue={activeTab}
              />
              <Divider />
            </StickyTab>
            <Section sx={{ pt: 2 }} $display={activeTab === 0} $direction={Direction.FadeIn}>
              <Stack spacing={1}>
                {urlAnnotations.length > 0 ? (
                  <Box component='ul' sx={{ pl: 2, m: 0 }}>
                    {urlAnnotations.map((link, index) => (
                      <Box component='li' key={index} sx={{ mb: 1 }}>
                        <Link
                          href={link.url}
                          target='_blank'
                          rel='noopener noreferrer'
                          underline='hover'
                        >
                          {link.name}
                        </Link>
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Typography variant='body2' color='text.secondary'>
                    No URLs available. Add annotations with the prefix "URL-" to display URLs
                    here.
                  </Typography>
                )}
              </Stack>
            </Section>
            {readme && activeTab === README_TAB && (
              <Section $display $direction={Direction.FadeIn}>
                <ReadmeMarkdown markdown={readme} testId='unit-readme' />
              </Section>
            )}
          </Aside>
        </AccordionDetails>
      </BorderedAccordion>
    </Container>
  );
};
