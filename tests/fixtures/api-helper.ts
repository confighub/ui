// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// API helper for Playwright tests - provides direct API access without React hooks

import type { Page } from '@playwright/test';
import type {
  UpdateUnitApiArg,
  UpdateUnitApiResponse,
  Unit,
  UnitRead,
  Space,
  SpaceRead,
  Link,
  LinkRead,
  FunctionSignature,
  Target,
  TargetRead,
  ReleasePublishRequest,
  ReleaseRead,
  ExtendedReleaseRead,
  Filter,
  FilterRead,
  ChangeSet,
  ChangeSetRead,
  ChangeOrder,
  ChangeOrderRead,
  ComponentRead,
  ExtendedChangeOrderRead,
  ExtendedComponentRead,
  ResourceProtection,
  UnitProtectionResponse
} from '@confighub/rtk-query';
import { hubApi } from './test';

export class ApiHelper {
  constructor(private readonly page: Page) { }

  /**
   * Update a unit via direct API call (PATCH /api/space/{spaceId}/unit/{unitId})
   * Uses the same types as the RTK Query updateUnit mutation
   */
  async updateUnit(
    args: UpdateUnitApiArg
  ): Promise<UpdateUnitApiResponse> {
    const { spaceId, unitId, unit, ...queryParams } = args;

    const response = await hubApi.patch(
      `/api/space/${spaceId}/unit/${unitId}`,
      {
        params: queryParams,
        data: unit,
        headers: {
          'Content-Type': 'application/merge-patch+json',
        },
      }
    );

    if (!response.ok()) {
      const errorText = await response.text();
      throw new Error(
        `Failed to update unit: ${response.status()} ${errorText}`
      );
    }

    return response.json();
  }

  /**
   * Get a unit by slug
   * @param slug - The slug identifier for the unit
   * @returns Promise resolving to the Unit object
   * @throws Error if the unit is not found or response is invalid
   */
  async getUnitBySlug(slug: string): Promise<Unit> {
    // Sanitize slug to prevent SQL injection
    const sanitizedSlug = slug.replace(/'/g, "''");
    const response = await hubApi.get(`/api/unit`, {
      params: {
        select: 'UnitID,SpaceID,Slug,ToolchainType',
        where: `Slug = '${sanitizedSlug}'`,
      },
    });

    if (!response.ok()) {
      throw new Error(
        `Failed to get unit: ${response.status()} ${await response.text()}`
      );
    }

    const units = await response.json();
    if (!Array.isArray(units) || units.length === 0) {
      throw new Error(`Unit with slug ${slug} not found`);
    }

    if (!units[0].Unit?.UnitID) {
      throw new Error('Invalid response: missing Unit.UnitID in retrieved unit');
    }

    return units[0].Unit;
  }

  /**
   * Get a unit by ID
   * @param unitId - The unique identifier for the unit
   * @returns Promise resolving to the Unit object
   * @throws Error if the request fails
   */
  async getUnitById(unitId: string): Promise<Unit> {
    const response = await hubApi.get(`/api/unit/${unitId}`);

    if (!response.ok()) {
      throw new Error(
        `Failed to get unit: ${response.status()} ${await response.text()}`
      );
    }

    return response.json();
  }

  /**
   * List units with optional filters
   * @param params - Optional filter parameters (select, where, limit, offset)
   * @returns Promise resolving to an array of Unit objects
   * @throws Error if the request fails
   */
  async listUnits(params?: {
    select?: string;
    where?: string;
    limit?: number;
    offset?: number;
  }): Promise<Array<{ Unit: Unit }>> {
    const response = await hubApi.get(`/api/unit`, {
      params: params || {},
    });

    if (!response.ok()) {
      throw new Error(
        `Failed to list units: ${response.status()} ${await response.text()}`
      );
    }

    return response.json();
  }

  /**
   * Create a unit via API
   * @param params - Object containing spaceId, unit data, and optional allowExists flag
   * @returns Promise resolving to the created Unit object
   * @throws Error if the request fails or response is invalid
   */
  async createUnit({
    spaceId,
    unit,
    allowExists = true,
  }: {
    spaceId: string;
    unit: Unit;
    allowExists?: boolean;
  }): Promise<UnitRead> {
    const response = await hubApi.post(`/api/space/${spaceId}/unit`, {
      params: {
        allow_exists: allowExists ? 'true' : 'false',
      },
      data: unit,
    });

    if (!response.ok()) {
      throw new Error(
        `Failed to create unit: ${response.status()} ${await response.text()}`
      );
    }

    // POST /api/space/{spaceId}/unit returns UnitCreateOrUpdateResponseRead
    // now (config Data and MutationSources split into their own APIs — see
    // rollout-fixture.ts's file header point 2 for the sibling ChangeOrder
    // change from the same migration), so the created Unit is under `.Unit`,
    // not the response body itself.
    const body = await response.json();
    const createdUnit = body?.Unit;
    if (!createdUnit?.UnitID) {
      throw new Error('Invalid response: missing Unit.UnitID in created unit');
    }

    return createdUnit as UnitRead;
  }

  /**
   * Write a Unit's configuration (PUT /api/space/{spaceId}/unit/{unitId}/data).
   *
   * `Data` is no longer a patchable Unit attribute — config Data and
   * MutationSources moved to their own APIs (#5140). This is the write side
   * of that split; `body` is the raw configuration text, not base64 — the old
   * `PATCH { Data: base64(...) }` embedded Data as a JSON field value, which
   * needed base64, but this endpoint's body IS the configuration, so it does
   * not.
   */
  async uploadUnitData({
    spaceId,
    unitId,
    body,
    changeSetId,
    protect,
  }: {
    spaceId: string;
    unitId: string;
    body: string;
    changeSetId?: string;
    /** Record the paths this write touches as protected local overrides. */
    protect?: boolean;
  }): Promise<void> {
    const response = await hubApi.put(
      `/api/space/${spaceId}/unit/${unitId}/data`,
      {
        params: {
          ...(changeSetId ? { change_set_id: changeSetId } : {}),
          ...(protect !== undefined ? { protect: String(protect) } : {}),
        },
        data: body,
      }
    );

    if (!response.ok()) {
      throw new Error(
        `Failed to upload unit data: ${response.status()} ${await response.text()}`
      );
    }
  }

  /**
   * Delete a unit.
   * @param spaceId - The Space the unit lives in
   * @param unitId - The unique identifier for the unit to delete
   * @param options.detach - Delete the Links other Units hold to this one along
   *   with it. Without it the server refuses to delete a Unit anything links to.
   * @returns Promise that resolves when the unit is deleted
   * @throws Error if the request fails
   */
  async deleteUnit(spaceId: string, unitId: string, options: { detach?: boolean } = {}): Promise<void> {
    // Space-scoped, because that is the only route the server registers for a
    // single Unit (`specificSpace`'s CREUPDL group in routes.go). `/api/unit/
    // <id>` matches no route at all and answers 404 — a status this helper
    // then reports as a delete failure rather than as a wrong URL.
    const response = await hubApi.delete(`/api/space/${spaceId}/unit/${unitId}`, {
      params: options.detach ? { detach: 'true' } : undefined,
    });

    if (!response.ok()) {
      throw new Error(
        `Failed to delete unit: ${response.status()} ${await response.text()}`
      );
    }

    return response.json();
  }

  /**
   * Create a link via API. Links are created in the downstream (FromUnitID)
   * unit's Space.
   * @param params - Object containing spaceId (the downstream unit's Space) and link data
   * @returns Promise resolving to the created LinkRead object
   * @throws Error if the request fails or response is invalid
   */
  async createLink({
    spaceId,
    link,
  }: {
    spaceId: string;
    link: Link;
  }): Promise<LinkRead> {
    const response = await hubApi.post(`/api/space/${spaceId}/link`, {
      data: link,
    });

    if (!response.ok()) {
      throw new Error(
        `Failed to create link: ${response.status()} ${await response.text()}`
      );
    }

    const createdLink = await response.json();
    if (!createdLink?.LinkID) {
      throw new Error('Invalid response: missing LinkID in created link');
    }

    return createdLink as LinkRead;
  }

  /**
   * List all available spaces
   * @returns Promise resolving to an array of Space objects
   * @throws Error if the request fails
   */
  async listSpaces(): Promise<Array<{ Space: { SpaceID: string; Slug: string } }>> {
    const response = await hubApi.get('/api/space');

    if (!response.ok()) {
      throw new Error(
        `Failed to list spaces: ${response.status()} ${await response.text()}`
      );
    }

    return response.json();
  }

  /**
   * Get a space by slug
   * @param slug - The slug identifier for the space
   * @returns Promise resolving to the Space object
   * @throws Error if the space is not found
   */
  async getSpaceBySlug(slug: string): Promise<{ SpaceID: string; Slug: string }> {
    const spaces = await this.listSpaces();
    const space = spaces.find(
      (s: { Space?: { Slug?: string } }) => s.Space?.Slug === slug
    );

    if (!space || !space.Space) {
      throw new Error(`Space with slug ${slug} not found`);
    }

    return space.Space;
  }

  /**
   * Create a component, or return the existing one with the same slug
   * @param slug - The slug identifier for the component
   * @returns Promise resolving to the Component object
   * @throws Error if the request fails
   */
  async createComponent(slug: string): Promise<ComponentRead> {
    const response = await hubApi.post('/api/component', {
      params: { allow_exists: 'true' },
      data: { Slug: slug, DisplayName: slug },
    });
    if (!response.ok()) {
      throw new Error(`Failed to create component: ${response.status()} ${await response.text()}`);
    }
    const component = (await response.json()) as ComponentRead;
    if (!component?.ComponentID) {
      throw new Error(`Create component ${slug} returned no ComponentID`);
    }
    return component;
  }

  /**
   * Get a component by slug
   * @param slug - The slug identifier for the component
   * @returns Promise resolving to the Component object
   * @throws Error if the component is not found
   */
  async getComponentBySlug(slug: string): Promise<ComponentRead> {
    const response = await hubApi.get('/api/component', {
      params: { where: `Slug = '${slug}'` },
    });
    if (!response.ok()) {
      throw new Error(`Failed to list components: ${response.status()} ${await response.text()}`);
    }
    const components = (await response.json()) as ExtendedComponentRead[];
    const component = components.find((c) => c.Component?.Slug === slug)?.Component;
    if (!component) {
      throw new Error(`Component with slug ${slug} not found`);
    }
    return component;
  }

  /**
   * Get the first available space
   * @returns The first space in the list
   * @throws Error if no spaces are available
   */
  async getFirstSpace(): Promise<{ SpaceID: string; Slug: string }> {
    const spaces = await this.listSpaces();
    if (!spaces || spaces.length === 0) {
      throw new Error('No spaces available');
    }

    if (!spaces[0].Space?.SpaceID) {
      throw new Error('Invalid space response: missing SpaceID');
    }

    return spaces[0].Space as { SpaceID: string; Slug: string };
  }

  /**
   * Helper: Update a unit by slug (combines getUnitBySlug + updateUnit)
   * @param params - Object containing slug, unit data, and other update parameters
   * @returns Promise resolving to the update response
   * @throws Error if the unit is not found or update fails
   */
  async updateUnitBySlug({
    slug,
    unit,
    ...otherArgs
  }: Omit<UpdateUnitApiArg, 'spaceId' | 'unitId'> & { slug: string }) {
    // Get the unit to find its ID and SpaceID
    const existingUnit = await this.getUnitBySlug(slug);

    // Update the unit
    return this.updateUnit({
      spaceId: existingUnit.SpaceID ?? '',
      unitId: existingUnit.UnitID ?? '',
      unit,
      ...otherArgs,
    });
  }

  /**
   * Set a unit's protection directly (POST /api/space/{spaceId}/unit/{unitId}/protection),
   * the SAME endpoint the lock-interaction UI's kebab/commit flow calls
   * (`useSetUnitProtectionMutation`). Distinct from `protectPath`: that helper
   * protects whatever paths a VALUE write touches, which cannot represent
   * "already protected, currently unmodified" — the state a committed
   * `Keep on merge` leaves a row in. Use this to seed a path as protected
   * WITHOUT also changing its value, so a test can assert the kebab renders
   * `Let merges update this` on page load with no staged interaction at all.
   */
  async setUnitProtection(
    spaceId: string,
    unitId: string,
    resourceProtection: ResourceProtection[],
  ): Promise<UnitProtectionResponse> {
    const response = await hubApi.post(
      `/api/space/${spaceId}/unit/${unitId}/protection`,
      { data: { ResourceProtection: resourceProtection } },
    );
    if (!response.ok()) {
      throw new Error(
        `Failed to set unit protection: ${response.status()} ${await response.text()}`
      );
    }
    return response.json();
  }

  /**
   * List all org-level functions (matches UI endpoint)
   * @returns Promise resolving to a map of toolchain types to function signatures
   * @throws Error if the request fails
   */
  async listOrgFunctions(): Promise<Record<string, Record<string, FunctionSignature>>> {
    const response = await hubApi.get('/api/function');

    if (!response.ok()) {
      throw new Error(
        `Failed to list functions: ${response.status()} ${await response.text()}`
      );
    }

    return await response.json();
  }

  /**
   * Process functions the same way the UI does - deduplicate across toolchains
   * @returns Array of deduplicated functions with their properties
   */
  private async processOrgFunctions(): Promise<Array<FunctionSignature>> {
    const functionMap = await this.listOrgFunctions();
    const grouped: Record<string, FunctionSignature> = {};

    // Flatten and deduplicate (matching UI logic)
    for (const toolchainFunctions of Object.values(functionMap)) {
      for (const func of Object.values(toolchainFunctions)) {
        const functionName = func.FunctionName;
        if (!functionName) continue;

        // If function already exists, we keep the first occurrence
        // The UI merges resourceTypes but for counting we just need uniqueness
        if (!grouped[functionName]) {
          grouped[functionName] = func;
        }
      }
    }

    return Object.values(grouped);
  }

  /**
   * Count total deduplicated functions (matches UI's total count)
   * @returns Total count of unique functions
   */
  async countTotalFunctions(): Promise<number> {
    const functions = await this.processOrgFunctions();
    return functions.length;
  }

  /**
   * Count functions matching a filter (matches UI's filtered count)
   * @param filter - Function to determine if a function should be counted
   * @returns Count of matching functions and total
   */
  async countFilteredFunctions(
    filter: (func: FunctionSignature) => boolean
  ): Promise<{ filtered: number; total: number }> {
    const functions = await this.processOrgFunctions();
    const filtered = functions.filter(filter).length;

    return { filtered, total: functions.length };
  }

  /**
   * List all filters
   * @param params - Optional filter parameters
   * @returns Promise resolving to an array of Filter objects
   */
  async listFilters(params?: {
    where?: string;
  }): Promise<Array<{ Filter: { FilterID: string; Name: string; Where?: string } }>> {
    const response = await hubApi.get('/api/filter', {
      params: params || {},
    });

    if (!response.ok()) {
      throw new Error(
        `Failed to list filters: ${response.status()} ${await response.text()}`
      );
    }

    return response.json();
  }

  /**
   * Delete a filter by ID
   * @param filterId - The unique identifier for the filter to delete
   * @returns Promise that resolves when the filter is deleted
   */
  async deleteFilter(filterId: string): Promise<void> {
    const response = await hubApi.delete(`/api/filter/${filterId}`);

    if (!response.ok()) {
      throw new Error(
        `Failed to delete filter: ${response.status()} ${await response.text()}`
      );
    }
  }

  /**
   * Create a space via API
   * @param params - Space data (Slug required, DisplayName and Labels optional) and allowExists flag
   * @returns Promise resolving to the created SpaceRead object
   * @throws Error if the request fails or response is invalid
   */
  async createSpace({
    space,
    allowExists = true,
  }: {
    space: Space;
    allowExists?: boolean;
  }): Promise<SpaceRead> {
    const response = await hubApi.post('/api/space', {
      params: {
        allow_exists: allowExists ? 'true' : 'false',
      },
      data: space,
    });

    if (!response.ok()) {
      throw new Error(
        `Failed to create space: ${response.status()} ${await response.text()}`
      );
    }

    const result = await response.json();

    if (!result?.SpaceID) {
      throw new Error('Invalid response: missing Space.SpaceID in created space');
    }

    return result as SpaceRead;
  }

  /**
   * Get a space by ID
   * @param spaceId - The unique identifier for the space
   * @returns Promise resolving to the SpaceRead object
   * @throws Error if the request fails
   */
  async getSpaceById(spaceId: string): Promise<SpaceRead> {
    const response = await hubApi.get(`/api/space/${spaceId}`);

    if (!response.ok()) {
      throw new Error(
        `Failed to get space: ${response.status()} ${await response.text()}`
      );
    }

    const result = await response.json();
    return (result.Space ?? result) as SpaceRead;
  }

  /**
   * Delete a space by ID
   * @param spaceId - The unique identifier for the space to delete
   * @param recursive - If true, recursively delete all entities within the space
   * @returns Promise that resolves when the space is deleted
   * @throws Error if the request fails
   */
  async deleteSpace(spaceId: string, recursive = false): Promise<void> {
    const response = await hubApi.delete(`/api/space/${spaceId}`, {
      params: {
        ...(recursive && { recursive: 'true' }),
      },
    });

    if (!response.ok()) {
      throw new Error(
        `Failed to delete space: ${response.status()} ${await response.text()}`
      );
    }
  }

  /**
   * Update a space via direct API call (PATCH /api/space/{spaceId}).
   * Used by the release flow to set ReleaseTargetID on a Space.
   * @param params - Object containing spaceId and the partial Space patch body
   * @returns Promise resolving to the updated SpaceRead object
   * @throws Error if the request fails
   */
  async updateSpace({
    spaceId,
    space,
  }: {
    spaceId: string;
    space: Partial<Space>;
  }): Promise<SpaceRead> {
    const response = await hubApi.patch(`/api/space/${spaceId}`, {
      headers: {
        'Content-Type': 'application/merge-patch+json',
      },
      data: space,
    });

    if (!response.ok()) {
      throw new Error(
        `Failed to update space: ${response.status()} ${await response.text()}`
      );
    }

    return response.json();
  }

  /**
   * Create a Target. A Space's ReleaseTargetID names one, and the Space's
   * Releases are published for it.
   * @param params - Object containing spaceId, slug, and optional allowExists flag
   * @returns Promise resolving to the created TargetRead object
   * @throws Error if the request fails or response is invalid
   */
  async createTarget({
    spaceId,
    slug,
    allowExists = true,
  }: {
    spaceId: string;
    slug: string;
    allowExists?: boolean;
  }): Promise<TargetRead> {
    const target: Partial<Target> = {
      Slug: slug,
    };

    const response = await hubApi.post(`/api/space/${spaceId}/target`, {
      params: {
        allow_exists: allowExists ? 'true' : 'false',
      },
      data: target,
    });

    if (!response.ok()) {
      throw new Error(
        `Failed to create target: ${response.status()} ${await response.text()}`
      );
    }

    const result = await response.json();
    if (!result?.TargetID) {
      throw new Error('Invalid response: missing TargetID in created target');
    }

    return result as TargetRead;
  }

  /**
   * Publish a Release for a Space (POST /api/space/{spaceId}/release) —
   * mirrors the UI's usePublishReleaseMutation. Freezes the Space's head
   * config (for Units assigned to the release Target) into an immutable
   * OCI bundle. Requires the Space to already have ReleaseTargetID set to
   * a Target (see updateSpace + createTarget).
   * @param params - Object containing spaceId and an optional publish request body (defaults to {} — head, no TagID)
   * @returns Promise resolving to the created ReleaseRead object
   * @throws Error if the request fails
   */
  async publishRelease({
    spaceId,
    releasePublishRequest = {},
  }: {
    spaceId: string;
    releasePublishRequest?: ReleasePublishRequest;
  }): Promise<ReleaseRead> {
    const response = await hubApi.post(`/api/space/${spaceId}/release`, {
      data: releasePublishRequest,
    });

    if (!response.ok()) {
      throw new Error(
        `Failed to publish release: ${response.status()} ${await response.text()}`
      );
    }

    return response.json();
  }

  /**
   * Withdraw (permanently delete) a Release
   * (DELETE /api/space/{spaceId}/release/{releaseId}) — mirrors the UI's
   * useWithdrawReleaseMutation. There is no "withdrawn" flag on ReleaseRead;
   * this is a hard delete and the entry disappears from listReleases.
   * @param params - Object containing spaceId and releaseId
   * @throws Error if the request fails
   */
  async withdrawRelease({
    spaceId,
    releaseId,
  }: {
    spaceId: string;
    releaseId: string;
  }): Promise<void> {
    const response = await hubApi.delete(
      `/api/space/${spaceId}/release/${releaseId}`
    );

    if (!response.ok()) {
      throw new Error(
        `Failed to withdraw release: ${response.status()} ${await response.text()}`
      );
    }
  }

  /**
   * List releases for a Space (GET /api/space/{spaceId}/release) — mirrors
   * the UI's useListExtendedReleasesQuery.
   * @param params - Object containing spaceId
   * @returns Promise resolving to an array of ExtendedReleaseRead objects
   * @throws Error if the request fails
   */
  async listReleases({ spaceId }: { spaceId: string }): Promise<ExtendedReleaseRead[]> {
    const response = await hubApi.get(`/api/space/${spaceId}/release`);

    if (!response.ok()) {
      throw new Error(
        `Failed to list releases: ${response.status()} ${await response.text()}`
      );
    }

    return response.json();
  }
  // ── ChangeOrder fixtures ────────────────────────────────────────────────
  //
  // A rollout is a ChangeOrder crossing Spaces, so a rollout fixture needs
  // three things the helpers above cannot make: a Filter that says WHERE the
  // change is headed, a ChangeSet that names it, and the ChangeOrder itself.
  //
  // Scope matters more than it looks. `ChangeOrder.SpaceFilterID` is what
  // selects the Spaces the change propagates into; without it the ChangeOrder
  // "names a change without saying where it is headed" and its derived
  // `ResolvedSpaceIDs` never grows past the Space it lives in — which reads,
  // wrongly, as a rollout that never moves. Every rollout fixture therefore
  // creates a Space Filter over the component label first.

  /**
   * Create a Filter (POST /api/space/{spaceId}/filter).
   *
   * For rollout fixtures this is a Filter over Spaces — `From: 'Space'` with a
   * `Where` that matches the fixture's Component label — which is then handed
   * to `createChangeOrder` as its `SpaceFilterID`.
   * @param params - Object containing spaceId, the Filter body, and allowExists
   * @returns Promise resolving to the created FilterRead object
   * @throws Error if the request fails
   */
  async createFilter({
    spaceId,
    filter,
    allowExists = true,
  }: {
    spaceId: string;
    filter: Filter;
    allowExists?: boolean;
  }): Promise<FilterRead> {
    const response = await hubApi.post(`/api/space/${spaceId}/filter`, {
      params: { allow_exists: allowExists ? 'true' : 'false' },
      data: filter,
    });

    if (!response.ok()) {
      throw new Error(
        `Failed to create filter: ${response.status()} ${await response.text()}`
      );
    }

    const result = await response.json();
    if (!result?.FilterID) {
      throw new Error('Invalid response: missing FilterID in created filter');
    }

    return result as FilterRead;
  }

  /**
   * List the Links in a Space (GET /api/space/{spaceId}/link).
   *
   * Read-only assertions need this: a view that claims to forbid editing has
   * to be checked against what reached the backend, not only against what the
   * DOM shows — a gesture that silently creates a Link while rendering no
   * dialog is exactly the failure worth catching.
   * @param spaceId - The Space whose Links to list
   * @returns Promise resolving to the raw Link entries
   * @throws Error if the request fails
   */
  async listLinksInSpace(spaceId: string): Promise<unknown[]> {
    const response = await hubApi.get(`/api/space/${spaceId}/link`);

    if (!response.ok()) {
      throw new Error(
        `Failed to list links: ${response.status()} ${await response.text()}`
      );
    }

    return response.json();
  }

  /**
   * Create a ChangeSet (POST /api/space/{spaceId}/change_set).
   *
   * Note the route segment is `change_set`, not `changeset` — `/api/changeset`
   * and `/api/changeorder` both 404.
   * @param params - Object containing spaceId, the ChangeSet body, and allowExists
   * @returns Promise resolving to the created ChangeSetRead object
   * @throws Error if the request fails
   */
  async createChangeSet({
    spaceId,
    changeSet,
    allowExists = true,
  }: {
    spaceId: string;
    changeSet: ChangeSet;
    allowExists?: boolean;
  }): Promise<ChangeSetRead> {
    const response = await hubApi.post(`/api/space/${spaceId}/change_set`, {
      params: { allow_exists: allowExists ? 'true' : 'false' },
      data: changeSet,
    });

    if (!response.ok()) {
      throw new Error(
        `Failed to create change set: ${response.status()} ${await response.text()}`
      );
    }

    const result = await response.json();
    if (!result?.ChangeSetID) {
      throw new Error('Invalid response: missing ChangeSetID in created change set');
    }

    return result as ChangeSetRead;
  }

  /**
   * Create a ChangeOrder (POST /api/space/{spaceId}/change_order).
   *
   * `EndTagID` is deliberately optional here: left unset, the server cuts a Tag
   * on the head Revision of every Unit in scope, which is exactly the boundary
   * a fixture wants and saves it from tagging each Unit by hand.
   * @param params - Object containing spaceId, the ChangeOrder body, and allowExists
   * @returns Promise resolving to the created ChangeOrderRead object
   * @throws Error if the request fails
   */
  async createChangeOrder({
    spaceId,
    changeOrder,
    allowExists = true,
  }: {
    spaceId: string;
    changeOrder: ChangeOrder;
    allowExists?: boolean;
  }): Promise<ChangeOrderRead> {
    const response = await hubApi.post(`/api/space/${spaceId}/change_order`, {
      params: { allow_exists: allowExists ? 'true' : 'false' },
      data: changeOrder,
    });

    if (!response.ok()) {
      throw new Error(
        `Failed to create change order: ${response.status()} ${await response.text()}`
      );
    }

    const result = await response.json();
    if (!result?.ChangeOrderID) {
      throw new Error('Invalid response: missing ChangeOrderID in created change order');
    }

    return result as ChangeOrderRead;
  }

  /**
   * Read a ChangeOrder (GET /api/space/{spaceId}/change_order/{changeOrderId}).
   *
   * `ResolvedSpaceIDs` (promoted) and `ReleasedSpaceIDs` (released) are derived
   * at READ time rather than stored, so this is the authoritative answer to
   * "how far has the rollout got" — and it is also why a spec must poll it with
   * `expect.poll` rather than read it once straight after a promote.
   *
   * The READ endpoints wrap the entity — `{"ChangeOrder": {...}}` — where POST
   * returns it bare. Reading `.ResolvedSpaceIDs` off the raw body therefore
   * yields `undefined` for every ChangeOrder, silently, which looks exactly
   * like a rollout that has not moved. This unwraps so callers cannot make
   * that mistake.
   * @param params - Object containing spaceId and changeOrderId
   * @returns Promise resolving to the unwrapped ChangeOrderRead object
   * @throws Error if the request fails
   */
  async getChangeOrder({
    spaceId,
    changeOrderId,
  }: {
    spaceId: string;
    changeOrderId: string;
  }): Promise<ChangeOrderRead> {
    const response = await hubApi.get(
      `/api/space/${spaceId}/change_order/${changeOrderId}`
    );

    if (!response.ok()) {
      throw new Error(
        `Failed to get change order: ${response.status()} ${await response.text()}`
      );
    }

    // The body is an ExtendedChangeOrderRead, whose `ChangeOrder` member is
    // the entity — and `ResolvedSpaceIDs` / `ReleasedSpaceIDs` are on THAT,
    // not on the wrapper.
    const body = (await response.json()) as ExtendedChangeOrderRead;
    if (!body?.ChangeOrder) {
      throw new Error(
        `Invalid response: missing ChangeOrder wrapper in ${JSON.stringify(body).slice(0, 200)}`
      );
    }

    return body.ChangeOrder;
  }

  /**
   * List the ChangeOrders in a Space (GET /api/space/{spaceId}/change_order).
   * @param params - Object containing spaceId and an optional where expression
   * @returns Promise resolving to an array of unwrapped ChangeOrderRead objects
   * @throws Error if the request fails
   */
  async listChangeOrders({
    spaceId,
    where,
  }: {
    spaceId: string;
    where?: string;
  }): Promise<ChangeOrderRead[]> {
    const response = await hubApi.get(`/api/space/${spaceId}/change_order`, {
      params: where ? { where } : {},
    });

    if (!response.ok()) {
      throw new Error(
        `Failed to list change orders: ${response.status()} ${await response.text()}`
      );
    }

    // Wrapped per element, as the single read is — see getChangeOrder.
    const body = (await response.json()) as ExtendedChangeOrderRead[];

    return body
      .map((entry) => entry.ChangeOrder)
      .filter((changeOrder): changeOrder is ChangeOrderRead => Boolean(changeOrder));
  }
}
