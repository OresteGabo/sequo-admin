# Administrator tiers

Support and Operations are combined into **Operations** (stored role ADMIN). **Staff manager** (STAFF_MANAGER) adds operational personnel onboarding and suspension. **Owner** (SUPER_ADMIN) alone manages administrator access and role assignments.

The UI labels and controls live in src/adminPermissions.ts. Account-role choices are limited by the actor's tier and self changes are disabled. The backend checks persisted authority and target eligibility independently; changing UI state never grants a permission.

The canonical guide and matrix are in the [API repository](https://github.com/OresteGabo/sequo-api/blob/main/docs/ADMIN_ROLES_AND_PERMISSIONS.md).

Validation:

    npm run test:permissions
    npm run build

Legacy SUPPORT_AGENT accounts remain read-only legacy identities and are not promoted automatically. Assign the combined Operations role explicitly through an Owner.
