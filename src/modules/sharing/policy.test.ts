import assert from "node:assert/strict";
import test from "node:test";
import { canGrantShare, permissionAllows, type FileAction, type ShareGrantContext, type SharePermission } from "./policy";

const context: ShareGrantContext = {
  actorId: "owner", ownerId: "owner", actorActive: true, actorRoleIds: ["role"],
  currentMemberships: [{ userId: "owner", groupId: "group" }, { userId: "recipient", groupId: "group" }],
  currentPolicies: [{ roleId: "role", groupId: "group" }],
};

test("permissions grant only their explicit action, including EDIT", () => {
  for (const permission of ["VIEW", "DOWNLOAD", "EDIT"] as const) {
    for (const action of ["view", "download", "edit"] as const) {
      assert.equal(permissionAllows(permission, action), permission.toLowerCase() === action);
    }
  }
  assert.equal(permissionAllows("ADMIN" as SharePermission, "download"), false);
  assert.equal(permissionAllows("VIEW", "delete" as FileAction), false);
});

test("owner can grant only within current role policy and shared membership", () => {
  assert.equal(canGrantShare(context, { userId: "recipient", active: true }, "VIEW"), true);
  assert.equal(canGrantShare(context, { groupId: "group" }, "DOWNLOAD"), true);
  for (const changed of [
    { actorId: "other" }, { actorActive: false }, { actorRoleIds: [] },
    { currentPolicies: [] }, { currentMemberships: [] },
    { currentMemberships: [{ userId: "recipient", groupId: "group" }] },
  ]) assert.equal(canGrantShare({ ...context, ...changed }, { userId: "recipient", active: true }, "VIEW"), false);
  assert.equal(canGrantShare(context, { userId: "recipient", active: false }, "VIEW"), false);
  assert.equal(canGrantShare(context, { userId: "outsider", active: true }, "EDIT"), false);
  assert.equal(canGrantShare(context, { groupId: "other" }, "VIEW"), false);
  assert.equal(canGrantShare(context, { userId: "owner", active: true }, "VIEW"), false);
  assert.equal(canGrantShare(context, { groupId: "group" }, "ADMIN" as SharePermission), false);
});

test("membership and policy revocation are respected by fresh snapshots", () => {
  const target = { userId: "recipient", active: true };
  assert.equal(canGrantShare(context, target, "VIEW"), true);
  assert.equal(canGrantShare({ ...context, currentMemberships: [{ userId: "owner", groupId: "group" }] }, target, "VIEW"), false);
  assert.equal(canGrantShare({ ...context, currentPolicies: [{ roleId: "another", groupId: "group" }] }, target, "VIEW"), false);
});
