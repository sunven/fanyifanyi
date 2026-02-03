import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { UpdateHandle, UpdateInfo } from "../lib/updater";
import { checkForUpdate, getCurrentVersion, relaunchApp } from "../lib/updater";

const DISMISSED_VERSION_KEY = "updater_dismissed_version";

/**
 * Update context value interface
 */
export interface UpdateContextValue {
  hasUpdate: boolean;
  updateInfo: UpdateInfo | null;
  updateHandle: UpdateHandle | null;
  isChecking: boolean;
  error: string | null;
  isDismissed: boolean;
  isDevMode: boolean;
  checkUpdate: () => Promise<boolean>;
  dismissUpdate: () => void;
  resetDismiss: () => void;
  downloadAndInstall: () => Promise<void>;
}

const UpdateContext = createContext<UpdateContextValue | undefined>(undefined);

interface UpdateProviderProps {
  children: ReactNode;
  checkOnMount?: boolean;
}

/**
 * Simplified update provider following cc-switch pattern
 */
export function UpdateProvider({
  children,
  checkOnMount = true,
}: UpdateProviderProps) {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateHandle, setUpdateHandle] = useState<UpdateHandle | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const isDevMode = import.meta.env.DEV;

  const checkUpdate = useCallback(async (): Promise<boolean> => {
    setIsChecking(true);
    setError(null);

    // In dev mode, show a message and return
    if (isDevMode) {
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for visual feedback
      setError("开发模式下无法检查更新，请使用生产版本测试此功能");
      setIsChecking(false);
      return false;
    }

    try {
      const result = await checkForUpdate();

      // Check if dismissed
      const dismissedVersion = localStorage.getItem(DISMISSED_VERSION_KEY);
      if (result.available && result.update) {
        if (dismissedVersion === result.update.version) {
          setIsDismissed(true);
          setHasUpdate(false);
          return false;
        }

        setHasUpdate(true);
        setUpdateInfo(result.update);
        setUpdateHandle(result.update);
        setIsDismissed(false);
        return true;
      }

      setHasUpdate(false);
      setUpdateInfo(null);
      setUpdateHandle(null);
      return false;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      return false;
    } finally {
      setIsChecking(false);
    }
  }, [isDevMode]);

  const dismissUpdate = useCallback(() => {
    if (updateInfo) {
      localStorage.setItem(DISMISSED_VERSION_KEY, updateInfo.version);
    }
    setHasUpdate(false);
    setUpdateInfo(null);
    setUpdateHandle(null);
    setIsDismissed(true);
  }, [updateInfo]);

  const resetDismiss = useCallback(() => {
    localStorage.removeItem(DISMISSED_VERSION_KEY);
    setIsDismissed(false);
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (!updateHandle) {
      return;
    }

    try {
      await updateHandle.downloadAndInstall();
      await relaunchApp();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    }
  }, [updateHandle]);

  // Auto-check on mount after delay (only in production)
  useEffect(() => {
    if (checkOnMount && !isDevMode) {
      const timer = setTimeout(() => {
        checkUpdate();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [checkOnMount, checkUpdate, isDevMode]);

  const value: UpdateContextValue = useMemo(
    () => ({
      hasUpdate,
      updateInfo,
      updateHandle,
      isChecking,
      error,
      isDismissed,
      isDevMode,
      checkUpdate,
      dismissUpdate,
      resetDismiss,
      downloadAndInstall,
    }),
    [
      hasUpdate,
      updateInfo,
      updateHandle,
      isChecking,
      error,
      isDismissed,
      isDevMode,
      checkUpdate,
      dismissUpdate,
      resetDismiss,
      downloadAndInstall,
    ]
  );

  return (
    <UpdateContext.Provider value={value}>
      {children}
    </UpdateContext.Provider>
  );
}

/**
 * Hook to use update context
 */
export function useUpdate() {
  const context = useContext(UpdateContext);
  if (context === undefined) {
    throw new Error("useUpdate must be used within an UpdateProvider");
  }
  return context;
}

export { getCurrentVersion };
