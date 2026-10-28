# Links

Read this before you add a link, or a control that goes to a different page.

## Rules

1. **External URL** (a different site): open a new tab with `target="_blank" rel="noopener noreferrer"`.
2. **Internal link** (a page in this app): use a real link that has an `href`. Use `NavLink` (`src/components/nav-link/NavLink.tsx`), or an MUI component with `component={RouterLink}`. Do not use `onClick={() => navigate(...)}` or `window.open` for a user click. A plain click opens the page in the same tab. On cmd-click, ctrl-click and middle-click, the browser opens a new tab.
3. **In-progress work**: a link in a ChangeOrder page, a Components side pane, the Function invoker or the View Explorer entity drawer opens a new tab. Thus the user keeps the work on the current page. For a new surface, ask: "Does a same-tab navigation discard state that the user builds or reviews?" If yes, open a new tab.
4. **In-place preview**: if a plain click shows the target in the current pane, keep the real `href`. Stop only the plain, unmodified left click. Let the browser do all other clicks.
5. Use `navigate()` only when the navigation is not a link click: after an action (create, delete, clone, submit), and to sync the URL with `{ replace: true }`.
6. Use `window.open` only where no link element can take the click: a keyboard shortcut, or a modified click on a row whose link is in one cell.

An anchor must not contain buttons. If a list row holds buttons, do not make the row an anchor. Put the link on the row title, and use a `::after` pseudo-element to stretch the link over the row. Give the buttons in the row `position: relative` and a higher `z-index`.

`NavLink` stops the click event, so a click on a link in a data grid does not select the row.

A row can give modified clicks a meaning of its own, for example ⌘-click to pick the row. Its link must not: on the link, ⌘/Ctrl-click and middle-click stay the browser's. Only ⇧-click can keep the row's meaning on the link, because the browser's ⇧-click opens a new window, which no rule asks for.

## Examples

```tsx
// 1. External URL
<Link href="https://docs.confighub.com/" target="_blank" rel="noopener noreferrer">Docs</Link>

// 2. Internal link in text or in a grid cell
<NavLink to={`/units/${spaceId}/${unitId}`}>{unitSlug}</NavLink>

// 2. Internal link that looks like a button
<Button component={RouterLink} to="/change-orders">All ChangeOrders</Button>

// 3. Link in a surface that holds in-progress work
<Link component={RouterLink} to={`/spaces/${spaceId}`} target="_blank" rel="noopener noreferrer">{spaceSlug}</Link>

// 4. In-place preview: a plain click opens the pane, all other clicks go to the browser
<Link
  component={RouterLink}
  to={`/units/${spaceId}/${unitId}`}
  onClick={(e: React.MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    openUnitPane(unitId);
  }}
>
  {unitSlug}
</Link>
```

In a surface that holds in-progress work, also give the in-place preview link `target="_blank"`.
