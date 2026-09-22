import React, { useEffect, useMemo, useRef, useState } from "react";
import { REPORT_TYPES, useFileManager } from "../contexts/FileManagerContext";
import styles from "./XmlFileSelector.module.css";

function sortCompatibleFiles(files, preferredId) {
  return [...files].sort((left, right) => {
    const preferredDelta = Number(right.id === preferredId) - Number(left.id === preferredId);
    if (preferredDelta !== 0) return preferredDelta;

    const yearDelta = Number(right.year || 0) - Number(left.year || 0);
    if (yearDelta !== 0) return yearDelta;

    return right.addedAt - left.addedAt;
  });
}

function buildMultiSummary(selectedFiles = []) {
  if (!selectedFiles.length) return "尚未選擇 XML 檔案";
  if (selectedFiles.length === 1) return selectedFiles[0].fileName;
  return `已選擇 ${selectedFiles.length} 份 XML`;
}

export default function XmlFileSelector({
  label,
  acceptTypes = [],
  onFileReady,
  hint,
  workspaceRole = "default",
  multiple = false,
  recommendedFileFilter = null,
}) {
  const { files, addFiles, getFilesByType, activeWorkspace, setWorkspaceFile } = useFileManager();
  const [selectedId, setSelectedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [source, setSource] = useState("none");
  const [recommendedId, setRecommendedId] = useState(null);
  const fileInputRef = useRef(null);
  const pendingUploadNameRef = useRef(null);
  const onFileReadyRef = useRef(onFileReady);
  const preferredId = activeWorkspace.lastSelectedByRole?.[workspaceRole] ?? null;
  const acceptTypesSignature = useMemo(() => acceptTypes.join("|"), [acceptTypes]);

  useEffect(() => {
    onFileReadyRef.current = onFileReady;
  }, [onFileReady]);

  const compatibleFiles = useMemo(() => {
    const baseFiles = getFilesByType(acceptTypesSignature ? acceptTypesSignature.split("|") : []);
    return sortCompatibleFiles(baseFiles, preferredId);
  }, [acceptTypesSignature, getFilesByType, preferredId]);

  const compatibleSignature = useMemo(
    () => compatibleFiles.map((file) => file.id).join("|"),
    [compatibleFiles]
  );
  const recommendedFile = (
    typeof recommendedFileFilter === "function"
      ? sortCompatibleFiles(compatibleFiles.filter(recommendedFileFilter), null)
      : compatibleFiles
  )[0] ?? null;

  useEffect(() => {
    const nextRecommended = recommendedFile;
    setRecommendedId(nextRecommended?.id ?? null);

    if (source === "pool" || source === "upload") return;

    if (!nextRecommended) {
      if (multiple) {
        setSelectedIds([]);
        setWorkspaceFile(workspaceRole, []);
        onFileReadyRef.current?.([]);
      } else {
        setSelectedId(null);
        setWorkspaceFile(workspaceRole, null);
        onFileReadyRef.current?.(null);
      }
      setSource("none");
      return;
    }

    if (multiple) {
      if (source === "auto" && selectedIds.length) return;
      setSelectedIds([nextRecommended.id]);
      setSource("auto");
      setWorkspaceFile(workspaceRole, [nextRecommended]);
      onFileReadyRef.current?.([nextRecommended]);
      return;
    }

    if (source === "auto" && selectedId === nextRecommended.id) return;
    setSelectedId(nextRecommended.id);
    setSource("auto");
    setWorkspaceFile(workspaceRole, nextRecommended);
    onFileReadyRef.current?.(nextRecommended);
  }, [
    compatibleSignature,
    multiple,
    recommendedFile,
    recommendedFileFilter,
    selectedId,
    selectedIds.length,
    setWorkspaceFile,
    source,
    workspaceRole,
  ]);

  useEffect(() => {
    if (!pendingUploadNameRef.current) return;

    const pendingNames = Array.isArray(pendingUploadNameRef.current)
      ? pendingUploadNameRef.current
      : [pendingUploadNameRef.current];
    const uploadedFiles = files.filter((file) => pendingNames.includes(file.fileName));
    if (!uploadedFiles.length) return;

    pendingUploadNameRef.current = null;

    if (multiple) {
      const nextIds = Array.from(new Set([...selectedIds, ...uploadedFiles.map((file) => file.id)]));
      const nextFiles = files.filter((file) => nextIds.includes(file.id));
      setSelectedIds(nextIds);
      setSource("upload");
      setWorkspaceFile(workspaceRole, nextFiles);
      onFileReadyRef.current?.(nextFiles);
      return;
    }

    const uploadedFile = uploadedFiles[0];
    setSelectedId(uploadedFile.id);
    setSource("upload");
    setWorkspaceFile(workspaceRole, uploadedFile);
    onFileReadyRef.current?.(uploadedFile);
  }, [files, multiple, selectedIds, setWorkspaceFile, workspaceRole]);

  const selectedFile = files.find((file) => file.id === selectedId) ?? null;
  const selectedFiles = files.filter((file) => selectedIds.includes(file.id));
  const selectedTypeInfo = selectedFile
    ? REPORT_TYPES[selectedFile.detectedType] ?? REPORT_TYPES.unknown
    : null;

  const toggleSelectedFile = (fileId) => {
    if (!multiple) return;
    const nextIds = selectedIds.includes(fileId)
      ? selectedIds.filter((id) => id !== fileId)
      : [...selectedIds, fileId];
    const nextFiles = files.filter((file) => nextIds.includes(file.id));
    setSelectedIds(nextIds);
    setSource("pool");
    setWorkspaceFile(workspaceRole, nextFiles);
    onFileReadyRef.current?.(nextFiles);
  };

  const handleSelectChange = (event) => {
    const nextId = Number(event.target.value || 0);
    if (!nextId) {
      setSelectedId(null);
      setSource("none");
      setWorkspaceFile(workspaceRole, null);
      onFileReadyRef.current?.(null);
      return;
    }

    const nextFile = files.find((file) => file.id === nextId) ?? null;
    setSelectedId(nextId);
    setSource("pool");
    setWorkspaceFile(workspaceRole, nextFile);
    onFileReadyRef.current?.(nextFile);
  };

  const handleUpload = async (event) => {
    const fileList = event.target.files;
    if (!fileList?.length) return;
    pendingUploadNameRef.current = multiple
      ? Array.from(fileList).map((file) => file.name)
      : fileList[0].name;
    await addFiles(fileList);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClear = () => {
    if (multiple) {
      setSelectedIds([]);
      setSource("none");
      setWorkspaceFile(workspaceRole, []);
      onFileReadyRef.current?.([]);
      return;
    }
    setSelectedId(null);
    setSource("none");
    setWorkspaceFile(workspaceRole, null);
    onFileReadyRef.current?.(null);
  };

  return (
    <div className={styles.selectorWrapper}>
      {label ? <div className={styles.label}>{label}</div> : null}

      {multiple ? (
        <div className={`${styles.currentFile} ${selectedFiles.length ? styles.manualSelected : ""}`}>
          <span className={`${styles.sourceBadge} ${styles.manual}`}>
            {source === "auto" ? "自動" : source === "upload" ? "上傳" : "選取"}
          </span>
          <span className={styles.fileName} title={buildMultiSummary(selectedFiles)}>
            {buildMultiSummary(selectedFiles)}
          </span>
          <button className={styles.clearBtn} onClick={handleClear} title="清除選擇">
            ×
          </button>
        </div>
      ) : selectedFile ? (
        <div
          className={`${styles.currentFile} ${
            source === "auto" ? styles.autoSelected : styles.manualSelected
          }`}
        >
          <span className={`${styles.sourceBadge} ${source === "auto" ? styles.auto : styles.manual}`}>
            {source === "auto" ? "自動" : source === "upload" ? "上傳" : "選取"}
          </span>
          {selectedTypeInfo ? (
            <span
              className={styles.typeBadge}
              style={{
                background: `${selectedTypeInfo.color}22`,
                color: selectedTypeInfo.color,
                border: `1px solid ${selectedTypeInfo.color}44`,
              }}
            >
              {selectedTypeInfo.label}
            </span>
          ) : null}
          <span className={styles.fileName} title={selectedFile.fileName}>
            {selectedFile.fileName}
          </span>
          <span className={styles.metaGroup}>
            {selectedFile.year ? <span className={styles.yearTag}>{selectedFile.year}</span> : null}
            {selectedFile.reportName ? (
              <span className={styles.reportTag} title={selectedFile.reportName}>
                {selectedFile.reportName}
              </span>
            ) : null}
          </span>
          <button className={styles.clearBtn} onClick={handleClear} title="清除選擇">
            ×
          </button>
        </div>
      ) : (
        <div className={styles.noFile}>尚未選擇 XML 檔案</div>
      )}

      {!multiple && recommendedId && recommendedId !== selectedId ? (
        <div className={styles.recommendedHint}>
          建議優先使用：{files.find((file) => file.id === recommendedId)?.fileName}
        </div>
      ) : null}

      <div className={styles.controls}>
        {multiple ? (
          <div className={styles.multiPicker} role="list" aria-label={label || "XML 多選清單"}>
            {compatibleFiles.length ? (
              compatibleFiles.map((file) => {
                const info = REPORT_TYPES[file.detectedType] ?? REPORT_TYPES.unknown;
                const isSelected = selectedIds.includes(file.id);
                return (
                  <button
                    key={file.id}
                    type="button"
                    role="listitem"
                    className={`${styles.multiOption} ${isSelected ? styles.multiOptionSelected : ""}`}
                    onClick={() => toggleSelectedFile(file.id)}
                  >
                    <span className={styles.multiOptionMain}>
                      <span
                        className={styles.typeBadge}
                        style={{
                          background: `${info.color}22`,
                          color: info.color,
                          border: `1px solid ${info.color}44`,
                        }}
                      >
                        {info.label}
                      </span>
                      <span className={styles.multiOptionName} title={file.fileName}>
                        {file.fileName}
                      </span>
                    </span>
                    <span className={styles.multiOptionMeta}>
                      {file.year ? `(${file.year})` : ""}
                      {file.reportName ? ` ${file.reportName}` : ""}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className={styles.emptyPool}>目前沒有可選的 XML。</div>
            )}
          </div>
        ) : (
          <select
            className={styles.poolSelect}
            value={selectedId ?? ""}
            onChange={handleSelectChange}
          >
            <option value="">請選擇 XML 檔案</option>
            {compatibleFiles.map((file) => {
              const info = REPORT_TYPES[file.detectedType] ?? REPORT_TYPES.unknown;
              return (
                <option
                  key={file.id}
                  value={file.id}
                >
                  [{info.label}] {file.fileName}
                  {file.year ? ` (${file.year})` : ""}
                  {file.reportName ? ` - ${file.reportName}` : ""}
                  {file.id === recommendedId ? " [建議]" : ""}
                </option>
              );
            })}
          </select>
        )}

        <label className={styles.uploadLabel}>
          上傳 XML
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml"
            className={styles.hiddenInput}
            onChange={handleUpload}
            multiple={multiple}
          />
        </label>
      </div>

      {multiple && selectedFiles.length ? (
        <div className={styles.multiSelectedList}>
          {selectedFiles.map((file) => (
            <button
              key={file.id}
              type="button"
              className={styles.multiTag}
              onClick={() => toggleSelectedFile(file.id)}
              title={`移除 ${file.fileName}`}
            >
              {file.fileName}
            </button>
          ))}
        </div>
      ) : null}

      {hint ? <div className={styles.hint}>{hint}</div> : null}
    </div>
  );
}
