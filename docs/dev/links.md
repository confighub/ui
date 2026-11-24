# Links

Read this before you add a link, or a control that goes to a different page.

A link to a page of this app opens in the same tab, on any surface. The trail at the top of each
page ([the trail](#the-trail)) leads back, so a link may take the user out of what they are doing.

## Rules

1. **External URL** (a different site): open a new tab with `target="_blank" rel="noopener noreferrer"`. The trail cannot lead back from another site.
2. **Internal link** (a page in this app): use a real link that has an `href`. Use `NavLink` (`src/components/nav-link/NavLink.tsx`), or an MUI component with `component={RouterLink}`. Do not give it a `target`. Do not use `onClick={() => navigate(...)}` or `window.open` for a user click. A plain click opens the page in the same tab. On cmd-click, ctrl-click and middle-click, the browser opens a new tab.
3. **Unsaved edits**: a surface that holds edits which are in neither the address nor the server calls `useLeaveGuard(dirty)` (`src/components/trail/LeaveGuard.tsx`). A plain click that leaves the page then asks first. Do not open a new tab to protect the edits.
4. **In-place preview**: if a plain click shows the target in the current pane, keep the real `href`. Stop only the plain, unmodified left click. Let the browser do all other clicks.
5. Use `navigate()` only when the navigation is not a link click: after an action (create, delete, clone, submit), and to sync the URL with `{ replace: true }`.
6. Use `window.open` only where no link element can take the click: a keyboard shortcut for "open in a new tab", or a modified click on a row whose link is in one cell.

`useSameTabLinks` (`src/components/trail/useSameTabLinks.ts`), which `Layout` installs, enforces rule 2 for plain clicks: a plain click on any link to a page of this app goes there in the same tab, whatever the link's `target`, and without a page load when the link is a plain `<a href>`. It leaves modified clicks, external links and downloads to the browser.

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

// 3. A surface with unsaved edits
useLeaveGuard(isDirty);

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

## The trail

`Layout` shows a bar above each page: the organization, then the trail, then the page's header
actions. The trail is the pages visited in this browser tab, in the order of the visits. It is not
a hierarchy. Each crumb has an icon for its type and a name. The last crumb is the page on screen.
A page visited again moves to the end. The code is in `src/components/trail/`.

- **A new route** gets a `handle: { crumb }` in `src/App.tsx`; the type of the route list requires
  it. The crumb spec is in `crumbs.ts`. Its `key` says what counts as one page: leave out a query
  parameter that selects a tab, a filter or a stage, and keep one that selects the page's subject.
- **A page whose address holds an id**, or whose subject has a display name, calls
  `useCrumbName(name)`. Until then the crumb shows the name of the type. Never show the id.
- **A new type of page** gets a `CrumbKind` in `trail.ts` and an icon in `TrailBar.tsx`.
- A crumb keeps the page's last address with its query, so it returns to the same tab, filter and
  selection. State that should survive leaving the page belongs in the address.
- A navigation with `{ replace: true }` to a different page drops the crumb of the page it
  replaced, so a redirect or a deleted entity's page leaves no crumb.
- Crumbs keep their full width. When the trail is longer than the bar, the oldest crumbs leave it
  first, into the "Earlier pages" menu; the page on screen and the pages just before it stay.
- The trail is kept in `sessionStorage`, per organization. A reload keeps it. A new tab starts
  its own.
- A page does not draw a breadcrumb of its own. `Header` (`src/components/header/Header.tsx`)
  takes the page's action buttons, which it renders into the bar, and its filter row.
