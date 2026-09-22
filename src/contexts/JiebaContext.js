import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
} from "react";

// 【關鍵的最終修復】從我們本地的檔案導入 segmentit
import segmentit from "../lib/segmentit.js";

// 建立 Context
const JiebaContext = createContext();

// 建立一個自訂 Hook
export function useJieba() {
  return useContext(JiebaContext);
}

// 建立 Context Provider 組件
export function JiebaProvider({ children }) {
  const [isJiebaReady, setIsJiebaReady] = useState(false);
  const [jiebaError, setJiebaError] = useState(null);

  useEffect(() => {
    // 防止重複執行
    if (isJiebaReady) {
      return;
    }

    async function initialize() {
      try {
        console.log("【最終修復】正在使用本地導入的 'segmentit'...");

        // 創建一個 segmentit 實例
        const segmentitInstance = segmentit.new();

        console.log("【最終修復】正在載入自定義詞典...");
        const response = await fetch("/financial_dict.txt");
        if (!response.ok) {
          throw new Error(`無法載入自定義詞典檔案: ${response.status}`);
        }
        const userDictText = await response.text();

        // 準備詞典物件
        const userDict = {};
        userDictText.split("\n").forEach((line) => {
          const word = line.split(" ")[0];
          if (word) {
            userDict[word] = 1;
          }
        });

        // 將詞典載入到實例中
        segmentitInstance.use(userDict);
        console.log("【最終修復】自定義詞典載入成功。");

        // 將這個可用的實例存儲在 window 上，以便其他檔案訪問
        window.__segmentit_instance = segmentitInstance;

        setIsJiebaReady(true);
        console.log("【完成】分析工具初始化成功，並已準備就緒！");
      } catch (err) {
        console.error("初始化分析工具時發生致命錯誤:", err);
        setJiebaError(err.message);
      }
    }

    initialize();
  }, [isJiebaReady]);

  const value = useMemo(
    () => ({
      isJiebaReady,
      jiebaError,
    }),
    [isJiebaReady, jiebaError]
  );

  return (
    <JiebaContext.Provider value={value}>{children}</JiebaContext.Provider>
  );
}
