"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  noProject: boolean;
  lastUpdated: Date | null;
  refetch: () => void;
}

export function useApi<T>(url: string): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noProject, setNoProject] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    // Abort previous request if still in-flight
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setLoading(true);
      setError(null);
      const res = await fetch(url, { signal: controller.signal });

      if (controller.signal.aborted) return;

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      const json = await res.json();

      if (json?.noProject || json?.error === "Proje bulunamadı") {
        setNoProject(true);
        setData(json);
        return;
      }

      if (!res.ok) {
        throw new Error(json?.error || `Sunucu hatası (${res.status})`);
      }

      setData(json);
      setNoProject(false);
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Bilinmeyen hata");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [url, router]);

  useEffect(() => {
    fetchData();
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [fetchData]);

  return { data, loading, error, noProject, lastUpdated, refetch: fetchData };
}

/** Relative time formatter (Turkish) */
export function formatLastUpdated(date: Date | null): string {
  if (!date) return "";
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 10) return "Az önce";
  if (seconds < 60) return `${seconds} sn önce`;
  if (minutes < 60) return `${minutes} dk önce`;
  if (hours < 24) return `${hours} sa önce`;
  return date.toLocaleString("tr-TR");
}
