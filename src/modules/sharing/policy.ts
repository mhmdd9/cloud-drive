export type SharePermission = "VIEW" | "DOWNLOAD" | "EDIT";
export type FileAction = "view" | "download" | "edit";

export function permissionAllows(permission: SharePermission, action: FileAction): boolean {
  switch (permission) {
    case "VIEW": return action === "view";
    case "DOWNLOAD": return action === "download";
    case "EDIT": return action === "edit";
    default: return false;
  }
}

export type Membership = { userId: string; groupId: string };
export type GroupPolicy = { groupId: string; roleId: string };
export type ShareGrantContext = {
  actorId: string;
  ownerId: string;
  actorActive: boolean;
  actorRoleIds: readonly string[];
  currentMemberships: readonly Membership[];
  currentPolicies: readonly GroupPolicy[];
};
export type ShareTarget = { userId: string; active: boolean } | { groupId: string };

export function canGrantShare(context: ShareGrantContext, target: ShareTarget, permission: SharePermission): boolean {
  if (!context.actorActive || context.actorId !== context.ownerId || !["VIEW", "DOWNLOAD", "EDIT"].includes(permission)) return false;
  if (("userId" in target) === ("groupId" in target)) return false;
  const allowedGroups = new Set(context.currentPolicies
    .filter((policy) => context.actorRoleIds.includes(policy.roleId))
    .map((policy) => policy.groupId));
  const actorGroups = new Set(context.currentMemberships
    .filter((membership) => membership.userId === context.actorId && allowedGroups.has(membership.groupId))
    .map((membership) => membership.groupId));
  if ("groupId" in target) return actorGroups.has(target.groupId);
  return target.active && target.userId !== context.actorId && context.currentMemberships.some((membership) =>
    membership.userId === target.userId && actorGroups.has(membership.groupId));
}
