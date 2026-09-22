// src/FinancialRatioTool.js
import React, { useReducer, useEffect, useRef, useState } from "react";
import { parseStringPromise } from "xml2js";
// CSS Modules for this component
import styles from "./FinancialRatioTool.module.css";
// Shared styles from App
//import appStyles from "./App.module.css";
// 引入設定檔
import {
  ACCOUNT_CODES,
  TARGET_SUBJECTS,
  TARGET_SUBJECT_CODES,
} from "./constants/financialConstants.js";
import { useFileManager } from "./contexts/FileManagerContext";
import XmlFileSelector from "./components/XmlFileSelector";

// --- (1) Reducer: State Management Center ---
const initialState = {
  balanceSheets: {},
  incomeDatas: {},
  bsFiles: [],
  incFiles: [],
  selectedYear: "",
  manualAvgDeposit: "",
  manualEmployeeCount: "",
  manualNetCashFlow: "",
  resultsApp1: null,
  financialDataApp2: null,
  calculatedRatiosApp2: null,
  otherReports: {},
  loading: false,
  error: "",
  bsLoadingError: null,
  incLoadingError: null,
  tableCollapseState: {
    app1Ratios: false,
    app2Ratios: false,
    bsStructure: false,
    datapreview: false,
  },
};

function reducer(state, action) {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_ERROR":
      // A generic error that doesn't clear specific loading errors
      return { ...state, error: action.payload, loading: false };
    case "SET_BS_FILES":
      return {
        ...state,
        bsFiles: action.payload.files,
        balanceSheets: action.payload.balanceSheets,
        bsLoadingError: action.payload.error,
        loading: false,
        error: "", // Clear general error on new file op
      };
    case "SET_INC_FILES":
      return {
        ...state,
        incFiles: action.payload.files,
        incomeDatas: action.payload.incomeDatas,
        incLoadingError: action.payload.error,
        loading: false,
        error: "", // Clear general error on new file op
      };
    case "SET_SELECTED_YEAR":
      return {
        ...state,
        selectedYear: action.payload,
        resultsApp1: null,
        financialDataApp2: null,
        calculatedRatiosApp2: null,
        error: "",
        manualAvgDeposit: state.otherReports[action.payload]?.avgDeposit !== undefined ? state.otherReports[action.payload].avgDeposit : "",
        manualEmployeeCount: state.otherReports[action.payload]?.empCount !== undefined ? state.otherReports[action.payload].empCount : "",
        manualNetCashFlow: state.otherReports[action.payload]?.netCashFlow !== undefined ? state.otherReports[action.payload].netCashFlow : "",
      };
    case "SET_OTHER_REPORTS":
      const newReports = { ...state.otherReports, ...action.payload };
      const currentYearReports = newReports[state.selectedYear] || {};
      return {
        ...state,
        otherReports: newReports,
        manualAvgDeposit: (!state.manualAvgDeposit && currentYearReports.avgDeposit !== undefined) ? currentYearReports.avgDeposit : state.manualAvgDeposit,
        manualEmployeeCount: (!state.manualEmployeeCount && currentYearReports.empCount !== undefined) ? currentYearReports.empCount : state.manualEmployeeCount,
        manualNetCashFlow: (!state.manualNetCashFlow && currentYearReports.netCashFlow !== undefined) ? currentYearReports.netCashFlow : state.manualNetCashFlow,
      };
    case "SET_MANUAL_INPUT":
      return { ...state, [action.payload.field]: action.payload.value };
    case "CALCULATION_START":
      return {
        ...state,
        loading: true,
        error: "",
        resultsApp1: null,
        financialDataApp2: null,
        calculatedRatiosApp2: null,
      };
    case "CALCULATION_SUCCESS":
      return {
        ...state,
        resultsApp1: action.payload.resultsApp1,
        financialDataApp2: action.payload.financialDataApp2,
        calculatedRatiosApp2: action.payload.calculatedRatiosApp2,
        error: action.payload.error, // Can carry non-blocking errors
        loading: false,
      };
    case "CALCULATION_FAILURE":
      return {
        ...state,
        error: action.payload,
        resultsApp1: null,
        financialDataApp2: null,
        calculatedRatiosApp2: null,
        loading: false,
      };
    case "TOGGLE_TABLE_COLLAPSE":
      return {
        ...state,
        tableCollapseState: {
          ...state.tableCollapseState,
          [action.payload]: !state.tableCollapseState[action.payload],
        },
      };
    default:
      return state;
  }
}

// --- Component Definition ---
function FinancialRatioTool() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { files } = useFileManager();
  const processedFileIds = useRef(new Set()); // 記錄已處理過的檔案 ID
  const {
    balanceSheets,
    incomeDatas,
    bsFiles,
    incFiles,
    selectedYear,
    manualAvgDeposit,
    manualEmployeeCount,
    manualNetCashFlow,
    resultsApp1,
    financialDataApp2,
    calculatedRatiosApp2,
    loading,
    error,
    bsLoadingError,
    incLoadingError,
    tableCollapseState,
  } = state;

  // --- Constants and Helpers ---
  // (移除) 舊的硬編碼變數已移除，改用 ACCOUNT_CODES 等常數
  const targetCodeToSubject = Object.entries(TARGET_SUBJECT_CODES).reduce(
    (acc, [code, name]) => {
      acc[code] = name;
      return acc;
    },
    {}
  );
  const normalize = (str) => (str ? str.replace(/[\s\u3000]/g, "") : "");

  const findValue = (rows, accountCode, valueField = "本年度決算數") => {
    if (!rows || !Array.isArray(rows)) return null;
    const row = rows.find(
      (r) => r["科目編號"] && r["科目編號"][0] === accountCode
    );
    if (row && row[valueField] && row[valueField][0]) {
      const cleanedValue = String(row[valueField][0]).replace(/,/g, "");
      const valueString = cleanedValue.replace(/[()]/g, "");
      const value = parseFloat(valueString);
      const finalValue =
        cleanedValue.includes("(") && cleanedValue.includes(")")
          ? -value
          : value;
      return isNaN(finalValue) ? null : Number(finalValue);
    }
    return null;
  };

  const formatNumThousands = (num) => {
    if (num === null || num === undefined || isNaN(Number(num))) return "?";
    try {
      const numInThousands = Math.round(Number(num) / 1000);
      return numInThousands.toLocaleString("en-US");
    } catch {
      return String(Math.round(Number(num) / 1000));
    }
  };

  const formatNumFull = (num) => {
    if (num === null || num === undefined || isNaN(Number(num))) return "?";
    try {
      return Number(num).toLocaleString("en-US", { maximumFractionDigits: 0 });
    } catch {
      return String(num);
    }
  };

  // --- Parsing Functions ---
  const extractYearFromParsedXml = (parsedXml) => {
    try {
      const header = parsedXml?.GenericData?.Header?.[0];
      if (!header) return "Unknown";
      const yearElem = header["年度"]?.[0] || header["Year"]?.[0];
      return yearElem ? String(yearElem).trim() : "Unknown";
    } catch (e) {
      console.error("Error extracting year:", e);
      return "Unknown";
    }
  };

  const parseBalanceSheetAggregated = (rows) => {
    const data = {
      資產: 0,
      負債: 0,
      流動資產: 0,
      流動負債: 0,
      存款: 0,
      銀行業存款: 0,
      國際金融機構存款: 0,
      權益: 0,
      使用權資產: 0,
      currentAssets: null,
      previousAssets: null,
      currentEquity: null,
      previousEquity: null,
      capital: null,
    };
    if (!rows || !Array.isArray(rows)) return data;
    // 使用 ACCOUNT_CODES 取代硬編碼
    data.currentAssets = findValue(rows, ACCOUNT_CODES.ASSETS, "本年度決算數");
    data.previousAssets = findValue(rows, ACCOUNT_CODES.ASSETS, "上年度決算數");
    data.currentEquity = findValue(rows, ACCOUNT_CODES.EQUITY, "本年度決算數");
    data.previousEquity = findValue(rows, ACCOUNT_CODES.EQUITY, "上年度決算數");
    data.capital = findValue(rows, ACCOUNT_CODES.CAPITAL, "本年度決算數");
    rows.forEach((row) => {
      const code = row["科目編號"]?.[0]?.trim();
      const name = row["科目名稱"]?.[0]?.trim();
      const value = findValue(rows, code, "本年度決算數");
      if (value === null || !code) return;
      const normName = normalize(name || "");
      if (code === "1") data["資產"] = value;
      else if (code === ACCOUNT_CODES.LIABILITIES) data["負債"] = value;
      else if (code === ACCOUNT_CODES.CURRENT_ASSETS) data["流動資產"] = value;
      else if (code === ACCOUNT_CODES.CURRENT_LIABILITIES)
        data["流動負債"] = value;
      else if (code === ACCOUNT_CODES.DEPOSITS) data["存款"] = value;
      else if (code === ACCOUNT_CODES.BANK_DEPOSITS) data["銀行業存款"] = value;
      else if (normName === "國際金融機構存款")
        data["國際金融機構存款"] = value;
      else if (code === ACCOUNT_CODES.EQUITY) data["權益"] = value;
      else if (code === ACCOUNT_CODES.RIGHT_OF_USE_ASSETS)
        data["使用權資產"] = value;
    });
    data.資產 = data.currentAssets ?? data.資產;
    data.權益 = data.currentEquity ?? data.權益;
    if (data.負債 === 0)
      data.負債 =
        findValue(rows, ACCOUNT_CODES.LIABILITIES, "本年度決算數") ?? 0;
    if (data.流動資產 === 0)
      data.流動資產 =
        findValue(rows, ACCOUNT_CODES.CURRENT_ASSETS, "本年度決算數") ?? 0;
    if (data.流動負債 === 0)
      data.流動負債 =
        findValue(rows, ACCOUNT_CODES.CURRENT_LIABILITIES, "本年度決算數") ?? 0;
    if (data.使用權資產 === 0)
      data.使用權資產 =
        findValue(rows, ACCOUNT_CODES.RIGHT_OF_USE_ASSETS, "本年度決算數") ?? 0;
    if (data.存款 === 0)
      data.存款 = findValue(rows, ACCOUNT_CODES.DEPOSITS, "本年度決算數") ?? 0;
    return data;
  };

  const parseIncomeStatementAggregated = (rows) => {
    if (!rows || !Array.isArray(rows)) return {};
    const getData = (code) => ({
      Actual: findValue(rows, code, "本年度決算數"),
      Budget: findValue(rows, code, "本年度預算數"),
      Previous: findValue(rows, code, "上年度決算數"),
    });
    const interestIncome = getData(ACCOUNT_CODES.INTEREST_INCOME);
    const fvtplGain = getData(ACCOUNT_CODES.FVTPL_GAIN);
    const fxGain = getData(ACCOUNT_CODES.FX_GAIN);
    const trustGainLoss = getData(ACCOUNT_CODES.TRUST_GAIN_LOSS);

    const investmentGainLoss_Actual =
      findValue(
        rows,
        ACCOUNT_CODES.INVESTMENT_GAIN_LOSS_PRIMARY,
        "本年度決算數"
      ) ??
      findValue(
        rows,
        ACCOUNT_CODES.INVESTMENT_GAIN_LOSS_SECONDARY,
        "本年度決算數"
      );
    const investmentGainLoss_Budget =
      findValue(
        rows,
        ACCOUNT_CODES.INVESTMENT_GAIN_LOSS_PRIMARY,
        "本年度預算數"
      ) ??
      findValue(
        rows,
        ACCOUNT_CODES.INVESTMENT_GAIN_LOSS_SECONDARY,
        "本年度預算數"
      );
    const investmentGainLoss_Previous =
      findValue(
        rows,
        ACCOUNT_CODES.INVESTMENT_GAIN_LOSS_PRIMARY,
        "上年度決算數"
      ) ??
      findValue(
        rows,
        ACCOUNT_CODES.INVESTMENT_GAIN_LOSS_SECONDARY,
        "上年度決算數"
      );

    const interestExpense = getData(ACCOUNT_CODES.INTEREST_EXPENSE);
    const revenuePrevious = findValue(
      rows,
      ACCOUNT_CODES.REVENUE,
      "上年度決算數"
    );

    return {
      operatingRevenue: findValue(rows, ACCOUNT_CODES.REVENUE, "本年度決算數"),
      profitBeforeTax: findValue(
        rows,
        ACCOUNT_CODES.PROFIT_BEFORE_TAX,
        "本年度決算數"
      ),
      netIncome_Actual: findValue(
        rows,
        ACCOUNT_CODES.NET_INCOME,
        "本年度決算數"
      ),
      operatingProfit_Actual: findValue(
        rows,
        ACCOUNT_CODES.OPERATING_PROFIT,
        "本年度決算數"
      ),
      revenue_Actual: findValue(rows, ACCOUNT_CODES.REVENUE, "本年度決算數"),
      revenue_Previous: revenuePrevious,
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
      netIncome_Budget: findValue(
        rows,
        ACCOUNT_CODES.NET_INCOME,
        "本年度預算數"
      ),
      netIncome_Previous: findValue(
        rows,
        ACCOUNT_CODES.NET_INCOME,
        "上年度決算數"
      ),
    };
  };

  const parseBalanceSheetDetails = (rows) => {
    const result = {};
    if (!rows || !Array.isArray(rows)) return result;
    rows.forEach((row) => {
      const codeNode = row["科目編號"]?.[0];
      if (!codeNode) return;
      const code = codeNode.trim();
      const rawNumber = findValue(rows, code, "本年度決算數");
      if (rawNumber === null) return;
      const formattedValue = rawNumber.toLocaleString("en-US", {
        maximumFractionDigits: 0,
        minimumFractionDigits: 0,
      });
      if (targetCodeToSubject[code]) {
        const targetSubjectName = targetCodeToSubject[code];
        result[targetSubjectName] = {
          formatted: formattedValue,
          raw: rawNumber,
        };
      }
    });
    TARGET_SUBJECTS.forEach((subjName) => {
      if (!result[subjName]) {
        result[subjName] = null;
      }
    });
    return result;
  };

  // --- File Handling ---
  const handleBsFileChange = async (e) => {
    const selectedFiles = Array.from(e.target.files);
    dispatch({ type: "SET_LOADING", payload: true });

    if (!selectedFiles.length) {
      dispatch({
        type: "SET_BS_FILES",
        payload: { files: [], balanceSheets: {}, error: null },
      });
      if (e.target) e.target.value = null;
      return;
    }

    const newBalanceSheets = {};
    let currentError = null;
    try {
      for (const file of selectedFiles) {
        const fileContent = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target.result);
          reader.onerror = () =>
            reject(new Error(`讀取檔案失敗: ${file.name}`));
          reader.readAsText(file, "UTF-8");
        });
        const parsedXml = await parseStringPromise(fileContent, {
          explicitArray: true,
        });
        if (!parsedXml || !parsedXml.GenericData) {
          currentError = `檔案 ${file.name} XML結構無效。`;
          continue;
        }
        const year = extractYearFromParsedXml(parsedXml);
        if (year === "Unknown") {
          currentError = `檔案 ${file.name} 無法提取年度。`;
          continue;
        }
        const rows = parsedXml.GenericData.DataSet?.[0]?.ROW;
        const header = parsedXml.GenericData.Header?.[0];
        const reportName =
          header?.["報表名稱"]?.[0] || header?.Table?.[0]?.$?.Name;
        const isBalanceSheet =
          findValue(rows, ACCOUNT_CODES.ASSETS, "本年度決算數") !== null ||
          reportName?.includes("資產負債");

        if (isBalanceSheet && rows) {
          console.log(
            `Detected Balance Sheet for year ${year} in file ${file.name}`
          );
          const aggregatedData = parseBalanceSheetAggregated(rows);
          const detailsData = parseBalanceSheetDetails(rows);
          newBalanceSheets[year] = {
            aggregated: aggregatedData,
            details: detailsData,
            fileName: file.name,
          };
        } else {
          currentError = `檔案 ${file.name} 似乎不是有效的資產負債表 XML。`;
        }
      }
      dispatch({
        type: "SET_BS_FILES",
        payload: {
          files: selectedFiles,
          balanceSheets: newBalanceSheets,
          error: currentError,
        },
      });
    } catch (err) {
      dispatch({
        type: "SET_BS_FILES",
        payload: {
          files: [],
          balanceSheets: {},
          error: `處理資產負債表檔案時發生錯誤: ${err.message || err}`,
        },
      });
    }
    if (e.target) e.target.value = null;
  };

  const handleIncFileChange = async (e) => {
    const selectedFiles = Array.from(e.target.files);
    dispatch({ type: "SET_LOADING", payload: true });

    if (!selectedFiles.length) {
      dispatch({
        type: "SET_INC_FILES",
        payload: { files: [], incomeDatas: {}, error: null },
      });
      if (e.target) e.target.value = null;
      return;
    }

    const newIncomeDatas = {};
    let currentError = null;
    try {
      for (const file of selectedFiles) {
        const fileContent = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target.result);
          reader.onerror = () =>
            reject(new Error(`讀取檔案失敗: ${file.name}`));
          reader.readAsText(file, "UTF-8");
        });
        const parsedXml = await parseStringPromise(fileContent, {
          explicitArray: true,
        });
        if (!parsedXml || !parsedXml.GenericData) {
          currentError = `檔案 ${file.name} XML結構無效。`;
          continue;
        }
        const year = extractYearFromParsedXml(parsedXml);
        if (year === "Unknown") {
          currentError = `檔案 ${file.name} 無法提取年度。`;
          continue;
        }
        const rows = parsedXml.GenericData.DataSet?.[0]?.ROW;
        const header = parsedXml.GenericData.Header?.[0];
        const reportName =
          header?.["報表名稱"]?.[0] || header?.Table?.[0]?.$?.Name;
        // 使用 ACCOUNT_CODES.NET_INCOME 取代 "68"
        const isIncomeStatement =
          findValue(rows, ACCOUNT_CODES.NET_INCOME, "本年度決算數") !== null ||
          reportName?.includes("損益");

        if (isIncomeStatement && rows) {
          console.log(
            `Detected Income Statement for year ${year} in file ${file.name}`
          );
          const aggregatedData = parseIncomeStatementAggregated(rows);
          newIncomeDatas[year] = {
            aggregated: aggregatedData,
            fileName: file.name,
          };
        } else {
          currentError = `檔案 ${file.name} 似乎不是有效的損益表 XML。`;
        }
      }
      dispatch({
        type: "SET_INC_FILES",
        payload: {
          files: selectedFiles,
          incomeDatas: newIncomeDatas,
          error: currentError,
        },
      });
    } catch (err) {
      dispatch({
        type: "SET_INC_FILES",
        payload: {
          files: [],
          incomeDatas: {},
          error: `處理損益表檔案時發生錯誤: ${err.message || err}`,
        },
      });
    }
    if (e.target) e.target.value = null;
  };

  const getCommonYears = () => {
    const bsYears = Object.keys(balanceSheets);
    const incYears = Object.keys(incomeDatas);
    return bsYears
      .filter((year) => incYears.includes(year))
      .sort((a, b) => b - a);
  };

  useEffect(() => {
    const years = getCommonYears();
    if (years.length > 0 && (!selectedYear || !years.includes(selectedYear))) {
      dispatch({ type: "SET_SELECTED_YEAR", payload: years[0] });
    } else if (years.length === 0 && selectedYear) {
      dispatch({ type: "SET_SELECTED_YEAR", payload: "" });
    }
  }, [balanceSheets, incomeDatas]);

  // --- 自動從 FileManagerContext 載入 XML 檔案 ---
  useEffect(() => {
    const newFiles = files.filter((f) => !processedFileIds.current.has(f.id));
    if (newFiles.length === 0) return;

    for (const f of newFiles) {
      processedFileIds.current.add(f.id);
    }

    const balanceFiles = newFiles.filter((f) => f.detectedType === "balance");
    const incomeFiles  = newFiles.filter((f) => f.detectedType === "income");
    if (newFiles.length === 0) return;

    const processAll = async () => {
      dispatch({ type: "SET_LOADING", payload: true });

      // --- 其他報表 (營業量值、員工人數、現金流量) ---
      const newOtherReports = {};
      let hasOtherReportsChanges = false;
      for (const entry of newFiles) {
        try {
          const parsedXml = await parseStringPromise(entry.rawContent, { explicitArray: true });
          if (!parsedXml?.GenericData) continue;
          
          const year = extractYearFromParsedXml(parsedXml);
          if (year === "Unknown") continue;
          
          const rows = parsedXml.GenericData.DataSet?.[0]?.ROW;
          const header = parsedXml.GenericData.Header?.[0];
          const reportName = header?.["報表名稱"]?.[0] || header?.Table?.[0]?.$?.Name;

          if (!rows) continue;

          if (reportName?.includes("主要產銷(營運)量值比較表") || reportName?.includes("營運量值比較")) {
            const depositRow = rows.find(r => r["產銷項目-名稱"]?.[0]?.includes("存款"));
            if (depositRow && depositRow["本年度決算數-數量"]?.[0]) {
              if (!newOtherReports[year]) newOtherReports[year] = {};
              newOtherReports[year].avgDeposit = String(depositRow["本年度決算數-數量"][0]).replace(/,/g, "");
              hasOtherReportsChanges = true;
            }
          } else if (reportName?.includes("員工人數彙計表") || reportName?.includes("員工人數")) {
            const totalRow = rows.find(r => r["科目-名稱"]?.[0]?.replace(/\s/g, "") === "合計");
            if (totalRow) {
              const domestic = parseInt(String(totalRow["決算數-國內部分"]?.[0] || "0").replace(/,/g, ""), 10);
              const foreign = parseInt(String(totalRow["決算數-國外部分"]?.[0] || "0").replace(/,/g, ""), 10);
              if (!isNaN(domestic) && !isNaN(foreign)) {
                if (!newOtherReports[year]) newOtherReports[year] = {};
                newOtherReports[year].empCount = String(domestic + foreign);
                hasOtherReportsChanges = true;
              }
            }
          } else if (reportName?.includes("現金流量表")) {
            const cfRow = rows.find(r => r["項目名稱"]?.[0]?.replace(/\s/g, "").includes("營業活動之淨現金流入"));
            if (cfRow && cfRow["決算數"]?.[0]) {
              if (!newOtherReports[year]) newOtherReports[year] = {};
              newOtherReports[year].netCashFlow = String(cfRow["決算數"][0]).replace(/,/g, "");
              hasOtherReportsChanges = true;
            }
          }
        } catch (e) {
          // ignore parsing error for side-reports
        }
      }
      
      if (hasOtherReportsChanges) {
        dispatch({
          type: "SET_OTHER_REPORTS",
          payload: newOtherReports
        });
      }

      // --- 資產負債表 ---
      const newBalanceSheets = { ...balanceSheets };
      let bsError = null;
      for (const entry of balanceFiles) {
        try {
          const parsedXml = await parseStringPromise(entry.rawContent, { explicitArray: true });
          if (!parsedXml?.GenericData) { bsError = `${entry.fileName}: XML 結構無效`; continue; }
          const year = extractYearFromParsedXml(parsedXml);
          if (year === "Unknown") { bsError = `${entry.fileName}: 無法取得年度`; continue; }
          const rows = parsedXml.GenericData.DataSet?.[0]?.ROW;
          if (findValue(rows, ACCOUNT_CODES.ASSETS, "本年度決算數") !== null && rows) {
            newBalanceSheets[year] = {
              aggregated: parseBalanceSheetAggregated(rows),
              details:    parseBalanceSheetDetails(rows),
              fileName:   entry.fileName,
            };
          }
        } catch (e) {
          bsError = `${entry.fileName}: 解析失敗`;
        }
      }
      if (Object.keys(newBalanceSheets).length > Object.keys(balanceSheets).length) {
        dispatch({
          type: "SET_BS_FILES",
          payload: {
            files: Object.values(newBalanceSheets).map((v) => ({ name: v.fileName })),
            balanceSheets: newBalanceSheets,
            error: bsError,
          },
        });
      } else {
        dispatch({ type: "SET_LOADING", payload: false });
      }

      // --- 損益表 ---
      const newIncomeDatas = { ...incomeDatas };
      let incError = null;
      for (const entry of incomeFiles) {
        try {
          const parsedXml = await parseStringPromise(entry.rawContent, { explicitArray: true });
          if (!parsedXml?.GenericData) { incError = `${entry.fileName}: XML 結構無效`; continue; }
          const year = extractYearFromParsedXml(parsedXml);
          if (year === "Unknown") { incError = `${entry.fileName}: 無法取得年度`; continue; }
          const rows = parsedXml.GenericData.DataSet?.[0]?.ROW;
          if (findValue(rows, ACCOUNT_CODES.NET_INCOME, "本年度決算數") !== null && rows) {
            newIncomeDatas[year] = {
              aggregated: parseIncomeStatementAggregated(rows),
              fileName:   entry.fileName,
            };
          }
        } catch (e) {
          incError = `${entry.fileName}: 解析失敗`;
        }
      }
      if (Object.keys(newIncomeDatas).length > Object.keys(incomeDatas).length) {
        dispatch({
          type: "SET_INC_FILES",
          payload: {
            files: Object.values(newIncomeDatas).map((v) => ({ name: v.fileName })),
            incomeDatas: newIncomeDatas,
            error: incError,
          },
        });
      } else {
        dispatch({ type: "SET_LOADING", payload: false });
      }
    };

    processAll();
  }, [files]); // 監聽全域檔案池變化

  const getFundYieldNumeratorSum = (data, type = "Actual") => {
    if (!data) return null;
    const suffix = `_${type}`;
    const interestIncome =
      typeof data[`interestIncome${suffix}`] === "number"
        ? data[`interestIncome${suffix}`]
        : 0;
    const fvtplGain =
      typeof data[`fvtplGain${suffix}`] === "number"
        ? data[`fvtplGain${suffix}`]
        : 0;
    const fxGain =
      typeof data[`fxGain${suffix}`] === "number" ? data[`fxGain${suffix}`] : 0;
    const trustGainLoss =
      typeof data[`trustGainLoss${suffix}`] === "number"
        ? data[`trustGainLoss${suffix}`]
        : 0;
    const investmentGainLoss =
      typeof data[`investmentGainLoss${suffix}`] === "number"
        ? data[`investmentGainLoss${suffix}`]
        : 0;
    return (
      interestIncome + fvtplGain + fxGain + trustGainLoss + investmentGainLoss
    );
  };

  const calculateAllResults = () => {
    if (
      !selectedYear ||
      !balanceSheets[selectedYear]?.aggregated ||
      !incomeDatas[selectedYear]?.aggregated
    ) {
      dispatch({
        type: "CALCULATION_FAILURE",
        payload: "請選擇有效的年度並確保已載入對應的資產負債表和損益表檔案。",
      });
      return;
    }

    dispatch({ type: "CALCULATION_START" });

    setTimeout(() => {
      try {
        // --- App 1 Calculations ---
        const bsDataApp1 = balanceSheets[selectedYear].aggregated;
        const incDataApp1 = incomeDatas[selectedYear].aggregated;
        const results1 = {};
        results1.debtAssetRatio =
          bsDataApp1?.資產 && bsDataApp1.資產 !== 0
            ? (bsDataApp1.負債 ?? 0) / bsDataApp1.資產
            : null;
        const deposits2103 = bsDataApp1?.銀行業存款 ?? 0;
        const deposits2104 = bsDataApp1?.國際金融機構存款 ?? 0;
        const deposits22 = bsDataApp1?.存款 ?? 0;
        const totalDepositsForRatio = deposits2103 + deposits2104 + deposits22;
        results1.depositEquityRatio =
          bsDataApp1?.權益 && bsDataApp1.權益 !== 0
            ? (totalDepositsForRatio / bsDataApp1.權益) * 100
            : null;
        results1.currentRatio =
          bsDataApp1?.流動負債 && bsDataApp1.流動負債 !== 0
            ? (bsDataApp1.流動資產 ?? 0) / bsDataApp1.流動負債
            : null;
        results1.interestCoverageRatio =
          incDataApp1?.profitBeforeTax !== null &&
          incDataApp1?.interestExpense_Actual &&
          incDataApp1.interestExpense_Actual !== 0
            ? ((incDataApp1.profitBeforeTax +
                incDataApp1.interestExpense_Actual) /
                incDataApp1.interestExpense_Actual) *
              100
            : null;
        const avgDeposit = parseFloat(manualAvgDeposit);
        const empCount = parseInt(manualEmployeeCount, 10);
        const netCF = parseFloat(manualNetCashFlow);
        results1.interestExpenseRatio =
          !isNaN(avgDeposit) &&
          avgDeposit !== 0 &&
          incDataApp1?.interestExpense_Actual !== null
            ? (incDataApp1.interestExpense_Actual / avgDeposit) * 100
            : null;
        results1.totalAssetTurnover =
          incDataApp1?.operatingRevenue !== null &&
          bsDataApp1?.資產 &&
          bsDataApp1.資產 !== 0
            ? incDataApp1.operatingRevenue / bsDataApp1.資產
            : null;
        results1.employeeAverageRevenue =
          !isNaN(empCount) &&
          empCount !== 0 &&
          incDataApp1?.operatingRevenue !== null
            ? Math.round(incDataApp1.operatingRevenue / empCount / 1000)
            : null;
        results1.employeeAverageProfit =
          !isNaN(empCount) &&
          empCount !== 0 &&
          incDataApp1?.netIncome_Actual !== null
            ? Math.round(incDataApp1.netIncome_Actual / empCount / 1000)
            : null;
        results1.cashFlowRatio =
          !isNaN(netCF) && bsDataApp1?.流動負債 && bsDataApp1.流動負債 !== 0
            ? (netCF / bsDataApp1.流動負債) * 100
            : null;

        // --- App 2 Calculations ---
        const bsDataApp2Current = balanceSheets[selectedYear]?.aggregated;
        const incDataApp2Current = incomeDatas[selectedYear]?.aggregated;
        let app2ErrorMessages = [];
        if (!bsDataApp2Current)
          app2ErrorMessages.push(`缺少 ${selectedYear} 年度資產負債表數據.`);
        if (!incDataApp2Current)
          app2ErrorMessages.push(`缺少 ${selectedYear} 年度損益表數據.`);
        if (app2ErrorMessages.length > 0) {
          dispatch({
            type: "CALCULATION_FAILURE",
            payload: `無法計算部分比率: ${app2ErrorMessages.join("; ")}`,
          });
          return;
        }

        const extractedDataApp2 = {
          operatingProfit: incDataApp2Current.operatingProfit_Actual,
          revenue: incDataApp2Current.revenue_Actual,
          revenue_Previous: incDataApp2Current.revenue_Previous,
          netIncome: incDataApp2Current.netIncome_Actual,
          currentAssets: bsDataApp2Current.currentAssets,
          currentEquity: bsDataApp2Current.currentEquity,
          capital: bsDataApp2Current.capital,
          previousAssets: bsDataApp2Current.previousAssets,
          previousEquity: bsDataApp2Current.previousEquity,
          avgAssets: null,
          avgEquity: null,
          interestIncome_Actual: incDataApp2Current.interestIncome_Actual,
          interestIncome_Budget: incDataApp2Current.interestIncome_Budget,
          interestIncome_Previous: incDataApp2Current.interestIncome_Previous,
          fvtplGain_Actual: incDataApp2Current.fvtplGain_Actual,
          fvtplGain_Budget: incDataApp2Current.fvtplGain_Budget,
          fvtplGain_Previous: incDataApp2Current.fvtplGain_Previous,
          fxGain_Actual: incDataApp2Current.fxGain_Actual,
          fxGain_Budget: incDataApp2Current.fxGain_Budget,
          fxGain_Previous: incDataApp2Current.fxGain_Previous,
          trustGainLoss_Actual: incDataApp2Current.trustGainLoss_Actual,
          trustGainLoss_Budget: incDataApp2Current.trustGainLoss_Budget,
          trustGainLoss_Previous: incDataApp2Current.trustGainLoss_Previous,
          investmentGainLoss_Actual:
            incDataApp2Current.investmentGainLoss_Actual,
          investmentGainLoss_Budget:
            incDataApp2Current.investmentGainLoss_Budget,
          investmentGainLoss_Previous:
            incDataApp2Current.investmentGainLoss_Previous,
          interestExpense_Actual: incDataApp2Current.interestExpense_Actual,
          interestExpense_Budget: incDataApp2Current.interestExpense_Budget,
          interestExpense_Previous: incDataApp2Current.interestExpense_Previous,
          netIncome_Budget: incDataApp2Current.netIncome_Budget,
          netIncome_Previous: incDataApp2Current.netIncome_Previous,
        };
        if (
          typeof extractedDataApp2.currentAssets === "number" &&
          typeof extractedDataApp2.previousAssets === "number"
        ) {
          extractedDataApp2.avgAssets =
            (extractedDataApp2.currentAssets +
              extractedDataApp2.previousAssets) /
            2;
        }
        if (
          typeof extractedDataApp2.currentEquity === "number" &&
          typeof extractedDataApp2.previousEquity === "number"
        ) {
          extractedDataApp2.avgEquity =
            (extractedDataApp2.currentEquity +
              extractedDataApp2.previousEquity) /
            2;
        }

        const ratiosApp2 = {};
        const {
          operatingProfit,
          revenue,
          netIncome,
          capital,
          avgAssets,
          avgEquity,
          interestIncome_Actual,
          fvtplGain_Actual,
          fxGain_Actual,
          trustGainLoss_Actual,
          investmentGainLoss_Actual,
          interestExpense_Actual,
          interestIncome_Budget,
          fvtplGain_Budget,
          fxGain_Budget,
          trustGainLoss_Budget,
          investmentGainLoss_Budget,
          interestExpense_Budget,
          interestIncome_Previous,
          fvtplGain_Previous,
          fxGain_Previous,
          trustGainLoss_Previous,
          investmentGainLoss_Previous,
          interestExpense_Previous,
        } = extractedDataApp2;
        ratiosApp2.operatingMargin = revenue ? operatingProfit / revenue : null;
        ratiosApp2.netMargin = revenue ? netIncome / revenue : null;
        const shares = capital ? capital / 10 : null;
        ratiosApp2.eps = shares ? netIncome / shares : null;
        ratiosApp2.roa = avgAssets ? netIncome / avgAssets : null;
        ratiosApp2.roe = avgEquity ? netIncome / avgEquity : null;
        const calculateFundYieldRatio = (
          intInc,
          fvtpl,
          fx,
          trust,
          invest,
          intExp
        ) => {
          if (intExp === null || intExp === undefined)
            return "N/A (無利息費用)";
          const numerator =
            (intInc ?? 0) +
            (fvtpl ?? 0) +
            (fx ?? 0) +
            (trust ?? 0) +
            (invest ?? 0);
          const denominator = Number(intExp);
          if (denominator === 0)
            return numerator > 0
              ? Infinity
              : numerator < 0
              ? -Infinity
              : "N/A (收益/成本皆0)";
          return numerator / denominator;
        };
        ratiosApp2.fundYieldToCost_Actual = calculateFundYieldRatio(
          interestIncome_Actual,
          fvtplGain_Actual,
          fxGain_Actual,
          trustGainLoss_Actual,
          investmentGainLoss_Actual,
          interestExpense_Actual
        );
        ratiosApp2.fundYieldToCost_Budget = calculateFundYieldRatio(
          interestIncome_Budget,
          fvtplGain_Budget,
          fxGain_Budget,
          trustGainLoss_Budget,
          investmentGainLoss_Budget,
          interestExpense_Budget
        );
        ratiosApp2.fundYieldToCost_Previous = calculateFundYieldRatio(
          interestIncome_Previous,
          fvtplGain_Previous,
          fxGain_Previous,
          trustGainLoss_Previous,
          investmentGainLoss_Previous,
          interestExpense_Previous
        );

        const formatRatioPercent = (ratio) => {
          if (typeof ratio === "number") {
            if (!isFinite(ratio)) return ratio > 0 ? "> 9999%" : "< -9999%";
            return `${(ratio * 100).toFixed(2)}%`;
          }
          return ratio;
        };

        const formattedRatiosApp2 = {
          operatingMargin:
            formatRatioPercent(ratiosApp2.operatingMargin) ?? "N/A",
          netMargin: formatRatioPercent(ratiosApp2.netMargin) ?? "N/A",
          eps:
            typeof ratiosApp2.eps === "number"
              ? ratiosApp2.eps.toFixed(2)
              : "N/A",
          roa: formatRatioPercent(ratiosApp2.roa) ?? "N/A",
          roe: formatRatioPercent(ratiosApp2.roe) ?? "N/A",
          fundYieldToCost_Actual:
            formatRatioPercent(ratiosApp2.fundYieldToCost_Actual) ?? "N/A",
          fundYieldToCost_Budget:
            formatRatioPercent(ratiosApp2.fundYieldToCost_Budget) ?? "N/A",
          fundYieldToCost_Previous:
            formatRatioPercent(ratiosApp2.fundYieldToCost_Previous) ?? "N/A",
        };

        dispatch({
          type: "CALCULATION_SUCCESS",
          payload: {
            resultsApp1: results1,
            financialDataApp2: extractedDataApp2,
            calculatedRatiosApp2: formattedRatiosApp2,
            error: app2ErrorMessages.join("; "), // Pass along any non-critical errors
          },
        });
      } catch (err) {
        console.error("Error during calculation:", err);
        dispatch({
          type: "CALCULATION_FAILURE",
          payload: `計算時發生錯誤: ${err.message}`,
        });
      }
    }, 50);
  };

  const handleManualInputChange = (field, value) => {
    dispatch({ type: "SET_MANUAL_INPUT", payload: { field, value } });
  };

  const toggleTableCollapse = (tableKey) => {
    dispatch({ type: "TOGGLE_TABLE_COLLAPSE", payload: tableKey });
  };

  const commonYears = getCommonYears();
  const showResults =
    !loading &&
    (resultsApp1 ||
      calculatedRatiosApp2 ||
      balanceSheets[selectedYear]?.details);
  const showPlaceholder =
    (!bsFiles.length && !incFiles.length) ||
    (!loading &&
      bsFiles.length > 0 &&
      incFiles.length > 0 &&
      commonYears.length === 0);
  const showCalculationArea = !loading && commonYears.length > 0;
  const renderCollapseHeader = (tableKey, title, meta) => (
    <button
      type="button"
      className={styles.collapsibleHeaderButton}
      onClick={() => toggleTableCollapse(tableKey)}
      aria-expanded={!tableCollapseState[tableKey]}
    >
      <span className={styles.collapsibleHeaderText}>
        <strong>{title}</strong>
        {meta ? <small>{meta}</small> : null}
      </span>
      <span className={styles.collapseToggleBadge}>
        <span className={styles.collapseToggleArrow} aria-hidden="true">
          {tableCollapseState[tableKey] ? ">" : "v"}
        </span>
        {tableCollapseState[tableKey] ? "??" : "??"}
      </span>
    </button>
  );

  return (
    <div className={styles.financialRatioTool}>
      {error && <p className={styles.errorMessage}>錯誤: {error}</p>}
      {(bsLoadingError || incLoadingError) && (
        <p className={styles.loadingError}>
          檔案載入錯誤: {bsLoadingError && `[資產負債表] ${bsLoadingError}`}{" "}
          {bsLoadingError && incLoadingError && " | "}{" "}
          {incLoadingError && `[損益表] ${incLoadingError}`}
        </p>
      )}
      {/* 步驟 1：選擇 XML 檔案 */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>
          <span>1. 選擇基準數據</span>
          <span className={styles.infoTooltip} tabIndex={0}>
            使用說明
            <span className={styles.infoTooltipPanel}>
              <strong>說明：</strong>
              此工具用於計算各年度之財務比率、經營比率及投資報酬分析。
              <br />
              <strong>使用方式：</strong>
              <br />
              1. 分別上傳資產負債表與損益表 XML，可同時載入多年度資料。
              <br />
              2. 系統會自動整理可分析年度，並帶出對應基準數據。
              <br />
              3. 輸入必要補充資訊後，即可執行比率分析。
            </span>
          </span>
        </h2>

        <div className={styles.uploadCardsContainer}>
          {/* 資產負債表區 */}
          <div>
            <XmlFileSelector
              label="資產負債表 XML（可多年度）"
              acceptTypes={["balance"]}
              onFileReady={() => {}}
              hint="選擇後即加入本工具；不需重複選取已載入年度"
            />

            {/* 已載入的資產負債表清單 */}
            {bsFiles.length > 0 && (
              <div style={{ marginTop: "8px", fontSize: "0.83em", color: "#475569" }}>
                <strong>已載入的多年度資料：</strong>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                  {Object.entries(balanceSheets).map(([year, data]) => (
                    <span key={year} style={{
                      padding: "2px 8px", borderRadius: "6px",
                      background: "#f0fdf4", border: "1px solid #86efac",
                      color: "#166534", fontWeight: 600
                    }}>
                      {year} 年 · {data.fileName}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {bsLoadingError && (
              <p style={{ color: "var(--color-danger)", fontSize: "0.85em", marginTop: "6px" }}>
                資產負債表載入錯誤：{bsLoadingError}
              </p>
            )}
          </div>

          {/* 損益表區 */}
          <div>
            <XmlFileSelector
              label="損益表 XML（可多年度）"
              acceptTypes={["income"]}
              onFileReady={() => {}}
              hint="選擇後即加入本工具；不需重複選取已載入年度"
            />

            {/* 已載入的損益表清單 */}
            {incFiles.length > 0 && (
              <div style={{ marginTop: "8px", fontSize: "0.83em", color: "#475569" }}>
                <strong>已載入的多年度資料：</strong>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                  {Object.entries(incomeDatas).map(([year, data]) => (
                    <span key={year} style={{
                      padding: "2px 8px", borderRadius: "6px",
                      background: "#eff6ff", border: "1px solid #93c5fd",
                      color: "#1e40af", fontWeight: 600
                    }}>
                      {year} 年 · {data.fileName}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {incLoadingError && (
              <p style={{ color: "var(--color-danger)", fontSize: "0.85em", marginTop: "6px" }}>
                損益表載入錯誤：{incLoadingError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 3. 年度選擇與計算區 (卡片化) */}
      {commonYears.length > 0 && (
        <div className={`${styles.card} ${styles.controlRailCard}`}>
          <h2 className={styles.cardTitle}>2. 選擇分析年度</h2>
          <div className={styles.controlRail}>
            <label
              htmlFor="year-select-ratio"
              className={styles.controlRailLabel}
            >
              選擇年度:
            </label>
            <select
              id="year-select-ratio"
              value={selectedYear}
              onChange={(e) =>
                dispatch({ type: "SET_SELECTED_YEAR", payload: e.target.value })
              }
              className={styles.controlRailSelect}
            >
              <option value="">請選擇年度</option>
              {commonYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            {selectedYear && (
              <span className={styles.controlRailStatus}>
                ✓ 已鎖定: {selectedYear}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 4. 計算與結果區 (卡片化) */}
      <div className={styles.card}>
        {showPlaceholder && (
          <div className={styles.placeholderContainer}>
            <div style={{ fontSize: "48px", marginBottom: "20px" }}>📊</div>
            <p className={styles.placeholderTextMain}>
              請完成上方檔案上傳以開始分析
            </p>
            <p style={{ fontSize: "0.95em" }}>
              系統將自動偵測資產負債表與損益表的共同年度。
            </p>
          </div>
        )}

        {loading && (
          <div
            style={{ textAlign: "center", padding: "40px", color: "#3b82f6" }}
          >
            <p>正在處理數據中...</p>
          </div>
        )}

        {showCalculationArea && !showResults && (
          <div className="calculation-and-results-area">
            <h2 className={styles.cardTitle}>3. 輸入補充資料並計算</h2>
            <div className={styles.manualInputsCompact}>
              <div className={styles.manualInputFieldsCompact}>
                <div>
                  <label htmlFor="avg-deposit-ratio">年平均存款量:</label>
                  <input
                    id="avg-deposit-ratio"
                    type="number"
                    value={manualAvgDeposit}
                    onChange={(e) =>
                      handleManualInputChange(
                        "manualAvgDeposit",
                        e.target.value
                      )
                    }
                    placeholder="例如 500000000"
                  />
                </div>
                <div>
                  <label htmlFor="emp-count-ratio">員工總人數:</label>
                  <input
                    id="emp-count-ratio"
                    type="number"
                    value={manualEmployeeCount}
                    onChange={(e) =>
                      handleManualInputChange(
                        "manualEmployeeCount",
                        e.target.value
                      )
                    }
                    placeholder="例如 150"
                  />
                </div>
                <div>
                  <label htmlFor="net-cashflow-ratio">
                    營業活動淨現金流量:
                  </label>
                  <input
                    id="net-cashflow-ratio"
                    type="number"
                    value={manualNetCashFlow}
                    onChange={(e) =>
                      handleManualInputChange(
                        "manualNetCashFlow",
                        e.target.value
                      )
                    }
                    placeholder="例如 20000000"
                  />
                </div>
              </div>
            </div>
            <div className={styles.compactActionSlot}>
              <button
                className={`${styles.calculateButton} ${styles.secondary}`}
                onClick={calculateAllResults}
              >
                重新計算
              </button>
            </div>
          </div>
        )}

        {showResults && (
          <div className="results-container">
            {/* 結果顯示與原本邏輯相同，此處略過細節以保持簡潔，實際請保留原有的結果渲染代碼 */}
            <div className={styles.resultControlRail}>
              <h2 className={styles.cardTitle}>3. 輸入資料 (可修改重算)</h2>
              <div className={styles.manualInputFieldsCompact}>
                <div>
                  <label>年平均存款量:</label>
                  <input
                    value={manualAvgDeposit}
                    onChange={(e) =>
                      handleManualInputChange(
                        "manualAvgDeposit",
                        e.target.value
                      )
                    }
                  />
                </div>
                <div>
                  <label>員工總人數:</label>
                  <input
                    value={manualEmployeeCount}
                    onChange={(e) =>
                      handleManualInputChange(
                        "manualEmployeeCount",
                        e.target.value
                      )
                    }
                  />
                </div>
                <div>
                  <label>營業活動淨現金流量:</label>
                  <input
                    value={manualNetCashFlow}
                    onChange={(e) =>
                      handleManualInputChange(
                        "manualNetCashFlow",
                        e.target.value
                      )
                    }
                  />
                </div>
              </div>
              <div className={styles.compactActionSlot}>
                <button
                  className={`${styles.calculateButton} ${styles.secondary}`}
                  onClick={calculateAllResults}
                  disabled={loading || !selectedYear}
                >
                  {loading ? "重新計算中..." : `計算 ${selectedYear} 年度比率`}
                </button>
              </div>
            </div>

            <h2 className={styles.cardTitle} style={{ marginTop: "30px" }}>
              4. 計算結果
            </h2>

            {balanceSheets[selectedYear]?.details && (
              <div className={styles.resultBlock}>
                <div
                  className={styles.collapsibleHeader}
                  onClick={() => toggleTableCollapse("bsStructure")}
                >
                  <h3>■ 簡明資產負債表 ({selectedYear} 年度決算數)</h3>
                  <button className={styles.collapseToggleButton}>
                    {tableCollapseState.bsStructure ? "[+] 展開" : "[-] 摺疊"}
                  </button>
                </div>
                {!tableCollapseState.bsStructure && (
                  <table className={styles.resultsTable}>
                    <thead>
                      <tr>
                        <th>科目</th>
                        <th>金額 (千元)</th>
                        <th>金額 (元)</th>
                        <th>結構比 (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {TARGET_SUBJECTS.map((subject) => {
                        const detail =
                          balanceSheets[selectedYear].details[subject];
                        const totalAssetsDetail =
                          balanceSheets[selectedYear].details["資產"];
                        let percentage = "N/A";
                        if (
                          detail &&
                          totalAssetsDetail &&
                          totalAssetsDetail.raw !== 0 &&
                          typeof detail.raw === "number"
                        ) {
                          percentage = `${(
                            (detail.raw / totalAssetsDetail.raw) *
                            100
                          ).toFixed(3)}%`;
                        } else if (
                          detail &&
                          subject === "資產" &&
                          typeof detail.raw === "number"
                        ) {
                          percentage = "100.000%";
                        }
                        return (
                          <tr key={subject}>
                            <td>{subject}</td>
                            <td>
                              {detail
                                ? formatNumThousands(detail.raw)
                                : "無資料"}
                            </td>
                            <td>
                              {detail ? formatNumFull(detail.raw) : "無資料"}
                            </td>
                            <td>{percentage}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {resultsApp1 && (
              <div className={styles.resultBlock}>
                <div
                  className={styles.collapsibleHeader}
                  onClick={() => toggleTableCollapse("app1Ratios")}
                >
                  <h3>■ 財務比率 (需輸入手動資料)</h3>
                  <button className={styles.collapseToggleButton}>
                    {tableCollapseState.app1Ratios ? "[+] 展開" : "[-] 摺疊"}
                  </button>
                </div>
                {!tableCollapseState.app1Ratios && (
                  <table className={styles.resultsTable}>
                    <thead>
                      <tr>
                        <th>比率項目</th>
                        <th>計算結果</th>
                        <th>說明</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>負債占資產比率</td>
                        <td>
                          {resultsApp1.debtAssetRatio !== null
                            ? `${(resultsApp1.debtAssetRatio * 100).toFixed(
                                2
                              )}%`
                            : "無法計算"}
                        </td>
                        <td>總負債 / 總資產</td>
                      </tr>
                      <tr>
                        <td>存款占權益比率</td>
                        <td>
                          {resultsApp1.depositEquityRatio !== null
                            ? `${resultsApp1.depositEquityRatio.toFixed(2)}%`
                            : "無法計算"}
                        </td>
                        <td>(銀行業存款+國際金融機構存款+總存款) / 總權益</td>
                      </tr>
                      <tr>
                        <td>流動比率</td>
                        <td>
                          {resultsApp1.currentRatio !== null
                            ? `${(resultsApp1.currentRatio * 100).toFixed(2)}%`
                            : "無法計算"}
                        </td>
                        <td>流動資產 / 流動負債</td>
                      </tr>
                      <tr>
                        <td>利息保障倍數</td>
                        <td>
                          {resultsApp1.interestCoverageRatio !== null
                            ? `${resultsApp1.interestCoverageRatio.toFixed(
                                2
                              )} %`
                            : "無法計算"}
                        </td>
                        <td>(稅前淨利 + 利息費用) / 利息費用</td>
                      </tr>
                      <tr>
                        <td>利息費用占年平均存款量比率</td>
                        <td>
                          {resultsApp1.interestExpenseRatio !== null
                            ? `${resultsApp1.interestExpenseRatio.toFixed(2)}%`
                            : manualAvgDeposit
                            ? "無法計算"
                            : "需輸入年平均存款量"}
                        </td>
                        <td>利息費用 / 年平均存款量</td>
                      </tr>
                      <tr>
                        <td>總資產週轉率</td>
                        <td>
                          {resultsApp1.totalAssetTurnover !== null
                            ? `${resultsApp1.totalAssetTurnover.toFixed(4)} 次`
                            : "無法計算"}
                        </td>
                        <td>營業收入 / 總資產</td>
                      </tr>
                      <tr>
                        <td>員工平均營業收入額 (千元)</td>
                        <td>
                          {resultsApp1.employeeAverageRevenue !== null
                            ? resultsApp1.employeeAverageRevenue.toLocaleString()
                            : manualEmployeeCount
                            ? "無法計算"
                            : "需輸入員工數"}
                        </td>
                        <td>(營業收入 / 員工總人數) / 1000</td>
                      </tr>
                      <tr>
                        <td>員工平均獲利額 (千元)</td>
                        <td>
                          {resultsApp1.employeeAverageProfit !== null
                            ? resultsApp1.employeeAverageProfit.toLocaleString()
                            : manualEmployeeCount
                            ? "無法計算"
                            : "需輸入員工數"}
                        </td>
                        <td>(本期淨利 / 員工總人數) / 1000</td>
                      </tr>
                      <tr>
                        <td>現金流量比率</td>
                        <td>
                          {resultsApp1.cashFlowRatio !== null
                            ? `${resultsApp1.cashFlowRatio.toFixed(2)}%`
                            : manualNetCashFlow
                            ? "無法計算"
                            : "需輸入淨現金流量"}
                        </td>
                        <td>營業活動之淨現金流量 / 流動負債</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {calculatedRatiosApp2 && financialDataApp2 && (
              <div className={styles.resultBlock}>
                <div
                  className={styles.collapsibleHeader}
                  onClick={() => toggleTableCollapse("app2Ratios")}
                >
                  <h3>■ 投資報酬分析表</h3>
                  <button className={styles.collapseToggleButton}>
                    {tableCollapseState.app2Ratios ? "[+] 展開" : "[-] 摺疊"}
                  </button>
                </div>
                {!tableCollapseState.app2Ratios && (
                  <>
                    <table
                      className={`${styles.resultsTable} ${styles.ratiosApp2Table}`}
                    >
                      <thead>
                        <tr>
                          <th>比率名稱</th>
                          <th>計算結果</th>
                          <th>計算公式與數值 (千元)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>營業利益率</td>
                          <td>{calculatedRatiosApp2.operatingMargin}</td>
                          <td>
                            營利 / 營收
                            <br />(
                            {formatNumThousands(
                              financialDataApp2.operatingProfit
                            )}{" "}
                            / {formatNumThousands(financialDataApp2.revenue)})
                          </td>
                        </tr>
                        <tr>
                          <td>淨利率</td>
                          <td>{calculatedRatiosApp2.netMargin}</td>
                          <td>
                            淨利 / 營收
                            <br />(
                            {formatNumThousands(
                              financialDataApp2.netIncome
                            )} / {formatNumThousands(financialDataApp2.revenue)}
                            )
                          </td>
                        </tr>
                        <tr>
                          <td>每股盈餘 (EPS) (元)</td>
                          <td>{calculatedRatiosApp2.eps}</td>
                          <td>
                            淨利 / (資本 / 10)
                            <br />(
                            {formatNumThousands(financialDataApp2.netIncome)} /
                            ( {formatNumThousands(financialDataApp2.capital)} /
                            10 ))
                          </td>
                        </tr>
                        <tr>
                          <td>總資產報酬率 (ROA)</td>
                          <td>{calculatedRatiosApp2.roa}</td>
                          <td>
                            淨利 / 平均資產
                            <br />(
                            {formatNumThousands(
                              financialDataApp2.netIncome
                            )} /{" "}
                            {formatNumThousands(financialDataApp2.avgAssets)})
                          </td>
                        </tr>
                        <tr>
                          <td>權益報酬率 (ROE)</td>
                          <td>{calculatedRatiosApp2.roe}</td>
                          <td>
                            淨利 / 平均權益
                            <br />(
                            {formatNumThousands(
                              financialDataApp2.netIncome
                            )} /{" "}
                            {formatNumThousands(financialDataApp2.avgEquity)})
                          </td>
                        </tr>
                        <tr>
                          <td>資金收益對資金成本比率 (決算)</td>
                          <td>{calculatedRatiosApp2.fundYieldToCost_Actual}</td>
                          <td>
                            資金收益決算加總 / 利費決算
                            <br />(
                            {formatNumThousands(
                              getFundYieldNumeratorSum(
                                financialDataApp2,
                                "Actual"
                              )
                            )}{" "}
                            /{" "}
                            {formatNumThousands(
                              financialDataApp2.interestExpense_Actual
                            )}
                            )
                          </td>
                        </tr>
                        <tr>
                          <td>資金收益對資金成本比率 (預算)</td>
                          <td>{calculatedRatiosApp2.fundYieldToCost_Budget}</td>
                          <td>
                            資金收益預算加總 / 利費預算
                            <br />(
                            {formatNumThousands(
                              getFundYieldNumeratorSum(
                                financialDataApp2,
                                "Budget"
                              )
                            )}{" "}
                            /{" "}
                            {formatNumThousands(
                              financialDataApp2.interestExpense_Budget
                            )}
                            )
                          </td>
                        </tr>
                        <tr>
                          <td>資金收益對資金成本比率 (上年)</td>
                          <td>
                            {calculatedRatiosApp2.fundYieldToCost_Previous}
                          </td>
                          <td>
                            資金收益上年加總 / 利費上年
                            <br />(
                            {formatNumThousands(
                              getFundYieldNumeratorSum(
                                financialDataApp2,
                                "Previous"
                              )
                            )}{" "}
                            /{" "}
                            {formatNumThousands(
                              financialDataApp2.interestExpense_Previous
                            )}
                            )
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            )}

            {financialDataApp2 && (
              <div className={styles.resultBlock}>
                {/* 【關鍵修正】使用與上方一致的 collapsibleHeader 樣式 */}
                <div
                  className={styles.collapsibleHeader}
                  onClick={() => toggleTableCollapse("datapreview")}
                >
                  {/* 統一使用 h3 並加上方塊符號，移除星號 */}
                  <h3>■ 比率計算所用之資料 (單位: 元)</h3>

                  {/* 使用統一的按鈕樣式 */}
                  <button className={styles.collapseToggleButton}>
                    {tableCollapseState.datapreview ? "[+] 展開" : "[-] 摺疊"}
                  </button>
                </div>

                {/* 內容區塊 */}
                {!tableCollapseState.datapreview && (
                  <ul className="styles.dataPreviewList">
                    {/* --- 損益表主要項目 --- */}
                    <li>
                      營利(62, {selectedYear}, 決):{" "}
                      {formatNumFull(financialDataApp2.operatingProfit)}
                    </li>

                    {/* 藍色：營收決算 + 成長率 */}
                    <li style={{ color: "blue" }}>
                      營收(41, {selectedYear}, 決):{" "}
                      {formatNumFull(financialDataApp2.revenue)}
                      {financialDataApp2.revenue_Previous ? (
                        <span
                          style={{
                            color: "#888",
                            fontSize: "0.85em",
                            marginLeft: "8px",
                          }}
                        >
                          (較上年:{" "}
                          {(
                            ((financialDataApp2.revenue -
                              financialDataApp2.revenue_Previous) /
                              Math.abs(financialDataApp2.revenue_Previous)) *
                            100
                          ).toFixed(2)}
                          %)
                        </span>
                      ) : null}
                    </li>

                    {/* 藍色：營收上年 */}
                    <li style={{ color: "blue" }}>
                      營收(41, {Number(selectedYear) - 1}, 決):{" "}
                      {formatNumFull(financialDataApp2.revenue_Previous)}
                    </li>

                    {/* 藍色：淨利決算 */}
                    <li style={{ color: "blue" }}>
                      淨利(68, {selectedYear}, 決):{" "}
                      {formatNumFull(financialDataApp2.netIncome)}
                    </li>
                    <li>
                      淨利(68, {selectedYear}, 預):{" "}
                      {formatNumFull(financialDataApp2.netIncome_Budget)}
                    </li>
                    <li>
                      淨利(68, {Number(selectedYear) - 1}, 決):{" "}
                      {formatNumFull(financialDataApp2.netIncome_Previous)}
                    </li>

                    {/* --- 資產負債表主要項目 --- */}
                    <li style={{ marginTop: "10px" }}>
                      資產(1, {selectedYear}, 決):{" "}
                      {formatNumFull(financialDataApp2.currentAssets)}
                    </li>
                    <li>
                      資產(1, {Number(selectedYear) - 1}, 決):{" "}
                      {formatNumFull(financialDataApp2.previousAssets)}
                    </li>
                    <li>
                      * 平均資產: {formatNumFull(financialDataApp2.avgAssets)}
                    </li>

                    {/* 綠色：權益決算 + 成長率 */}
                    <li style={{ color: "green", marginTop: "10px" }}>
                      權益(3, {selectedYear}, 決):{" "}
                      {formatNumFull(financialDataApp2.currentEquity)}
                      {financialDataApp2.previousEquity ? (
                        <span
                          style={{
                            color: "#888",
                            fontSize: "0.85em",
                            marginLeft: "8px",
                          }}
                        >
                          (較上年:{" "}
                          {(
                            ((financialDataApp2.currentEquity -
                              financialDataApp2.previousEquity) /
                              Math.abs(financialDataApp2.previousEquity)) *
                            100
                          ).toFixed(2)}
                          %)
                        </span>
                      ) : null}
                    </li>

                    {/* 綠色：權益上年 */}
                    <li style={{ color: "green" }}>
                      權益(3, {Number(selectedYear) - 1}, 決):{" "}
                      {formatNumFull(financialDataApp2.previousEquity)}
                    </li>

                    {/* 藍色：平均權益 */}
                    <li style={{ color: "blue" }}>
                      * 平均權益: {formatNumFull(financialDataApp2.avgEquity)}
                    </li>

                    <li style={{ marginTop: "10px" }}>
                      資本(310101, {selectedYear}, 決):{" "}
                      {formatNumFull(financialDataApp2.capital)}
                    </li>

                    {/* --- 資金收益/成本項目 --- */}
                    <li
                      style={{
                        fontWeight: "bold",
                        marginTop: "15px",
                        marginBottom: "5px",
                        borderBottom: "1px dashed #ccc",
                      }}
                    >
                      資金收益/成本項目 ：
                    </li>

                    {/* 利息收入 */}
                    <li>
                      利收({ACCOUNT_CODES.INTEREST_INCOME}, 決):{" "}
                      {formatNumFull(financialDataApp2.interestIncome_Actual)}
                    </li>
                    <li>
                      利收({ACCOUNT_CODES.INTEREST_INCOME}, 預):{" "}
                      {formatNumFull(financialDataApp2.interestIncome_Budget)}
                    </li>
                    <li>
                      利收({ACCOUNT_CODES.INTEREST_INCOME}, 上):{" "}
                      {formatNumFull(financialDataApp2.interestIncome_Previous)}
                    </li>

                    {/* 金融資產利益 */}
                    <li style={{ marginTop: "5px" }}>
                      金資利({ACCOUNT_CODES.FVTPL_GAIN}, 決):{" "}
                      {formatNumFull(financialDataApp2.fvtplGain_Actual)}
                    </li>
                    <li>
                      金資利({ACCOUNT_CODES.FVTPL_GAIN}, 預):{" "}
                      {formatNumFull(financialDataApp2.fvtplGain_Budget)}
                    </li>
                    <li>
                      金資利({ACCOUNT_CODES.FVTPL_GAIN}, 上):{" "}
                      {formatNumFull(financialDataApp2.fvtplGain_Previous)}
                    </li>

                    {/* 兌換利益 */}
                    <li style={{ marginTop: "5px" }}>
                      兌換利({ACCOUNT_CODES.FX_GAIN}, 決):{" "}
                      {formatNumFull(financialDataApp2.fxGain_Actual)}
                    </li>
                    <li>
                      兌換利({ACCOUNT_CODES.FX_GAIN}, 預):{" "}
                      {formatNumFull(financialDataApp2.fxGain_Budget)}
                    </li>
                    <li>
                      兌換利({ACCOUNT_CODES.FX_GAIN}, 上):{" "}
                      {formatNumFull(financialDataApp2.fxGain_Previous)}
                    </li>

                    {/* 信託損益 */}
                    <li style={{ marginTop: "5px" }}>
                      信託損({ACCOUNT_CODES.TRUST_GAIN_LOSS}, 決):{" "}
                      {formatNumFull(financialDataApp2.trustGainLoss_Actual)}
                    </li>
                    <li>
                      信託損({ACCOUNT_CODES.TRUST_GAIN_LOSS}, 預):{" "}
                      {formatNumFull(financialDataApp2.trustGainLoss_Budget)}
                    </li>
                    <li>
                      信託損({ACCOUNT_CODES.TRUST_GAIN_LOSS}, 上):{" "}
                      {formatNumFull(financialDataApp2.trustGainLoss_Previous)}
                    </li>

                    {/* 投資利益 */}
                    <li style={{ marginTop: "5px" }}>
                      投資利({ACCOUNT_CODES.INVESTMENT_GAIN_LOSS_PRIMARY}/
                      {ACCOUNT_CODES.INVESTMENT_GAIN_LOSS_SECONDARY}, 決):{" "}
                      {formatNumFull(
                        financialDataApp2.investmentGainLoss_Actual
                      )}
                    </li>
                    <li>
                      投資利({ACCOUNT_CODES.INVESTMENT_GAIN_LOSS_PRIMARY}/
                      {ACCOUNT_CODES.INVESTMENT_GAIN_LOSS_SECONDARY}, 預):{" "}
                      {formatNumFull(
                        financialDataApp2.investmentGainLoss_Budget
                      )}
                    </li>
                    <li>
                      投資利({ACCOUNT_CODES.INVESTMENT_GAIN_LOSS_PRIMARY}/
                      {ACCOUNT_CODES.INVESTMENT_GAIN_LOSS_SECONDARY}, 上):{" "}
                      {formatNumFull(
                        financialDataApp2.investmentGainLoss_Previous
                      )}
                    </li>

                    {/* 紅色：利息費用 (決) */}
                    <li style={{ color: "red", marginTop: "5px" }}>
                      利費({ACCOUNT_CODES.INTEREST_EXPENSE}, 決):{" "}
                      {formatNumFull(financialDataApp2.interestExpense_Actual)}
                    </li>
                    <li>
                      利費({ACCOUNT_CODES.INTEREST_EXPENSE}, 預):{" "}
                      {formatNumFull(financialDataApp2.interestExpense_Budget)}
                    </li>
                    <li>
                      利費({ACCOUNT_CODES.INTEREST_EXPENSE}, 上):{" "}
                      {formatNumFull(
                        financialDataApp2.interestExpense_Previous
                      )}
                    </li>

                    {/* --- 加總預覽 --- */}
                    <li
                      style={{
                        fontStyle: "italic",
                        color: "#666",
                        marginTop: "15px",
                        marginBottom: "5px",
                      }}
                    >
                      --- 加總預覽 ---
                    </li>

                    {/* 紅色：資金收益 (決) */}
                    <li style={{ color: "red" }}>
                      * 資金收益 (決):{" "}
                      {formatNumFull(
                        getFundYieldNumeratorSum(financialDataApp2, "Actual")
                      )}
                    </li>
                    <li>
                      * 資金成本 (決):{" "}
                      {formatNumFull(financialDataApp2.interestExpense_Actual)}
                    </li>

                    <li style={{ marginTop: "5px" }}>
                      * 資金收益 (預):{" "}
                      {formatNumFull(
                        getFundYieldNumeratorSum(financialDataApp2, "Budget")
                      )}
                    </li>
                    <li>
                      * 資金成本 (預):{" "}
                      {formatNumFull(financialDataApp2.interestExpense_Budget)}
                    </li>

                    <li style={{ marginTop: "5px" }}>
                      * 資金收益 (上):{" "}
                      {formatNumFull(
                        getFundYieldNumeratorSum(financialDataApp2, "Previous")
                      )}
                    </li>
                    <li>
                      * 資金成本 (上):{" "}
                      {formatNumFull(
                        financialDataApp2.interestExpense_Previous
                      )}
                    </li>
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default FinancialRatioTool;
