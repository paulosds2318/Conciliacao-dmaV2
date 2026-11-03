import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { wasAutoApproved } from "./request-status.ts";

describe("wasAutoApproved", () => {
  it("é automática quando não houve decisão do administrador", () => {
    assert.equal(wasAutoApproved("2026-11-03T10:00:00Z", undefined), true);
  });
  it("é automática quando veio depois de uma recusa do administrador (reabertura)", () => {
    assert.equal(wasAutoApproved("2026-11-03T12:00:00Z", "2026-11-03T10:00:00Z"), true);
  });
  it("não é automática sem o evento de aprovação automática", () => {
    assert.equal(wasAutoApproved(null, "2026-11-03T10:00:00Z"), false);
    assert.equal(wasAutoApproved(undefined, undefined), false);
  });
  it("não é automática quando a decisão do administrador é mais recente", () => {
    assert.equal(wasAutoApproved("2026-11-03T10:00:00Z", "2026-11-03T12:00:00Z"), false);
  });
});
