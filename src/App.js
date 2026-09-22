import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./App.module.css";
import { useComparisonTool } from "./hooks/useComparisonTool";
import FinancialRatioTool from "./FinancialRatioTool";
import SmartCompareTool from "./SmartCompareTool.jsx";
import FileManagerPanel from "./components/FileManagerPanel";
import XmlFileSelector from "./components/XmlFileSelector";
import { useFileManager } from "./contexts/FileManagerContext";

const REVIEW_ACTIONS = [
  { key: "已確認正確", label: "已確認通過" },
  { key: "文字需修改", label: "修補文字說明" },
];

const RESULT_FILTER_OPTIONS = [
  ["pending", "待審核"],
  ["attention_summary", "注意事項"],
  ["missing", "缺漏"],
  ["mismatch", "差異"],
  ["reviewed", "已審核(全)"],
  ["reviewed_text_modify", "已審核-修補文字說明"],
];

const isValidKnowledgeRule = (rule) =>
  typeof rule?.keyword === "string" &&
  rule.keyword.trim().length > 0 &&
  typeof rule?.warning === "string" &&
  rule.warning.trim().length > 0;
function App() {
  const [activeTab, setActiveTab] = useState("comparison");
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const [showGoTopFab, setShowGoTopFab] = useState(false);
  const [showHighlightPanel, setShowHighlightPanel] = useState(false);
  const [sourceSelection, setSourceSelection] = useState(null);
  const resultRefs = useRef({});
  const highlightContainerRef = useRef(null);
  const pendingResultScrollRef = useRef(null);
  const sourceTextareaRef = useRef(null);
  const tabMenuRef = useRef(null);

  const {
    inputText,
    displayInputText,
    locatorHighlightEnabled,
    reportName,
    xmlLoadingError,
    isXmlLoaded,
    filteredComparisonResults,
    comparisonResults,
    loading,
    extractedCount,
    filterStatus,
    setFilterStatus,
    rawExtractedForHighlight,
    confirmedMatches,
    reportType,
    summaryStats,
    setReviewDecision,
    activeResultKey,
    setActiveResultKey,
    compareError,
    exceptionSummaryText,
    highlightLookup,
    textFocusedResults,
    getMetricStatusLabel,
    handleFileEntry,
    handleInputChange,
    handleCompare,
    batchOverview,
    activeRunId,
    switchToRun,
    segmentMode,
    setSegmentMode,
    manualSegments,
    setManualSegment,
    activeManualRatioYear,
    activeManualRatioInputs,
    setManualRatioInput,
    selectedFiles,
    loadedComparisonFileCount,
  } = useComparisonTool();

  const { files } = useFileManager();

  const knowledgeBaseFiles = useMemo(
    () => files.filter((file) => file.detectedType === "knowledgeBase"),
    [files]
  );

  const knowledgeBaseSummaries = useMemo(
    () =>
      knowledgeBaseFiles.map((file) => {
        const parsedRules = Array.isArray(file.parsedData) ? file.parsedData : [];
        const validRules = parsedRules
          .filter(isValidKnowledgeRule)
          .map((rule) => ({
            keyword: rule.keyword.trim(),
            warning: rule.warning.trim(),
          }));

        return {
          id: file.id,
          fileName: file.fileName,
          parseError: file.parseError || "",
          totalRuleCount: parsedRules.length,
          validRuleCount: validRules.length,
          invalidRuleCount: parsedRules.length - validRules.length,
          previewRules: validRules,
        };
      }),
    [knowledgeBaseFiles]
  );

  const knowledgeBaseFileCount = knowledgeBaseSummaries.length;
  const knowledgeBaseValidFileCount = knowledgeBaseSummaries.filter((file) => !file.parseError).length;
  const knowledgeBaseInvalidFileCount = knowledgeBaseSummaries.filter((file) => !!file.parseError).length;
  const knowledgeBaseValidRuleCount = knowledgeBaseSummaries.reduce(
    (total, file) => total + file.validRuleCount,
    0
  );
  const knowledgeBaseMalformedRuleCount = knowledgeBaseSummaries.reduce(
    (total, file) => total + file.invalidRuleCount,
    0
  );
  const knowledgeBaseIssueCount = knowledgeBaseInvalidFileCount + knowledgeBaseMalformedRuleCount;

  const metricColumns = useMemo(
    () =>
      reportType === "productionSalesVolume"
        ? [
            { key: "quantityComparison", label: "本期數量" },
            { key: "deltaQuantityComparison", label: "增減數量" },
            { key: "deltaQuantityPercentComparison", label: "增減百分比" },
          ]
        : [
            { key: "amountComparison", label: "本期金額" },
            { key: "deltaAmountComparison", label: "增減金額" },
            { key: "deltaPercentComparison", label: "增減百分比" },
          ],
    [reportType]
  );

  const visibleResultKeys = useMemo(
    () => new Set(filteredComparisonResults.map((result) => result.resultKey)),
    [filteredComparisonResults]
  );

  const manualSegmentFields = [
    ["income", "損益表段落", "輸入損益表段落"],
    ["balance", "資產負債表段落", "輸入資產負債表段落"],
    ["cashflow", "現金流量表段落", "輸入現金流量表段落"],
    ["profitDistribution", "盈虧撥補表段落", "輸入盈虧撥補表段落"],
    ["production", "營運量值比較段落", "輸入營運量值比較段落"],
    ["operatingRatios", "經營/成長比率段落", "輸入經營比率與成長比率段落"],
  ];

  const handleHighlightClick = (resultKey) => {
    if (!resultKey) return;
    pendingResultScrollRef.current = resultKey;
    if (!visibleResultKeys.has(resultKey) && filterStatus !== "all") {
      setFilterStatus("all");
    }
    setActiveResultKey(resultKey);
  };

  const scrollHighlightIntoView = (resultKey) => {
    if (!highlightContainerRef.current) return;
    const highlightElement = highlightContainerRef.current.querySelector(
      `[data-result-key="${resultKey}"]`
    );
    if (!highlightElement) return;

    const container = highlightContainerRef.current;
    const containerRect = container.getBoundingClientRect();
    const highlightRect = highlightElement.getBoundingClientRect();
    const nextScrollTop =
      container.scrollTop +
      (highlightRect.top - containerRect.top) -
      container.clientHeight / 2 +
      highlightRect.height / 2;
    container.scrollTo({
      top: Math.max(0, nextScrollTop),
      behavior: "smooth",
    });
  };

  const handleResultCardClick = (resultKey) => {
    if (!resultKey) return;
    pendingResultScrollRef.current = null;
    setActiveResultKey(resultKey);
    requestAnimationFrame(() => {
      scrollHighlightIntoView(resultKey);
    });
  };

  const updateSourceSelection = () => {
    const textarea = sourceTextareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    if (end <= start) {
      setSourceSelection(null);
      return;
    }

    const selectedText = inputText.slice(start, end);
    if (!selectedText.trim()) {
      setSourceSelection(null);
      return;
    }

    setSourceSelection({
      start,
      end,
      text: selectedText,
    });
  };

  const handleSourceTextChange = (event) => {
    setSourceSelection(null);
    handleInputChange(event);
  };

  const applySelectionToSegment = (segmentKey) => {
    if (!sourceSelection?.text) return;
    setManualSegment(segmentKey, sourceSelection.text);
  };

  const clearSegment = (segmentKey) => {
    setManualSegment(segmentKey, "");
  };

  useEffect(() => {
    if (!activeResultKey || pendingResultScrollRef.current !== activeResultKey) return;
    const row = resultRefs.current[activeResultKey];
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
    pendingResultScrollRef.current = null;
  }, [activeResultKey, comparisonResults, filteredComparisonResults]);

  const renderHighlightedText = () => {
    if (!displayInputText) {
      return <pre className={styles.highlightPre}>請先輸入核對文本內容。</pre>;
    }

    if (!locatorHighlightEnabled || !rawExtractedForHighlight.length) {
      return <pre className={styles.highlightPre}>{displayInputText}</pre>;
    }

    const elements = [];
    let lastIndex = 0;

    const sortedRawExtracted = [...rawExtractedForHighlight].sort((left, right) => left.index - right.index);
    sortedRawExtracted.forEach((item, index) => {
      if (item.index == null || item.length == null) return;

      if (item.index > lastIndex) {
        elements.push(
          <React.Fragment key={`text-${item.index}`}>
            {displayInputText.slice(lastIndex, item.index)}
          </React.Fragment>
        );
      }

      const highlightKey = `${item.index}-${item.length}`;
      const linkedHighlight = highlightLookup[highlightKey];
      const resultKey = linkedHighlight?.resultKey;
      const isConfirmed = confirmedMatches[highlightKey];
      const isActive = resultKey && resultKey === activeResultKey;
      let className = styles.highlightNeutral;

      if (isConfirmed) className = styles.highlightMatch;
      else if (linkedHighlight?.statusBucket) {
        if (linkedHighlight.statusBucket === "mismatch") className = styles.highlightMismatch;
        else if (linkedHighlight.statusBucket === "missing") className = styles.highlightWarning;
      }

      elements.push(
        <button
          type="button"
          key={`highlight-${highlightKey}-${index}`}
          data-highlight-key={highlightKey}
          data-result-key={resultKey || ""}
          className={`${styles.highlightToken} ${className} ${isActive ? styles.highlightActive : ""}`}
          onClick={() => handleHighlightClick(resultKey)}
        >
          {displayInputText.slice(item.index, item.index + item.length)}
        </button>
      );
      lastIndex = item.index + item.length;
    });

    if (lastIndex < displayInputText.length) {
      elements.push(<React.Fragment key="tail">{displayInputText.slice(lastIndex)}</React.Fragment>);
    }

    return <pre className={styles.highlightPre}>{elements}</pre>;
  };

  const selectedResult = useMemo(() => {
    if (!filteredComparisonResults.length) return null;
    return (
      filteredComparisonResults.find((result) => result.resultKey === activeResultKey) ||
      filteredComparisonResults[0]
    );
  }, [activeResultKey, filteredComparisonResults]);
  const uploadedFileCount = selectedFiles.length;
  const highlightFragmentCount = rawExtractedForHighlight.length;
  const focusedBatchItem =
    batchOverview.find((item) => item.runId === activeRunId) || batchOverview[0] || null;
  const focusedReportLabel =
    focusedBatchItem?.fileName ||
    reportName ||
    (selectedFiles.length === 1 ? selectedFiles[0]?.fileName : null) ||
    "尚未聚焦報表";
  const inputCharCount = inputText.trim().length;
  const hasInputText = inputCharCount > 0;
  const isReadyToCompare = isXmlLoaded && hasInputText;
  const hasComparisonResults = batchOverview.length > 0;
  const hasLoadedBatchGap =
    loadedComparisonFileCount > 0 && loadedComparisonFileCount !== uploadedFileCount;
  const batchSummaryDescription =
    loadedComparisonFileCount > 0
      ? `資料中心 ${loadedComparisonFileCount} 份 / 本次核驗 ${uploadedFileCount} 份 / 目前聚焦 ${focusedReportLabel}`
      : "尚未建立本次核驗批次。";
  const batchResultStatus = loading
    ? "核驗進行中"
    : hasComparisonResults
      ? "已有核驗結果"
      : "尚未產生結果";
  const readinessItems = [
    {
      key: "files",
      label: "已載入 XML",
      value: uploadedFileCount ? `${uploadedFileCount} 份` : "待上傳",
      ready: isXmlLoaded,
    },
    {
      key: "text",
      label: "已匯入文字",
      value: hasInputText ? `${inputCharCount} 字` : "待貼上",
      ready: hasInputText,
    },
    {
      key: "run",
      label: "核驗狀態",
      value: loading ? "核驗中" : hasComparisonResults ? "已完成" : isReadyToCompare ? "可執行" : "待準備",
      ready: isReadyToCompare,
    },
  ];
  const scrollToPageTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    if (activeTab === "structureAnalysis") {
      setActiveTab("comparison");
    }
  }, [activeTab]);

  useEffect(() => {
    const updateGoTopVisibility = () => {
      setShowGoTopFab(window.scrollY > 420);
    };

    updateGoTopVisibility();
    window.addEventListener("scroll", updateGoTopVisibility, { passive: true });
    window.addEventListener("resize", updateGoTopVisibility);

    return () => {
      window.removeEventListener("scroll", updateGoTopVisibility);
      window.removeEventListener("resize", updateGoTopVisibility);
    };
  }, [activeTab]);

  const isMismatchMetric = (metricValue) => {
    if (!metricValue) return false;
    const code = metricValue.statusCode || metricValue.status_code;
    if (code) return code === "mismatch";
    const status = String(metricValue.status || "");
    return status.includes("mismatch") || status.includes("差異");
  };

  const shouldRenderMetricCard = (metricValue) => {
    if (!metricValue) return false;
    const statusCode = metricValue.statusCode || metricValue.status_code;
    if (statusCode === "unresolved" && metricValue?.extracted_index == null) {
      return false;
    }
    return Boolean(metricValue.status || statusCode);
  };

  const buildResultMetricCards = (result) => {
    if (!result) return [];

    const baseCards =
      result.sourceType === "derived_ratio"
        ? metricColumns.filter((metric) => Boolean(result[metric.key]))
        : metricColumns.filter((metric) => shouldRenderMetricCard(result[metric.key]));
    const supplementalCards = (result.metricSummaries || [])
      .filter((metric) =>
        ["direction-", "support-amount-"].some((prefix) => String(metric.metricKey || "").startsWith(prefix))
      )
      .map((metric) => ({
        key: metric.metricKey,
        label: metric.label,
        value: metric,
      }));

    return [...baseCards, ...supplementalCards];
  };

  const getPrimaryResultMetricCard = (result) => {
    const cards = buildResultMetricCards(result);
    if (!cards.length) return metricColumns[0];

    const withValue = cards.map((metric) => ({
      ...metric,
      value: metric.value || result?.[metric.key],
    }));
    return (
      withValue.find(
        (metric) => String(metric.key || "").startsWith("support-amount-") && getMetricBucket(metric.value) === "mismatch"
      ) ||
      withValue.find(
        (metric) => String(metric.key || "").startsWith("support-amount-") && getMetricBucket(metric.value) === "missing"
      ) ||
      withValue.find((metric) => getMetricBucket(metric.value) === "mismatch") ||
      withValue.find((metric) => getMetricBucket(metric.value) === "missing") ||
      withValue[0]
    );
  };

  const statusLabelMap = {
    mismatch: "差異",
    missing: "缺漏",
    matched: "一致",
    open: "待處理",
    pending: "待審核",
    unresolved: "待審核",
  };

  const severityLabelMap = {
    high: "高",
    medium: "中",
    low: "低",
    info: "資訊",
  };

  const getDisplayStatusLabel = (result) => statusLabelMap[result?.statusBucket] || "未分類";
  const getDisplaySeverityLabel = (result) => severityLabelMap[result?.severity] || "一般";
  const getReviewLabel = (decisionType) =>
    REVIEW_ACTIONS.find((action) => action.key === decisionType)?.label || "尚未審核";

  const getMetricDisplayStatusLabel = (metric) => {
    if (!metric) return "-";
    const code = metric.statusCode || metric.status_code;
    if (code && statusLabelMap[code]) return statusLabelMap[code];
    const raw = String(getMetricStatusLabel(metric) || "");
    if (raw.toLowerCase().includes("mismatch")) return "差異";
    if (raw.toLowerCase().includes("missing")) return "缺漏";
    if (raw.toLowerCase().includes("match")) return "一致";
    return "待處理";
  };

  const getMetricBucket = (metric) => {
    if (!metric) return null;
    const code = String(metric.statusCode || metric.status_code || "").toLowerCase();
    if (code === "mismatch") return "mismatch";
    if (code === "missing" || code === "missing_base" || code === "unmatched") return "missing";

    const raw = String(metric.status || "").toLowerCase();
    if (raw.includes("mismatch") || raw.includes("差異")) return "mismatch";
    if (raw.includes("missing") || raw.includes("缺漏") || raw.includes("未對應")) return "missing";
    return null;
  };

  const getPendingAttentionText = (result) => {
    const metrics = Array.isArray(result?.metricSummaries) ? result.metricSummaries : [];
    const hasMismatch = metrics.some((metric) => getMetricBucket(metric) === "mismatch");
    const hasMissing = metrics.some((metric) => getMetricBucket(metric) === "missing");

    if (hasMismatch && hasMissing) return "同時含差異及缺漏，請人工確認。";
    if (hasMismatch) return "含差異，請人工確認。";
    if (hasMissing) return "含缺漏，請人工確認。";
    return "需人工確認。";
  };

  const handleAttentionSummaryFilter = () => {
    setFilterStatus(filterStatus === "attention_summary" ? "all" : "attention_summary");
  };

  const handleTabChange = (nextTab) => {
    setActiveTab(nextTab);
  };

  return (
    <div className={styles.appContainer}>
      <header className={styles.pageHeader}>
        <h1 className={styles.mainTitle}>財報核對平台</h1>
        <p className={styles.pageSubtitle}>
          集中管理財報 XML、文字說明與核驗結果，支援批次檢核、差異追蹤與人工覆核。
        </p>
      </header>

      <FileManagerPanel />

      <div className={styles.tabs}>
        <div
          className={styles.tabMenu}
          data-open={tabMenuOpen ? "true" : "false"}
          ref={tabMenuRef}
          onMouseLeave={() => setTabMenuOpen(false)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setTabMenuOpen(false);
            }
          }}
        >
          <div className={styles.tabMenuPanel} aria-label="頁面切換">
            <button
              className={activeTab === "comparison" ? styles.tabActive : ""}
              onClick={() => handleTabChange("comparison")}
            >
              <h2>核對總覽</h2>
            </button>
            <button
              className={activeTab === "financialRatio" ? styles.tabActive : ""}
              onClick={() => handleTabChange("financialRatio")}
            >
              <h2>比率分析</h2>
            </button>
            <button
              className={activeTab === "smartCompare" ? styles.tabActive : ""}
              onClick={() => handleTabChange("smartCompare")}
            >
              <h2>報表檢核</h2>
            </button>
          </div>
          <button
            type="button"
            className={styles.tabMenuToggle}
            aria-label="切換工具"
            onMouseEnter={() => setTabMenuOpen(true)}
            onFocus={() => setTabMenuOpen(true)}
          >
            <span className={styles.tabMenuToggleLabel}>工具切換</span>
          </button>
        </div>
      </div>

      <div className={styles.tabContent}>
        <section
          className={`${styles.tabPanel} ${activeTab === "comparison" ? styles.tabPanelActive : styles.tabPanelHidden}`}
          hidden={activeTab !== "comparison"}
        >
            <div className={styles.workflowGrid}>
              <section className={styles.card}>
                <h2>1. 載入財報資料</h2>
                <XmlFileSelector
                  label="選擇待核驗財報 XML"
                  acceptTypes={["income", "balance", "cashflow", "profitDistribution", "production"]}
                  onFileReady={handleFileEntry}
                  workspaceRole="comparisonPrimaryFiles"
                  multiple
                  hint="可一次選取多份財報 XML，建立本次核驗批次。"
                />
                {xmlLoadingError ? <p className={styles.errorText}>{xmlLoadingError}</p> : null}
              </section>

              <section className={styles.card}>
                <h2>
                  <span>2. 匯入說明文字</span>
                  <a
                    className={styles.titleHelperLink}
                    href="https://ai.studio/apps/e505cd69-c4a2-4be3-802a-41b4ad8b3d47"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    PDF 內容擷取助手
                  </a>
                </h2>
                <textarea
                  ref={sourceTextareaRef}
                  className={styles.comparisonTextarea}
                  value={inputText}
                  onChange={handleSourceTextChange}
                  onSelect={updateSourceSelection}
                  onKeyUp={updateSourceSelection}
                  onMouseUp={updateSourceSelection}
                  placeholder="貼上需與財報 XML 交叉核驗的文字說明內容。"
                  disabled={!isXmlLoaded}
                />
                {segmentMode === "manual" ? (
                  <div className={styles.inlineSegmentPanel}>
                    <div className={styles.inlineSegmentPanelHeader}>
                      <strong>原文框選分段</strong>
                      <span>
                        {sourceSelection?.text
                          ? `已選取 ${sourceSelection.text.length} 字，直接指定到對應段落。`
                          : "在上方原文直接框選段落，再點下面按鈕指定。"}
                      </span>
                    </div>
                    <div className={styles.inlineSegmentActionGrid}>
                      {manualSegmentFields.map(([segmentKey, label]) => (
                        <button
                          key={segmentKey}
                          type="button"
                          className={styles.inlineSegmentAction}
                          onClick={() => applySelectionToSegment(segmentKey)}
                          disabled={!sourceSelection?.text}
                        >
                          帶入{label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            </div>

            <section className={styles.card}>
              <div className={styles.executionShell}>
                <div className={styles.executionSummaryBar}>
                  <div className={styles.executionSummaryCopy}>
                    <h2>3. 執行核驗</h2>
                    <p className={styles.cardHint}>
                      系統會擷取文字中的數值與敘述，自動對照財報 XML 項目並標示例外。
                    </p>
                  </div>
                  <div className={styles.executionStatusList}>
                    {readinessItems.map((item) => (
                      <div
                        key={item.key}
                        className={`${styles.executionStatusItem} ${
                          item.ready ? styles.executionStatusItemReady : styles.executionStatusItemIdle
                        }`}
                      >
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                  <button
                    className={styles.primaryButton}
                    onClick={handleCompare}
                    disabled={loading || !isReadyToCompare}
                  >
                    {loading ? "核驗中..." : "開始核驗"}
                  </button>
                </div>
                <div className={styles.batchSnapshot}>
                  <div className={styles.batchSnapshotCopy}>
                    <span className={styles.batchSnapshotLabel}>本次核驗批次</span>
                    <strong>{batchSummaryDescription}</strong>
                    <small>
                      {hasLoadedBatchGap
                        ? "資料中心與本次核驗批次數量不同，屬於正常的聚焦檢視。"
                        : "目前檢視與資料中心維持同步。"}{" "}
                      結果狀態：{batchResultStatus}
                    </small>
                  </div>
                </div>

                {!isReadyToCompare ? (
                  <div className={styles.workflowPlaceholder}>
                    <strong>先完成上方兩步，再進入核驗設定與結果檢視。</strong>
                    <span>目前建議流程：先上傳財報 XML，再貼入說明文字；系統會自動解鎖核驗操作。</span>
                  </div>
                ) : (
                  <div className={styles.actionHeader}>
                    <div>
                      <div className={styles.sectionTitleRow}>
                        <h2>核驗設定</h2>
                      </div>
                      <div className={styles.modeSelectorRail}>
                        <div className={styles.modeSelectorCopy}>
                          <strong>核驗模式</strong>
                          <span>預設為全文核驗；若要指定段落，可切換到手動分段核驗。</span>
                        </div>
                        <div className={styles.modeSelectorGroup} role="tablist" aria-label="核驗模式">
                          <button
                            type="button"
                            role="tab"
                            aria-selected={segmentMode === "fulltext"}
                            className={`${styles.modeSelectorButton} ${
                              segmentMode === "fulltext" ? styles.modeSelectorButtonActive : ""
                            }`}
                            onClick={() => setSegmentMode("fulltext")}
                          >
                            <strong>全文核驗</strong>
                            <span>直接用整段文字比對 XML</span>
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={segmentMode === "manual"}
                            className={`${styles.modeSelectorButton} ${
                              segmentMode === "manual" ? styles.modeSelectorButtonActive : ""
                            }`}
                            onClick={() => setSegmentMode("manual")}
                          >
                            <strong>手動分段核驗</strong>
                            <span>框選原文後指定到各段落</span>
                          </button>
                        </div>
                      </div>
                      {segmentMode === "manual" ? (
                        <>
                          <div className={styles.segmentSelectionHint}>
                            <span className={styles.segmentSelectionTitle}>原文框選帶入</span>
                            <span className={styles.segmentSelectionText}>
                              {sourceSelection?.text
                                ? `已由上方原文選取 ${sourceSelection.text.length} 字；下方段落僅供檢查與手動修正。`
                                : "先在上方原文輸入框選取段落範圍，再用原文下方按鈕指定到對應段落。"}
                            </span>
                          </div>
                          <div className={styles.manualSegmentGrid}>
                            {manualSegmentFields.map(([segmentKey, label, placeholder]) => (
                              <label key={segmentKey} className={styles.manualSegmentItem}>
                                <div className={styles.manualSegmentHeader}>
                                  <span>{label}</span>
                                  <div className={styles.manualSegmentActions}>
                                    <button
                                      type="button"
                                      className={styles.segmentGhostButton}
                                      onClick={() => clearSegment(segmentKey)}
                                      disabled={!manualSegments[segmentKey]}
                                    >
                                      清除
                                    </button>
                                  </div>
                                </div>
                                <textarea
                                  className={styles.manualSegmentTextarea}
                                  value={manualSegments[segmentKey]}
                                  onChange={(event) => setManualSegment(segmentKey, event.target.value)}
                                  placeholder={placeholder}
                                />
                              </label>
                            ))}
                          </div>
                        </>
                      ) : null}
                      {activeManualRatioYear ? (
                        <div className={styles.manualRatioPanel}>
                          <div className={styles.manualRatioHeader}>
                            <strong>經營比率補充資料</strong>
                            <span>{activeManualRatioYear} 年度，單位：%</span>
                          </div>
                          <div className={styles.manualRatioGrid}>
                            <label>
                              本年度(N) 預算權益報酬率
                              <input
                                type="text"
                                inputMode="decimal"
                                value={activeManualRatioInputs.roeBudget || ""}
                                onChange={(event) =>
                                  setManualRatioInput(activeManualRatioYear, "roeBudget", event.target.value)
                                }
                                placeholder="例如 13.79"
                              />
                            </label>
                            <label>
                              上年度(N-1) 決算權益報酬率
                              <input
                                type="text"
                                inputMode="decimal"
                                value={activeManualRatioInputs.roePrevious || ""}
                                onChange={(event) =>
                                  setManualRatioInput(activeManualRatioYear, "roePrevious", event.target.value)
                                }
                                placeholder="例如 18.57"
                              />
                            </label>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
              {compareError ? <div className={styles.errorBanner}>{compareError}</div> : null}
            </section>

            <section className={styles.card}>
              <div className={styles.knowledgePanelHeader}>
                <div>
                  <h2>4. 知識規則</h2>
                  <p className={styles.cardHint}>系統只會使用有效規則，格式錯誤或欄位不完整的項目會略過。</p>
                </div>
              </div>
              {!knowledgeBaseFileCount ? (
                <div className={styles.workflowPlaceholder}>
                  <strong>尚未載入知識規則 JSON。</strong>
                  <span>可從資料中心上傳 audit.json，檢查目前規則是否已正確載入。</span>
                </div>
              ) : (
                <div className={styles.knowledgePanel}>
                  <div className={styles.knowledgeSummaryGrid}>
                    <div className={styles.knowledgeSummaryCard}>
                      <span>規則檔案</span>
                      <strong>{knowledgeBaseFileCount}</strong>
                    </div>
                    <div className={`${styles.knowledgeSummaryCard} ${styles.knowledgeSummaryCardGood}`}>
                      <span>有效規則</span>
                      <strong>{knowledgeBaseValidRuleCount}</strong>
                    </div>
                    <div
                      className={`${styles.knowledgeSummaryCard} ${
                        knowledgeBaseIssueCount ? styles.knowledgeSummaryCardWarn : styles.knowledgeSummaryCardNeutral
                      }`}
                    >
                      <span>待修正</span>
                      <strong>{knowledgeBaseIssueCount}</strong>
                    </div>
                  </div>

                  <section className={styles.knowledgeCard}>
                    <div className={styles.knowledgeCardHeader}>
                      <strong>檔案狀態</strong>
                      <span>{knowledgeBaseValidFileCount} / {knowledgeBaseFileCount} 份可用</span>
                    </div>
                    <div className={styles.knowledgeFileList}>
                      {knowledgeBaseSummaries.map((file) => (
                        <article key={file.id} className={styles.knowledgeFileItem}>
                          <div className={styles.knowledgeFileTop}>
                            <strong>{file.fileName}</strong>
                            <span
                              className={`${styles.knowledgeStateBadge} ${
                                file.parseError
                                  ? styles.knowledgeStateError
                                  : file.invalidRuleCount > 0
                                    ? styles.knowledgeStateWarn
                                    : styles.knowledgeStateGood
                              }`}
                            >
                              {file.parseError ? "解析失敗" : file.invalidRuleCount > 0 ? "部分可用" : "可用"}
                            </span>
                          </div>
                          <div className={styles.knowledgeFileMeta}>
                            <span>有效 {file.validRuleCount}</span>
                            <span>原始 {file.totalRuleCount}</span>
                            {file.invalidRuleCount > 0 ? <span>待修正 {file.invalidRuleCount}</span> : null}
                          </div>
                          {file.parseError ? <p className={styles.knowledgeFileError}>{file.parseError}</p> : null}
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </section>

            <section className={styles.card}>
              <h2>5. Dashboard</h2>
              {!hasComparisonResults ? (
                <div className={styles.workflowPlaceholder}>
                  <strong>核驗完成後，這裡會顯示批次摘要、結果清單與明細檢視。</strong>
                  <span>目前結果區先保留為摘要占位，避免在尚未執行前堆出大量空白控制項。</span>
                </div>
              ) : (
                <>
                  <div className={styles.summaryGrid}>
                    <div className={styles.summaryCard}>
                      <span>已聚焦結果</span>
                      <strong>{summaryStats.total}</strong>
                    </div>
                    <div className={`${styles.summaryCard} ${styles.summaryCardAlert}`}>
                      <span>差異</span>
                      <strong>{summaryStats.mismatch}</strong>
                    </div>
                    <div className={`${styles.summaryCard} ${styles.summaryCardAlertSoft}`}>
                      <span>缺漏</span>
                      <strong>{summaryStats.missing}</strong>
                    </div>
                    <div className={`${styles.summaryCard} ${styles.summaryCardPending}`}>
                      <span>待審核</span>
                      <strong>{summaryStats.pendingOpen}</strong>
                    </div>
                    <div className={`${styles.summaryCard} ${styles.summaryCardMuted}`}>
                      <span>已審核</span>
                      <strong>{summaryStats.explained}</strong>
                    </div>
                  </div>

                  <div
                    className={`${styles.batchOverviewGrid} ${
                      batchOverview.length === 1 ? styles.batchOverviewGridSingle : ""
                    }`}
                  >
                    {batchOverview.map((item) => (
                      <button
                        key={item.runId}
                        type="button"
                        className={`${styles.batchOverviewCard} ${
                          batchOverview.length === 1 ? styles.batchOverviewCardSingle : ""
                        } ${
                          activeRunId === item.runId ? styles.batchOverviewCardActive : ""
                        } ${
                          item.hasError
                            ? styles.batchOverviewCardError
                            : item.pending > 0
                              ? styles.batchOverviewCardPending
                              : item.mismatch > 0 || item.missing > 0
                                ? styles.batchOverviewCardReview
                                : styles.batchOverviewCardClean
                        }`}
                        onClick={() => switchToRun(item.runId)}
                      >
                        <div className={styles.batchOverviewTop}>
                          <strong>{item.fileName}</strong>
                          <span
                            className={`${styles.batchOverviewStatus} ${
                              item.hasError
                                ? styles.batchOverviewStatusError
                                : item.pending > 0
                                  ? styles.batchOverviewStatusPending
                                  : styles.batchOverviewStatusClean
                            }`}
                          >
                            {item.hasError ? "核驗失敗" : item.pending > 0 ? `待審核 ${item.pending}` : "已完成"}
                          </span>
                        </div>
                        <div className={styles.batchOverviewMeta}>
                          <span>差異 {item.mismatch}</span>
                          <span>缺漏 {item.missing}</span>
                          <span>核驗 {item.extractedCount}</span>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className={styles.resultLayout}>
                    <div className={styles.resultsPanel}>
                      <div className={styles.resultsToolbarSticky}>
                        <div className={styles.resultsToolbar}>
                          <div className={styles.filterGroup}>
                            {RESULT_FILTER_OPTIONS.map(([value, label]) => (
                              <button
                                key={value}
                                className={`${styles.filterChip} ${
                                  filterStatus === value ? styles.filterChipActive : ""
                                }`}
                                onClick={() => setFilterStatus(value)}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          {batchOverview.length > 1 ? (
                            <select
                              className={styles.runSelect}
                              value={activeRunId || ""}
                              onChange={(event) => switchToRun(event.target.value)}
                            >
                              {batchOverview.map((item) => (
                                <option key={item.runId} value={item.runId}>
                                  {item.fileName}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      </div>

                      <div className={styles.exceptionCard}>
                        <div className={styles.exceptionHeader}>
                          <button
                            type="button"
                            className={`${styles.exceptionTitleButton} ${
                              filterStatus === "attention_summary" ? styles.exceptionTitleButtonActive : ""
                            }`}
                            onClick={handleAttentionSummaryFilter}
                          >
                            注意事項摘要
                          </button>
                          <button
                            className={styles.secondaryButton}
                            onClick={() =>
                              navigator.clipboard.writeText(exceptionSummaryText || "目前沒有需要處理的注意事項")
                            }
                          >
                            複製注意事項摘要
                          </button>
                        </div>
                        <pre className={styles.exceptionText}>
                          {exceptionSummaryText || "目前沒有需要處理的注意事項。"}
                        </pre>
                      </div>

                      <div className={styles.resultWorkbench}>
                        <div className={styles.resultListCompact}>
                          {filteredComparisonResults.map((result) => {
                            const primaryMetric = getPrimaryResultMetricCard(result);
                            const primaryValue = primaryMetric?.value || result[primaryMetric?.key];

                            return (
                              <article
                                key={result.resultKey}
                                ref={(node) => {
                                  resultRefs.current[result.resultKey] = node;
                                }}
                                className={`${styles.resultListItem} ${
                                  activeResultKey === result.resultKey ? styles.resultListItemActive : ""
                                } ${
                                  result.requiresAttention && !result.currentReview
                                    ? styles.resultListItemNeedsAttention
                                    : ""
                                }`}
                              onClick={() => handleResultCardClick(result.resultKey)}
                            >
                              <div className={styles.resultListItemTop}>
                                <h3>{result.term}</h3>
                                {result.requiresAttention && !result.currentReview ? (
                                  <span className={`${styles.badge} ${styles.badgeAttention}`}>待審核</span>
                                ) : null}
                              </div>
                              <div className={styles.resultBadges}>
                                  <span className={`${styles.badge} ${styles[`status_${result.statusBucket}`]}`}>
                                    {getDisplayStatusLabel(result)}
                                  </span>
                                </div>
                                <div className={styles.resultListMeta}>
                                  <span>
                                    {result.sourceType === "derived_ratio" && primaryMetric?.key === "amountComparison"
                                      ? "比率值"
                                      : primaryMetric?.label || "-"}
                                  </span>
                                  <strong>{primaryValue?.extracted_display || "-"}</strong>
                                  <small>財報 XML: {primaryValue?.base_display || "-"}</small>
                                </div>
                              </article>
                            );
                          })}
                          {!filteredComparisonResults.length ? (
                            <div className={styles.emptyState}>
                              <strong>目前篩選條件下沒有結果。</strong>
                              <span>改看「注意事項 / 缺漏 / 差異」，比較容易找到需要處理的項目。</span>
                              <div className={styles.emptyStateActions}>
                                <button
                                  type="button"
                                  className={styles.secondaryButton}
                                  onClick={() => setFilterStatus("attention_summary")}
                                >
                                  看注意事項
                                </button>
                                <button
                                  type="button"
                                  className={styles.secondaryButton}
                                  onClick={() => setFilterStatus("missing")}
                                >
                                  看缺漏
                                </button>
                                <button
                                  type="button"
                                  className={styles.secondaryButton}
                                  onClick={() => setFilterStatus("mismatch")}
                                >
                                  看差異
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div className={styles.resultDetailPanel}>
                          {selectedResult ? (() => {
                            const warningText = selectedResult.warnings?.length
                              ? selectedResult.warnings.join("；")
                              : "";
                            const primaryMetric = getPrimaryResultMetricCard(selectedResult);
                            const primaryValue = primaryMetric?.value || selectedResult[primaryMetric?.key];
                            return (
                            <article
                              className={`${styles.resultCard} ${
                                selectedResult.requiresAttention && !selectedResult.currentReview
                                  ? styles.resultCardNeedsAttention
                                  : ""
                              }`}
                            >
                              <div className={styles.resultCardHeader}>
                                <div>
                                  <h3>{selectedResult.term}</h3>
                                  <div className={styles.resultBadges}>
                                    <span className={`${styles.badge} ${styles[`status_${selectedResult.statusBucket}`]}`}>
                                      {getDisplayStatusLabel(selectedResult)}
                                    </span>
                                    <span className={`${styles.badge} ${styles[`severity_${selectedResult.severity}`]}`}>
                                      重要度 {getDisplaySeverityLabel(selectedResult)}
                                    </span>
                                    {selectedResult.sourceType === "derived_ratio" ? (
                                      <span className={`${styles.badge} ${styles.badgeDerivedRatio}`}>
                                        財務比率
                                      </span>
                                    ) : null}
                                    {selectedResult.isExplanationRequired ? (
                                      <span className={`${styles.badge} ${styles.badgeWarning}`}>
                                        需補充說明
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                <div className={styles.reviewState}>
                                  {selectedResult.currentReview ? (
                                    <>
                                      <strong>{getReviewLabel(selectedResult.currentReview.decisionType)}</strong>
                                      <span>{new Date(selectedResult.currentReview.decidedAt).toLocaleString()}</span>
                                    </>
                                  ) : (
                                    <span>尚未審核</span>
                                  )}
                                </div>
                              </div>

                              <div className={styles.resultHeroMetrics}>
                                <div className={styles.resultHeroMetric}>
                                  <span>
                                    {selectedResult.sourceType === "derived_ratio" &&
                                    primaryMetric?.key === "amountComparison"
                                      ? "比率值"
                                      : primaryMetric?.label || "主要值"}
                                  </span>
                                  <strong>{primaryValue?.extracted_display || "-"}</strong>
                                </div>
                                <div className={styles.resultHeroMetric}>
                                  <span>XML 對照值</span>
                                  <strong>{primaryValue?.base_display || "-"}</strong>
                                </div>
                              </div>

                              <div className={styles.metricGrid}>
                                {buildResultMetricCards(selectedResult).map((metric) => {
                                  const value = metric.value || selectedResult[metric.key];
                                  return (
                                    <div
                                      key={metric.key}
                                      className={`${styles.metricCard} ${
                                        isMismatchMetric(value) ? styles.metricCardNeedsAttention : ""
                                      }`}
                                    >
                                      <span>
                                        {selectedResult.sourceType === "derived_ratio" && metric.key === "amountComparison"
                                          ? "比率值"
                                          : metric.label}
                                      </span>
                                      <strong>{value?.extracted_display || "-"}</strong>
                                      <small>基準：{value?.base_display || "-"}</small>
                                      <small>狀態：{getMetricDisplayStatusLabel(value)}</small>
                                    </div>
                                  );
                                })}
                              </div>

                              {selectedResult.requiresAttention && !selectedResult.currentReview ? (
                                <div className={styles.pendingAlertBlock}>
                                  <strong>待審核</strong>
                                  <span>{getPendingAttentionText(selectedResult)}</span>
                                </div>
                              ) : null}

                              <div className={styles.detailRow}>
                                <span className={styles.detailLabel}>判定依據</span>
                                <span>{selectedResult.explanationBasisText || "未提供"}</span>
                              </div>
                              <div className={styles.detailRow}>
                                <span className={styles.detailLabel}>文字說明</span>
                                <span>
                                  {selectedResult.hasEmbeddedExplanation
                                    ? `已偵測：${selectedResult.explanationExcerpt || "文字中含說明語句"}`
                                    : "未偵測到補充說明"}
                                </span>
                              </div>
                              <div className={`${styles.detailRow} ${warningText ? styles.riskDetailRow : ""}`}>
                                <span className={styles.detailLabel}>風險提示</span>
                                <span className={warningText ? styles.riskDetailText : ""}>{warningText || "-"}</span>
                              </div>

                              <div className={styles.reviewActions}>
                                {REVIEW_ACTIONS.map((action) => (
                                  <button
                                    key={action.key}
                                    type="button"
                                    className={`${styles.reviewButton} ${
                                      selectedResult.currentReview?.decisionType === action.key
                                        ? styles.reviewButtonActive
                                        : ""
                                    }`}
                                    onClick={() => setReviewDecision(selectedResult, action.key)}
                                  >
                                    {action.label}
                                  </button>
                                ))}
                              </div>
                            </article>
                            );
                          })() : (
                            <div className={styles.emptyState}>請先完成核驗，並選擇一筆結果查看明細。</div>
                          )}
                        </div>
                      </div>

                      <details
                        className={styles.highlightDisclosure}
                        open={showHighlightPanel}
                        onToggle={(event) => setShowHighlightPanel(event.currentTarget.open)}
                      >
                        <summary className={styles.highlightDisclosureSummary}>
                          <div>
                            <strong>文字定位檢視</strong>
                            <span className={styles.panelHint}>
                              {locatorHighlightEnabled
                                ? "點選高亮文字可快速定位至上方結果明細"
                                : "目前尚未產生可定位的文字片段"}
                            </span>
                          </div>
                          <span className={styles.highlightDisclosureAction}>
                            {showHighlightPanel
                              ? `收起全文（${highlightFragmentCount} 個定位片段）`
                              : `展開全文（${highlightFragmentCount} 個定位片段）`}
                          </span>
                        </summary>
                        <div ref={highlightContainerRef} className={styles.highlightedTextContainer}>
                          {renderHighlightedText()}
                        </div>
                      </details>
                    </div>
                  </div>
                </>
              )}
            </section>
        </section>

        <section
          className={`${styles.tabPanel} ${activeTab === "financialRatio" ? styles.tabPanelActive : styles.tabPanelHidden}`}
          hidden={activeTab !== "financialRatio"}
        >
          <FinancialRatioTool />
        </section>
        <section
          className={`${styles.tabPanel} ${activeTab === "smartCompare" ? styles.tabPanelActive : styles.tabPanelHidden}`}
          hidden={activeTab !== "smartCompare"}
        >
          <SmartCompareTool />
        </section>
        {showGoTopFab ? (
          <button
            type="button"
            className={styles.goTopFab}
            onClick={scrollToPageTop}
            aria-label="回到頁面頂部"
            title="回到頂部"
          >
            ↑
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default App;









