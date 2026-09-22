// src/utils/xmlUtils.js

/**
 * 通用輔助函數：嘗試從多個可能的標籤名稱中獲取內容
 * @param {Element} rowNode XML節點
 * @param {string[]} tags 可能的標籤名稱陣列
 * @returns {string|null} 節點文字內容
 */
function getElementTextByTags(rowNode, tags) {
  for (const tag of tags) {
    // 嘗試不同的寫法（原始、全小寫、全大寫）
    const possibilities = [tag, tag.toLowerCase(), tag.toUpperCase()];
    for (const t of possibilities) {
      const element = rowNode.getElementsByTagName(t)[0];
      if (element) return element.textContent.trim();
    }
  }
  return null;
}

/**
 * 通用輔助函數：解析財務數字 (處理逗號與括號負數)
 * @param {string|null} str 原始字串
 * @returns {number|null} 解析後的數字
 */
function parseFinancialNumber(str) {
  if (
    str === null ||
    str === undefined ||
    typeof str !== "string" ||
    str.trim() === ""
  ) {
    return null;
  }
  let cleanStr = str.trim();
  const isParenthesisNegative = /^\(.*\)$/.test(cleanStr);
  cleanStr = cleanStr.replace(/[,()]/g, "");
  let num = parseFloat(cleanStr);
  if (isNaN(num)) return null;
  if (isParenthesisNegative) num = -Math.abs(num);
  return num;
}

/**
 * 通用輔助函數：從節點獲取文字
 */
function getElementText(parentNode, selector) {
  const element = parentNode.querySelector(selector);
  return element ? element.textContent.trim() : null;
}

function roundToTwoDecimals(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return parseFloat(value.toFixed(2));
}

function sumDefinedValues(values) {
  const definedValues = values.filter(
    (value) => typeof value === "number" && !Number.isNaN(value)
  );
  if (!definedValues.length) return null;
  return definedValues.reduce((sum, value) => sum + value, 0);
}

function normalizeSubjectText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[（）]/g, (char) => (char === "（" ? "(" : ")"));
}

export function buildDerivedIncomeStatementRows(fullData) {
  const derivedDefinitions = [
    {
      term: "營業及營業外收入決算數總計",
      code: "41+49",
      components: [
        { code: "41", names: ["營業收入"] },
        { code: "49", names: ["營業外收入"] },
      ],
    },
    {
      term: "營業及營業外支出決算數總計",
      code: "51+52+59+65",
      components: [
        { code: "51", names: ["營業成本"] },
        { code: "52", names: ["營業費用"] },
        { code: "59", names: ["營業外費用"] },
        { code: "65", names: ["所得稅費用(利益)", "所得稅費用（利益）"] },
      ],
    },
  ];

  const expenseDefinitionIndex = derivedDefinitions.findIndex(
    (definition) => definition.code === "51+52+59+65"
  );
  if (expenseDefinitionIndex >= 0) {
    derivedDefinitions[expenseDefinitionIndex] = {
      term: "營業及營業外支出暨所得稅費用決算數總計",
      code: "51+52+59+65",
      components: [
        { code: "51", names: ["營業成本"] },
        { code: "52", names: ["營業費用"] },
        { code: "59", names: ["營業外費用"] },
        { code: "65", names: ["所得稅費用(利益)", "所得稅費用（利益）"] },
      ],
    };
    derivedDefinitions.splice(expenseDefinitionIndex, 0, {
      term: "營業及營業外支出決算數總計",
      code: "51+52+59",
      components: [
        { code: "51", names: ["營業成本"] },
        { code: "52", names: ["營業費用"] },
        { code: "59", names: ["營業外費用"] },
      ],
    });
  }

  const existingTerms = new Set(fullData.map((row) => row.term));

  derivedDefinitions.forEach((definition) => {
    if (existingTerms.has(definition.term)) return;

    const usedKeys = new Set();
    const componentRows = definition.components
      .map((component) => {
        const normalizedNames = component.names.map(normalizeSubjectText);
        return fullData.find((row) => {
          const rowKey = `${row.code || ""}::${row.term || ""}`;
          if (usedKeys.has(rowKey)) return false;

          const normalizedCode = String(row.code || "").trim();
          const normalizedTerm = normalizeSubjectText(row.term);
          const isMatched =
            normalizedCode === component.code ||
            normalizedNames.includes(normalizedTerm);

          if (isMatched) {
            usedKeys.add(rowKey);
            return true;
          }

          return false;
        });
      })
      .filter(Boolean);
    if (!componentRows.length) return;

    const amount = sumDefinedValues(componentRows.map((row) => row.amount));
    const deltaAmount = sumDefinedValues(componentRows.map((row) => row.deltaAmount));
    const inferredLastAmount =
      amount !== null && deltaAmount !== null ? amount - deltaAmount : null;
    const deltaPercent =
      deltaAmount !== null &&
      inferredLastAmount !== null &&
      inferredLastAmount !== 0
        ? roundToTwoDecimals((deltaAmount / Math.abs(inferredLastAmount)) * 100)
        : null;

    const sourceOrder = Math.min(
      ...componentRows.map((row) =>
        typeof row.sourceOrder === "number" ? row.sourceOrder : Number.MAX_SAFE_INTEGER
      )
    );
    const level =
      componentRows.find((row) => row.level)?.level ?? fullData.find((row) => row.level)?.level ?? null;

    fullData.push({
      term: definition.term,
      code: definition.code,
      sourceOrder: Number.isFinite(sourceOrder) ? sourceOrder : fullData.length,
      sourceType: "xml",
      level,
      amount,
      deltaAmount,
      deltaPercent,
      quantity: null,
      deltaQuantity: null,
      deltaQuantityPercent: null,
    });
    existingTerms.add(definition.term);
  });
}

/**
 * =========================================================
 *  功能一：決算概要數字比對 (useComparisonTool 使用)
 * =========================================================
 */
export function parseComparisonXml(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "application/xml");

  if (xmlDoc.querySelector("parsererror")) {
    return {
      fullData: [],
      availableLevels: [],
      reportName: null,
      reportType: "financial",
      error: "XML 檔案格式錯誤，無法解析。",
    };
  }

  // 尋找 ROW 標籤
  let rows = [];
  const possibleRowTags = ["ROW", "Row", "row", "Rows", "rows"];
  for (const tag of possibleRowTags) {
    const found = xmlDoc.getElementsByTagName(tag);
    if (found.length > 0) {
      rows = Array.from(found);
      break;
    }
  }

  if (rows.length === 0) {
    return {
      fullData: [],
      availableLevels: [],
      reportName: null,
      reportType: "financial",
      error: "XML 中未找到任何 <ROW> 數據。",
    };
  }

  // 檢測報表類型
  let reportName = null;
  let reportType = "financial";
  const reportNameNode = xmlDoc.querySelector(
    "REPORT_NAME, ReportName, reportname, 報表名稱"
  );
  if (reportNameNode) {
    reportName = reportNameNode.textContent.trim();
    if (reportName.includes("產銷") || reportName.includes("營運量")) {
      reportType = "productionSalesVolume";
    }
  }

  const fullData = [];
  const levelSet = new Set();

  rows.forEach((rowNode) => {
    // 1. 抓取科目名稱
    const term = getElementTextByTags(rowNode, [
      "科目名稱",
      "項目",
      "項目名稱",
      "摘要",
      "產銷項目-名稱",
    ]);
    if (!term) return;

    const code = getElementTextByTags(rowNode, [
      "科目編號",
      "科目代碼",
      "會計科目代碼",
      "會計科目-代碼",
      "ACCT_CODE",
      "ACCOUNT_CODE",
      "CODE",
    ]);

    // 2. 抓取層級
    const level = getElementTextByTags(rowNode, ["LEVEL", "Level", "層級"]);
    if (level) levelSet.add(level);

    // 3. 抓取數值 (先暫存，稍後進行正負號校正)
    const rawAmount = parseFinancialNumber(
      getElementTextByTags(rowNode, ["本年度決算數", "決算數", "金額"])
    );
    const rawDeltaAmount = parseFinancialNumber(
      getElementTextByTags(rowNode, ["比較增減-金額", "增減金額"])
    );
    let rawDeltaPercent = parseFinancialNumber(
      getElementTextByTags(rowNode, ["比較增減-百分比", "增減百分比"])
    );

    const rawQuantity = parseFinancialNumber(
      getElementTextByTags(rowNode, ["本年度決算數-數量", "決算數量", "數量"])
    );
    const rawDeltaQuantity = parseFinancialNumber(
      getElementTextByTags(rowNode, [
        "本年度決算數與預算數比較增減-數量",
        "增減數量",
      ])
    );
    let rawDeltaQuantityPercent = parseFinancialNumber(
      getElementTextByTags(rowNode, [
        "本年度決算數與預算數比較增減-數量百分比",
        "增減數量百分比",
      ])
    );

    // 【核心修正】正負號連動校正邏輯
    // 如果「比較增減金額」為負值，強制「比較增減百分比」也必須為負值
    if (rawDeltaAmount !== null && rawDeltaAmount < 0) {
      if (rawDeltaPercent !== null && rawDeltaPercent > 0) {
        rawDeltaPercent = -rawDeltaPercent;
      }
    }

    // 如果「比較增減數量」為負值，強制「比較增減數量百分比」也必須為負值
    if (rawDeltaQuantity !== null && rawDeltaQuantity < 0) {
      if (rawDeltaQuantityPercent !== null && rawDeltaQuantityPercent > 0) {
        rawDeltaQuantityPercent = -rawDeltaQuantityPercent;
      }
    }

    fullData.push({
      term: term,
      code: code || "",
      sourceOrder: fullData.length,
      sourceType: "xml",
      level: level,
      amount: rawAmount,
      deltaAmount: rawDeltaAmount,
      deltaPercent: rawDeltaPercent,
      quantity: rawQuantity,
      deltaQuantity: rawDeltaQuantity,
      deltaQuantityPercent: rawDeltaQuantityPercent,
    });
  });

  if (reportType === "financial") {
    buildDerivedIncomeStatementRows(fullData);
  }

  const availableLevels = Array.from(levelSet).sort();

  // 若無層級，自動補正
  if (availableLevels.length === 0 && fullData.length > 0) {
    if (reportType === "productionSalesVolume") {
      availableLevels.push("N/A");
      fullData.forEach((row) => (row.level = "N/A"));
    } else {
      const defaultLevel = "預設層級";
      availableLevels.push(defaultLevel);
      fullData.forEach((row) => {
        if (!row.level) row.level = defaultLevel;
      });
    }
  }

  return { fullData, availableLevels, reportName, reportType, error: null };
}

/**
 * =========================================================
 *  功能二：結構分析工具 (StructureAnalysisTool 使用)
 *  【移植自您原先的 parseXmlData 邏輯】
 * =========================================================
 */
export function parseStructureXml(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");

  const errorNode = xmlDoc.querySelector("parsererror");
  if (errorNode) {
    throw new Error(
      errorNode.querySelector("div")?.textContent ||
        "XML 檔案格式不正確，無法解析。"
    );
  }

  const rows = xmlDoc.querySelectorAll("ROW");
  const allParsedAccounts = [];
  let assetsTotal = 0;
  let liabilitiesTotal = 0;
  let equityTotal = 0;
  let liabilitiesAndEquityTotal = 0;

  // 1. 第一次遍歷：抓取所有資料並計算總額
  rows.forEach((row) => {
    const seqNo = getElementText(row, "SEQNO") || "";
    const level = getElementText(row, "LEVEL") || "";
    const bold = getElementText(row, "BOLD") || "";
    const name = getElementText(row, "科目名稱") || "";
    const code = getElementText(row, "科目編號") || "";

    // 使用上方定義的 parseFinancialNumber (支援負數括號)
    const currentYearAmount = parseFinancialNumber(
      getElementText(row, "本年度決算數")
    );
    const lastYearAmount = parseFinancialNumber(
      getElementText(row, "上年度決算數")
    );
    const comparisonAmount = parseFinancialNumber(
      getElementText(row, "比較增減-金額")
    );
    const comparisonPercentage = parseFinancialNumber(
      getElementText(row, "比較增減-百分比")
    );
    const remark = getElementText(row, "備註") || "";

    // 【邏輯保留】處理 LEVEL 01 的總計邏輯
    if (level === "01") {
      if (name === "資產" && currentYearAmount !== null) {
        assetsTotal = currentYearAmount;
      } else if (name === "負債" && currentYearAmount !== null) {
        liabilitiesTotal = currentYearAmount;
      } else if (name === "權益" && currentYearAmount !== null) {
        equityTotal = currentYearAmount;
      } else if (name === "負債及權益總計" && currentYearAmount !== null) {
        liabilitiesAndEquityTotal = currentYearAmount;
      }
      return;
    }

    // 【邏輯保留】處理 LEVEL 02 的明細邏輯
    if (level === "02") {
      allParsedAccounts.push({
        seqNo,
        level,
        bold,
        name,
        code,
        currentYearAmount,
        lastYearAmount,
        comparisonAmount,
        comparisonPercentage,
        remark,
        percentageOfTotal: null,
        percentageBase: "未知",
      });
    }
  });

  // 補強邏輯：如果沒有明確的「負債及權益總計」，嘗試用加總
  if (
    liabilitiesTotal !== null &&
    equityTotal !== null &&
    liabilitiesAndEquityTotal === 0
  ) {
    liabilitiesAndEquityTotal = liabilitiesTotal + equityTotal;
  }

  // 2. 第二次遍歷：分類並計算百分比
  const assets = [];
  const liabilities = [];
  const equity = [];

  allParsedAccounts.forEach((account) => {
    let percentageOfTotal = null;
    let percentageBase = "未知";
    const amount = account.currentYearAmount;

    if (amount !== null) {
      if (account.code.startsWith("1")) {
        if (assetsTotal !== 0) {
          percentageOfTotal = (amount / assetsTotal) * 100;
        }
        percentageBase = "資產總額";
        assets.push({
          ...account,
          percentageOfTotal:
            percentageOfTotal !== null
              ? parseFloat(percentageOfTotal.toFixed(2))
              : null,
          percentageBase: percentageBase,
        });
      } else if (account.code.startsWith("2")) {
        if (liabilitiesAndEquityTotal !== 0) {
          percentageOfTotal = (amount / liabilitiesAndEquityTotal) * 100;
        }
        percentageBase = "負債及權益總額";
        liabilities.push({
          ...account,
          percentageOfTotal:
            percentageOfTotal !== null
              ? parseFloat(percentageOfTotal.toFixed(2))
              : null,
          percentageBase: percentageBase,
        });
      } else if (account.code.startsWith("3")) {
        if (liabilitiesAndEquityTotal !== 0) {
          percentageOfTotal = (amount / liabilitiesAndEquityTotal) * 100;
        }
        percentageBase = "負債及權益總額";
        equity.push({
          ...account,
          percentageOfTotal:
            percentageOfTotal !== null
              ? parseFloat(percentageOfTotal.toFixed(2))
              : null,
          percentageBase: percentageBase,
        });
      }
    }
  });

  // 3. 計算總體比率
  let liabilitiesToLiabAndEquityRatio = null;
  if (liabilitiesTotal !== null && liabilitiesAndEquityTotal !== 0) {
    liabilitiesToLiabAndEquityRatio =
      (liabilitiesTotal / liabilitiesAndEquityTotal) * 100;
  }

  let equityToLiabAndEquityRatio = null;
  if (equityTotal !== null && liabilitiesAndEquityTotal !== 0) {
    equityToLiabAndEquityRatio =
      (equityTotal / liabilitiesAndEquityTotal) * 100;
  }

  // 4. 返回與您原程式 State 一致的結構
  return {
    groupedAccounts: { assets, liabilities, equity },
    totalAssets: assetsTotal,
    totalLiabilities: liabilitiesTotal,
    totalEquity: equityTotal,
    totalLiabilitiesAndEquity: liabilitiesAndEquityTotal,
    liabilitiesToLiabAndEquityRatio: liabilitiesToLiabAndEquityRatio
      ? parseFloat(liabilitiesToLiabAndEquityRatio.toFixed(2))
      : null,
    equityToLiabAndEquityRatio: equityToLiabAndEquityRatio
      ? parseFloat(equityToLiabAndEquityRatio.toFixed(2))
      : null,
  };
}
