import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseComparisonXml } from "../utils/xmlUtils";
import {
  buildNormalizedBalanceStructureComparisonRows,
  buildDerivedComparisonRows,
  extractXmlYear,
} from "../utils/financialRatioDerivedRows";
import { useFileManager } from "../contexts/FileManagerContext";

const REVIEWER_NAME = "Analyst";

const STATUS_LABELS = {
  matched: "一致",
  mismatch: "不一致",
  missing: "未找到",
  pending: "待確認",
  open: "待確認",
  unresolved: "待確認",
  unmatched: "未匹配",
};

const SEVERITY_LABELS = {
  high: "高風險",
  medium: "中風險",
  low: "低風險",
  info: "資訊",
};

export const MANUAL_SEGMENT_TYPES = [
  "income",
  "balance",
  "cashflow",
  "profitDistribution",
  "production",
  "operatingRatios",
];
const MANUAL_SEGMENT_LABELS = {
  income: "損益段落",
  balance: "資產負債段落",
  cashflow: "現金流量段落",
  profitDistribution: "盈餘分配段落",
  production: "營運量值段落",
  operatingRatios: "經營/成長比率段落",
};

const OPERATING_RATIO_CODE_PREFIXES = [
  "ratio:netMargin",
  "ratio:roe",
  "ratio:fundYieldToCost",
  "ratio:revenueGrowth",
  "ratio:equityGrowth",
];

const EXPLANATION_KEYWORDS = [
  "主要係",
  "係因",
  "係採",
  "係按",
  "係由",
  "係屬",
  "係為",
  "因為",
  "由於",
  "原因",
  "主因",
  "因此",
  "致",
  "受",
  "影響",
  "反映",
  "說明",
  "所致",
  "來自",
  "包括",
  "認列",
];

function getMetricConfigs(reportType) {
  if (reportType === "productionSalesVolume") {
    return [
      { key: "quantityComparison", label: "本期數量" },
      { key: "deltaQuantityComparison", label: "增減數量" },
      { key: "deltaQuantityPercentComparison", label: "增減百分比" },
    ];
  }

  return [
    { key: "amountComparison", label: "本期金額" },
    { key: "deltaAmountComparison", label: "增減金額" },
    { key: "deltaPercentComparison", label: "增減百分比" },
  ];
}

function getStatusBucket(status) {
  if (!status) return "unmatched";
  if (typeof status === "object") {
    const statusCode = status.statusCode || status.status_code;
    if (statusCode === "matched") return "matched";
    if (statusCode === "mismatch") return "mismatch";
    if (statusCode === "missing_base" || statusCode === "missing") return "missing";
    if (statusCode === "unresolved" || statusCode === "open") return "unresolved";
    if (statusCode === "unmatched") return "unmatched";
    status = status.status;
  }
  if (status === "?鞎陬" || status === "?貊泵") return "matched";
  if (status === "??謆??" || status === "銝蝚?") return "mismatch";
  if (typeof status === "string" && (status.startsWith("?蝞???亥縐") || status.startsWith("?箸??⊥迨"))) {
    return "missing";
  }
  if (status === "?綽???" || status === "敺?撠?") return "unresolved";
  return "unmatched";
}

function getStatusLabel(statusBucket) {
  return STATUS_LABELS[statusBucket] || statusBucket || "-";
}

function getSeverityLabel(severity) {
  return SEVERITY_LABELS[severity] || severity || "-";
}

function getMetricStatusLabel(metric) {
  if (!metric?.status && !metric?.statusCode && !metric?.status_code) return "-";
  return getStatusLabel(getStatusBucket(metric));
}

function normalizeMetric(metric) {
  return metric && typeof metric === "object" ? metric : {};
}

function shouldSurfaceMetric(metric) {
  if (!metric || !metric?.status) return false;
  const statusBucket = getStatusBucket(metric);
  if (statusBucket === "unresolved" && metric?.extracted_index == null) {
    return false;
  }
  return true;
}

function getReasonText(metric) {
  if (!metric) return "未擷取到可核對數字";

  const reasonMap = {
    no_extraction: "未在文字中擷取到數字",
    percent_symbol_or_percent_keyword: "由百分比符號或百分比關鍵字判定",
    decrease_keyword: "由減少關鍵字判定",
    amount_keyword: "由金額關鍵字判定",
    deltaAmount_keyword: "由增減金額關鍵字判定",
    deltaPercent_keyword: "由增減百分比關鍵字判定",
    quantity_keyword: "由數量關鍵字判定",
    deltaQuantity_keyword: "由增減數量關鍵字判定",
    deltaQuantityPercent_keyword: "由數量百分比關鍵字判定",
    cashflow_inflow: "由現金流入語意判定",
    cashflow_outflow: "由現金流出語意判定",
    term_context: "由科目上下文判定",
  };

  const sourceMap = {
    specific_string: "特殊字串命中",
    term_name: "科目名稱命中",
    unmatched: "未命中科目",
  };

  const parts = [];
  if (metric.term_match_source) parts.push(sourceMap[metric.term_match_source] || metric.term_match_source);
  if (metric.match_reason) parts.push(reasonMap[metric.match_reason] || metric.match_reason);
  return parts.join(" / ");
}

function sortResults(results) {
  const severityOrder = { high: 0, medium: 1, low: 2, info: 3 };
  const statusOrder = { mismatch: 0, missing: 1, pending: 2, open: 3, matched: 4, unmatched: 5 };
  const sourceTypeOrder = { xml: 0, derived_ratio: 1 };

  return [...results].sort((left, right) => {
    const severityDelta = (severityOrder[left.severity] ?? 9) - (severityOrder[right.severity] ?? 9);
    if (severityDelta !== 0) return severityDelta;

    const statusDelta = (statusOrder[left.statusBucket] ?? 9) - (statusOrder[right.statusBucket] ?? 9);
    if (statusDelta !== 0) return statusDelta;

    const sourceTypeDelta =
      (sourceTypeOrder[left.sourceType] ?? 9) - (sourceTypeOrder[right.sourceType] ?? 9);
    if (sourceTypeDelta !== 0) return sourceTypeDelta;

    const sourceOrderDelta = (left.sourceOrder ?? Number.MAX_SAFE_INTEGER) - (right.sourceOrder ?? Number.MAX_SAFE_INTEGER);
    if (sourceOrderDelta !== 0) return sourceOrderDelta;

    return left.term.localeCompare(right.term, "zh-Hant");
  });
}

function hasExtractedMetric(result) {
  if (!result?.metricSummaries?.length) return false;
  return result.metricSummaries.some((metric) => metric?.extracted_index != null);
}

function requiresPendingReview(result) {
  if (!result) return false;
  return Boolean(result.requiresAttention);
}

function compareSubjectCode(leftCode = "", rightCode = "") {
  const left = String(leftCode || "").trim();
  const right = String(rightCode || "").trim();

  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;

  const leftParts = left.split(/[^0-9A-Za-z]+/).filter(Boolean);
  const rightParts = right.split(/[^0-9A-Za-z]+/).filter(Boolean);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] ?? "";
    const rightPart = rightParts[index] ?? "";
    const leftIsNumber = /^\d+$/.test(leftPart);
    const rightIsNumber = /^\d+$/.test(rightPart);

    if (leftIsNumber && rightIsNumber) {
      const diff = Number(leftPart) - Number(rightPart);
      if (diff !== 0) return diff;
      if (leftPart.length !== rightPart.length) return leftPart.length - rightPart.length;
      continue;
    }

    const diff = leftPart.localeCompare(rightPart, "zh-Hant");
    if (diff !== 0) return diff;
  }

  return left.localeCompare(right, "zh-Hant");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitExplanationSegments(text) {
  return String(text || "")
    .split(/[\n。；;！？!?]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function detectEmbeddedExplanation(inputText, result) {
  const segments = splitExplanationSegments(inputText);
  if (!segments.length) {
    return {
      hasEmbeddedExplanation: false,
      explanationSignals: [],
      explanationExcerpt: "",
    };
  }

  const primaryTerm = String(result.term || "").trim();
  if (!primaryTerm) {
    return {
      hasEmbeddedExplanation: false,
      explanationSignals: [],
      explanationExcerpt: "",
    };
  }

  for (const segment of segments) {
    if (!segment.includes(primaryTerm)) continue;

    const explanationSignals = EXPLANATION_KEYWORDS.filter((keyword) => segment.includes(keyword));
    if (!explanationSignals.length) continue;

    const stripped = segment.replace(new RegExp(escapeRegExp(primaryTerm), "g"), "");
    if (!/[\u4e00-\u9fffA-Za-z]{2,}/.test(stripped)) continue;

    return {
      hasEmbeddedExplanation: true,
      explanationSignals,
      explanationExcerpt: segment,
    };
  }

  return {
    hasEmbeddedExplanation: false,
    explanationSignals: [],
    explanationExcerpt: "",
  };
}

function buildInputSignature(inputText = "") {
  const normalized = String(inputText || "").trim().replace(/\s+/g, " ");
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return `${normalized.length}:${hash}`;
}

export function hasOperatingRatioDerivedRows(entry) {
  return Boolean(
    entry?.fullParsedData?.some((row) => {
      const code = String(row?.code || "");
      return (
        row?.sourceType === "derived_ratio" &&
        OPERATING_RATIO_CODE_PREFIXES.some((prefix) => code.startsWith(prefix))
      );
    })
  );
}

export function resolveManualSegmentType(entry) {
  if (hasOperatingRatioDerivedRows(entry)) return "operatingRatios";
  if (MANUAL_SEGMENT_TYPES.includes(entry?.xmlType)) return entry.xmlType;
  if (entry?.reportType === "productionSalesVolume") return "production";
  return null;
}

function getManualSegmentText(segmentType, manualSegments = {}) {
  if (!segmentType) return "";
  return String(manualSegments?.[segmentType] || "").trim();
}

function findTextInRange(text, token, fromIndex, rangeStart, rangeEndExclusive) {
  if (!token) return -1;
  const maxStart = rangeEndExclusive - token.length;
  if (maxStart < rangeStart) return -1;

  let index = text.indexOf(token, fromIndex);
  while (index >= 0) {
    if (index >= rangeStart && index <= maxStart) return index;
    index = text.indexOf(token, index + 1);
  }
  return -1;
}

function relocateHighlightsToFullText(rawItems = [], segmentText = "", fullText = "", options = {}) {
  const { lockToSegmentRange = false } = options;
  if (!Array.isArray(rawItems) || !rawItems.length) {
    return { relocatedItems: [], keyMap: {} };
  }

  if (segmentText === fullText) {
    const identityMap = Object.fromEntries(
      rawItems.map((item) => [`${item.index}-${item.length}`, `${item.index}-${item.length}`])
    );
    return { relocatedItems: rawItems, keyMap: identityMap };
  }

  const sorted = [...rawItems]
    .filter((item) => Number.isInteger(item.index) && Number.isInteger(item.length) && item.length > 0)
    .sort((left, right) => left.index - right.index);

  const keyMap = {};
  const relocatedItems = [];
  let rangeStart = 0;
  let rangeEnd = fullText.length;
  if (lockToSegmentRange && segmentText && segmentText !== fullText) {
    const start = fullText.indexOf(segmentText);
    if (start < 0) {
      return { relocatedItems: [], keyMap: {} };
    }
    rangeStart = start;
    rangeEnd = start + segmentText.length;
  }

  let cursor = rangeStart;

  sorted.forEach((item) => {
    const oldKey = `${item.index}-${item.length}`;
    const token = segmentText.slice(item.index, item.index + item.length);
    if (!token) return;

    let foundIndex = findTextInRange(fullText, token, cursor, rangeStart, rangeEnd);
    if (foundIndex < 0) foundIndex = findTextInRange(fullText, token, rangeStart, rangeStart, rangeEnd);
    if (foundIndex < 0) return;

    const newKey = `${foundIndex}-${token.length}`;
    keyMap[oldKey] = newKey;
    relocatedItems.push({
      ...item,
      index: foundIndex,
      length: token.length,
    });
    cursor = foundIndex + token.length;
  });

  return { relocatedItems, keyMap };
}

function getPendingReasons(result) {
  const reasons = [];
  if (result.statusBucket === "mismatch") reasons.push("含不一致狀態");
  if (result.isExplanationRequired && !result.hasEmbeddedExplanation) {
    reasons.push("需補充說明但未偵測到明確補充說明");
  }
  return reasons;
}

function buildAuditMap(fullParsedData, knowledgeBase, reportType) {
  const nextMap = new Map();

  fullParsedData.forEach((row) => {
    if (!row.term) return;

    const warnings = knowledgeBase
      .filter((rule) => rule?.keyword && row.term.includes(rule.keyword))
      .map((rule) => rule.warning);
    const diffPercent = reportType === "productionSalesVolume" ? row.deltaQuantityPercent : row.deltaPercent;
    const isExplanationRequired = diffPercent !== null && Math.abs(diffPercent) >= 20;

    nextMap.set(row.term, {
      warnings,
      diffPercent,
      isExplanationRequired,
    });
  });

  return nextMap;
}

function normalizeResults({
  rawResults,
  backendSummaryStats,
  reportType,
  fullParsedData,
  knowledgeBase,
  inputText,
  fileId,
  runId,
  reviewDecisions,
  inputSignature,
}) {
  const auditMap = buildAuditMap(fullParsedData, knowledgeBase, reportType);
  const metricConfigs = getMetricConfigs(reportType);

  const nextResults = (rawResults || []).map((result) => {
    const metricSummaries = metricConfigs
      .map((config) => ({
        metricKey: config.key,
        label: config.label,
        ...normalizeMetric(result[config.key]),
      }))
      .filter((metric) => shouldSurfaceMetric(metric));
    const directionSummaries = (Array.isArray(result.directionComparisons) ? result.directionComparisons : [])
      .map((item, index) => ({
        metricKey: `direction-${index}`,
        label: `方向：較${item.label}`,
        status: item.status,
        statusCode: item.statusCode,
        extracted_display: item.extracted_display,
        base_display: item.base_display,
        match_reason: item.message || "方向文字檢核",
        term_match_source: "term_context",
      }))
      .filter((metric) => shouldSurfaceMetric(metric));
    const supportAmountSummaries = (Array.isArray(result.supportAmountComparisons)
      ? result.supportAmountComparisons
      : []
    )
      .map((item, index) => ({
        metricKey: `support-amount-${index}`,
        label: `金額：${item.label}`,
        status: item.status,
        statusCode: item.statusCode,
        extracted_display: item.extracted_display,
        base_display: item.base_display,
        extracted_index: item.extracted_index,
        extracted_length: item.extracted_length,
        match_reason: item.message || "金額文字檢核",
        term_match_source: "term_context",
      }))
      .filter((metric) => shouldSurfaceMetric(metric));
    const allMetricSummaries = [...metricSummaries, ...supportAmountSummaries, ...directionSummaries];

    const metricBuckets = allMetricSummaries.map((metric) => getStatusBucket(metric));
    let statusBucket = "matched";
    if (metricBuckets.includes("mismatch")) statusBucket = "mismatch";
    else if (metricBuckets.includes("missing") || metricBuckets.includes("unmatched")) statusBucket = "missing";
    else if (metricBuckets.includes("unresolved")) statusBucket = "open";

    const firstLinkedMetric =
      allMetricSummaries.find((metric) => metric?.extracted_index != null) ?? allMetricSummaries[0] ?? null;
    const highlightKey =
      firstLinkedMetric?.extracted_index != null
        ? `${firstLinkedMetric.extracted_index}-${firstLinkedMetric.extracted_length}`
        : null;
    const resultKey = `${runId}::${fileId}::${result.level || "default"}::${result.term}`;
    const reviewKey = `${inputSignature}::${fileId}::${result.term}::${firstLinkedMetric?.metricKey || "row"}::${
      firstLinkedMetric?.extracted_index ?? "none"
    }`;

    const audit = auditMap.get(result.term) || {
      warnings: [],
      diffPercent: null,
      isExplanationRequired: false,
    };

    const reasons = allMetricSummaries
      .map((metric) => getReasonText(metric))
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index);
    const baseSeverity =
      audit.warnings.length || audit.isExplanationRequired
        ? "high"
        : result.severity || (statusBucket === "matched" ? "low" : "medium");
    const currentReview = reviewDecisions[reviewKey] || null;
    const explanationDetection = detectEmbeddedExplanation(inputText, {
      term: result.term,
      candidate_terms: result.candidate_terms,
      snippets: result.snippets,
    });
    const explanationReasons = [];
    if (audit.diffPercent !== null && Math.abs(audit.diffPercent) >= 20) {
      explanationReasons.push(`差異百分比 ${audit.diffPercent.toFixed(2)}% 達門檻`);
    }
    if (audit.warnings.length > 0) {
      explanationReasons.push("命中文字風險規則");
    }
    if (explanationDetection.hasEmbeddedExplanation) {
      explanationReasons.push("輸入文字已包含說明語句");
    }

    const directionWarnings = directionSummaries
      .filter((item) => getStatusBucket(item) === "mismatch")
      .map((item) => item.match_reason)
      .filter(Boolean);
    const pendingReasons = getPendingReasons({
      statusBucket,
      isExplanationRequired: audit.isExplanationRequired || audit.warnings.length > 0,
      hasEmbeddedExplanation: explanationDetection.hasEmbeddedExplanation,
    });
    const requiresAttention = pendingReasons.length > 0;

    return {
      ...result,
      runId,
      fileId,
      reportType,
      resultKey,
      reviewKey,
      highlightKey,
      sourceOrder:
        typeof result.sourceOrder === "number" && Number.isFinite(result.sourceOrder)
          ? result.sourceOrder
          : Number.MAX_SAFE_INTEGER,
      metricSummaries: allMetricSummaries,
      hasExtractedMatch: allMetricSummaries.some((metric) => metric?.extracted_index != null),
      statusBucket,
      statusLabel: getStatusLabel(statusBucket),
      severity: baseSeverity,
      severityLabel: getSeverityLabel(baseSeverity),
      warnings: [...audit.warnings, ...directionWarnings],
      diffPercent: audit.diffPercent,
      isExplanationRequired: audit.isExplanationRequired || audit.warnings.length > 0,
      hasEmbeddedExplanation: explanationDetection.hasEmbeddedExplanation,
      explanationSignals: explanationDetection.explanationSignals,
      explanationExcerpt: explanationDetection.explanationExcerpt,
      explanationBasisText: explanationReasons.join(" / "),
      reasonText: reasons.join(" | "),
      requiresAttention,
      pendingReasons,
      currentReview,
    };
  });

  const sortedResults = sortResults(nextResults);
  const explainedCount = sortedResults.filter((result) => !!reviewDecisions[result.reviewKey]).length;
  const calculatedStats = {
    total: backendSummaryStats?.total ?? sortedResults.length,
    matched: backendSummaryStats?.matched ?? sortedResults.filter((result) => result.statusBucket === "matched").length,
    mismatch:
      backendSummaryStats?.mismatch ?? sortedResults.filter((result) => result.statusBucket === "mismatch").length,
    missing: backendSummaryStats?.missing ?? sortedResults.filter((result) => result.statusBucket === "missing").length,
    reviewRequired: sortedResults.filter((result) => result.requiresAttention).length,
    pendingOpen: sortedResults.filter((result) => result.requiresAttention && !result.currentReview).length,
    explained: explainedCount,
  };

  return {
    normalizedResults: sortedResults,
    summaryStats: calculatedStats,
  };
}

function parseEntry(entry) {
  if (!entry?.rawContent) {
    return {
      fileId: entry?.id,
      fileName: entry?.fileName || "",
      reportName: "",
      reportType: "financial",
      xmlType: entry?.detectedType || "unknown",
      fullParsedData: [],
      availableLevels: [],
      baseDataCount: 0,
      error: "檔案內容為空",
    };
  }

  const {
    fullData,
    availableLevels: parsedLevels,
    reportName: parsedReportName,
    reportType: parsedReportType,
    error,
  } = parseComparisonXml(entry.rawContent);

  const resolvedReportType = parsedReportType || "financial";
  const baseDataCount = calculateBaseDataCount(fullData || [], resolvedReportType);

  return {
    fileId: entry.id,
    fileName: entry.fileName,
    year: entry.year || extractXmlYear(entry.rawContent),
    reportName: parsedReportName,
    reportType: resolvedReportType,
    xmlType: entry.detectedType || "unknown",
    fullParsedData: fullData || [],
    availableLevels: parsedLevels || [],
    baseDataCount,
    error: error || null,
  };
}

function calculateBaseDataCount(fullData = [], reportType = "financial") {
  return new Set(
    (fullData || [])
      .filter((row) => {
        if (reportType === "productionSalesVolume") {
          return row.quantity !== null || row.deltaQuantity !== null || row.deltaQuantityPercent !== null;
        }
        return row.amount !== null || row.deltaAmount !== null || row.deltaPercent !== null;
      })
      .map((row) => row.term)
      .filter(Boolean)
  ).size;
}

function appendDerivedRowsToEntry(entry, derivedRows = []) {
  if (!entry || entry.error || entry.reportType !== "financial" || !derivedRows.length) return entry;

  const existingTerms = new Set(entry.fullParsedData.map((row) => row.term));
  const baseSourceOrder =
    Math.max(
      -1,
      ...entry.fullParsedData.map((row) =>
        typeof row.sourceOrder === "number" && Number.isFinite(row.sourceOrder) ? row.sourceOrder : -1
      )
    ) + 1;
  const level = entry.fullParsedData.find((row) => row.level)?.level || entry.availableLevels[0] || "財務比率";

  const nextRows = derivedRows
    .filter((row) => !existingTerms.has(row.term))
    .map((row, index) => ({
      ...row,
      level: row.level || level,
      sourceOrder: baseSourceOrder + index,
    }));

  if (!nextRows.length) return entry;

  const fullParsedData = [...entry.fullParsedData, ...nextRows];
  return {
    ...entry,
    fullParsedData,
    baseDataCount: calculateBaseDataCount(fullParsedData, entry.reportType),
  };
}

function appendBalanceStructureRowsToEntry(entry, rawContent) {
  if (!entry || entry.error || entry.reportType !== "financial" || entry.xmlType !== "balance") {
    return entry;
  }

  const structureRows = buildNormalizedBalanceStructureComparisonRows(
    entry.fullParsedData,
    entry.fullParsedData.find((row) => row.level)?.level || entry.availableLevels[0] || "財務比率"
  );
  return appendDerivedRowsToEntry(entry, structureRows);
}

export function createOperatingRatioEntries(parsedEntries = [], derivedRowsByYear = {}) {
  return Object.entries(derivedRowsByYear)
    .map(([year, rows]) => {
      const ratioRows = (rows || []).filter((row) =>
        OPERATING_RATIO_CODE_PREFIXES.some((prefix) => String(row?.code || "").startsWith(prefix))
      );
      if (!ratioRows.length) return null;

      const sourceEntry = parsedEntries.find((entry) => !entry.error && String(entry.year || "") === String(year));
      const availableLevels = [...new Set(ratioRows.map((row) => row.level).filter(Boolean))];
      const normalizedRows = ratioRows.map((row, index) => ({
        ...row,
        sourceOrder: typeof row.sourceOrder === "number" ? row.sourceOrder : index,
      }));

      return {
        fileId: `operating-ratios-${year}`,
        fileName: `經營/成長比率-${year}`,
        year,
        reportName: "經營/成長比率",
        reportType: "financial",
        xmlType: "operatingRatios",
        fullParsedData: normalizedRows,
        availableLevels: availableLevels.length ? availableLevels : [sourceEntry?.availableLevels?.[0] || "財務比率"],
        baseDataCount: calculateBaseDataCount(normalizedRows, "financial"),
        error: null,
      };
    })
    .filter(Boolean);
}

export function useComparisonTool() {
  const [inputText, setInputText] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [parsedEntries, setParsedEntries] = useState([]);
  const [batchRuns, setBatchRuns] = useState([]);
  const [activeRunId, setActiveRunId] = useState(null);
  const [activeFileId, setActiveFileId] = useState(null);
  const [xmlLoadingError, setXmlLoadingError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("open");
  const groupedExtractedDataRef = useRef({});
  const [compareError, setCompareError] = useState("");
  const [reviewDecisions, setReviewDecisions] = useState({});
  const [activeResultKey, setActiveResultKey] = useState(null);
  const [segmentMode, setSegmentMode] = useState("fulltext");
  const [manualRatioInputsByYear, setManualRatioInputsByYear] = useState({});
  const [manualSegments, setManualSegments] = useState(
    MANUAL_SEGMENT_TYPES.reduce((acc, key) => ({ ...acc, [key]: "" }), {})
  );

  const { files, activeWorkspace, setTextInputSource } = useFileManager();

  const knowledgeBase = useMemo(
    () =>
      files
        .filter((file) => file.detectedType === "knowledgeBase" && Array.isArray(file.parsedData))
        .flatMap((file) => file.parsedData),
    [files]
  );

  const knowledgeBaseRuleCount = knowledgeBase.length;
  const loadedComparisonFileCount = useMemo(
    () =>
      files.filter((file) =>
        ["income", "balance", "cashflow", "profitDistribution", "production"].includes(file.detectedType)
      ).length,
    [files]
  );

  const validParsedEntries = useMemo(
    () => parsedEntries.filter((entry) => !entry.error && entry.fullParsedData.length > 0),
    [parsedEntries]
  );

  const activeRun = useMemo(() => {
    if (!batchRuns.length) return null;
    return batchRuns.find((run) => run.runId === activeRunId) || batchRuns[0];
  }, [activeRunId, batchRuns]);

  const activeParsedEntry = useMemo(() => {
    if (activeRun?.fileId) {
      return parsedEntries.find((entry) => entry.fileId === activeRun.fileId) || null;
    }
    if (activeFileId) {
      return parsedEntries.find((entry) => entry.fileId === activeFileId) || null;
    }
    return parsedEntries[0] || null;
  }, [activeFileId, activeRun, parsedEntries]);

  const comparisonResults = activeRun?.comparisonResults || [];
  const rawExtractedForHighlightSource = activeRun?.rawExtractedForHighlight || [];
  const confirmedMatchesSource = activeRun?.confirmedMatches || {};
  const extractedCount = activeRun?.extractedCount || 0;
  const displayInputText = segmentMode === "manual" && activeRun?.segmentText ? activeRun.segmentText : inputText;
  const { relocatedItems: rawExtractedForHighlight, keyMap: highlightKeyMap } = useMemo(
    () =>
      relocateHighlightsToFullText(rawExtractedForHighlightSource, activeRun?.segmentText || inputText, displayInputText, {
        lockToSegmentRange: false,
      }),
    [activeRun?.segmentText, displayInputText, inputText, rawExtractedForHighlightSource]
  );
  const locatorHighlightEnabled = rawExtractedForHighlight.length > 0;
  const confirmedMatches = useMemo(() => {
    const next = {};
    Object.entries(confirmedMatchesSource).forEach(([oldKey, value]) => {
      const newKey = highlightKeyMap[oldKey];
      if (newKey) next[newKey] = value;
    });
    return next;
  }, [confirmedMatchesSource, highlightKeyMap]);

  const xmlFileName = activeParsedEntry?.fileName || "";
  const reportName = activeParsedEntry?.reportName || null;
  const reportType = activeParsedEntry?.reportType || "financial";
  const baseDataCount = activeParsedEntry?.baseDataCount || 0;
  const isXmlLoaded = validParsedEntries.length > 0;
  const availableLevels = activeParsedEntry?.availableLevels || [];
  const selectedLevel = availableLevels[0] || "";
  const activeManualRatioYear = activeParsedEntry?.year || validParsedEntries[0]?.year || "";
  const activeManualRatioInputs = manualRatioInputsByYear[activeManualRatioYear] || {
    roeBudget: "",
    roePrevious: "",
  };

  const textFocusedResults = useMemo(
    () => comparisonResults.filter((result) => hasExtractedMetric(result)),
    [comparisonResults]
  );

  const summaryStats = useMemo(() => {
    const stats = {
      total: textFocusedResults.length,
      matched: 0,
      mismatch: 0,
      missing: 0,
      reviewRequired: 0,
      pendingOpen: 0,
      explained: 0,
    };

    textFocusedResults.forEach((result) => {
      if (result.statusBucket === "matched") stats.matched += 1;
      if (result.statusBucket === "mismatch") stats.mismatch += 1;
      if (result.statusBucket === "missing") stats.missing += 1;
      if (result.requiresAttention) stats.reviewRequired += 1;
      if (result.requiresAttention && !result.currentReview) stats.pendingOpen += 1;
      if (result.currentReview) stats.explained += 1;
    });

    return stats;
  }, [textFocusedResults]);

  const filteredComparisonResults = useMemo(() => {
    if (filterStatus === "all") return textFocusedResults;
    if (filterStatus === "open") return textFocusedResults.filter((result) => !result.currentReview);
    if (filterStatus === "attention_summary") {
      return textFocusedResults.filter(
        (result) => result.statusBucket !== "matched" || result.isExplanationRequired
      );
    }
    if (filterStatus === "pending") {
      return textFocusedResults.filter((result) => requiresPendingReview(result) && !result.currentReview);
    }
    if (filterStatus === "reviewed") return textFocusedResults.filter((result) => !!result.currentReview);
    if (filterStatus === "reviewed_non_correct") {
      return textFocusedResults.filter(
        (result) => !!result.currentReview && result.currentReview.decisionType !== "已確認正確"
      );
    }
    if (filterStatus === "reviewed_text_modify") {
      return textFocusedResults.filter((result) => result.currentReview?.decisionType === "文字需修改");
    }
    if (filterStatus === "reviewed_xml_review") {
      return textFocusedResults.filter((result) => result.currentReview?.decisionType === "XML需複核");
    }
    if (filterStatus === "reviewed_need_explanation") {
      return textFocusedResults.filter((result) => result.currentReview?.decisionType === "需補充說明");
    }
    return textFocusedResults.filter((result) => result.statusBucket === filterStatus);
  }, [filterStatus, textFocusedResults]);

  const highlightLookup = useMemo(() => {
    const nextMap = {};
    const termToResult = Object.fromEntries(comparisonResults.map((result) => [result.term, result]));

    comparisonResults.forEach((result) => {
      if (result.highlightKey) {
        const nextKey = highlightKeyMap[result.highlightKey] || result.highlightKey;
        nextMap[nextKey] = {
          resultKey: result.resultKey,
          statusBucket: result.statusBucket,
        };
      }

      result.metricSummaries.forEach((metric) => {
        if (metric?.extracted_index != null) {
          const oldKey = `${metric.extracted_index}-${metric.extracted_length}`;
          const nextKey = highlightKeyMap[oldKey] || oldKey;
          nextMap[nextKey] = {
            resultKey: result.resultKey,
            statusBucket: result.statusBucket,
          };
        }
      });
    });

    rawExtractedForHighlight.forEach((item) => {
      const key = `${item.index}-${item.length}`;
      if (nextMap[key]) return;
      if (!item.associatedTerm) return;

      const linkedResult = termToResult[item.associatedTerm];
      if (!linkedResult) return;

      nextMap[key] = {
        resultKey: linkedResult.resultKey,
        statusBucket: linkedResult.statusBucket,
      };
    });

    return nextMap;
  }, [comparisonResults, highlightKeyMap, rawExtractedForHighlight]);

  const exceptionSummaryText = useMemo(
    () =>
      comparisonResults
        .filter((result) => hasExtractedMetric(result))
        .filter((result) => result.statusBucket !== "matched" || result.isExplanationRequired)
        .sort((left, right) => {
          const orderDelta =
            (left.sourceOrder ?? Number.MAX_SAFE_INTEGER) - (right.sourceOrder ?? Number.MAX_SAFE_INTEGER);
          if (orderDelta !== 0) return orderDelta;
          const codeDelta = compareSubjectCode(left.code, right.code);
          if (codeDelta !== 0) return codeDelta;
          return left.term.localeCompare(right.term, "zh-Hant");
        })
        .map((result) => {
          const reviewLabel = result.currentReview?.decisionType ? ` / 處理：${result.currentReview.decisionType}` : "";
          const warnings = result.warnings.length ? ` / 風險：${result.warnings.join("；")}` : "";
          const codeLabel = result.code ? `${result.code} ` : "";
          return `${codeLabel}${result.term} - ${result.statusLabel}${warnings}${reviewLabel}`;
        })
        .join("\n"),
    [comparisonResults]
  );

  const batchOverview = useMemo(
    () =>
      batchRuns.map((run) => ({
        runId: run.runId,
        fileId: run.fileId,
        fileName: run.fileName,
        reportType: run.reportType,
        extractedCount: run.extractedCount,
        mismatch: run.summaryStats?.mismatch || 0,
        missing: run.summaryStats?.missing || 0,
        pending:
          run.comparisonResults?.filter(
            (result) => hasExtractedMetric(result) && result.requiresAttention && !result.currentReview
          ).length || 0,
        hasError: Boolean(run.error),
      })),
    [batchRuns]
  );

  const resetCompareState = useCallback(() => {
    setBatchRuns([]);
    setActiveRunId(null);
    setActiveResultKey(null);
    setCompareError("");
  }, []);

  const handleFileEntry = useCallback(
    (entryInput) => {
      const entries = Array.isArray(entryInput) ? entryInput.filter(Boolean) : entryInput ? [entryInput] : [];
      setSelectedFiles(entries);
      setActiveFileId(entries[0]?.id ?? null);

      const derivedRowsByYear = buildDerivedComparisonRows(entries, manualRatioInputsByYear);
      const baseParsed = entries
        .map(parseEntry)
        .map((entry, index) => appendBalanceStructureRowsToEntry(entry, entries[index]?.rawContent));
      const parsed = [...baseParsed, ...createOperatingRatioEntries(baseParsed, derivedRowsByYear)];
      setParsedEntries(parsed);

      const errors = parsed.filter((item) => item.error).map((item) => `${item.fileName}: ${item.error}`);
      setXmlLoadingError(errors.length ? errors.join("；") : null);
      resetCompareState();
    },
    [manualRatioInputsByYear, resetCompareState]
  );

  const handleFileChange = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      handleFileEntry({
        id: Date.now(),
        fileName: file.name,
        rawContent: await file.text(),
      });
      if (event.target) event.target.value = null;
    },
    [handleFileEntry]
  );

  const handleInputChange = useCallback(
    (event) => {
      setInputText(event.target.value);
      setTextInputSource("manual");
      resetCompareState();
    },
    [resetCompareState, setTextInputSource]
  );

  const setManualSegment = useCallback(
    (reportType, value) => {
      setManualSegments((prev) => ({
        ...prev,
        [reportType]: value,
      }));
      resetCompareState();
    },
    [resetCompareState]
  );

  const setManualRatioInput = useCallback(
    (year, key, value) => {
      if (!year || !key) return;
      setManualRatioInputsByYear((prev) => ({
        ...prev,
        [year]: {
          ...(prev[year] || {}),
          [key]: value,
        },
      }));
      resetCompareState();
    },
    [resetCompareState]
  );

  useEffect(() => {
    if (!selectedFiles.length) return;

    const derivedRowsByYear = buildDerivedComparisonRows(selectedFiles, manualRatioInputsByYear);
    const baseParsed = selectedFiles
      .map(parseEntry)
      .map((entry, index) => appendBalanceStructureRowsToEntry(entry, selectedFiles[index]?.rawContent));
    const parsed = [...baseParsed, ...createOperatingRatioEntries(baseParsed, derivedRowsByYear)];

    setParsedEntries(parsed);
    const errors = parsed.filter((item) => item.error).map((item) => `${item.fileName}: ${item.error}`);
    setXmlLoadingError(errors.length ? errors.join("；") : null);
  }, [manualRatioInputsByYear, selectedFiles]);

  const setActiveBatchFileId = useCallback((fileId) => {
    setActiveFileId(fileId);
    setActiveRunId((prevRunId) => {
      if (!fileId) return prevRunId;
      return prevRunId;
    });
  }, []);

  const handleCompare = useCallback(async () => {
    if (!isXmlLoaded || !inputText.trim() || !validParsedEntries.length) return;

    setLoading(true);
    setCompareError("");
    const inputSignature = buildInputSignature(inputText);

    const runPrefix = `run-${Date.now()}`;

    try {
      const settledResults = await Promise.allSettled(
        validParsedEntries.map(async (entry, index) => {
          const runId = `${runPrefix}-${index + 1}`;
          let segmentText = inputText;
          if (segmentMode === "manual") {
            const segmentType = resolveManualSegmentType(entry);
            segmentText = getManualSegmentText(segmentType, manualSegments);
            if (!segmentText) {
              const segmentLabel = MANUAL_SEGMENT_LABELS[segmentType] || "對應分段";
              throw new Error(`${entry.fileName}: 未填寫 ${segmentLabel}，無法進行手動分段核對`);
            }
          }

          const response = await fetch("http://127.0.0.1:8000/api/compare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              inputText: segmentText,
              fullParsedData: entry.fullParsedData,
              availableLevels: entry.availableLevels,
              reportName: entry.reportName,
              reportType: entry.reportType,
              xmlType: entry.xmlType,
            }),
          });

          if (!response.ok) {
            throw new Error(`${entry.fileName}: HTTP ${response.status}`);
          }

          const data = await response.json();
          const { normalizedResults, summaryStats: normalizedSummaryStats } = normalizeResults({
            rawResults: data.comparisonResults || [],
            backendSummaryStats: data.summaryStats || null,
            reportType: entry.reportType,
            fullParsedData: entry.fullParsedData,
            knowledgeBase,
            inputText: segmentText,
            fileId: entry.fileId,
            runId,
            reviewDecisions,
            inputSignature,
          });

          return {
            runId,
            fileId: entry.fileId,
            fileName: entry.fileName,
            reportName: entry.reportName,
            reportType: entry.reportType,
            xmlType: entry.xmlType,
            segmentText,
            summaryStats: normalizedSummaryStats,
            comparisonResults: normalizedResults,
            rawExtractedForHighlight: data.rawExtractedForHighlight || [],
            extractedCount: data.extractedCount || 0,
            confirmedMatches: data.confirmedMatches || {},
            error: null,
          };
        })
      );

      const runResults = settledResults.map((item, index) => {
        if (item.status === "fulfilled") return item.value;
        const entry = validParsedEntries[index];
        return {
          runId: `${runPrefix}-${index + 1}`,
          fileId: entry.fileId,
          fileName: entry.fileName,
          reportName: entry.reportName,
          reportType: entry.reportType,
          xmlType: entry.xmlType,
          segmentText: "",
          summaryStats: {
            total: 0,
            matched: 0,
            mismatch: 0,
            missing: 0,
            reviewRequired: 0,
            pendingOpen: 0,
            explained: 0,
          },
          comparisonResults: [],
          rawExtractedForHighlight: [],
          extractedCount: 0,
          confirmedMatches: {},
          error: item.reason?.message || "比對失敗",
        };
      });

      setBatchRuns(runResults);
      const firstSuccessRun =
        runResults.find(
          (item) =>
            !item.error &&
            item.xmlType === "operatingRatios" &&
            item.comparisonResults?.some((result) => hasExtractedMetric(result))
        ) ||
        runResults.find((item) => !item.error) ||
        runResults[0];
      setActiveRunId(firstSuccessRun?.runId || null);
      setActiveFileId(firstSuccessRun?.fileId || selectedFiles[0]?.id || null);
      const firstResult = firstSuccessRun?.comparisonResults?.find((result) => hasExtractedMetric(result));
      setActiveResultKey(firstResult?.resultKey || firstSuccessRun?.comparisonResults?.[0]?.resultKey || null);

      const failedRuns = runResults.filter((item) => item.error);
      if (failedRuns.length) {
        const errorMessage = failedRuns.map((item) => `${item.fileName}: ${item.error}`).join("；");
        setCompareError(`部分檔案比對失敗：${errorMessage}`);
      }
    } catch (error) {
      setCompareError(`無法完成比對：${error.message || "未知錯誤"}`);
    } finally {
      setLoading(false);
    }
  }, [
    inputText,
    isXmlLoaded,
    knowledgeBase,
    manualSegments,
    reviewDecisions,
    segmentMode,
    selectedFiles,
    validParsedEntries,
  ]);

  const setReviewDecision = useCallback((result, decisionType, note = "") => {
    const nextDecision = {
      reviewer: REVIEWER_NAME,
      decidedAt: new Date().toISOString(),
      decisionType,
      note,
    };

    const shouldClearDecision = result.currentReview?.decisionType === decisionType;

    setReviewDecisions((prev) => {
      if (shouldClearDecision) {
        const next = { ...prev };
        delete next[result.reviewKey];
        return next;
      }

      return {
        ...prev,
        [result.reviewKey]: nextDecision,
      };
    });

    setBatchRuns((prev) =>
      prev.map((run) => {
        if (run.runId !== result.runId) return run;
        return {
          ...run,
          comparisonResults: run.comparisonResults.map((item) =>
            item.reviewKey === result.reviewKey
              ? { ...item, currentReview: shouldClearDecision ? null : nextDecision }
              : item
          ),
        };
      })
    );
  }, []);

  const switchToRun = useCallback((runId) => {
    const targetRun = batchRuns.find((run) => run.runId === runId);
    if (!targetRun) return;
    setActiveRunId(targetRun.runId);
    setActiveFileId(targetRun.fileId);
    const firstResult = targetRun.comparisonResults.find((item) => hasExtractedMetric(item));
    setActiveResultKey(firstResult?.resultKey || targetRun.comparisonResults[0]?.resultKey || null);
  }, [batchRuns]);

  return {
    inputText,
    displayInputText,
    locatorHighlightEnabled,
    fullParsedData: activeParsedEntry?.fullParsedData || [],
    availableLevels,
    selectedLevel,
    setSelectedLevel: () => {},
    baseDataCount,
    xmlFileName,
    reportName,
    xmlLoadingError,
    isXmlLoaded,
    comparisonResults,
    filteredComparisonResults,
    loading,
    extractedCount,
    filterStatus,
    setFilterStatus,
    groupedExtractedDataRef,
    rawExtractedForHighlight,
    confirmedMatches,
    reportType,
    summaryStats,
    reviewDecisions,
    setReviewDecision,
    activeResultKey,
    setActiveResultKey,
    compareError,
    exceptionSummaryText,
    knowledgeBaseRuleCount,
    loadedComparisonFileCount,
    activeWorkspace,
    highlightLookup,
    textFocusedResults,
    getStatusLabel,
    getMetricStatusLabel,
    handleFileChange,
    handleFileEntry,
    handleInputChange,
    handleCompare,
    selectedFiles,
    batchRuns,
    batchOverview,
    activeRunId,
    activeFileId,
    setActiveBatchFileId,
    switchToRun,
    segmentMode,
    setSegmentMode,
    manualSegments,
    setManualSegment,
    activeManualRatioYear,
    activeManualRatioInputs,
    setManualRatioInput,
  };
}
