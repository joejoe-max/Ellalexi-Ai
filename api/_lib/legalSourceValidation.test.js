import { describe, expect, it } from "vitest";
import { enforceLegalCurrentness } from "./legalSourceValidation.js";

describe("legal currentness guard", () => {
  it("downgrades current-law claims when retrieved source metadata does not verify currentness", () => {
    const result = enforceLegalCurrentness({
      status: "verified_sources_found",
      findings: [{
        effectiveStatus: "currentness_verified",
        confidence: "high",
        caveat: "Check the contract.",
        citations: [{ sourceStatus: "Live web result; legal effect/currentness not independently established" }]
      }],
      limitations: []
    });
    expect(result.findings[0].effectiveStatus).toBe("unclear");
    expect(result.findings[0].confidence).toBe("moderate");
    expect(result.status).toBe("insufficient_sources");
    expect(result.limitations).toHaveLength(1);
  });

  it("preserves a currentness claim only when every cited source is explicitly verified", () => {
    const result = enforceLegalCurrentness({
      status: "verified_sources_found",
      findings: [{
        effectiveStatus: "currentness_verified",
        confidence: "high",
        citations: [{ currentnessVerified: true }, { currentnessVerified: true }]
      }],
      limitations: []
    });
    expect(result.findings[0].effectiveStatus).toBe("currentness_verified");
    expect(result.status).toBe("verified_sources_found");
  });

  it("marks historical-only citations as historical rather than current", () => {
    const result = enforceLegalCurrentness({
      status: "verified_sources_found",
      findings: [{
        effectiveStatus: "currentness_verified",
        confidence: "moderate",
        citations: [{ sourceStatus: "Historical repository copy; currentness and legal effect are not verified." }]
      }],
      limitations: []
    });
    expect(result.findings[0].effectiveStatus).toBe("historical_or_unverified");
  });
});
