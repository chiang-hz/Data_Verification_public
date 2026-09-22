// src/StructureAnalysisTool.js
import React, { useState, useRef, useEffect } from "react";
import * as Diff from "diff-match-patch";
import styles from "./StructureAnalysisTool.module.css";
import { UploadIcon } from "./Icons";
import { parseStructureXml } from "./utils/xmlUtils";
import XmlFileSelector from "./components/XmlFileSelector";

const dmp = new Diff.diff_match_patch();

function StructureAnalysisTool() {
  const [totalAssets, setTotalAssets] = useState(null);
  const [totalLiabilities, setTotalLiabilities] = useState(null);
  const [totalEquity, setTotalEquity] = useState(null);
  const [totalLiabilitiesAndEquity, setTotalLiabilitiesAndEquity] =
    useState(null);
  const [liabilitiesToLiabAndEquityRatio, setLiabilitiesToLiabAndEquityRatio] =
    useState(null);
  const [equityToLiabAndEquityRatio, setEquityToLiabAndEquityRatio] =
    useState(null);
  const [error, setError] = useState(null);
  const [groupedAccounts, setGroupedAccounts] = useState({
    assets: [],
    liabilities: [],
    equity: [],
  });

  // 新增一個 state 用來顯示目前選中的檔名
  const [fileName, setFileName] = useState("");

  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [comparisonResult, setComparisonResult] = useState(null);
  const [diffHtml, setDiffHtml] = useState(null);

  // 接受來自 XmlFileSelector 的 fileEntry
  const handleFileEntry = (entry) => {
    if (!entry || !entry.rawContent) return;
    setFileName(entry.fileName);
    try {
      const parsedData = parseStructureXml(entry.rawContent);
      setGroupedAccounts(parsedData.groupedAccounts);
      setTotalAssets(parsedData.totalAssets);
      setTotalLiabilities(parsedData.totalLiabilities);
      setTotalEquity(parsedData.totalEquity);
      setTotalLiabilitiesAndEquity(parsedData.totalLiabilitiesAndEquity);
      setLiabilitiesToLiabAndEquityRatio(parsedData.liabilitiesToLiabAndEquityRatio);
      setEquityToLiabAndEquityRatio(parsedData.equityToLiabAndEquityRatio);
      setError(null);
      setComparisonResult(null);
      setDiffHtml(null);
    } catch (err) {
      setError(`解析檔案時發生錯誤：${err instanceof Error ? err.message : "未知錯誤"}`);
      setGroupedAccounts({ assets: [], liabilities: [], equity: [] });
      setTotalAssets(null);
      setFileName("");
    }
  };

  // 處理檔案邏輯
  const processFile = (file) => {
    if (file && (file.type === "text/xml" || file.name.endsWith(".xml"))) {
      setFileName(file.name); // 更新檔名顯示
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const xmlString = e.target?.result;
          if (typeof xmlString === "string") {
            const parsedData = parseStructureXml(xmlString);

            setGroupedAccounts(parsedData.groupedAccounts);
            setTotalAssets(parsedData.totalAssets);
            setTotalLiabilities(parsedData.totalLiabilities);
            setTotalEquity(parsedData.totalEquity);
            setTotalLiabilitiesAndEquity(parsedData.totalLiabilitiesAndEquity);
            setLiabilitiesToLiabAndEquityRatio(
              parsedData.liabilitiesToLiabAndEquityRatio
            );
            setEquityToLiabAndEquityRatio(
              parsedData.equityToLiabAndEquityRatio
            );

            setError(null);
            // 清空之前的比對狀態，但保留貼上的文字讓使用者決定是否保留
            setComparisonResult(null);
            setDiffHtml(null);
          } else {
            throw new Error("無法讀取檔案內容。");
          }
        } catch (err) {
          setError(
            `讀取或解析檔案時發生錯誤：${
              err instanceof Error ? err.message : "未知錯誤"
            }`
          );
          setGroupedAccounts({ assets: [], liabilities: [], equity: [] });
          setTotalAssets(null);
          setFileName("");
        }
      };
      reader.onerror = () => {
        setError("讀取檔案時發生錯誤。");
        setGroupedAccounts({ assets: [], liabilities: [], equity: [] });
        setTotalAssets(null);
        setFileName("");
      };
      reader.readAsText(file);
    } else if (file) {
      setError("請上傳有效的 XML 檔案 (.xml)。");
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
    // 不要在這裡清空 value，否則無法觸發下一次相同檔案的 change (視需求)
    // 但為了 UI 體驗，通常可以保留
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  // 格式化輔助函數
  const formatRatio = (ratio) => {
    if (typeof ratio !== "number" || ratio === null || isNaN(ratio))
      return "無法計算";
    return ratio.toFixed(2);
  };

  const formatAmount = (amount) => {
    if (typeof amount !== "number" || amount === null || isNaN(amount))
      return "-";
    return amount.toLocaleString() + "元";
  };

  const renderRatioText = (accountOrRatioObject) => {
    const ratio =
      accountOrRatioObject.percentageTotal !== undefined
        ? accountOrRatioObject.percentageTotal
        : accountOrRatioObject.percentageOfTotal;
    const baseText = accountOrRatioObject.percentageBase || "未知總額";
    const formattedRatio = formatRatio(ratio);

    if (formattedRatio === "無法計算")
      return `，占${baseText}之${formattedRatio}`;
    if (formattedRatio === "0.00") return "。";
    return `，占${baseText}之${formattedRatio}%。`;
  };

  // 生成標準文字
  const generateStandardText = () => {
    let standardText = "";
    if (groupedAccounts.assets.length > 0) {
      standardText += "(一 ) 資產之組成\n";
      groupedAccounts.assets.forEach((account, index) => {
        const amountStr = formatAmount(account.currentYearAmount);
        const ratioStr = renderRatioText(account);
        standardText += `${index + 1}. ${
          account.name
        }${amountStr}${ratioStr}\n`;
      });
      if (totalAssets !== null) {
        standardText += `以上資產總額為${totalAssets.toLocaleString()}元。\n`;
      }
      standardText += "\n";
    }

    if (groupedAccounts.liabilities.length > 0) {
      standardText += "(二 ) 負債之狀況\n";
      groupedAccounts.liabilities.forEach((account, index) => {
        const amountStr = formatAmount(account.currentYearAmount);
        const ratioStr = renderRatioText(account);
        standardText += `${index + 1}. ${
          account.name
        }${amountStr}${ratioStr}\n`;
      });
      if (totalLiabilities !== null && totalLiabilitiesAndEquity !== null) {
        const amountStr = totalLiabilities.toLocaleString();
        const ratioStr = renderRatioText({
          percentageTotal: liabilitiesToLiabAndEquityRatio,
          percentageBase: "負債及權益總額",
        });
        standardText += `以上負債總額為${amountStr}元${ratioStr}\n`;
      }
      standardText += "\n";
    }

    if (groupedAccounts.equity.length > 0) {
      standardText += "(三 ) 權益之內容\n";
      groupedAccounts.equity.forEach((account, index) => {
        const amountStr = formatAmount(account.currentYearAmount);
        const ratioStr = renderRatioText(account);
        standardText += `${index + 1}. ${
          account.name
        }${amountStr}${ratioStr}\n`;
      });
      if (totalEquity !== null && totalLiabilitiesAndEquity !== null) {
        const amountStr = totalEquity.toLocaleString();
        const ratioStr = renderRatioText({
          percentageTotal: equityToLiabAndEquityRatio,
          percentageBase: "負債及權益總額",
        });
        standardText += `以上權益總額為${amountStr}元${ratioStr}\n`;
      }
      standardText += "\n";
    }
    return standardText.trim();
  };

  const handlePaste = (event) => {
    // 允許預設貼上，這裡只是為了抓取 state
    // 如果要攔截可以 preventDefault 但要自己處理插入
  };

  const compareTexts = (pasted) => {
    const standard = generateStandardText();
    if (standard.trim() === pasted.trim()) {
      setComparisonResult("比對結果：完全一致");
      setDiffHtml(standard.replace(/\n/g, "<br/>"));
    } else {
      setComparisonResult("比對結果：不一致 (紅色為應刪除，綠色為應加入)");
      const diffs = dmp.diff_main(pasted, standard);
      dmp.diff_cleanupSemantic(diffs);
      setDiffHtml(dmp.diff_prettyHtml(diffs).replace(/&para;/g, ""));
    }
  };

  const handleManualCompare = () => {
    if (
      pastedText &&
      (groupedAccounts.assets.length > 0 ||
        groupedAccounts.liabilities.length > 0 ||
        groupedAccounts.equity.length > 0)
    ) {
      compareTexts(pastedText);
    } else if (!pastedText) {
      setComparisonResult("請先粘貼要比對的文字。");
      setDiffHtml(null);
    } else {
      setComparisonResult("請先上傳並解析 XML 檔案。");
      setDiffHtml(null);
    }
  };

  useEffect(() => {
    // 即時比對 (可選)
    if (
      pastedText &&
      (groupedAccounts.assets.length > 0 ||
        groupedAccounts.liabilities.length > 0 ||
        groupedAccounts.equity.length > 0)
    ) {
      // 如果希望自動比對可以打開這裡，目前使用手動按鈕觸發
      // compareTexts(pastedText);
    }
  }, [groupedAccounts, pastedText]);

  const hasData = totalAssets !== null;

  return (
    <div>
      <main>
        {/* 1. 說明區塊 */}
        <div className={styles.infoBox}>
          <p>
            <strong>說明：</strong>
            此工具用於核對「資產負債之結構」章節，自動生成標準段落並與您貼上的文字進行比對。
          </p>
          <p>
            <strong>操作流程：</strong>
            <br />
            1. 匯入自 SBA 產出之資產負債表 XML 檔。
            <br />
            2. 工具會自動在下方生成標準文字段落。
            <br />
            3. 將您決算書中的「伍、資產負債狀況」文字貼入比對框。
            <br />
            4. 點擊「手動比對」查看差異。
          </p>
        </div>

        {error && <div className={styles.errorMessage}>{error}</div>}

        {/* 2. 上傳卡片 */}
        <div className={styles.card}>
          <h2>步驟 1: 選擇 資產負債表</h2>

          <XmlFileSelector
            label="資產負債表 XML"
            acceptTypes={["balance"]}
            onFileReady={handleFileEntry}
            hint="系統將自動帶入檔案管理區已上傳的資產負債表"
          />
        </div>

        {/* 3. 解析結果預覽 (如有資料) */}
        {hasData && (
          <div className={styles.card}>
            <h2>系統生成之標準結構文字</h2>
            <div className={styles.parsedDataDisplay}>
              {/* 資產 */}
              {groupedAccounts.assets.length > 0 && (
                <div style={{ marginTop: "0.5rem" }}>
                  <h3>(一 ) 資產之組成</h3>
                  <ul>
                    {groupedAccounts.assets.map((account, index) => (
                      <li key={`asset-${index}`}>
                        {index + 1}. {account.name}{" "}
                        {formatAmount(account.currentYearAmount)}
                        {renderRatioText(account)}
                      </li>
                    ))}
                  </ul>
                  {totalAssets !== null && (
                    <p style={{ marginLeft: "20px", fontWeight: "bold" }}>
                      以上資產總額為{totalAssets.toLocaleString()}元。
                    </p>
                  )}
                </div>
              )}

              {/* 負債 */}
              {groupedAccounts.liabilities.length > 0 && (
                <div style={{ marginTop: "1.5rem" }}>
                  <h3>(二 ) 負債之狀況</h3>
                  <ul>
                    {groupedAccounts.liabilities.map((account, index) => (
                      <li key={`liability-${index}`}>
                        {index + 1}. {account.name}{" "}
                        {formatAmount(account.currentYearAmount)}
                        {renderRatioText(account)}
                      </li>
                    ))}
                  </ul>
                  {totalLiabilities !== null &&
                    totalLiabilitiesAndEquity !== null && (
                      <p style={{ marginLeft: "20px", fontWeight: "bold" }}>
                        以上負債總額為{totalLiabilities.toLocaleString()}元
                        {renderRatioText({
                          percentageTotal: liabilitiesToLiabAndEquityRatio,
                          percentageBase: "負債及權益總額",
                        })}
                      </p>
                    )}
                </div>
              )}

              {/* 權益 */}
              {groupedAccounts.equity.length > 0 && (
                <div style={{ marginTop: "1.5rem" }}>
                  <h3>(三 ) 權益之內容</h3>
                  <ul>
                    {groupedAccounts.equity.map((account, index) => (
                      <li key={`equity-${index}`}>
                        {index + 1}. {account.name}{" "}
                        {formatAmount(account.currentYearAmount)}
                        {renderRatioText(account)}
                      </li>
                    ))}
                  </ul>
                  {totalEquity !== null &&
                    totalLiabilitiesAndEquity !== null && (
                      <p style={{ marginLeft: "20px", fontWeight: "bold" }}>
                        以上權益總額為{totalEquity.toLocaleString()}元
                        {renderRatioText({
                          percentageTotal: equityToLiabAndEquityRatio,
                          percentageBase: "負債及權益總額",
                        })}
                      </p>
                    )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. 文字比對區 (樣式對齊 Step 2) */}
        <div className={styles.card}>
          <h2>步驟 2: 輸入文字並比對</h2>
          <textarea
            className={styles.comparisonTextarea}
            placeholder="請將您決算書中的「伍、資產負債狀況」文字貼上至此..."
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            onPaste={handlePaste}
          />

          <div style={{ textAlign: "center", marginTop: "20px" }}>
            <button
              className={styles.button}
              onClick={handleManualCompare}
              disabled={!pastedText || !hasData}
            >
              手動比對
            </button>
          </div>

          {comparisonResult !== null && (
            <div style={{ marginTop: "2rem" }}>
              <h3>{comparisonResult}</h3>
              {diffHtml !== null && (
                <div
                  className={styles.diffDisplay}
                  dangerouslySetInnerHTML={{ __html: diffHtml }}
                />
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default StructureAnalysisTool;
