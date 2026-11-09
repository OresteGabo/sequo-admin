# Administrator tiers

Support and Operations are combined into **Operations** (stored role ADMIN). **Staff manager** (STAFF_MANAGER) adds operational personnel onboarding and suspension. **Owner** (SUPER_ADMIN) alone manages administrator access and role assignments.

The UI labels and controls live in src/adminPermissions.ts. Account-role choices are limited by the actor's tier and self changes are disabled. The backend checks persisted authority and target eligibility independently; changing UI state never grants a permission.

The canonical guide and matrix are in the [API repository](https://github.com/OresteGabo/sequo-api/blob/main/docs/ADMIN_ROLES_AND_PERMISSIONS.md).

Validation:

    npm run test:permissions
    npm run build

Legacy SUPPORT_AGENT accounts remain read-only legacy identities and are not promoted automatically. Assign the combined Operations role explicitly through an Owner.

## Owner network management

Owners can add approved personnel in Users, edit display names, and open vendor, rider and hub profile controls directly from their existing lists. Vendor/rider registration and hub setup retain their existing forms. Account access includes explicit Suspend and Restore actions; profile removal archives operational records and preserves history. Active orders, rider missions, parcel custody and pending checkouts must be resolved first. New controls remain hidden from Operations and Staff managers.

Run `npm run test:owner-directory`, `npm run test:permissions`, and `npm run build` when changing these controls. Backend documentation: [Owner network management](https://github.com/OresteGabo/sequo-api/blob/main/docs/OWNER_NETWORK_MANAGEMENT.md).

## Partner onboarding and applications

Owners and Staff managers now add vendors, riders and hubs directly on their own pages. The single form creates or matches the account and registers the partner atomically. Applications from the public website appear in the same page’s Applications inbox, prefilled for approval or decline. Original details and reviewer corrections remain in history. Operations cannot access these review controls, and only Owners can appoint administrators.

Run `npm run test:partner-onboarding` with the existing permission/session checks. [Backend workflow guide](https://github.com/OresteGabo/sequo-api/blob/main/docs/PARTNER_ONBOARDING_AND_APPLICATIONS.md).
