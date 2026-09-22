import { createOperatingRatioEntries, MANUAL_SEGMENT_TYPES, resolveManualSegmentType } from "./useComparisonTool";

describe("useComparisonTool manual segment routing", () => {
  it("initializes the operating/growth ratio manual segment type", () => {
    expect(MANUAL_SEGMENT_TYPES).toContain("operatingRatios");
  });

  it("routes operating ratio entries to the operating ratio segment", () => {
    expect(
      resolveManualSegmentType({
        xmlType: "operatingRatios",
        reportType: "financial",
        fullParsedData: [
          { term: "淨利率", code: "ratio:netMargin:actual", sourceType: "derived_ratio" },
        ],
      })
    ).toBe("operatingRatios");
  });

  it("keeps regular financial entries on their original report segment", () => {
    expect(
      resolveManualSegmentType({
        xmlType: "income",
        reportType: "financial",
        fullParsedData: [{ term: "營業收入", code: "41", sourceType: "xml" }],
      })
    ).toBe("income");

    expect(
      resolveManualSegmentType({
        xmlType: "balance",
        reportType: "financial",
        fullParsedData: [{ term: "權益", code: "3", sourceType: "xml" }],
      })
    ).toBe("balance");
  });

  it("creates a separate operating/growth ratio batch entry from derived rows", () => {
    const entries = createOperatingRatioEntries(
      [
        {
          fileId: 1,
          fileName: "損益表.xml",
          year: "113",
          availableLevels: ["甲"],
          error: null,
        },
      ],
      {
        113: [
          { term: "淨利率", code: "ratio:netMargin:actual", sourceType: "derived_ratio", amount: 44.01 },
          { term: "流動資產占資產總額之比率", code: "structure:asset", sourceType: "derived_ratio", amount: 10 },
        ],
      }
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      fileId: "operating-ratios-113",
      fileName: "經營/成長比率-113",
      xmlType: "operatingRatios",
      reportName: "經營/成長比率",
    });
    expect(entries[0].fullParsedData).toEqual([expect.objectContaining({ code: "ratio:netMargin:actual" })]);
  });
});
