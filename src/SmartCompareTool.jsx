import React, { useState, useMemo, useCallback, useEffect } from "react";
import styles from "./SmartCompareTool.module.css";
import { UploadIcon } from "./Icons";
import { TAGS_CONFIG } from "./tagsConfig";
import XmlFileSelector from "./components/XmlFileSelector";
import { useFileManager } from "./contexts/FileManagerContext";

/**
 * 數值清洗函式：處理千分位、空格及負數括號
 */
function cleanAndParseFloat(str) {
  if (str === null || str === undefined) return 0;
  const cleaned = str
    .toString()
    .replace(/[, \s]/g, "")
    .replace(/\((.*)\)/, "-$1");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * 優先權取值輔助函式：確保索引與名稱抓取正確
 */
const getPriorityValue = (node, tags) => {
  if (!node) return "";
  for (const tag of tags) {
    const element = Array.from(node.children).find(
      (child) => child.tagName === tag
    );
    // 索引純化：跳過含有年度描述或純文字標題的標籤作為索引編號
    if (element && element.textContent.trim()) {
      const text = element.textContent.trim();
      const isDescription = ["本年度預算數", "上年度決算數", "年度決算數"].some(
        (s) => text.includes(s)
      );
      if (!isDescription) return text;
    }
  }
  return "";
};

/**
 * 個別數據抓取函式
 */
const extractIndividualValues = (row, code, name, isBaseFile = false) => {
  const items = [];
  if (!row || !row.children) return items;

  // 偵測營運量值表的年度描述 (用於基準檔定位)
  const yearDesc =
    Array.from(row.children).find((c) => c.tagName === "營運項目-名稱及年度")
      ?.textContent || "";

  Array.from(row.children).forEach((child) => {
    const tagName = child.tagName;
    const val = cleanAndParseFloat(child.textContent);
    if (val === 0) return;

    if (!isBaseFile) {
      if (TAGS_CONFIG.budget.includes(tagName)) {
        items.push({
          code,
          name,
          value: val,
          type: "budget",
          originalTagName: tagName,
        });
      }
      if (TAGS_CONFIG.lastActual.includes(tagName)) {
        items.push({
          code,
          name,
          value: val,
          type: "lastActual",
          originalTagName: tagName,
        });
      }
    } else {
      // 基準檔：區分預算與決算區塊
      const isBudgetSection =
        yearDesc.includes("本年度預算數") ||
        TAGS_CONFIG.budget.includes(tagName);
      if (isBudgetSection && TAGS_CONFIG.budget.includes(tagName)) {
        items.push({
          code,
          name,
          value: val,
          type: "baseBudget",
          originalTagName: tagName,
        });
      }
      if (TAGS_CONFIG.baseActualTarget.includes(tagName)) {
        items.push({
          code,
          name,
          value: val,
          type: "baseActual",
          originalTagName: tagName,
        });
      }
    }
  });
  return items;
};

const parseFinancialXml = (xmlString, isBaseFile = false) => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "application/xml");
  if (xmlDoc.getElementsByTagName("parsererror").length) return null;

  const header = xmlDoc.querySelector("Header");
  const yearText =
    header?.querySelector("年度")?.textContent ||
    xmlDoc.getElementsByTagName("年度")[0]?.textContent ||
    "0";
  const unit =
    header?.querySelector("單位")?.textContent ||
    xmlDoc.getElementsByTagName("單位")[0]?.textContent ||
    "新臺幣元";
  const year = parseInt(yearText, 10);

  const allExtractedItems = [];
  Array.from(xmlDoc.querySelectorAll("ROW")).forEach((row) => {
    let code = getPriorityValue(row, TAGS_CONFIG.primaryCode);
    if (!code) code = getPriorityValue(row, TAGS_CONFIG.fallbackCode);
    const name = getPriorityValue(row, TAGS_CONFIG.name);

    const items = extractIndividualValues(row, code, name, isBaseFile);
    allExtractedItems.push(...items);
  });

  return { year, unit, items: allExtractedItems };
};

const SMART_COMPARE_TYPES = ["income", "balance", "cashflow", "profitDistribution", "production"];

const getXmlText = (xmlDoc, tagNames) => {
  for (const tagName of tagNames) {
    const node = xmlDoc.querySelector(`Header > ${tagName}, ${tagName}`);
    if (node?.textContent?.trim()) return node.textContent.trim();
  }
  return "";
};

const getEntryMetadata = (entry) => {
  if (!entry?.rawContent) {
    return {
      year: Number(entry?.year || 0),
      stage: "",
    };
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(entry.rawContent, "application/xml");
  if (xmlDoc.getElementsByTagName("parsererror").length) {
    return {
      year: Number(entry.year || 0),
      stage: "",
    };
  }

  const yearText = getXmlText(xmlDoc, ["年度", "Year", "YEAR"]) || entry.year || "";
  const stage = getXmlText(xmlDoc, ["階段", "Stage", "STAGE"]);

  return {
    year: Number.parseInt(yearText, 10) || 0,
    stage,
  };
};

function SmartCompareTool() {
  const [targetFile, setTargetFile] = useState(null);
  const [budgetBase, setBudgetBase] = useState(null);
  const [actualBase, setActualBase] = useState(null);
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all"); // 篩選狀態

  const { files } = useFileManager();
  const knowledgeBase = useMemo(() => {
    const kbFiles = files.filter(f => f.detectedType === "knowledgeBase" && f.parsedData);
    let rules = [];
    for (const f of kbFiles) {
      if (Array.isArray(f.parsedData)) {
        rules = rules.concat(f.parsedData);
      }
    }
    return rules;
  }, [files]);

  const needs = useMemo(
    () => ({
      budget: targetFile?.items.some((i) => i.type === "budget") || false,
      actual: targetFile?.items.some((i) => i.type === "lastActual") || false,
    }),
    [targetFile]
  );
  const missingRequirements = useMemo(() => {
    const requirements = [];
    if (!targetFile) requirements.push("本年度決算 XML");
    if (needs.budget && !budgetBase) requirements.push("預算 XML");
    if (needs.actual && !actualBase) requirements.push("前期決算 XML");
    return requirements;
  }, [actualBase, budgetBase, needs.actual, needs.budget, targetFile]);
  const compareActionLabel = missingRequirements.length
    ? `還差 ${missingRequirements.length} 份${missingRequirements.length === 1 ? missingRequirements[0] : "基準 XML"}`
    : "可執行雙層核對";

  // 計算各狀態數量彙整
  const availableFileNames = useMemo(
    () => new Set(files.map((file) => file.fileName)),
    [files]
  );

  useEffect(() => {
    if (targetFile?.fileName && !availableFileNames.has(targetFile.fileName)) {
      setTargetFile(null);
      setBudgetBase(null);
      setActualBase(null);
      setResults([]);
      return;
    }

    if (budgetBase?.fileName && !availableFileNames.has(budgetBase.fileName)) {
      setBudgetBase(null);
      setResults([]);
    }

    if (actualBase?.fileName && !availableFileNames.has(actualBase.fileName)) {
      setActualBase(null);
      setResults([]);
    }
  }, [actualBase, availableFileNames, budgetBase, targetFile]);

  const stats = useMemo(() => {
    return {
      total: results.length,
      success: results.filter((r) => r.status === "success").length,
      error: results.filter((r) => r.status === "error").length,
      missing: results.filter((r) => r.status === "missing").length,
      explain: results.filter((r) => r.isExplanationRequired).length,
    };
  }, [results]);

  const filteredResults = useMemo(() => {
    if (filterStatus === "all") return results;
    if (filterStatus === "explain") return results.filter((r) => r.isExplanationRequired);
    return results.filter((r) => r.status === filterStatus);
  }, [results, filterStatus]);

  const handleFileChange = async (event, type) => {
    const file = event.target.files[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseFinancialXml(text, type !== "target");
    if (!parsed) return;
    const info = { ...parsed, fileName: file.name };
    if (type === "target") {
      setTargetFile(info);
      setBudgetBase(null);
      setActualBase(null);
      setResults([]);
    } else if (type === "budget") setBudgetBase(info);
    else if (type === "actual") setActualBase(info);
  };

  // 接受來自 XmlFileSelector 的 fileEntry
  const handleTargetEntry = useCallback((entry) => {
    if (!entry?.rawContent) { setTargetFile(null); return; }
    const parsed = parseFinancialXml(entry.rawContent, false);
    if (!parsed) return;
    setTargetFile({ ...parsed, fileName: entry.fileName, detectedType: entry.detectedType });
    setBudgetBase(null);
    setActualBase(null);
    setResults([]);
  }, []);

  const handleBudgetEntry = useCallback((entry) => {
    if (!entry?.rawContent) { setBudgetBase(null); return; }
    const parsed = parseFinancialXml(entry.rawContent, true);
    if (!parsed) return;
    setBudgetBase({ ...parsed, fileName: entry.fileName });
  }, []);

  const handleActualEntry = useCallback((entry) => {
    if (!entry?.rawContent) { setActualBase(null); return; }
    const parsed = parseFinancialXml(entry.rawContent, true);
    if (!parsed) return;
    setActualBase({ ...parsed, fileName: entry.fileName });
  }, []);

  const autoTargetFilter = useCallback((entry) => {
    const metadata = getEntryMetadata(entry);
    return metadata.year > 0 && metadata.stage.includes("決算");
  }, []);

  const autoBudgetFilter = useCallback((entry) => {
    const targetYear = Number(targetFile?.year || 0);
    const targetType = targetFile?.detectedType;
    if (!targetYear || !targetType || entry.detectedType !== targetType) return false;
    const metadata = getEntryMetadata(entry);
    return metadata.year === targetYear && metadata.stage.includes("預算");
  }, [targetFile?.detectedType, targetFile?.year]);

  const autoActualFilter = useCallback((entry) => {
    const targetYear = Number(targetFile?.year || 0);
    const targetType = targetFile?.detectedType;
    if (!targetYear || !targetType || entry.detectedType !== targetType) return false;
    const metadata = getEntryMetadata(entry);
    return metadata.year === targetYear - 1 && metadata.stage.includes("決算");
  }, [targetFile?.detectedType, targetFile?.year]);


  const handleCompare = useCallback(() => {
    if (!targetFile) return;
    setIsLoading(true);

    setTimeout(() => {
      const bFactor = budgetBase?.unit.includes("千元") ? 1000 : 1;
      const aFactor = actualBase?.unit.includes("千元") ? 1000 : 1;

      const buildMaps = (baseItems, factor) => {
        const codeMap = new Map();
        const nameMap = new Map();
        baseItems.forEach((i) => {
          const val = i.value * factor;
          const codeKey = `${i.code}_${i.originalTagName}`;
          const nameKey = `${i.name}_${i.originalTagName}`;
          if (i.code && !codeMap.has(codeKey)) codeMap.set(codeKey, val);
          if (i.name && !nameMap.has(nameKey)) nameMap.set(nameKey, val);
        });
        return { codeMap, nameMap };
      };

      const bMaps = buildMaps(budgetBase?.items || [], bFactor);
      const aMaps = buildMaps(actualBase?.items || [], aFactor);

      const compResults = targetFile.items.map((item) => {
        let refValue = null;
        let matchSource = "";
        const tagName = item.originalTagName;

        const isOverseas = tagName.includes("國外");
        const isQty = tagName.includes("數量") || tagName.includes("量");
        const isAmt =
          tagName.includes("金額") ||
          tagName.includes("值") ||
          tagName.includes("合計") ||
          tagName === "本年度預算數" ||
          tagName === "上年度決算數";

        const findValue = (maps, type) => {
          // 1. 編號精確匹配
          let val = maps.codeMap.get(`${item.code}_${tagName}`);

          // 2. 特殊對應 (預算合計、決算對本年合計、營運量值)
          if (val === undefined) {
            const specTags = [];
            if (tagName === "本年度預算數") specTags.push("本年度預算數-合計");
            if (tagName === "上年度決算數") specTags.push("本年度決算數-合計");
            if (isQty) specTags.push("營運量");
            if (isAmt) specTags.push("營運值");

            for (const sTag of specTags) {
              val = maps.codeMap.get(`${item.code}_${sTag}`);
              if (val !== undefined) break;
            }
          }

          // 3. 名稱索引回溯
          if (val === undefined && item.name) {
            val = maps.nameMap.get(`${item.name}_${tagName}`);
            if (val === undefined) {
              const nSpec = [];
              if (tagName === "上年度決算數") nSpec.push("本年度決算數-合計");
              if (isQty) nSpec.push("營運量");
              if (isAmt) nSpec.push("營運值");
              for (const ns of nSpec) {
                val = maps.nameMap.get(`${item.name}_${ns}`);
                if (val !== undefined) break;
              }
            }
            if (val !== undefined) matchSource = " (名稱匹配)";
          }

          // 4. 特徵模糊搜尋
          if (val === undefined) {
            const list =
              type === "budget"
                ? TAGS_CONFIG.budget
                : TAGS_CONFIG.baseActualTarget;
            for (const t of list) {
              const tOverseas = t.includes("國外");
              const tQty = t.includes("數量") || t.includes("量");
              const tAmt =
                t.includes("金額") ||
                t.includes("值") ||
                t.includes("合計") ||
                t === "本年度預算數" ||
                t === "本年度決算數";
              if (
                isOverseas === tOverseas &&
                (isQty ? tQty : isAmt ? tAmt : !tQty && !tAmt)
              ) {
                val = maps.codeMap.get(`${item.code}_${t}`);
                if (val !== undefined) break;
              }
            }
          }
          return val === undefined ? null : val; // 強制將 undefined 轉為 null
        };

        if (item.type === "budget") refValue = findValue(bMaps, "budget");
        else if (item.type === "lastActual")
          refValue = findValue(aMaps, "actual");

        const isMatch =
          refValue !== null && Math.abs(item.value - refValue) < 1;
        const status =
          refValue === null ? "missing" : isMatch ? "success" : "error";

        // ----- 計算差異比例 (>20%) -----
        let isExplanationRequired = false;
        let diffPercent = 0;
        if (refValue !== null) {
          if (refValue === 0) {
            if (item.value !== 0) {
              diffPercent = 100;
              isExplanationRequired = true;
            }
          } else {
            diffPercent = ((item.value - refValue) / Math.abs(refValue)) * 100;
            if (Math.abs(diffPercent) > 20) {
              isExplanationRequired = true;
            }
          }
        }

        // ----- 知識庫命中比對 -----
        const auditWarnings = [];
        knowledgeBase.forEach(kb => {
          if (item.name && kb.keyword && item.name.includes(kb.keyword)) {
            auditWarnings.push(kb.warning);
          }
        });

        return {
          ...item,
          refValue,
          status,
          displayName: item.name + matchSource,
          isExplanationRequired,
          diffPercent,
          auditWarnings
        };
      });

      setResults(compResults);
      setIsLoading(false);
    }, 100);
  }, [targetFile, budgetBase, actualBase, knowledgeBase]);

  return (
    <div className={styles.pageContainer}>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>
          <span>1. 選擇報表與執行核對</span>
          <span className={styles.infoTooltip} tabIndex={0}>
            使用說明
            <span className={styles.infoTooltipPanel}>
              <strong>說明：</strong>
              報表檢核會整合目標財報、基準財報與知識庫規則，快速標示差異、缺漏與需補充說明項目。
              <br />
              <strong>使用方式：</strong>
              <br />
              1. 先在檔案管理區載入相關 XML，系統會自動帶入可用檔案。
              <br />
              2. 依核驗需求選擇本年度、預算或上年度基準資料。
              <br />
              3. 執行報表檢核後，可依結果狀態快速篩選重點項目。
            </span>
          </span>
        </h2>
        <div className={styles.uploadContainer} style={{ flexDirection: "column", gap: "10px" }}>
          <XmlFileSelector
            label="本年度(N) 決算書"
            acceptTypes={SMART_COMPARE_TYPES}
            onFileReady={handleTargetEntry}
            workspaceRole="smartCompareTarget"
            recommendedFileFilter={autoTargetFilter}
            hint="本年度決算書 XML，系統將從檔案管理區自動帶入"
          />
          {needs.budget && (
            <XmlFileSelector
              label="本年度(N) 預算基準"
              acceptTypes={SMART_COMPARE_TYPES}
              onFileReady={handleBudgetEntry}
              workspaceRole="smartCompareBudgetBase"
              recommendedFileFilter={autoBudgetFilter}
              hint="本年度預算 XML"
            />
          )}
          {needs.actual && (
            <XmlFileSelector
              label="上年度(N-1) 決算基準"
              acceptTypes={SMART_COMPARE_TYPES}
              onFileReady={handleActualEntry}
              workspaceRole="smartCompareActualBase"
              recommendedFileFilter={autoActualFilter}
              hint="上年度決算書 XML"
            />
          )}
        </div>
        <div className={styles.actionSection}>
          <div
            className={`${styles.actionStatusBanner} ${
              missingRequirements.length ? styles.actionStatusBannerPending : styles.actionStatusBannerReady
            }`}
          >
            <strong>{compareActionLabel}</strong>
            <span>
              {missingRequirements.length
                ? `請先補齊：${missingRequirements.join(" / ")}`
                : "條件齊備，可直接執行雙層核對。"}
            </span>
          </div>
          <button
            onClick={handleCompare}
            disabled={
              isLoading ||
              !targetFile ||
              (needs.budget && !budgetBase) ||
              (needs.actual && !actualBase)
            }
            className={styles.button}
          >
            執行雙層核對
          </button>
        </div>
      </div>


      {results.length > 0 && (
        <div className={styles.card}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "15px",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            <h2
              className={styles.cardTitle}
              style={{ margin: 0, border: "none" }}
            >
              2. 核對結果彙整
            </h2>

            {/* 狀態一鍵篩選按鈕組 */}
            <div style={{ display: "flex", gap: "8px" }}>
              {[
                {
                  id: "all",
                  label: "全部",
                  count: stats.total,
                  color: "#64748b",
                },
                {
                  id: "success",
                  label: "一致",
                  count: stats.success,
                  color: "#16a34a",
                },
                {
                  id: "error",
                  label: "不符",
                  count: stats.error,
                  color: "#dc2626",
                },
                {
                  id: "missing",
                  label: "缺基準",
                  count: stats.missing,
                  color: "#f59e0b",
                },
                {
                  id: "explain",
                  label: "需說明",
                  count: stats.explain,
                  color: "#b45309", // 深橘紅
                },
              ].map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => setFilterStatus(btn.id)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "20px",
                    border:
                      filterStatus === btn.id
                        ? `2px solid ${btn.color}`
                        : "1px solid #e2e8f0",
                    backgroundColor:
                      filterStatus === btn.id ? `${btn.color}10` : "white",
                    color: btn.color,
                    fontSize: "13px",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  {btn.label} ({btn.count})
                </button>
              ))}
            </div>
          </div>

          <div className={styles.resultsTableContainer}>
            <table
              className={styles.resultsTable}
              style={{ tableLayout: "fixed", width: "100%" }}
            >
              <thead>
                <tr>
                  {/* 為每一欄設定固定寬度百分比或像素 */}
                  <th style={{ width: "35%" }}>項目資訊</th>
                  <th style={{ width: "15%" }}>類型</th>
                  <th style={{ width: "15%" }}>書面值 (N)</th>
                  <th style={{ width: "15%" }}>基準值</th>
                  <th style={{ width: "20%" }}>狀態</th>
                </tr>
              </thead>
              <tbody>
                {results
                  .filter(
                    (res) =>
                      filterStatus === "all" || res.status === filterStatus
                  )
                  .map((res, idx) => (
                    <tr key={idx}>
                      <td
                        style={{ overflow: "hidden", textOverflow: "ellipsis" }}
                      >
                        <div style={{ fontWeight: "bold" }}>
                          {res.displayName}
                        </div>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>
                          索引: {res.code || "無"} | 標籤: {res.originalTagName}
                        </div>
                        {/* 審計警告與需補充說明標示 */}
                        <div style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {res.isExplanationRequired && (
                            <span
                              style={{
                                display: "inline-flex", alignItems: "center",
                                color: "#b91c1c", fontSize: "0.8em", background: "#fef2f2",
                                border: "1px solid #fca5a5", padding: "2px 6px", borderRadius: "12px",
                                fontWeight: "bold"
                              }}
                            >
                              🚩 差異達20%需補充說明
                            </span>
                          )}
                          {res.auditWarnings && res.auditWarnings.length > 0 && (
                            <span
                              style={{
                                display: "inline-flex", alignItems: "center",
                                color: "#b45309", fontSize: "0.8em", background: "#fffbeb",
                                border: "1px solid #fcd34d", padding: "2px 6px", borderRadius: "12px",
                                fontWeight: "bold", cursor: "help"
                              }}
                              title={res.auditWarnings.join("\n")}
                            >
                              ⚠️ 歷史審計風險
                            </span>
                          )}
                        </div>
                      </td>
                      <td>{res.type === "budget" ? "本年預算" : "上年決算"}</td>
                      <td className={styles.valueText}>
                        {res.value.toLocaleString()}
                      </td>
                      <td className={styles.valueText}>
                        {res.refValue != null
                          ? res.refValue.toLocaleString()
                          : "無對應"}
                      </td>
                      <td>
                        <span
                          className={
                            res.status === "success"
                              ? styles.valueXml
                              : styles.valueJson
                          }
                          style={{
                            padding: "4px 10px",
                            borderRadius: "12px",
                            fontSize: "13px",
                            fontWeight: "bold",
                            display: "inline-block",
                            width: "80px",
                            textAlign: "center",
                          }}
                        >
                          {res.status === "success"
                            ? "一致"
                            : res.status === "error"
                            ? "不符"
                            : "缺基準"}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default SmartCompareTool;
