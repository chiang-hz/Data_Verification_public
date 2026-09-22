import {
  buildNormalizedBalanceStructureComparisonRows,
  buildDerivedComparisonRows,
  buildDerivedComparisonRowsForYear,
  buildFinancialRatioCalculationPayload,
} from "./financialRatioDerivedRows";
import { buildDerivedIncomeStatementRows, parseComparisonXml } from "./xmlUtils";
import { detectXmlReportType } from "../contexts/FileManagerContext";

const fs = require("fs");
const path = require("path");

describe("financialRatioDerivedRows", () => {
  const completeBalanceData = {
    assets: 1000,
    liabilities: 400,
    currentAssets: 500,
    currentLiabilities: 250,
    deposits: 150,
    bankDeposits: 100,
    postalSavingsDeposits: 50,
    equity: 600,
    currentAssetsTotal: 1000,
    previousAssets: 800,
    currentEquity: 600,
    previousEquity: 500,
    capital: 200,
  };

  const completeIncomeData = {
    operatingRevenue: 300,
    profitBeforeTax: 180,
    netIncome_Actual: 120,
    operatingProfit_Actual: 90,
    revenue_Actual: 300,
    revenue_Budget: 250,
    revenue_Previous: 260,
    interestIncome_Actual: 70,
    interestIncome_Budget: 65,
    interestIncome_Previous: 60,
    fvtplGain_Actual: 5,
    fvtplGain_Budget: 4,
    fvtplGain_Previous: 3,
    fxGain_Actual: 2,
    fxGain_Budget: 1,
    fxGain_Previous: 1,
    trustGainLoss_Actual: 3,
    trustGainLoss_Budget: 2,
    trustGainLoss_Previous: 1,
    investmentGainLoss_Actual: 4,
    investmentGainLoss_Budget: 3,
    investmentGainLoss_Previous: 2,
    interestExpense_Actual: 20,
    interestExpense_Budget: 25,
    interestExpense_Previous: 30,
    netIncome_Budget: 100,
    netIncome_Previous: 90,
  };

  it("builds derived ratio rows from XML-calculable inputs only", () => {
    const rows = buildDerivedComparisonRowsForYear({
      balanceData: completeBalanceData,
      incomeData: completeIncomeData,
      level: "L1",
    });

    const byCode = Object.fromEntries(rows.map((row) => [row.code, row]));

    expect(byCode["ratio:debtAssetRatio:actual"]).toMatchObject({
      sourceType: "derived_ratio",
      preferredMetricKey: "amount",
      strictMatchOnly: true,
      level: "L1",
      amount: 40,
    });
    expect(byCode["ratio:currentRatio:actual"]).toMatchObject({
      amount: 200,
    });
    expect(byCode["ratio:totalAssetTurnover:actual"]).toMatchObject({
      amount: 0.3,
    });
    expect(byCode["ratio:eps:actual"]).toMatchObject({
      amount: 6,
    });
    expect(byCode["ratio:fundYieldToCost:actual"]).toMatchObject({
      amount: 420,
    });

    const codes = rows.map((row) => row.code);
    expect(codes).not.toContain("ratio:interestExpenseRatio:actual");
    expect(codes).not.toContain("ratio:employeeAverageRevenue:actual");
    expect(codes).not.toContain("ratio:employeeAverageProfit:actual");
    expect(codes).not.toContain("ratio:cashFlowRatio:actual");
  });

  it("skips rows whose required XML inputs are incomplete", () => {
    const rows = buildDerivedComparisonRowsForYear({
      balanceData: {
        ...completeBalanceData,
        capital: null,
        previousAssets: null,
        previousEquity: null,
      },
      incomeData: completeIncomeData,
    });

    const codes = rows.map((row) => row.code);

    expect(codes).not.toContain("ratio:eps:actual");
    expect(codes).not.toContain("ratio:roa:actual");
    expect(codes).not.toContain("ratio:roe:actual");
    expect(codes).toContain("ratio:debtAssetRatio:actual");
  });

  it("keeps actual, budget, and previous fund-yield variants distinct", () => {
    const payload = buildFinancialRatioCalculationPayload({
      balanceData: completeBalanceData,
      incomeData: completeIncomeData,
    });
    const rows = buildDerivedComparisonRowsForYear({
      balanceData: completeBalanceData,
      incomeData: completeIncomeData,
    });

    const fundYieldRows = rows.filter((row) => row.code.startsWith("ratio:fundYieldToCost:"));

    expect(payload.rawRatiosApp2.fundYieldToCost_Actual).not.toBeNull();
    expect(payload.rawRatiosApp2.fundYieldToCost_Budget).not.toBeNull();
    expect(payload.rawRatiosApp2.fundYieldToCost_Previous).not.toBeNull();
    expect(fundYieldRows).toHaveLength(3);
    expect(new Set(fundYieldRows.map((row) => row.code)).size).toBe(3);
    expect(new Set(fundYieldRows.map((row) => row.term)).size).toBe(3);
  });

  it("builds operating and growth ratio rows with manual ROE comparison inputs", () => {
    const rows = buildDerivedComparisonRowsForYear({
      balanceData: completeBalanceData,
      incomeData: completeIncomeData,
      manualRatioInputs: {
        roeBudget: "13.79",
        roePrevious: "18.57%",
      },
    });

    const byCode = Object.fromEntries(rows.map((row) => [row.code, row]));

    expect(byCode["ratio:netMargin:actual"]).toMatchObject({
      amount: 40,
      directionComparisons: expect.arrayContaining([
        expect.objectContaining({ label: "本年度預算", rightValue: 40 }),
        expect.objectContaining({ label: "上年度決算", rightValue: 34.62 }),
      ]),
    });
    expect(byCode["ratio:roe:actual"]).toMatchObject({
      amount: 21.82,
      directionComparisons: expect.arrayContaining([
        expect.objectContaining({ label: "本年度預算", rightValue: 13.79 }),
        expect.objectContaining({ label: "上年度決算", rightValue: 18.57 }),
      ]),
    });
    expect(byCode["ratio:revenueGrowth:actual"]).toMatchObject({
      amount: 15.38,
      directionComparisons: expect.arrayContaining([
        expect.objectContaining({ label: "上年度決算數", rightValue: 260, valueUnit: "amount" }),
      ]),
    });
    expect(byCode["ratio:equityGrowth:actual"]).toMatchObject({
      amount: 20,
    });
  });

  it("builds operating and growth ratio rows from the local income and balance XML fixtures", () => {
    const incomeXml = fs.readFileSync(path.join(process.cwd(), "損益表.xml"), "utf8");
    const balanceXml = fs.readFileSync(path.join(process.cwd(), "資產負債表.xml"), "utf8");
    const entries = [
      {
        id: 1,
        fileName: "損益表.xml",
        rawContent: incomeXml,
        detectedType: "income",
      },
      {
        id: 2,
        fileName: "資產負債表.xml",
        rawContent: balanceXml,
        detectedType: "balance",
      },
    ];
    const rowsByYear = buildDerivedComparisonRows(entries, {
      113: {
        roeBudget: "13.79",
        roePrevious: "18.57",
      },
    });
    const rows = Object.values(rowsByYear).flat();
    const byCode = Object.fromEntries(rows.map((row) => [row.code, row]));

    expect(byCode["ratio:netMargin:actual"]).toMatchObject({ amount: 44.01 });
    expect(byCode["ratio:netMargin:actual"].supportAmounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "本年度決算淨利", value: 253349225860 }),
        expect.objectContaining({ label: "營業收入", value: 575723811549 }),
      ])
    );
    expect(byCode["ratio:roe:actual"]).toMatchObject({
      amount: 19.07,
      supportAmounts: expect.arrayContaining([
        expect.objectContaining({ label: "本年度決算淨利", value: 253349225860 }),
        expect.objectContaining({ label: "平均權益", value: 1328837083535.5 }),
      ]),
      directionComparisons: expect.arrayContaining([
        expect.objectContaining({ label: "本年度預算", rightValue: 13.79 }),
        expect.objectContaining({ label: "上年度決算", rightValue: 18.57 }),
      ]),
    });
    expect(byCode["ratio:fundYieldToCost:actual"]).toMatchObject({
      amount: 349.53,
      supportAmounts: expect.arrayContaining([
        expect.objectContaining({ label: "本年度決算資金收益", value: 575134397639 }),
        expect.objectContaining({ label: "利息費用", value: 164545772050 }),
      ]),
    });
    expect(byCode["ratio:revenueGrowth:actual"]).toMatchObject({
      amount: 2.74,
      supportAmounts: expect.arrayContaining([
        expect.objectContaining({ label: "本年度決算營業收入", value: 575723811549 }),
        expect.objectContaining({ label: "上年度決算數", value: 560352407307 }),
      ]),
    });
    expect(byCode["ratio:equityGrowth:actual"]).toMatchObject({
      amount: 4.09,
      supportAmounts: expect.arrayContaining([
        expect.objectContaining({ label: "本年度決算權益", value: 1355456547315 }),
        expect.objectContaining({ label: "上年度決算數", value: 1302217619756 }),
      ]),
    });
  });

  it("builds balance-sheet structure ratio rows for asset and liability-equity phrases", () => {
    const rows = buildNormalizedBalanceStructureComparisonRows([
      { code: "1", name: "\u8cc7\u7522", current: 1000 },
      { code: "11", name: "\u6d41\u52d5\u8cc7\u7522", current: 250 },
      { code: "2", name: "\u8ca0\u50b5", current: 400 },
      { code: "21", name: "\u6d41\u52d5\u8ca0\u50b5", current: 120 },
      { code: "3", name: "\u6b0a\u76ca", current: 600 },
      { code: "31", name: "\u8cc7\u672c", current: 200 },
    ]);

    const byTerm = Object.fromEntries(rows.map((row) => [row.term, row]));

    expect(byTerm["\u6d41\u52d5\u8cc7\u7522\u5360\u8cc7\u7522\u7e3d\u984d\u4e4b\u6bd4\u7387"]).toMatchObject({
      sourceType: "derived_ratio",
      strictMatchOnly: true,
      displayUnit: "percent",
      amount: 25,
      aliases: expect.arrayContaining([
        "\u6d41\u52d5\u8cc7\u7522\u5360\u8cc7\u7522\u7e3d\u984d\u4e4b",
        "\u6d41\u52d5\u8cc7\u7522\u5360\u8cc7\u7522\u7e3d\u984d",
      ]),
    });
    expect(byTerm["\u6d41\u52d5\u8ca0\u50b5\u5360\u8ca0\u50b5\u53ca\u6b0a\u76ca\u7e3d\u984d\u4e4b\u6bd4\u7387"]).toMatchObject({
      amount: 12,
    });
    expect(byTerm["\u8cc7\u672c\u5360\u8ca0\u50b5\u53ca\u6b0a\u76ca\u7e3d\u984d\u4e4b\u6bd4\u7387"]).toMatchObject({
      amount: 20,
    });
    expect(byTerm["\u8ca0\u50b5\u5360\u8ca0\u50b5\u53ca\u6b0a\u76ca\u7e3d\u984d\u4e4b\u6bd4\u7387"]).toMatchObject({
      aliases: expect.arrayContaining([
        "\u8ca0\u50b5\u7e3d\u984d\u5360\u8ca0\u50b5\u53ca\u6b0a\u76ca\u7e3d\u984d\u4e4b\u6bd4\u7387",
        "\u8ca0\u50b5\u7e3d\u984d\u5360\u8ca0\u50b5\u53ca\u6b0a\u76ca\u7e3d\u984d\u4e4b",
        "\u8ca0\u50b5\u7e3d\u984d\u5360\u8ca0\u50b5\u53ca\u6b0a\u76ca\u7e3d\u984d",
      ]),
    });
  });

  it("builds balance-sheet structure ratio rows from parsed comparison rows", () => {
    const rows = buildNormalizedBalanceStructureComparisonRows([
      { code: "1", term: "\u8cc7\u7522", amount: 1000 },
      { code: "11", term: "\u6d41\u52d5\u8cc7\u7522", amount: 250 },
      { code: "2", term: "\u8ca0\u50b5", amount: 400 },
      { code: "21", term: "\u6d41\u52d5\u8ca0\u50b5", amount: 120 },
      { code: "3", term: "\u6b0a\u76ca", amount: 600 },
    ]);

    const byTerm = Object.fromEntries(rows.map((row) => [row.term, row]));

    expect(byTerm["\u6d41\u52d5\u8cc7\u7522\u5360\u8cc7\u7522\u7e3d\u984d\u4e4b\u6bd4\u7387"]).toMatchObject({
      amount: 25,
      sourceType: "derived_ratio",
    });
    expect(byTerm["\u6d41\u52d5\u8ca0\u50b5\u5360\u8ca0\u50b5\u53ca\u6b0a\u76ca\u7e3d\u984d\u4e4b\u6bd4\u7387"]).toMatchObject({
      amount: 12,
    });
  });

  it("adds retained-earnings structure-ratio aliases for accumulated-loss wording", () => {
    const rows = buildNormalizedBalanceStructureComparisonRows([
      { code: "2", term: "\u8ca0\u50b5", amount: 400 },
      { code: "3", term: "\u6b0a\u76ca", amount: 600 },
      { code: "33", term: "\u4fdd\u7559\u76c8\u9918", amount: 80 },
    ]);

    const retainedEarningsRow = rows.find(
      (row) => row.term === "\u4fdd\u7559\u76c8\u9918\u5360\u8ca0\u50b5\u53ca\u6b0a\u76ca\u7e3d\u984d\u4e4b\u6bd4\u7387"
    );

    expect(retainedEarningsRow).toBeTruthy();
    expect(retainedEarningsRow.aliases).toEqual(
      expect.arrayContaining([
        "\u4fdd\u7559\u76c8\u9918\uff08\u6216\u7d2f\u7a4d\u8667\u640d\uff09\u5360\u8ca0\u50b5\u53ca\u6b0a\u76ca\u7e3d\u984d\u4e4b\u6bd4\u7387",
        "\u4fdd\u7559\u76c8\u9918\uff08\u6216\u7d2f\u7a4d\u8667\u640d\uff09\u5360\u8ca0\u50b5\u53ca\u6b0a\u76ca\u7e3d\u984d\u4e4b",
        "\u4fdd\u7559\u76c8\u9918\uff08\u6216\u7d2f\u7a4d\u8667\u640d\uff09\u5360\u8ca0\u50b5\u53ca\u6b0a\u76ca\u7e3d\u984d",
      ])
    );
  });

  it("builds separate income-statement expense summary rows with and without tax", () => {
    const fullData = [
      { term: "營業成本", code: "51", amount: 100, deltaAmount: 10, sourceOrder: 3, level: "L1" },
      { term: "營業費用", code: "52", amount: 20, deltaAmount: 2, sourceOrder: 4, level: "L1" },
      { term: "營業外費用", code: "59", amount: 3, deltaAmount: 1, sourceOrder: 5, level: "L1" },
      { term: "所得稅費用(利益)", code: "65", amount: 7, deltaAmount: 2, sourceOrder: 6, level: "L1" },
    ];

    buildDerivedIncomeStatementRows(fullData);

    const byTerm = Object.fromEntries(fullData.map((row) => [row.term, row]));

    expect(byTerm["營業及營業外支出決算數總計"]).toMatchObject({
      code: "51+52+59",
      amount: 123,
      deltaAmount: 13,
      deltaPercent: 11.82,
      level: "L1",
    });
    expect(byTerm["營業及營業外支出暨所得稅費用決算數總計"]).toMatchObject({
      code: "51+52+59+65",
      amount: 130,
      deltaAmount: 15,
      deltaPercent: 13.04,
      level: "L1",
    });
  });

  it("detects the real balance-sheet XML as balance and builds the current-assets structure ratio row", () => {
    const xmlPath = path.join(process.cwd(), "\u8cc7\u7522\u8ca0\u50b5\u8868.xml");
    const xmlString = fs.readFileSync(xmlPath, "utf8");

    expect(detectXmlReportType(xmlString)).toBe("balance");

    const { fullData } = parseComparisonXml(xmlString);
    const structureRows = buildNormalizedBalanceStructureComparisonRows(fullData);
    const byTerm = Object.fromEntries(structureRows.map((row) => [row.term, row]));
    const currentAssetsRow = fullData.find((row) => row.term === "\u6d41\u52d5\u8cc7\u7522");

    expect(currentAssetsRow).toBeTruthy();
    expect(byTerm["\u6d41\u52d5\u8cc7\u7522\u5360\u8cc7\u7522\u7e3d\u984d\u4e4b\u6bd4\u7387"]).toMatchObject({
      amount: 10.93,
      sourceType: "derived_ratio",
      level: currentAssetsRow.level,
      strictMatchOnly: true,
      preferredMetricKey: "amount",
      aliases: expect.arrayContaining([
        "\u6d41\u52d5\u8cc7\u7522\u5360\u8cc7\u7522\u7e3d\u984d\u4e4b",
        "\u6d41\u52d5\u8cc7\u7522\u5360\u8cc7\u7522\u7e3d\u984d",
      ]),
    });
  });
});

