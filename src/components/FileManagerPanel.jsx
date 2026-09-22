import React, { useRef, useState } from "react";
import { useFileManager, REPORT_TYPES } from "../contexts/FileManagerContext";
import styles from "./FileManagerPanel.module.css";

const UI_TEXT = {
  title: "財報資料中心",
  loadedPrefix: "，目前已載入 ",
  loadedSuffix: " 份檔案",
  collapse: "收合",
  expand: "展開",
  uploadLead: "點擊或拖放",
  uploadBody: " XML / JSON 財報與知識庫檔案至此",
  uploadHint:
    "系統將自動辨識報表類型、年度與可用核驗資料。",
  empty:
    "尚未載入檔案，請先上傳財報 XML 或知識庫資料。",
  remove: "移除",
};

export default function FileManagerPanel() {
  const { files, addFiles, removeFile } = useFileManager();
  const [expanded, setExpanded] = useState(true);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const handleDragOver = (event) => {
    event.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleDrop = async (event) => {
    event.preventDefault();
    setDragging(false);
    await addFiles(event.dataTransfer.files);
  };

  const handleInputChange = async (event) => {
    if (!event.target.files) return;
    await addFiles(event.target.files);
    if (inputRef.current) inputRef.current.value = "";
  };

  const summaryCounts = {};
  files.forEach((file) => {
    summaryCounts[file.detectedType] = (summaryCounts[file.detectedType] ?? 0) + 1;
  });

  return (
    <div className={styles.panel}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ""}`} aria-hidden="true">
          ▾
        </span>
        <span className={styles.headerTitle}>
          {UI_TEXT.title}
          {files.length > 0 && `${UI_TEXT.loadedPrefix}${files.length}${UI_TEXT.loadedSuffix}`}
        </span>

        {files.length > 0 ? (
          <span className={styles.headerSummary}>
            {Object.entries(summaryCounts).map(([type, count]) => {
              const info = REPORT_TYPES[type] ?? REPORT_TYPES.unknown;
              return (
                <span
                  key={type}
                  className={styles.summaryBadge}
                  style={{
                    background: `${info.color}22`,
                    color: info.color,
                    border: `1px solid ${info.color}44`,
                  }}
                >
                  {info.label} ×{count}
                </span>
              );
            })}
          </span>
        ) : null}

        <span className={styles.toggleBtn}>{expanded ? UI_TEXT.collapse : UI_TEXT.expand}</span>
      </button>

      {expanded ? (
        <div className={styles.body}>
          <div
            className={`${styles.dropZone} ${dragging ? styles.dragging : ""}`}
            role="button"
            tabIndex={0}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xml,.json"
              multiple
              className={styles.hiddenInput}
              onChange={handleInputChange}
            />
            <div className={styles.dropZoneText}>
              <strong>{UI_TEXT.uploadLead}</strong>
              <span className={styles.dropZoneArrow} aria-hidden="true">
                →
              </span>
              {UI_TEXT.uploadBody}
              <br />
              <span style={{ fontSize: "0.9em", color: "#94a3b8" }}>{UI_TEXT.uploadHint}</span>
            </div>
          </div>

          {files.length > 0 ? (
            <div className={styles.fileGrid}>
              {files.map((file) => {
                const info = REPORT_TYPES[file.detectedType] ?? REPORT_TYPES.unknown;
                return (
                  <div key={file.id} className={styles.fileCard}>
                    <span
                      className={styles.typeDot}
                      style={{ background: info.color }}
                      title={info.label}
                    />
                    <span className={styles.cardName} title={file.fileName}>
                      {file.fileName}
                    </span>
                    <span className={styles.cardMeta}>
                      {info.label}
                      {file.year ? ` ${file.year}` : ""}
                    </span>
                    <button
                      className={styles.removeBtn}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeFile(file.id);
                      }}
                      title={UI_TEXT.remove}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyHint}>{UI_TEXT.empty}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
