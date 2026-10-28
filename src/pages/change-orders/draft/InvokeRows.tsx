// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * An Invoke draft's rows, under the What track where Base changes has its update-type sub bar.
 *
 * One "Run" row: the function slot, then what it is given.
 *
 * - The image function (the default): the container, then the image reference with its tag as
 *   the input, suggestions under it and its warnings beside it (`ImageTagField`).
 * - Any other function: its arguments, and the resources it runs on.
 *
 * Every control writes the URL. A value that is last time's carries the history mark; one that is
 * not has the way back at the end of its row, never between a control and its text.
 */

import { useState, type ReactNode } from 'react';

import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';
import BookmarkBorderOutlinedIcon from '@mui/icons-material/BookmarkBorderOutlined';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FunctionsIcon from '@mui/icons-material/Functions';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import MemoryOutlinedIcon from '@mui/icons-material/MemoryOutlined';
import SearchIcon from '@mui/icons-material/Search';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';

import { VISUALLY_HIDDEN_SX } from '@/utility/visually-hidden';

import {
  changeOrderAction,
  changeOrderBorder,
  changeOrderFontMono,
  changeOrderInk,
  changeOrderShape,
  changeOrderStatus,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';
import { RolePill } from '../components/ImageChangeAtoms';
import { CouldNotEstablish } from './CouldNotEstablish';
import { draftCopy } from './draftCopy';
import type { DraftAddressPatch } from './draftDecisions';
import { draftProblemId } from './draftFocus';
import {
  type DraftArgValue,
  type DraftInvoke,
  type DraftInvokeSource,
  INVOKE_IDS,
  imageWarningsOf,
  invocationMatches,
  sameSource,
  sourcePatch,
  tagSuggestionsOf,
} from './draftInvoke';
import { type DraftResourceOption, type DraftSavedInvocation, invocationRef, whereOfSlugs } from './draftKinds';
import { BARE_BUTTON, DRAFT_TRANSITION, FOCUS_RING, OPEN_PRESSED, OPTION_SX, PRESS } from './draftLook';
import { DraftPopover, LastTimeMark, OptionAside, OptionText, PopoverDivider, PopoverHeading, RevertButton } from './DraftPopover';
import type { DraftProblem, DraftReadStatus } from './draftTypes';
import { ImageTagField, ImageTagWarnings } from './ImageTagField';
import { type DraftIcon, ImageIcon } from './kindIcons';
import { AsLastTime, KeepTogether, Row } from './DraftRows';
import { LABEL_COLUMN, PICK_SX, ROWS_GRID_SX } from './draftRowsLook';

const copy = draftCopy.invoke;
const back = draftCopy.page.facts.backTo;

/** Each common function's mark; any other function the generic one. */
const FUNCTION_ICON: Readonly<Record<string, DraftIcon>> = {
  'set-label': LabelOutlinedIcon,
  'set-annotation': StickyNote2OutlinedIcon,
  'set-env-var': TuneOutlinedIcon,
  'set-replicas': LayersOutlinedIcon,
  'set-container-resources': MemoryOutlinedIcon,
  'set-container-image': ImageIcon,
};

interface SourceIconProps {
  source: DraftInvokeSource;
}

function SourceIcon({ source }: SourceIconProps) {
  if (source.kind === 'invocation') return <BookmarkBorderOutlinedIcon aria-hidden />;
  const Icon = FUNCTION_ICON[source.name] ?? FunctionsIcon;
  return <Icon aria-hidden />;
}

/** The function slot: a bordered control. */
const CONTROL_SX = {
  ...BARE_BUTTON,
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  height: 28,
  padding: '0 6px 0 10px',
  border: `1px solid ${changeOrderBorder.default}`,
  borderRadius: `${changeOrderShape.radius.md}px`,
  background: changeOrderSurface.card,
  fontSize: changeOrderType.size.body,
  color: changeOrderInk.default,
  whiteSpace: 'nowrap',
  transition: DRAFT_TRANSITION,
  '& > .MuiSvgIcon-root': { fontSize: 13, color: changeOrderInk.default },
  '& > .MuiSvgIcon-root:last-of-type': { fontSize: 16, color: changeOrderInk.subtle },
  '&:hover': { borderColor: changeOrderBorder.strong },
  '&:focus-visible': FOCUS_RING,
  ...OPEN_PRESSED,
  ...PRESS,
} as const;

/** A text input: bordered, mono, as wide as what it holds; the page's 2px rust ring while it has the keyboard. */
const INPUT_SX = {
  height: 28,
  boxSizing: 'border-box',
  border: `1px solid ${changeOrderBorder.default}`,
  borderRadius: `${changeOrderShape.radius.md}px`,
  background: changeOrderSurface.card,
  padding: '0 9px',
  fontFamily: changeOrderFontMono,
  fontSize: changeOrderType.size.body,
  color: changeOrderInk.default,
  transition: DRAFT_TRANSITION,
  // 90px with its padding at the least, as wide as what it holds beyond that.
  '& input': { padding: 0, height: 26, fieldSizing: 'content', minWidth: 72, maxWidth: '28ch' },
  '& input::placeholder': { color: changeOrderInk.subtle, opacity: 1 },
  '&:hover': { borderColor: changeOrderBorder.strong },
  '&.Mui-focused': { borderColor: changeOrderAction.focus, outline: `2px solid ${changeOrderAction.focus}`, outlineOffset: 1 },
  '&[data-invalid]': { borderColor: changeOrderStatus.danger },
} as const;

interface InputLabelProps {
  children: string;
}

/** An argument's name inside its input, for one whose name its value does not say. */
function InputLabel({ children }: InputLabelProps) {
  return (
    <Box component="span" aria-hidden="true" sx={{ fontFamily: changeOrderFontMono, fontSize: changeOrderType.size.small, color: changeOrderInk.subtle, marginRight: '7px', whiteSpace: 'nowrap' }}>
      {children}
    </Box>
  );
}

interface TextValueProps {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  /** The argument's short name, shown inside the box where the value alone does not say what it is. */
  name?: string;
  /** What the function says the argument is: its peek. */
  help?: string;
  problemIds?: readonly string[];
  testId?: string;
  onChange: (text: string) => void;
}

/**
 * A typed value. What is typed is the input's own until it leaves; meanwhile each keystroke is
 * written to the URL, and a value the URL changes from elsewhere (an undo) is taken in while the
 * input is not being typed in.
 */
export function TextValue({ id, label, value, placeholder, name, help, problemIds = [], testId, onChange }: TextValueProps) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  if (!focused && text !== value) setText(value);
  const input = (
    <InputBase
      id={id}
      value={text}
      placeholder={placeholder ?? label}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(event) => {
        setText(event.target.value);
        onChange(event.target.value);
      }}
      startAdornment={name === undefined ? undefined : <InputLabel>{name}</InputLabel>}
      name={id}
      data-invalid={problemIds.length > 0 ? '' : undefined}
      inputProps={{
        'aria-label': label,
        'aria-invalid': problemIds.length > 0 ? true : undefined,
        'aria-describedby': problemIds.length > 0 ? problemIds.join(' ') : undefined,
        spellCheck: false,
        autoComplete: 'off',
        translate: 'no',
        'data-testid': testId,
      }}
      sx={INPUT_SX}
    />
  );
  if (help === undefined) return input;
  return (
    <Tooltip title={help} enterDelay={400} describeChild placement="bottom-start">
      {input}
    </Tooltip>
  );
}

interface FunctionOptionProps {
  name: string;
  checked: boolean;
  /** The function's description: a second line in a search's results, the option's title otherwise. */
  description: string | undefined;
  twoLines: boolean;
  /** What a new Invoke draft runs: marked so in the list. */
  isDefault: boolean;
  onPick: () => void;
}

function FunctionOption({ name, checked, description, twoLines, isDefault, onPick }: FunctionOptionProps) {
  const Icon = FUNCTION_ICON[name] ?? FunctionsIcon;
  return (
    <Box
      component="button"
      type="button"
      role="menuitemradio"
      data-draft-option
      data-function={name}
      aria-checked={checked}
      title={twoLines ? undefined : description}
      onClick={onPick}
      sx={{ ...OPTION_SX, alignItems: twoLines ? 'flex-start' : 'center', padding: twoLines ? '7px 8px' : '6px 8px' }}
    >
      <Icon aria-hidden />
      <OptionText mono title={<span translate="no">{name}</span>} sub={twoLines ? description : undefined} />
      {isDefault ? <OptionAside>{copy.isDefault}</OptionAside> : null}
    </Box>
  );
}

interface InvocationOptionProps {
  invocation: DraftSavedInvocation;
  checked: boolean;
  isLast: boolean;
  onPick: () => void;
}

function InvocationOption({ invocation, checked, isLast, onPick }: InvocationOptionProps) {
  return (
    <Box
      component="button"
      type="button"
      role="menuitemradio"
      data-draft-option
      data-invocation={invocationRef(invocation)}
      aria-checked={checked}
      onClick={onPick}
      sx={OPTION_SX}
    >
      <BookmarkBorderOutlinedIcon aria-hidden />
      <OptionText
        mono
        title={<span translate="no">{invocation.slug}</span>}
        sub={
          <>
            {`${invocation.spaceSlug} · `}
            <span translate="no">{invocation.calls.map((call) => call.FunctionName).join(', ')}</span>
          </>
        }
      />
      {isLast ? <LastTimeMark /> : null}
    </Box>
  );
}

interface FunctionSlotProps {
  invoke: DraftInvoke;
  onPick: (source: DraftInvokeSource) => void;
}

/**
 * The function slot: what runs. Without a search, the few most recent saved Invocations (last
 * time's first) above the functions, the default (the image function) first. The search finds
 * every function and every saved Invocation, by its slug or a function it runs, each in its own
 * group. Its mark and peek say what Create does with the call: run a saved Invocation, or save
 * this one.
 */
function FunctionSlot({ invoke, onPick }: FunctionSlotProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const source = invoke.source.value;
  const lastId = invoke.source.last?.kind === 'invocation' ? invoke.source.last.invocation.invocationId : undefined;
  const searching = query.trim() !== '';
  const matches = (name: string) => name.toLowerCase().includes(query.trim().toLowerCase());
  const functions = searching ? [...invoke.functionOptions, ...invoke.moreFunctions].filter(matches) : invoke.functionOptions;
  const invocations = searching ? invoke.invocationOptions.filter((invocation) => invocationMatches(invocation, query)) : invoke.recentInvocations;
  // A search when there is more than the popover lists.
  const searchable = invoke.moreFunctions.length > 0 || invoke.invocationOptions.length > invoke.recentInvocations.length;
  const pick = (next: DraftInvokeSource) => {
    setAnchor(null);
    setQuery('');
    onPick(next);
  };
  const isChosen = (invocation: DraftSavedInvocation) => source.kind === 'invocation' && source.invocation.invocationId === invocation.invocationId;
  const shown = source.kind === 'invocation' ? source.invocation.slug : source.name;
  const runs = source.kind === 'invocation' ? source.invocation : invoke.adopted;
  const saving = runs === undefined ? copy.savesOnCreate : copy.runsSaved(runs.slug);
  const SavingIcon = runs === undefined ? BookmarkAddOutlinedIcon : BookmarkBorderOutlinedIcon;
  return (
    <>
      <Tooltip title={saving} enterDelay={400} describeChild>
        <Box
          component="button"
          type="button"
          id={INVOKE_IDS.function}
          data-testid="draft-invoke-function"
          data-runs={runs === undefined ? 'saved-on-create' : invocationRef(runs)}
          aria-haspopup="dialog"
          aria-expanded={anchor !== null}
          aria-label={`${copy.function}: ${shown}`}
          onClick={(event) => setAnchor(event.currentTarget)}
          sx={CONTROL_SX}
        >
          <SourceIcon source={source} />
          <Box component="span" translate="no" sx={{ fontFamily: changeOrderFontMono, fontSize: 12, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {shown}
          </Box>
          {source.kind === 'function' ? <SavingIcon aria-hidden data-testid="draft-invoke-saving" sx={{ '&&': { fontSize: 13, color: changeOrderInk.subtle } }} /> : null}
          <ExpandMoreIcon aria-hidden />
        </Box>
      </Tooltip>
      <DraftPopover anchorEl={anchor} onClose={() => setAnchor(null)} label={copy.function} height={360}>
        {searchable ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              margin: '2px 2px 6px',
              padding: '0 8px',
              height: 30,
              borderRadius: `${changeOrderShape.radius.md}px`,
              background: changeOrderSurface.sunk,
              '&:focus-within': { outline: `2px solid ${changeOrderAction.focus}`, outlineOffset: 0 },
            }}
          >
            <SearchIcon aria-hidden sx={{ fontSize: 16, color: changeOrderInk.subtle }} />
            <InputBase
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              inputProps={{ 'aria-label': copy.searchFunctions, spellCheck: false, 'data-draft-search': '' }}
              sx={{ flex: 1, fontSize: changeOrderType.size.body }}
            />
            <Box role="status" aria-live="polite" sx={VISUALLY_HIDDEN_SX}>
              {searching ? copy.matchCount(functions.length + invocations.length) : ''}
            </Box>
          </Box>
        ) : null}
        {invocations.length === 0 ? null : (
          <>
            {/* Without a search, the recent few need no heading: each says it is saved, and where. */}
            {searching ? <PopoverHeading icon={<BookmarkBorderOutlinedIcon aria-hidden />}>{copy.savedInvocations}</PopoverHeading> : null}
            <Box role="menu" aria-label={searching ? copy.savedInvocations : copy.recentInvocations} data-testid="draft-invoke-invocations">
              {invocations.map((invocation) => (
                <InvocationOption
                  key={invocation.invocationId}
                  invocation={invocation}
                  checked={isChosen(invocation)}
                  isLast={invocation.invocationId === lastId}
                  onPick={() => pick({ kind: 'invocation', invocation })}
                />
              ))}
            </Box>
            <PopoverDivider />
          </>
        )}
        <PopoverHeading icon={<FunctionsIcon aria-hidden />}>{copy.functions}</PopoverHeading>
        <Box role="menu" aria-label={copy.functions} sx={{ maxHeight: 280, overflowY: 'auto' }}>
          {functions.length === 0 ? <Box sx={{ padding: '6px 8px', fontSize: changeOrderType.size.body, color: changeOrderInk.subtle }}>{copy.noFunctionMatches}</Box> : null}
          {functions.map((name) => (
            <FunctionOption
              key={name}
              name={name}
              checked={source.kind === 'function' && source.name === name}
              description={invoke.functionDescriptions.get(name)}
              twoLines={searching}
              isDefault={name === invoke.defaultFunction}
              onPick={() => pick({ kind: 'function', name })}
            />
          ))}
        </Box>
      </DraftPopover>
    </>
  );
}

interface ChoiceOption {
  value: string;
  title: ReactNode;
  sub?: ReactNode;
  aside?: ReactNode;
}

interface ChoicePickProps {
  id: string;
  /** Its accessible name: "set-container-resources: operation". */
  label: string;
  /** What it shows while nothing is picked: "operation". */
  placeholder: string;
  value: string;
  heading: string;
  icon: ReactNode;
  options: readonly ChoiceOption[];
  last: string | undefined;
  help?: string;
  problemIds?: readonly string[];
  testId: string;
  onPick: (value: string) => void;
}

/** An inline choice of one value: a container, an enum's value. */
function ChoicePick({ id, label, placeholder, value, heading, icon, options, last, help, problemIds = [], testId, onPick }: ChoicePickProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Tooltip title={help ?? ''} enterDelay={400} describeChild placement="bottom-start">
        <Box
          component="button"
          type="button"
          id={id}
          data-testid={testId}
          aria-haspopup="dialog"
          aria-expanded={anchor !== null}
          aria-label={`${label}: ${value === '' ? draftCopy.invoke.noneYet : value}`}
          aria-invalid={problemIds.length > 0 ? true : undefined}
          aria-describedby={problemIds.length > 0 ? problemIds.join(' ') : undefined}
          onClick={(event) => setAnchor(event.currentTarget)}
          sx={{ ...PICK_SX, ...(value === '' ? { color: changeOrderInk.subtle } : {}) }}
        >
          <span translate="no">{value === '' ? placeholder : value}</span>
          <ExpandMoreIcon aria-hidden />
        </Box>
      </Tooltip>
      <DraftPopover anchorEl={anchor} onClose={() => setAnchor(null)} label={heading} wide>
        <PopoverHeading icon={icon}>{heading}</PopoverHeading>
        <Box role="menu" aria-label={heading}>
          {options.map((option) => (
            <Box
              key={option.value}
              component="button"
              type="button"
              role="menuitemradio"
              data-draft-option
              data-choice={option.value}
              aria-checked={option.value === value}
              onClick={() => {
                setAnchor(null);
                if (option.value !== value) onPick(option.value);
              }}
              sx={OPTION_SX}
            >
              <OptionText mono title={option.title} sub={option.sub} />
              {option.value === last ? <LastTimeMark /> : null}
              {option.aside === undefined ? null : <OptionAside>{option.aside}</OptionAside>}
            </Box>
          ))}
        </Box>
      </DraftPopover>
    </>
  );
}

/** The containers the base runs, as a choice: each with the tag the variants run it at now, as the hero says it. */
function containerOptions(invoke: DraftInvoke, currentTags: ReadonlyMap<string, string>): ChoiceOption[] {
  return invoke.containers.map((option) => {
    const tag = currentTags.get(option.name) ?? option.tag;
    return {
      value: option.name,
      title: (
        <>
          <span translate="no">{option.name}</span>
          <RolePill role={option.role} />
        </>
      ),
      sub: <span translate="no">{option.resources.join(', ')}</span>,
      aside: tag === undefined ? undefined : <span translate="no">{tag}</span>,
    };
  });
}

interface ResourcesPickProps {
  invoke: DraftInvoke;
  onChange: (patch: DraftAddressPatch) => void;
}

/** The resources a function runs on: the base's, workloads first, by what they hold. Writes `WhereUnit`. */
function ResourcesPick({ invoke, onChange }: ResourcesPickProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const all = invoke.resources.map((option) => option.unitSlug);
  const where = invoke.where.value;
  const selected = where === '' ? all : (invoke.selectedSlugs ?? []);
  const custom = where !== '' && invoke.selectedSlugs === undefined;
  const labelOf = (option: DraftResourceOption) => (option.more > 0 ? `${option.label} ${copy.moreResources(option.more)}` : option.label);
  let shown: string;
  if (custom) shown = `${copy.where} ${where}`;
  else if (where === '') shown = copy.everyResource;
  else if (selected.length === 1) shown = labelOf(invoke.resources.find((option) => option.unitSlug === selected[0]) ?? { unitSlug: selected[0], label: selected[0], more: 0, workload: false });
  else shown = copy.resourceCount(selected.length);
  const write = (slugs: readonly string[]) => {
    const next = slugs.length === all.length ? '' : whereOfSlugs(slugs);
    // The default is not written down: the URL keeps only what was decided.
    onChange({ where: next === invoke.whereDefault ? null : next });
  };
  const toggle = (slug: string) => {
    const base = custom ? [] : selected;
    const next = base.includes(slug) ? base.filter((other) => other !== slug) : all.filter((other) => base.includes(other) || other === slug);
    if (next.length > 0) write(next);
  };
  return (
    <>
      <KeepTogether>
        <Box
          component="button"
          type="button"
          id={INVOKE_IDS.resources}
          data-testid="draft-invoke-resources"
          aria-haspopup="dialog"
          aria-expanded={anchor !== null}
          aria-label={`${copy.resources}: ${shown}`}
          onClick={(event) => setAnchor(event.currentTarget)}
          sx={{ ...PICK_SX, gap: '4px', maxWidth: 320 }}
        >
          <ImageIcon aria-hidden sx={{ '&&': { fontSize: 13 } }} />
          <Box component="span" translate="no" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 12 }}>
            {shown}
          </Box>
          <ExpandMoreIcon aria-hidden />
        </Box>
        {invoke.where.last !== undefined && !invoke.where.differsFromLast ? <AsLastTime /> : null}
      </KeepTogether>
      <DraftPopover anchorEl={anchor} onClose={() => setAnchor(null)} label={copy.resources} wide height={320}>
        <PopoverHeading icon={<ImageIcon aria-hidden />}>{copy.resources}</PopoverHeading>
        <Box role="menu" aria-label={copy.resources}>
          {invoke.resources.map((option) => {
            const checked = !custom && selected.includes(option.unitSlug);
            // The last one ticked stays: a change that runs on nothing is not a change.
            const only = checked && selected.length === 1;
            return (
              <Box
                key={option.unitSlug}
                component="button"
                type="button"
                role="menuitemcheckbox"
                data-draft-option
                data-resource={option.unitSlug}
                aria-checked={checked}
                aria-disabled={only ? true : undefined}
                title={only ? copy.oneResourceAtLeast : undefined}
                onClick={() => toggle(option.unitSlug)}
                sx={{
                  ...OPTION_SX,
                  alignItems: 'center',
                  '&[aria-checked="true"]': {},
                  '&[aria-disabled="true"]': { cursor: 'not-allowed' },
                  '& > .MuiSvgIcon-root': { fontSize: 17, color: checked ? changeOrderAction.ink : changeOrderInk.subtle },
                }}
              >
                {checked ? <CheckBoxIcon aria-hidden /> : <CheckBoxOutlineBlankIcon aria-hidden />}
                <OptionText mono title={<span translate="no">{labelOf(option)}</span>} sub={only ? copy.oneResourceAtLeast : undefined} />
              </Box>
            );
          })}
        </Box>
      </DraftPopover>
    </>
  );
}

interface QuietProblemProps {
  problem: DraftProblem | undefined;
}

/** A problem held back from the list under the row until there is something to fix: said only to the input it describes. */
function QuietProblem({ problem }: QuietProblemProps) {
  if (problem === undefined) return null;
  return (
    <Box component="span" id={draftProblemId(problem)} sx={VISUALLY_HIDDEN_SX}>
      {problem.message}
    </Box>
  );
}

interface ArgControlProps {
  arg: DraftArgValue;
  invoke: DraftInvoke;
  currentTags: ReadonlyMap<string, string>;
  onChange: (text: string) => void;
}

/** One argument of the Run row: a container or an enum picked, any other value typed. */
function ArgControl({ arg, invoke, currentTags, onChange }: ArgControlProps) {
  const problemIds = arg.problem === undefined ? [] : [draftProblemId(arg.problem)];
  const id = INVOKE_IDS.arg(arg.slot.name);
  const label = copy.argumentLabel(invoke.functionName, arg.slot.label);
  const help = arg.slot.parameter.Description || undefined;
  const testId = `draft-invoke-arg-${arg.slot.name}`;
  const quiet = arg.problem?.code === 'arg-empty' ? arg.problem : undefined;
  let control: ReactNode;
  if (arg.slot.sense === 'container' && invoke.containers.length > 0) {
    control = (
      <ChoicePick
        id={id}
        label={label}
        placeholder={arg.slot.label}
        value={arg.text}
        heading={copy.container}
        icon={<ImageIcon aria-hidden />}
        options={containerOptions(invoke, currentTags)}
        last={arg.last}
        help={help}
        problemIds={problemIds}
        testId={testId}
        onPick={onChange}
      />
    );
  } else if (arg.slot.sense === 'enum') {
    control = (
      <ChoicePick
        id={id}
        label={label}
        placeholder={arg.slot.label}
        value={arg.text}
        heading={arg.slot.label}
        icon={<TuneOutlinedIcon aria-hidden />}
        options={(arg.slot.parameter.EnumValues ?? []).map((value) => ({ value, title: <span translate="no">{value}</span> }))}
        last={arg.last}
        help={help}
        problemIds={problemIds}
        testId={testId}
        onPick={onChange}
      />
    );
  } else {
    const keyOrValue = arg.slot.label === 'key' || arg.slot.label === 'value' || arg.slot.label === 'variable';
    const example = arg.slot.parameter.Example;
    control = (
      <TextValue
        id={id}
        label={label}
        placeholder={example ? `${example}` : `${arg.slot.label}…`}
        name={keyOrValue ? undefined : arg.slot.label}
        help={help}
        value={arg.text}
        problemIds={problemIds}
        testId={testId}
        onChange={onChange}
      />
    );
  }
  return (
    <KeepTogether>
      {control}
      {arg.last !== undefined && arg.text === arg.last ? <AsLastTime /> : null}
      <QuietProblem problem={quiet} />
    </KeepTogether>
  );
}

/** `=` between a key and its value, as a label or an environment variable is written. */
function Equals() {
  return (
    <Box component="span" aria-hidden="true" sx={{ color: changeOrderInk.default, fontSize: changeOrderType.size.body }}>
      =
    </Box>
  );
}

interface RevertsProps {
  invoke: DraftInvoke;
  onChange: (patch: DraftAddressPatch) => void;
}

/** The ways back to last time for a row's values, at the row's end. */
function SourceRevert({ invoke, onChange }: RevertsProps) {
  const last = invoke.source.last;
  if (!invoke.source.differsFromLast || last === undefined) return null;
  return <RevertButton label={back(last.kind === 'invocation' ? last.invocation.slug : last.name)} onClick={() => onChange(invoke.sourceBack)} />;
}

interface ValueRunRowProps {
  invoke: DraftInvoke;
  currentTags: ReadonlyMap<string, string>;
  onPickSource: (source: DraftInvokeSource) => void;
  onChange: (patch: DraftAddressPatch) => void;
}

/** Any other function's Run row: the function, its arguments (`key = value`), and the resources. */
function ValueRunRow({ invoke, currentTags, onPickSource, onChange }: ValueRunRowProps) {
  const args = invoke.args;
  // One argument at a time: the URL merges it into the others.
  const setArg = (name: string, text: string | null) => onChange({ params: { [name]: text } });
  const pairAt = args.findIndex((arg, index) => index + 1 < args.length && ['key', 'variable'].includes(arg.slot.label) && args[index + 1].slot.label === 'value');
  const changedArgs = args.filter((arg) => arg.last !== undefined && arg.text !== arg.last);
  return (
    <Row label={copy.run} testId="draft-invoke-run">
      <KeepTogether>
        <FunctionSlot invoke={invoke} onPick={onPickSource} />
        {invoke.source.last !== undefined && !invoke.source.differsFromLast ? <AsLastTime /> : null}
      </KeepTogether>
      {args.map((arg, index) => (
        <Box key={arg.slot.name} sx={{ display: 'contents' }}>
          {index === pairAt + 1 && pairAt >= 0 ? <Equals /> : null}
          <ArgControl arg={arg} invoke={invoke} currentTags={currentTags} onChange={(text) => setArg(arg.slot.name, text)} />
        </Box>
      ))}
      {invoke.picksResources && invoke.resources.length > 0 ? <ResourcesPick invoke={invoke} onChange={onChange} /> : null}
      <SourceRevert invoke={invoke} onChange={onChange} />
      {changedArgs.map((arg) => (
        <RevertButton key={arg.slot.name} label={back(arg.last === '' ? draftCopy.invoke.noneYet : (arg.last ?? ''))} onClick={() => setArg(arg.slot.name, null)} />
      ))}
      {invoke.where.differsFromLast && invoke.where.last !== undefined ? (
        <RevertButton label={back(invoke.where.last === '' ? copy.everyResource : invoke.where.last)} onClick={() => onChange({ where: null })} />
      ) : null}
    </Row>
  );
}

interface ImageRunRowProps {
  invoke: DraftInvoke;
  currentTags: ReadonlyMap<string, string>;
  tagsInScope: ReadonlyMap<string, ReadonlyMap<string, number>>;
  onPickSource: (source: DraftInvokeSource) => void;
  onChange: (patch: DraftAddressPatch) => void;
}

/**
 * The image function's Run row, in the other functions' shape: the function, the container, then
 * the image reference with its tag as the input, and what to know about that tag beside it. One
 * line: the tag's warnings and the repository give way before anything wraps.
 */
function ImageRunRow({ invoke, currentTags, tagsInScope, onPickSource, onChange }: ImageRunRowProps) {
  const tagProblems = invoke.problems.filter((problem) => problem.focusId === INVOKE_IDS.tag);
  const copied = tagProblems.find((problem) => problem.code === 'tag-copied');
  const quiet = tagProblems.find((problem) => problem.code === 'tag-empty');
  const containerProblems = invoke.problems.filter((problem) => problem.focusId === INVOKE_IDS.container);
  const warnings = imageWarningsOf(invoke, currentTags);
  const suggestions = tagSuggestionsOf(invoke, currentTags, tagsInScope);
  // One history mark for the call when it is last time's; the container's own only when the call is not.
  const callAsLast = invoke.source.last !== undefined && !invoke.source.differsFromLast;
  const containerAsLast = !callAsLast && invoke.container.last !== undefined && !invoke.container.differsFromLast;
  return (
    <Row label={copy.run} testId="draft-invoke-run" oneLine>
      <KeepTogether>
        <FunctionSlot invoke={invoke} onPick={onPickSource} />
        {callAsLast ? <AsLastTime /> : null}
      </KeepTogether>
      {invoke.containers.length > 0 ? (
        <KeepTogether>
          <ChoicePick
            id={INVOKE_IDS.container}
            label={copy.container}
            placeholder={copy.container.toLowerCase()}
            value={invoke.container.value ?? ''}
            heading={copy.container}
            icon={<ImageIcon aria-hidden />}
            options={containerOptions(invoke, currentTags)}
            last={invoke.container.last}
            problemIds={containerProblems.map(draftProblemId)}
            testId="draft-invoke-container"
            // Last time's tag was last time's container's: another container starts with none.
            onPick={(container) => onChange({ container, tag: container === invoke.container.last ? null : '' })}
          />
          {containerAsLast ? <AsLastTime /> : null}
        </KeepTogether>
      ) : null}
      <ImageTagField invoke={invoke} suggestions={suggestions} warned={warnings.length > 0} onChange={onChange} />
      {/* The problems the row says without words of their own: the copied chip, the empty box. */}
      {copied === undefined ? null : (
        <Box component="span" id={draftProblemId(copied)} sx={VISUALLY_HIDDEN_SX}>
          {copied.message}
        </Box>
      )}
      <QuietProblem problem={quiet} />
      <SourceRevert invoke={invoke} onChange={onChange} />
      {invoke.container.differsFromLast && invoke.container.last !== undefined ? (
        <RevertButton label={back(invoke.container.last)} onClick={() => onChange({ container: null, tag: null })} />
      ) : null}
      {invoke.tag.differsFromLast && invoke.tag.last !== undefined ? <RevertButton label={back(invoke.tag.last)} onClick={() => onChange({ tag: null })} /> : null}
      <ImageTagWarnings warnings={warnings} />
    </Row>
  );
}

export interface InvokeRowsProps {
  invoke: DraftInvoke | undefined;
  status: DraftReadStatus;
  onRetry: () => void;
  /** The tag each container runs at in the variants now, by name: what the container choice shows. */
  currentTags: ReadonlyMap<string, string>;
  /** Each tag the variants in scope run each container at, with how many run it: what the tag suggests. */
  tagsInScope: ReadonlyMap<string, ReadonlyMap<string, number>>;
  onChange: (patch: DraftAddressPatch) => void;
}

/**
 * The rows of an Invoke draft. While the functions and the base's configuration are read, the
 * rows' shape; if they cannot be, "Could not establish" with its retry.
 */
export function InvokeRows({ invoke, status, onRetry, currentTags, tagsInScope, onChange }: InvokeRowsProps) {
  if (status === 'failed') return <CouldNotEstablish onRetry={onRetry} retryWhat={copy.functions.toLowerCase()} />;
  if (invoke === undefined || status === 'loading') {
    return (
      <Box role="status" aria-busy="true" aria-label={copy.loadingRows} sx={{ display: 'flex', gap: '6px', marginTop: '10px', paddingLeft: `${LABEL_COLUMN + 14}px` }} data-testid="draft-invoke-loading">
        <Skeleton variant="rounded" width={150} height={28} />
        <Skeleton variant="rounded" width={90} height={28} />
        <Skeleton variant="rounded" width={110} height={28} />
      </Box>
    );
  }
  const pickSource = (source: DraftInvokeSource) => {
    // Last time's source (or, without one, the default function) is not written down.
    const back = invoke.source.last ?? { kind: 'function', name: invoke.defaultFunction };
    onChange(sameSource(source, back) ? invoke.sourceBack : sourcePatch(source));
  };
  return (
    <Box
      data-testid="draft-invoke-rows"
      data-mode={invoke.mode}
      sx={ROWS_GRID_SX}
    >
      {invoke.mode === 'image' ? (
        <ImageRunRow invoke={invoke} currentTags={currentTags} tagsInScope={tagsInScope} onPickSource={pickSource} onChange={onChange} />
      ) : (
        <ValueRunRow invoke={invoke} currentTags={currentTags} onPickSource={pickSource} onChange={onChange} />
      )}
    </Box>
  );
}
