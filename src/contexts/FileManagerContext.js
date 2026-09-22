import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export const REPORT_TYPES = {
  income: { label: "損益表", color: "#3b82f6" },
  balance: { label: "資產負債表", color: "#10b981" },
  cashflow: { label: "現金流量表", color: "#8b5cf6" },
  profitDistribution: { label: "盈餘分配表", color: "#f59e0b" },
  production: { label: "營運量值表", color: "#ec4899" },
  knowledgeBase: { label: "知識規則", color: "#dc2626" },
  unknown: { label: "未知類型", color: "#94a3b8" },
};

const REPORT_NAME_SELECTORS = [
  "REPORT_NAME",
  "ReportName",
  "reportname",
  "報表名稱",
  "TableName",
];

const ACCOUNT_CODE_SELECTORS = [
  "科目編號",
  "會計科目代碼",
  "會計科目-代碼",
  "科目代碼",
  "ACCT_CODE",
];

const YEAR_SELECTORS = ["年度", "Year", "YEAR"];

const PRODUCTION_TAG_NAMES = [
  "營運項目-名稱及年度",
  "本年度決算數-數量",
  "本年度決算數與預算數比較增減-數量",
  "本年度決算數與預算數比較增減-數量百分比",
];

function includesAnyKeyword(value, keywords = []) {
  return keywords.some((keyword) => value.includes(keyword));
}

function getNodeText(xmlDoc, selectors = []) {
  for (const selector of selectors) {
    const node = xmlDoc.querySelector(selector);
    if (node?.textContent?.trim()) return node.textContent.trim();
  }
  return "";
}

function getTableName(xmlDoc) {
  const tableNode = xmlDoc.querySelector("Header > Table, Table");
  const attrName = tableNode?.getAttribute("Name")?.trim();
  if (attrName) return attrName;

  return getNodeText(xmlDoc, REPORT_NAME_SELECTORS);
}

function getAccountCodes(xmlDoc) {
  const selector = ACCOUNT_CODE_SELECTORS.join(", ");

  return Array.from(xmlDoc.querySelectorAll(selector))
    .map((node) => node.textContent.trim())
    .filter(Boolean);
}

function hasAnyTag(xmlDoc, tagNames = []) {
  return tagNames.some((tagName) => xmlDoc.getElementsByTagName(tagName).length > 0);
}

function arraysEqual(left = [], right = []) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function detectXmlReportType(xmlString) {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");
    if (xmlDoc.querySelector("parseerror, parsererror")) return "unknown";

    const reportName = getTableName(xmlDoc);
    const normalizedReportName = reportName.toLowerCase();

    if (
      includesAnyKeyword(reportName, ["損益", "收支餘絀"]) ||
      includesAnyKeyword(normalizedReportName, ["income"])
    ) {
      return "income";
    }

    if (
      includesAnyKeyword(reportName, ["資產負債"]) ||
      includesAnyKeyword(normalizedReportName, ["balance"])
    ) {
      return "balance";
    }

    if (
      includesAnyKeyword(reportName, ["現金流量"]) ||
      includesAnyKeyword(normalizedReportName, ["cash flow"])
    ) {
      return "cashflow";
    }

    if (
      includesAnyKeyword(reportName, ["盈餘分配", "虧損撥補", "盈虧撥補", "盈虧撥補表"]) ||
      includesAnyKeyword(normalizedReportName, ["profit"])
    ) {
      return "profitDistribution";
    }

    if (includesAnyKeyword(reportName, ["產銷", "營運量值", "量值比較", "主要產銷", "營運項目"])) {
      return "production";
    }

    if (hasAnyTag(xmlDoc, PRODUCTION_TAG_NAMES)) {
      return "production";
    }

    const codes = getAccountCodes(xmlDoc);
    if (codes.some((code) => code === "68" || code.startsWith("41") || code.startsWith("51"))) {
      return "income";
    }
    if (codes.some((code) => code === "1" || code === "2" || code === "3")) {
      return "balance";
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}

function extractYear(xmlString) {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");
    return getNodeText(xmlDoc, YEAR_SELECTORS);
  } catch {
    return "";
  }
}

function extractReportName(xmlString) {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");
    return getTableName(xmlDoc);
  } catch {
    return "";
  }
}

const FileManagerContext = createContext(null);

export function useFileManager() {
  return useContext(FileManagerContext);
}

let nextId = 1;

export function FileManagerProvider({ children }) {
  const [files, setFiles] = useState([]);
  const [activeWorkspace, setActiveWorkspace] = useState({
    comparisonPrimaryFileId: null,
    comparisonPrimaryFileIds: [],
    knowledgeBaseIds: [],
    textInputSource: "manual",
    lastSelectedByRole: {},
  });

  const addFiles = useCallback(async (fileList) => {
    const newEntries = [];

    for (const file of Array.from(fileList)) {
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (ext !== ".xml" && ext !== ".json") continue;

      const rawContent = await file.text();
      let detectedType = "unknown";
      let reportName = file.name.replace(/\.[^/.]+$/, "");
      let year = "";
      let parsedData = null;
      let parseError = "";

      if (ext === ".json") {
        detectedType = "knowledgeBase";
        try {
          const parsedJson = JSON.parse(rawContent);
          if (!Array.isArray(parsedJson)) {
            parseError = "Knowledge rule JSON must be an array.";
          } else {
            parsedData = parsedJson;
          }
        } catch (error) {
          parsedData = null;
          parseError = `JSON parse failed: ${error.message}`;
        }
      } else {
        detectedType = detectXmlReportType(rawContent);
        reportName = extractReportName(rawContent) || reportName;
        year = extractYear(rawContent);
      }

      newEntries.push({
        id: nextId++,
        fileName: file.name,
        reportName,
        detectedType,
        year,
        rawContent,
        parsedData,
        parseError,
        addedAt: Date.now(),
      });
    }

    if (!newEntries.length) return [];

    setFiles((prev) => {
      const updated = [...prev];
      for (const entry of newEntries) {
        const existingIndex = updated.findIndex((file) => file.fileName === entry.fileName);
        if (existingIndex >= 0) {
          entry.id = updated[existingIndex].id;
          updated[existingIndex] = entry;
        } else {
          updated.push(entry);
        }
      }
      return updated;
    });

    return newEntries;
  }, []);

  const removeFile = useCallback((id) => {
    setFiles((prev) => prev.filter((file) => file.id !== id));
    setActiveWorkspace((prev) => ({
      ...prev,
      comparisonPrimaryFileId:
        prev.comparisonPrimaryFileId === id ? null : prev.comparisonPrimaryFileId,
      comparisonPrimaryFileIds: prev.comparisonPrimaryFileIds.filter((fileId) => fileId !== id),
      knowledgeBaseIds: prev.knowledgeBaseIds.filter((kbId) => kbId !== id),
      lastSelectedByRole: Object.fromEntries(
        Object.entries(prev.lastSelectedByRole).map(([role, fileId]) => [
          role,
          fileId === id ? null : fileId,
        ])
      ),
    }));
  }, []);

  const getFilesByType = useCallback(
    (types = []) => {
      if (!types.length) return files;
      return files.filter((file) => types.includes(file.detectedType));
    },
    [files]
  );

  const setWorkspaceFile = useCallback((role, fileEntry) => {
    setActiveWorkspace((prev) => {
      const nextPrimaryFileId =
        role === "comparisonPrimaryFile"
          ? fileEntry?.id ?? null
          : role === "comparisonPrimaryFiles"
            ? Array.isArray(fileEntry)
              ? fileEntry[0]?.id ?? null
              : null
            : prev.comparisonPrimaryFileId;
      const nextPrimaryFileIds =
        role === "comparisonPrimaryFiles"
          ? Array.isArray(fileEntry)
            ? fileEntry.map((item) => item?.id).filter(Boolean)
            : []
          : prev.comparisonPrimaryFileIds;
      const nextRoleSelectedId =
        role === "comparisonPrimaryFiles"
          ? Array.isArray(fileEntry)
            ? fileEntry[0]?.id ?? null
            : null
          : fileEntry?.id ?? null;

      if (
        nextPrimaryFileId === prev.comparisonPrimaryFileId &&
        arraysEqual(nextPrimaryFileIds, prev.comparisonPrimaryFileIds) &&
        nextRoleSelectedId === (prev.lastSelectedByRole?.[role] ?? null)
      ) {
        return prev;
      }

      return {
        ...prev,
        comparisonPrimaryFileId: nextPrimaryFileId,
        comparisonPrimaryFileIds: nextPrimaryFileIds,
        lastSelectedByRole: {
          ...prev.lastSelectedByRole,
          [role]: nextRoleSelectedId,
        },
      };
    });
  }, []);

  const refreshKnowledgeBaseSelection = useCallback((nextFiles) => {
    const knowledgeBaseIds = nextFiles
      .filter((file) => file.detectedType === "knowledgeBase")
      .map((file) => file.id);
    setActiveWorkspace((prev) => ({
      ...prev,
      knowledgeBaseIds,
    }));
  }, []);

  useEffect(() => {
    refreshKnowledgeBaseSelection(files);
  }, [files, refreshKnowledgeBaseSelection]);

  const setTextInputSource = useCallback((textInputSource) => {
    setActiveWorkspace((prev) => ({ ...prev, textInputSource }));
  }, []);

  const value = useMemo(
    () => ({
      files,
      addFiles,
      removeFile,
      getFilesByType,
      activeWorkspace,
      setWorkspaceFile,
      setTextInputSource,
    }),
    [activeWorkspace, addFiles, files, getFilesByType, removeFile, setTextInputSource, setWorkspaceFile]
  );

  return <FileManagerContext.Provider value={value}>{children}</FileManagerContext.Provider>;
}
