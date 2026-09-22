import { ACCOUNT_CODES } from "../constants/financialConstants";

const TERM_TAGS = ["科目名稱", "會計科目", "會計科目名稱", "名稱"];
const CODE_TAGS = ["科目編號", "科目代碼", "會計科目代碼", "會計科目-代碼", "ACCT_CODE", "ACCOUNT_CODE", "CODE"];
const CURRENT_VALUE_TAGS = ["本年度決算數", "數值", "金額"];
const BUDGET_VALUE_TAGS = ["本年度預算數"];
const PREVIOUS_VALUE_TAGS = ["上年度決算數"];
const YEAR_TAGS = ["年度", "Year", "YEAR"];

const DEFAULT_LEVEL = "財務比率";

const APP1_RATIO_DEFINITIONS = [
  {
    key: "debtAssetRatio",
    term: "負債占資產比率",
    aliases: ["負債比率"],
    code: "ratio:debtAssetRatio:actual",
    displayUnit: "percent",
    displayDecimals: 2,
    transform: (value) => value * 100,
  },
  {
    key: "depositEquityRatio",
    term: "存款占權益比率",
    aliases: ["存款對權益比率"],
    code: "ratio:depositEquityRatio:actual",
    displayUnit: "percent",
    displayDecimals: 2,
  },
  {
    key: "currentRatio",
    term: "流動比率",
    aliases: [],
    code: "ratio:currentRatio:actual",
    displayUnit: "percent",
    displayDecimals: 2,
    transform: (value) => value * 100,
  },
  {
    key: "interestCoverageRatio",
    term: "利息保障倍數",
    aliases: [],
    code: "ratio:interestCoverageRatio:actual",
    displayUnit: "percent",
    displayDecimals: 2,
  },
  {
    key: "totalAssetTurnover",
    term: "總資產週轉率",
    aliases: ["資產週轉率"],
    code: "ratio:totalAssetTurnover:actual",
    displayUnit: "times",
    displayDecimals: 4,
  },
];

const APP2_RATIO_DEFINITIONS = [
  {
    key: "operatingMargin",
    term: "營業利益率",
    aliases: ["營益率"],
    code: "ratio:operatingMargin:actual",
    displayUnit: "percent",
    displayDecimals: 2,
    transform: (value) => value * 100,
  },
  {
    key: "netMargin",
    term: "純益率",
    aliases: ["淨利率", "本年度決算淨利率"],
    code: "ratio:netMargin:actual",
    displayUnit: "percent",
    displayDecimals: 2,
    transform: (value) => value * 100,
  },
  {
    key: "eps",
    term: "每股盈餘（EPS）",
    aliases: ["每股盈餘", "EPS"],
    code: "ratio:eps:actual",
    displayUnit: "number",
    displayDecimals: 2,
  },
  {
    key: "roa",
    term: "總資產報酬率（ROA）",
    aliases: ["ROA", "資產報酬率"],
    code: "ratio:roa:actual",
    displayUnit: "percent",
    displayDecimals: 2,
    transform: (value) => value * 100,
  },
  {
    key: "roe",
    term: "權益報酬率（ROE）",
    aliases: ["權益報酬率", "ROE", "股東權益報酬率"],
    code: "ratio:roe:actual",
    displayUnit: "percent",
    displayDecimals: 2,
    transform: (value) => value * 100,
  },
  {
    key: "fundYieldToCost_Actual",
    term: "資金收益對資金成本比率（決算）",
    aliases: ["資金收益對資金成本比率", "決算資金收益對資金成本比率", "其比率"],
    code: "ratio:fundYieldToCost:actual",
    displayUnit: "percent",
    displayDecimals: 2,
    transform: (value) => value * 100,
  },
  {
    key: "fundYieldToCost_Budget",
    term: "資金收益對資金成本比率（預算）",
    aliases: ["預算資金收益對資金成本比率"],
    code: "ratio:fundYieldToCost:budget",
    displayUnit: "percent",
    displayDecimals: 2,
    transform: (value) => value * 100,
  },
  {
    key: "fundYieldToCost_Previous",
    term: "資金收益對資金成本比率（上年）",
    aliases: ["上年資金收益對資金成本比率"],
    code: "ratio:fundYieldToCost:previous",
    displayUnit: "percent",
    displayDecimals: 2,
    transform: (value) => value * 100,
  },
];

const GROWTH_RATIO_DEFINITIONS = [
  {
    key: "revenueGrowth",
    term: "營運成長率",
    aliases: ["營業收入成長率", "營收成長率"],
    code: "ratio:revenueGrowth:actual",
    displayUnit: "percent",
    displayDecimals: 2,
  },
  {
    key: "equityGrowth",
    term: "權益成長率",
    aliases: ["權益增加率"],
    code: "ratio:equityGrowth:actual",
    displayUnit: "percent",
    displayDecimals: 2,
  },
];

function getElementTextByTags(rowNode, tags) {
  for (const tag of tags) {
    const possibilities = [tag, tag.toLowerCase(), tag.toUpperCase()];
    for (const candidate of possibilities) {
      const element = rowNode.getElementsByTagName(candidate)[0];
      if (element?.textContent?.trim()) return element.textContent.trim();
    }
  }
  return null;
}

function parseFinancialNumber(str) {
  if (typeof str !== "string" || str.trim() === "") return null;
  let cleanStr = str.trim();
  const isParenthesisNegative = /^\(.*\)$/.test(cleanStr);
  cleanStr = cleanStr.replace(/[,()]/g, "");
  const num = parseFloat(cleanStr);
  if (Number.isNaN(num)) return null;
  return isParenthesisNegative ? -Math.abs(num) : num;
}

function normalizeName(value) {
  return String(value || "").replace(/[\s\u3000]/g, "");
}

function roundValue(value, decimals = 2) {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) return null;
  return Number(value.toFixed(decimals));
}

function uniqueAliases(values = []) {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value.trim())));
}

function sumDefinedValues(values) {
  const definedValues = values.filter((value) => typeof value === "number" && !Number.isNaN(value));
  if (!definedValues.length) return null;
  return definedValues.reduce((sum, value) => sum + value, 0);
}

function formatRatioPercent(ratio) {
  if (typeof ratio !== "number" || Number.isNaN(ratio) || !Number.isFinite(ratio)) return "N/A";
  return `${(ratio * 100).toFixed(2)}%`;
}

function parseManualPercent(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replace(/[%％,\s]/g, "");
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed / 100;
}

export function extractXmlYear(xmlString) {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");
    if (xmlDoc.querySelector("parsererror")) return "";
    return getElementTextByTags(xmlDoc, YEAR_TAGS) || "";
  } catch {
    return "";
  }
}

export function parseXmlRowRecords(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "application/xml");
  if (xmlDoc.querySelector("parsererror")) return [];

  const rows = Array.from(xmlDoc.getElementsByTagName("ROW"));
  return rows.map((rowNode) => ({
    code: (getElementTextByTags(rowNode, CODE_TAGS) || "").trim(),
    name: getElementTextByTags(rowNode, TERM_TAGS) || "",
    current: parseFinancialNumber(getElementTextByTags(rowNode, CURRENT_VALUE_TAGS)),
    budget: parseFinancialNumber(getElementTextByTags(rowNode, BUDGET_VALUE_TAGS)),
    previous: parseFinancialNumber(getElementTextByTags(rowNode, PREVIOUS_VALUE_TAGS)),
  }));
}

function findValue(records, accountCode, valueKey = "current") {
  const row = records.find((record) => record.code === accountCode);
  if (!row) return null;
  if (valueKey in row) return row[valueKey] ?? null;
  if (valueKey === "current") return row.amount ?? null;
  return null;
}

function findValueByName(records, accountName, valueKey = "current") {
  const normalizedTarget = normalizeName(accountName);
  const row = records.find((record) => normalizeName(record.name ?? record.term) === normalizedTarget);
  if (!row) return null;
  if (valueKey in row) return row[valueKey] ?? null;
  if (valueKey === "current") return row.amount ?? null;
  return null;
}

export function buildBalanceSheetAggregatedData(records) {
  const data = {
    assets: null,
    liabilities: null,
    currentAssets: null,
    currentLiabilities: null,
    deposits: null,
    bankDeposits: null,
    postalSavingsDeposits: null,
    equity: null,
    rightOfUseAssets: null,
    currentAssetsTotal: null,
    previousAssets: null,
    currentEquity: null,
    previousEquity: null,
    capital: null,
  };

  if (!Array.isArray(records) || !records.length) return data;

  data.currentAssetsTotal = findValue(records, ACCOUNT_CODES.ASSETS, "current");
  data.previousAssets = findValue(records, ACCOUNT_CODES.ASSETS, "previous");
  data.currentEquity = findValue(records, ACCOUNT_CODES.EQUITY, "current");
  data.previousEquity = findValue(records, ACCOUNT_CODES.EQUITY, "previous");
  data.capital = findValue(records, ACCOUNT_CODES.CAPITAL, "current");

  records.forEach((record) => {
    const { code, name, current } = record;
    if (current === null || !code) return;
    const normalizedName = normalizeName(name);

    if (code === ACCOUNT_CODES.ASSETS) data.assets = current;
    else if (code === ACCOUNT_CODES.LIABILITIES) data.liabilities = current;
    else if (code === ACCOUNT_CODES.CURRENT_ASSETS) data.currentAssets = current;
    else if (code === ACCOUNT_CODES.CURRENT_LIABILITIES) data.currentLiabilities = current;
    else if (code === ACCOUNT_CODES.DEPOSITS) data.deposits = current;
    else if (code === ACCOUNT_CODES.BANK_DEPOSITS) data.bankDeposits = current;
    else if (normalizedName === "郵匯儲金轉存款") data.postalSavingsDeposits = current;
    else if (code === ACCOUNT_CODES.EQUITY) data.equity = current;
    else if (code === ACCOUNT_CODES.RIGHT_OF_USE_ASSETS) data.rightOfUseAssets = current;
  });

  data.assets = data.currentAssetsTotal ?? data.assets;
  data.equity = data.currentEquity ?? data.equity;
  data.liabilities = data.liabilities ?? findValue(records, ACCOUNT_CODES.LIABILITIES, "current");
  data.currentAssets = data.currentAssets ?? findValue(records, ACCOUNT_CODES.CURRENT_ASSETS, "current");
  data.currentLiabilities =
    data.currentLiabilities ?? findValue(records, ACCOUNT_CODES.CURRENT_LIABILITIES, "current");
  data.rightOfUseAssets =
    data.rightOfUseAssets ?? findValue(records, ACCOUNT_CODES.RIGHT_OF_USE_ASSETS, "current");
  data.deposits = data.deposits ?? findValue(records, ACCOUNT_CODES.DEPOSITS, "current");

  return data;
}

export function buildIncomeStatementAggregatedData(records) {
  if (!Array.isArray(records) || !records.length) return {};

  const getTriplet = (code) => ({
    Actual: findValue(records, code, "current"),
    Budget: findValue(records, code, "budget"),
    Previous: findValue(records, code, "previous"),
  });

  const interestIncome = getTriplet(ACCOUNT_CODES.INTEREST_INCOME);
  const fvtplGain = getTriplet(ACCOUNT_CODES.FVTPL_GAIN);
  const fxGain = getTriplet(ACCOUNT_CODES.FX_GAIN);
  const trustGainLoss = getTriplet(ACCOUNT_CODES.TRUST_GAIN_LOSS);

  const investmentGainLoss_Actual =
    findValue(records, ACCOUNT_CODES.INVESTMENT_GAIN_LOSS_PRIMARY, "current") ??
    findValue(records, ACCOUNT_CODES.INVESTMENT_GAIN_LOSS_SECONDARY, "current");
  const investmentGainLoss_Budget =
    findValue(records, ACCOUNT_CODES.INVESTMENT_GAIN_LOSS_PRIMARY, "budget") ??
    findValue(records, ACCOUNT_CODES.INVESTMENT_GAIN_LOSS_SECONDARY, "budget");
  const investmentGainLoss_Previous =
    findValue(records, ACCOUNT_CODES.INVESTMENT_GAIN_LOSS_PRIMARY, "previous") ??
    findValue(records, ACCOUNT_CODES.INVESTMENT_GAIN_LOSS_SECONDARY, "previous");

  const interestExpense = getTriplet(ACCOUNT_CODES.INTEREST_EXPENSE);

  return {
    operatingRevenue: findValue(records, ACCOUNT_CODES.REVENUE, "current"),
    profitBeforeTax: findValue(records, ACCOUNT_CODES.PROFIT_BEFORE_TAX, "current"),
    netIncome_Actual: findValue(records, ACCOUNT_CODES.NET_INCOME, "current"),
    operatingProfit_Actual: findValue(records, ACCOUNT_CODES.OPERATING_PROFIT, "current"),
    revenue_Actual: findValue(records, ACCOUNT_CODES.REVENUE, "current"),
    revenue_Budget: findValue(records, ACCOUNT_CODES.REVENUE, "budget"),
    revenue_Previous: findValue(records, ACCOUNT_CODES.REVENUE, "previous"),
    interestIncome_Actual: interestIncome.Actual,
    interestIncome_Budget: interestIncome.Budget,
    interestIncome_Previous: interestIncome.Previous,
    fvtplGain_Actual: fvtplGain.Actual,
    fvtplGain_Budget: fvtplGain.Budget,
    fvtplGain_Previous: fvtplGain.Previous,
    fxGain_Actual: fxGain.Actual,
    fxGain_Budget: fxGain.Budget,
    fxGain_Previous: fxGain.Previous,
    trustGainLoss_Actual: trustGainLoss.Actual,
    trustGainLoss_Budget: trustGainLoss.Budget,
    trustGainLoss_Previous: trustGainLoss.Previous,
    investmentGainLoss_Actual,
    investmentGainLoss_Budget,
    investmentGainLoss_Previous,
    interestExpense_Actual: interestExpense.Actual,
    interestExpense_Budget: interestExpense.Budget,
    interestExpense_Previous: interestExpense.Previous,
    netIncome_Budget: findValue(records, ACCOUNT_CODES.NET_INCOME, "budget"),
    netIncome_Previous: findValue(records, ACCOUNT_CODES.NET_INCOME, "previous"),
  };
}

function calculateFundYieldRatio(intInc, fvtpl, fx, trust, invest, intExp) {
  if (typeof intExp !== "number" || Number.isNaN(intExp) || intExp === 0) return null;
  const numerator = (intInc ?? 0) + (fvtpl ?? 0) + (fx ?? 0) + (trust ?? 0) + (invest ?? 0);
  return numerator / intExp;
}

export function getFundYieldNumeratorSum(data, type = "Actual") {
  if (!data) return null;
  const suffix = `_${type}`;
  return (
    (typeof data[`interestIncome${suffix}`] === "number" ? data[`interestIncome${suffix}`] : 0) +
    (typeof data[`fvtplGain${suffix}`] === "number" ? data[`fvtplGain${suffix}`] : 0) +
    (typeof data[`fxGain${suffix}`] === "number" ? data[`fxGain${suffix}`] : 0) +
    (typeof data[`trustGainLoss${suffix}`] === "number" ? data[`trustGainLoss${suffix}`] : 0) +
    (typeof data[`investmentGainLoss${suffix}`] === "number" ? data[`investmentGainLoss${suffix}`] : 0)
  );
}

export function buildFinancialRatioCalculationPayload({
  balanceData,
  incomeData,
  manualAvgDeposit = null,
  manualEmployeeCount = null,
  manualNetCashFlow = null,
  manualRoeBudget = null,
  manualRoePrevious = null,
}) {
  if (!balanceData || !incomeData) {
    return {
      resultsApp1: null,
      financialDataApp2: null,
      rawRatiosApp2: null,
      calculatedRatiosApp2: null,
    };
  }

  const avgDeposit = Number.parseFloat(manualAvgDeposit);
  const employeeCount = Number.parseInt(manualEmployeeCount, 10);
  const netCashFlow = Number.parseFloat(manualNetCashFlow);
  const manualRoeBudgetRatio = parseManualPercent(manualRoeBudget);
  const manualRoePreviousRatio = parseManualPercent(manualRoePrevious);
  const assetsValue = balanceData.assets ?? balanceData["資產"] ?? balanceData.currentAssetsTotal ?? null;
  const liabilitiesValue = balanceData.liabilities ?? balanceData["負債"] ?? null;
  const equityValue = balanceData.equity ?? balanceData["權益"] ?? balanceData.currentEquity ?? null;
  const currentAssetsValue = balanceData.currentAssets ?? balanceData["流動資產"] ?? null;
  const currentLiabilitiesValue = balanceData.currentLiabilities ?? balanceData["流動負債"] ?? null;
  const depositsValue = balanceData.deposits ?? balanceData["存款"] ?? null;
  const bankDepositsValue = balanceData.bankDeposits ?? balanceData["銀行業存款"] ?? null;
  const postalSavingsValue =
    balanceData.postalSavingsDeposits ?? balanceData["國際金融機構存款"] ?? balanceData["郵匯儲金轉存款"] ?? null;

  const resultsApp1 = {};
  resultsApp1.debtAssetRatio =
    typeof assetsValue === "number" && assetsValue != 0
      ? (liabilitiesValue ?? 0) / assetsValue
      : null;

  const totalDepositsForRatio =
    (bankDepositsValue ?? 0) + (postalSavingsValue ?? 0) + (depositsValue ?? 0);
  resultsApp1.depositEquityRatio =
    typeof equityValue === "number" && equityValue != 0
      ? (totalDepositsForRatio / equityValue) * 100
      : null;
  resultsApp1.currentRatio =
    typeof currentLiabilitiesValue === "number" && currentLiabilitiesValue != 0
      ? (currentAssetsValue ?? 0) / currentLiabilitiesValue
      : null;
  resultsApp1.interestCoverageRatio =
    typeof incomeData.profitBeforeTax === "number" &&
    typeof incomeData.interestExpense_Actual === "number" &&
    incomeData.interestExpense_Actual !== 0
      ? ((incomeData.profitBeforeTax + incomeData.interestExpense_Actual) / incomeData.interestExpense_Actual) *
        100
      : null;
  resultsApp1.interestExpenseRatio =
    Number.isFinite(avgDeposit) && avgDeposit !== 0 && typeof incomeData.interestExpense_Actual === "number"
      ? (incomeData.interestExpense_Actual / avgDeposit) * 100
      : null;
  resultsApp1.totalAssetTurnover =
    typeof incomeData.operatingRevenue === "number" && typeof assetsValue === "number" && assetsValue != 0
      ? incomeData.operatingRevenue / assetsValue
      : null;
  resultsApp1.employeeAverageRevenue =
    Number.isFinite(employeeCount) && employeeCount !== 0 && typeof incomeData.operatingRevenue === "number"
      ? Math.round(incomeData.operatingRevenue / employeeCount / 1000)
      : null;
  resultsApp1.employeeAverageProfit =
    Number.isFinite(employeeCount) && employeeCount !== 0 && typeof incomeData.netIncome_Actual === "number"
      ? Math.round(incomeData.netIncome_Actual / employeeCount / 1000)
      : null;
  resultsApp1.cashFlowRatio =
    Number.isFinite(netCashFlow) && typeof currentLiabilitiesValue == "number" && currentLiabilitiesValue != 0
      ? (netCashFlow / currentLiabilitiesValue) * 100
      : null;

  const financialDataApp2 = {
    operatingProfit: incomeData.operatingProfit_Actual,
    revenue: incomeData.revenue_Actual,
    revenue_Previous: incomeData.revenue_Previous,
    netIncome: incomeData.netIncome_Actual,
    currentAssets: balanceData.currentAssetsTotal,
    currentEquity: balanceData.currentEquity,
    capital: balanceData.capital,
    previousAssets: balanceData.previousAssets,
    previousEquity: balanceData.previousEquity,
    avgAssets: null,
    avgEquity: null,
    interestIncome_Actual: incomeData.interestIncome_Actual,
    interestIncome_Budget: incomeData.interestIncome_Budget,
    interestIncome_Previous: incomeData.interestIncome_Previous,
    fvtplGain_Actual: incomeData.fvtplGain_Actual,
    fvtplGain_Budget: incomeData.fvtplGain_Budget,
    fvtplGain_Previous: incomeData.fvtplGain_Previous,
    fxGain_Actual: incomeData.fxGain_Actual,
    fxGain_Budget: incomeData.fxGain_Budget,
    fxGain_Previous: incomeData.fxGain_Previous,
    trustGainLoss_Actual: incomeData.trustGainLoss_Actual,
    trustGainLoss_Budget: incomeData.trustGainLoss_Budget,
    trustGainLoss_Previous: incomeData.trustGainLoss_Previous,
    investmentGainLoss_Actual: incomeData.investmentGainLoss_Actual,
    investmentGainLoss_Budget: incomeData.investmentGainLoss_Budget,
    investmentGainLoss_Previous: incomeData.investmentGainLoss_Previous,
    interestExpense_Actual: incomeData.interestExpense_Actual,
    interestExpense_Budget: incomeData.interestExpense_Budget,
    interestExpense_Previous: incomeData.interestExpense_Previous,
    netIncome_Budget: incomeData.netIncome_Budget,
    netIncome_Previous: incomeData.netIncome_Previous,
    revenue_Budget: incomeData.revenue_Budget,
    currentEquity_Previous: balanceData.previousEquity,
  };

  if (
    typeof financialDataApp2.currentAssets === "number" &&
    typeof financialDataApp2.previousAssets === "number"
  ) {
    financialDataApp2.avgAssets = (financialDataApp2.currentAssets + financialDataApp2.previousAssets) / 2;
  }
  if (
    typeof financialDataApp2.currentEquity === "number" &&
    typeof financialDataApp2.previousEquity === "number"
  ) {
    financialDataApp2.avgEquity = (financialDataApp2.currentEquity + financialDataApp2.previousEquity) / 2;
  }

  const shares = typeof financialDataApp2.capital === "number" ? financialDataApp2.capital / 10 : null;
  const rawRatiosApp2 = {
    operatingMargin:
      typeof financialDataApp2.revenue === "number" && financialDataApp2.revenue !== 0
        ? financialDataApp2.operatingProfit / financialDataApp2.revenue
        : null,
    netMargin:
      typeof financialDataApp2.revenue === "number" && financialDataApp2.revenue !== 0
        ? financialDataApp2.netIncome / financialDataApp2.revenue
        : null,
    netMargin_Budget:
      typeof financialDataApp2.revenue_Budget === "number" && financialDataApp2.revenue_Budget !== 0
        ? financialDataApp2.netIncome_Budget / financialDataApp2.revenue_Budget
        : null,
    netMargin_Previous:
      typeof financialDataApp2.revenue_Previous === "number" && financialDataApp2.revenue_Previous !== 0
        ? financialDataApp2.netIncome_Previous / financialDataApp2.revenue_Previous
        : null,
    eps: typeof shares === "number" && shares !== 0 ? financialDataApp2.netIncome / shares : null,
    roa:
      typeof financialDataApp2.avgAssets === "number" && financialDataApp2.avgAssets !== 0
        ? financialDataApp2.netIncome / financialDataApp2.avgAssets
        : null,
    roe:
      typeof financialDataApp2.avgEquity === "number" && financialDataApp2.avgEquity !== 0
        ? financialDataApp2.netIncome / financialDataApp2.avgEquity
        : null,
    roe_Budget: manualRoeBudgetRatio,
    roe_Previous: manualRoePreviousRatio,
    fundYieldToCost_Actual: calculateFundYieldRatio(
      financialDataApp2.interestIncome_Actual,
      financialDataApp2.fvtplGain_Actual,
      financialDataApp2.fxGain_Actual,
      financialDataApp2.trustGainLoss_Actual,
      financialDataApp2.investmentGainLoss_Actual,
      financialDataApp2.interestExpense_Actual
    ),
    fundYieldToCost_Budget: calculateFundYieldRatio(
      financialDataApp2.interestIncome_Budget,
      financialDataApp2.fvtplGain_Budget,
      financialDataApp2.fxGain_Budget,
      financialDataApp2.trustGainLoss_Budget,
      financialDataApp2.investmentGainLoss_Budget,
      financialDataApp2.interestExpense_Budget
    ),
    fundYieldToCost_Previous: calculateFundYieldRatio(
      financialDataApp2.interestIncome_Previous,
      financialDataApp2.fvtplGain_Previous,
      financialDataApp2.fxGain_Previous,
      financialDataApp2.trustGainLoss_Previous,
      financialDataApp2.investmentGainLoss_Previous,
      financialDataApp2.interestExpense_Previous
    ),
    revenueGrowth:
      typeof financialDataApp2.revenue === "number" &&
      typeof financialDataApp2.revenue_Previous === "number" &&
      financialDataApp2.revenue_Previous !== 0
        ? (financialDataApp2.revenue - financialDataApp2.revenue_Previous) / Math.abs(financialDataApp2.revenue_Previous)
        : null,
    equityGrowth:
      typeof financialDataApp2.currentEquity === "number" &&
      typeof financialDataApp2.previousEquity === "number" &&
      financialDataApp2.previousEquity !== 0
        ? (financialDataApp2.currentEquity - financialDataApp2.previousEquity) / Math.abs(financialDataApp2.previousEquity)
        : null,
  };

  const calculatedRatiosApp2 = {
    operatingMargin: formatRatioPercent(rawRatiosApp2.operatingMargin),
    netMargin: formatRatioPercent(rawRatiosApp2.netMargin),
    eps: typeof rawRatiosApp2.eps === "number" && Number.isFinite(rawRatiosApp2.eps) ? rawRatiosApp2.eps.toFixed(2) : "N/A",
    roa: formatRatioPercent(rawRatiosApp2.roa),
    roe: formatRatioPercent(rawRatiosApp2.roe),
    fundYieldToCost_Actual: formatRatioPercent(rawRatiosApp2.fundYieldToCost_Actual),
    fundYieldToCost_Budget: formatRatioPercent(rawRatiosApp2.fundYieldToCost_Budget),
    fundYieldToCost_Previous: formatRatioPercent(rawRatiosApp2.fundYieldToCost_Previous),
    revenueGrowth: formatRatioPercent(rawRatiosApp2.revenueGrowth),
    equityGrowth: formatRatioPercent(rawRatiosApp2.equityGrowth),
  };

  return {
    resultsApp1,
    financialDataApp2,
    rawRatiosApp2,
    calculatedRatiosApp2,
  };
}

function buildRatioRow(definition, rawValue, level, sourceOrder, directionComparisons = []) {
  if (typeof rawValue !== "number" || Number.isNaN(rawValue) || !Number.isFinite(rawValue)) return null;
  const transformedValue = typeof definition.transform === "function" ? definition.transform(rawValue) : rawValue;
  const roundedValue = roundValue(transformedValue, definition.displayDecimals);
  if (roundedValue === null) return null;

  return {
    term: definition.term,
    aliases: [definition.term, ...definition.aliases],
    code: definition.code,
    sourceOrder,
    level: level || DEFAULT_LEVEL,
    sourceType: "derived_ratio",
    preferredMetricKey: "amount",
    strictMatchOnly: true,
    displayUnit: definition.displayUnit,
    displayDecimals: definition.displayDecimals,
    amount: roundedValue,
    deltaAmount: null,
    deltaPercent: null,
    quantity: null,
    deltaQuantity: null,
    deltaQuantityPercent: null,
    directionComparisons,
  };
}

function buildGrowthRatioRow(definition, rawValue, level, sourceOrder, directionComparisons = []) {
  return buildRatioRow(
    {
      ...definition,
      transform: (value) => value * 100,
    },
    rawValue,
    level,
    sourceOrder,
    directionComparisons
  );
}

function toDisplayedPercent(rawRatio) {
  if (typeof rawRatio !== "number" || Number.isNaN(rawRatio) || !Number.isFinite(rawRatio)) return null;
  return roundValue(rawRatio * 100, 2);
}

function buildRatioDirection({ label, leftValue, rightValue, valueUnit = "percent" }) {
  if (
    typeof leftValue !== "number" ||
    typeof rightValue !== "number" ||
    Number.isNaN(leftValue) ||
    Number.isNaN(rightValue)
  ) {
    return null;
  }

  let expectedDirection = "equal";
  if (leftValue > rightValue) expectedDirection = "higher";
  else if (leftValue < rightValue) expectedDirection = "lower";

  return {
    label,
    rightValue,
    expectedDirection,
    valueUnit,
    displayDecimals: valueUnit === "percent" ? 2 : null,
  };
}

function compactDirections(directions = []) {
  return directions.filter(Boolean);
}

function buildSupportAmount(label, value, displayDecimals = null) {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) return null;
  return {
    label,
    value,
    displayUnit: "amount",
    displayDecimals,
  };
}

function buildStructureRatioRow({
  record,
  denominator,
  denominatorLabel,
  sourceOrder,
  level = DEFAULT_LEVEL,
}) {
  const recordName = record?.name ?? record?.term;
  const recordAmount = record?.current ?? record?.amount;
  if (!recordName || typeof recordAmount !== "number" || !Number.isFinite(recordAmount)) return null;
  if (typeof denominator !== "number" || !Number.isFinite(denominator) || denominator === 0) return null;

  const ratio = roundValue((recordAmount / denominator) * 100, 2);
  if (ratio === null) return null;
  const normalizedTerm = `${recordName}\u5360${denominatorLabel}\u4e4b\u6bd4\u7387`;
  const normalizedAliases = [
    normalizedTerm,
    `${recordName}\u5360${denominatorLabel}\u4e4b`,
    `${recordName}\u5360${denominatorLabel}`,
  ];
  if (recordName === "\u4fdd\u7559\u76c8\u9918" || recordName === "\u7d2f\u7a4d\u8667\u640d") {
    normalizedAliases.push(
      `\u4fdd\u7559\u76c8\u9918\uff08\u6216\u7d2f\u7a4d\u8667\u640d\uff09\u5360${denominatorLabel}\u4e4b\u6bd4\u7387`
    );
    normalizedAliases.push(`\u4fdd\u7559\u76c8\u9918\uff08\u6216\u7d2f\u7a4d\u8667\u640d\uff09\u5360${denominatorLabel}\u4e4b`);
    normalizedAliases.push(`\u4fdd\u7559\u76c8\u9918\uff08\u6216\u7d2f\u7a4d\u8667\u640d\uff09\u5360${denominatorLabel}`);
  }
  /*
  const term = `${recordName}占${denominatorLabel}之比率`;
  const aliases = [term, `${recordName}占${denominatorLabel}`];
  const structureRatioAliases = [];
  if (recordName === "保留盈餘" || recordName === "累積虧損") {
    structureRatioAliases.push(`保留盈餘（或累積虧損）占${denominatorLabel}之比率`);
    structureRatioAliases.push(`保留盈餘（或累積虧損）占${denominatorLabel}`);
  }

  const term = `${recordName}占${denominatorLabel}之比率`;

  */
  const term = normalizedTerm;
  const structureRatioAliases = [];
  return {
    term: normalizedTerm,
    aliases: [term, `${recordName}占${denominatorLabel}`, ...structureRatioAliases],
    aliases: normalizedAliases,
    code: `structure:${record.code || record.name}:${denominatorLabel}`,
    sourceOrder,
    level: record?.level || level,
    sourceType: "derived_ratio",
    preferredMetricKey: "amount",
    strictMatchOnly: true,
    displayUnit: "percent",
    displayDecimals: 2,
    amount: ratio,
    deltaAmount: null,
    deltaPercent: null,
    quantity: null,
    deltaQuantity: null,
    deltaQuantityPercent: null,
  };
}

function buildNormalizedStructureRatioRow({
  record,
  denominator,
  denominatorLabel,
  sourceOrder,
  level = DEFAULT_LEVEL,
}) {
  const recordName = record?.name ?? record?.term;
  const recordAmount = record?.current ?? record?.amount;
  if (!recordName || typeof recordAmount !== "number" || !Number.isFinite(recordAmount)) return null;
  if (typeof denominator !== "number" || !Number.isFinite(denominator) || denominator === 0) return null;

  const ratio = roundValue((recordAmount / denominator) * 100, 2);
  if (ratio === null) return null;

  const subjectAliases = [recordName];
  if (recordName === "\u8cc7\u7522") subjectAliases.push("\u8cc7\u7522\u7e3d\u984d");
  if (recordName === "\u8ca0\u50b5") subjectAliases.push("\u8ca0\u50b5\u7e3d\u984d");
  if (recordName === "\u6b0a\u76ca") subjectAliases.push("\u6b0a\u76ca\u7e3d\u984d");
  if (
    recordName === "\u4fdd\u7559\u76c8\u9918" ||
    recordName === "\u7d2f\u7a4d\u8667\u640d" ||
    recordName === "\u4fdd\u7559\u76c8\u9918\uff08\u6216\u7d2f\u7a4d\u8667\u640d\uff09"
  ) {
    subjectAliases.push("\u4fdd\u7559\u76c8\u9918");
    subjectAliases.push("\u7d2f\u7a4d\u8667\u640d");
    subjectAliases.push("\u4fdd\u7559\u76c8\u9918\uff08\u6216\u7d2f\u7a4d\u8667\u640d\uff09");
  }

  const aliases = [];
  subjectAliases.forEach((subjectAlias) => {
    aliases.push(`${subjectAlias}\u5360${denominatorLabel}\u4e4b\u6bd4\u7387`);
    aliases.push(`${subjectAlias}\u5360${denominatorLabel}\u4e4b`);
    aliases.push(`${subjectAlias}\u5360${denominatorLabel}`);
  });

  return {
    term: `${recordName}\u5360${denominatorLabel}\u4e4b\u6bd4\u7387`,
    aliases: uniqueAliases(aliases),
    code: `structure:${record.code || record.name}:${denominatorLabel}`,
    sourceOrder,
    level: record?.level || level,
    sourceType: "derived_ratio",
    preferredMetricKey: "amount",
    strictMatchOnly: true,
    displayUnit: "percent",
    displayDecimals: 2,
    amount: ratio,
    deltaAmount: null,
    deltaPercent: null,
    quantity: null,
    deltaQuantity: null,
    deltaQuantityPercent: null,
  };
}

export function buildBalanceStructureComparisonRows(records = [], level = DEFAULT_LEVEL) {
  return buildNormalizedBalanceStructureComparisonRows(records, level);

  if (!Array.isArray(records) || !records.length) return [];

  const assetsTotal = findValue(records, ACCOUNT_CODES.ASSETS, "current");
  const liabilitiesTotal = findValue(records, ACCOUNT_CODES.LIABILITIES, "current");
  const equityTotal = findValue(records, ACCOUNT_CODES.EQUITY, "current");
  const liabilitiesAndEquityTotal =
    sumDefinedValues([liabilitiesTotal, equityTotal]) ??
    findValueByName(records, "負債及權益總計", "current");

  const rows = [];
  let sourceOrder = 0;

  records.forEach((record) => {
    const code = String(record?.code || "").trim();
    const recordAmount = record?.current ?? record?.amount;
    if (!code || typeof recordAmount !== "number" || !Number.isFinite(recordAmount)) return;

    let row = null;
    if (code.startsWith("1")) {
      row = buildStructureRatioRow({
        record,
        denominator: assetsTotal,
        denominatorLabel: "\u8cc7\u7522\u7e3d\u984d",
        denominatorLabel: "資產總額",
        sourceOrder,
        level: record?.level || level,
        denominatorLabel: "\u8cc7\u7522\u7e3d\u984d",
      });
    } else if (code.startsWith("2") || code.startsWith("3")) {
      row = buildStructureRatioRow({
        record,
        denominator: liabilitiesAndEquityTotal,
        denominatorLabel: "\u8ca0\u50b5\u53ca\u6b0a\u76ca\u7e3d\u984d",
        denominatorLabel: "負債及權益總額",
        sourceOrder,
        level: record?.level || level,
        denominatorLabel: "\u8ca0\u50b5\u53ca\u6b0a\u76ca\u7e3d\u984d",
      });
    }

    if (row) {
      rows.push(row);
      sourceOrder += 1;
    }
  });

  return rows;
}

export function buildNormalizedBalanceStructureComparisonRows(records = [], level = DEFAULT_LEVEL) {
  if (!Array.isArray(records) || !records.length) return [];

  const assetsTotal = findValue(records, ACCOUNT_CODES.ASSETS, "current");
  const liabilitiesTotal = findValue(records, ACCOUNT_CODES.LIABILITIES, "current");
  const equityTotal = findValue(records, ACCOUNT_CODES.EQUITY, "current");
  const liabilitiesAndEquityTotal =
    sumDefinedValues([liabilitiesTotal, equityTotal]) ??
    findValueByName(records, "\u8ca0\u50b5\u53ca\u6b0a\u76ca\u7e3d\u984d", "current");

  const rows = [];
  let sourceOrder = 0;

  records.forEach((record) => {
    const code = String(record?.code || "").trim();
    const recordAmount = record?.current ?? record?.amount;
    if (!code || typeof recordAmount !== "number" || !Number.isFinite(recordAmount)) return;

    let row = null;
    if (code.startsWith("1")) {
      row = buildNormalizedStructureRatioRow({
        record,
        denominator: assetsTotal,
        denominatorLabel: "\u8cc7\u7522\u7e3d\u984d",
        sourceOrder,
        level: record?.level || level,
      });
    } else if (code.startsWith("2") || code.startsWith("3")) {
      row = buildNormalizedStructureRatioRow({
        record,
        denominator: liabilitiesAndEquityTotal,
        denominatorLabel: "\u8ca0\u50b5\u53ca\u6b0a\u76ca\u7e3d\u984d",
        sourceOrder,
        level: record?.level || level,
      });
    }

    if (row) {
      rows.push(row);
      sourceOrder += 1;
    }
  });

  return rows;
}

export function buildDerivedComparisonRowsForYear({
  balanceData,
  incomeData,
  level = DEFAULT_LEVEL,
  manualRatioInputs = {},
}) {
  const payload = buildFinancialRatioCalculationPayload({
    balanceData,
    incomeData,
    manualRoeBudget: manualRatioInputs.roeBudget,
    manualRoePrevious: manualRatioInputs.roePrevious,
  });
  if (!payload.resultsApp1 || !payload.rawRatiosApp2) return [];

  const rows = [];
  let sourceOrder = 0;

  APP1_RATIO_DEFINITIONS.forEach((definition) => {
    const row = buildRatioRow(definition, payload.resultsApp1[definition.key], level, sourceOrder);
    if (row) {
      rows.push(row);
      sourceOrder += 1;
    }
  });

  APP2_RATIO_DEFINITIONS.forEach((definition) => {
    let directionComparisons = [];
    let supportAmounts = [];
    if (definition.key === "netMargin") {
      directionComparisons = compactDirections([
        buildRatioDirection({
          label: "本年度預算",
          leftValue: toDisplayedPercent(payload.rawRatiosApp2.netMargin),
          rightValue: toDisplayedPercent(payload.rawRatiosApp2.netMargin_Budget),
        }),
        buildRatioDirection({
          label: "上年度決算",
          leftValue: toDisplayedPercent(payload.rawRatiosApp2.netMargin),
          rightValue: toDisplayedPercent(payload.rawRatiosApp2.netMargin_Previous),
        }),
      ]);
      supportAmounts = compactDirections([
        buildSupportAmount("本年度決算淨利", payload.financialDataApp2.netIncome),
        buildSupportAmount("營業收入", payload.financialDataApp2.revenue),
      ]);
    } else if (definition.key === "roe") {
      directionComparisons = compactDirections([
        buildRatioDirection({
          label: "本年度預算",
          leftValue: toDisplayedPercent(payload.rawRatiosApp2.roe),
          rightValue: toDisplayedPercent(payload.rawRatiosApp2.roe_Budget),
        }),
        buildRatioDirection({
          label: "上年度決算",
          leftValue: toDisplayedPercent(payload.rawRatiosApp2.roe),
          rightValue: toDisplayedPercent(payload.rawRatiosApp2.roe_Previous),
        }),
      ]);
      supportAmounts = compactDirections([
        buildSupportAmount("本年度決算淨利", payload.financialDataApp2.netIncome),
        buildSupportAmount("平均權益", payload.financialDataApp2.avgEquity, 0),
      ]);
    } else if (definition.key === "fundYieldToCost_Actual") {
      directionComparisons = compactDirections([
        buildRatioDirection({
          label: "本年度預算",
          leftValue: toDisplayedPercent(payload.rawRatiosApp2.fundYieldToCost_Actual),
          rightValue: toDisplayedPercent(payload.rawRatiosApp2.fundYieldToCost_Budget),
        }),
        buildRatioDirection({
          label: "上年度決算",
          leftValue: toDisplayedPercent(payload.rawRatiosApp2.fundYieldToCost_Actual),
          rightValue: toDisplayedPercent(payload.rawRatiosApp2.fundYieldToCost_Previous),
        }),
      ]);
      supportAmounts = compactDirections([
        buildSupportAmount("本年度決算資金收益", getFundYieldNumeratorSum(payload.financialDataApp2, "Actual")),
        buildSupportAmount("利息費用", payload.financialDataApp2.interestExpense_Actual),
      ]);
    }

    const row = buildRatioRow(
      definition,
      payload.rawRatiosApp2[definition.key],
      level,
      sourceOrder,
      directionComparisons
    );
    if (row) {
      row.supportAmounts = supportAmounts;
      rows.push(row);
      sourceOrder += 1;
    }
  });

  GROWTH_RATIO_DEFINITIONS.forEach((definition) => {
    let directionComparisons = [];
    let supportAmounts = [];
    if (definition.key === "revenueGrowth") {
      directionComparisons = compactDirections([
        buildRatioDirection({
          label: "上年度決算數",
          leftValue: payload.financialDataApp2.revenue,
          rightValue: payload.financialDataApp2.revenue_Previous,
          valueUnit: "amount",
        }),
      ]);
      supportAmounts = compactDirections([
        buildSupportAmount("本年度決算營業收入", payload.financialDataApp2.revenue),
        buildSupportAmount("上年度決算數", payload.financialDataApp2.revenue_Previous),
      ]);
    } else if (definition.key === "equityGrowth") {
      directionComparisons = compactDirections([
        buildRatioDirection({
          label: "上年度決算數",
          leftValue: payload.financialDataApp2.currentEquity,
          rightValue: payload.financialDataApp2.previousEquity,
          valueUnit: "amount",
        }),
      ]);
      supportAmounts = compactDirections([
        buildSupportAmount("本年度決算權益", payload.financialDataApp2.currentEquity),
        buildSupportAmount("上年度決算數", payload.financialDataApp2.previousEquity),
      ]);
    }

    const row = buildGrowthRatioRow(
      definition,
      payload.rawRatiosApp2[definition.key],
      level,
      sourceOrder,
      directionComparisons
    );
    if (row) {
      row.supportAmounts = supportAmounts;
      rows.push(row);
      sourceOrder += 1;
    }
  });

  return rows;
}

export function buildDerivedComparisonRows(fileEntries = [], manualRatioInputsByYear = {}) {
  const entriesByYear = new Map();

  fileEntries.forEach((entry) => {
    if (!entry?.rawContent || !["balance", "income"].includes(entry.detectedType)) return;
    const year = entry.year || extractXmlYear(entry.rawContent);
    if (!year) return;

    const records = parseXmlRowRecords(entry.rawContent);
    if (!records.length) return;

    const bucket = entriesByYear.get(year) || {};
    if (entry.detectedType === "balance") {
      bucket.balanceData = buildBalanceSheetAggregatedData(records);
    } else if (entry.detectedType === "income") {
      bucket.incomeData = buildIncomeStatementAggregatedData(records);
    }
    entriesByYear.set(year, bucket);
  });

  const result = {};
  entriesByYear.forEach((bucket, year) => {
    if (!bucket.balanceData || !bucket.incomeData) return;
    result[year] = buildDerivedComparisonRowsForYear({
      balanceData: bucket.balanceData,
      incomeData: bucket.incomeData,
      manualRatioInputs: manualRatioInputsByYear[year] || {},
    });
  });

  return result;
}
