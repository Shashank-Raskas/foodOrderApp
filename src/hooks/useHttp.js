import { useCallback, useEffect, useRef, useState } from "react";

// ─── Module-level stale-while-revalidate cache ───────────────────────────────
const httpCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(url) {
    const entry = httpCache.get(url);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
        httpCache.delete(url);
        return null;
    }
    return entry.data;
}

function setCache(url, data) {
    httpCache.set(url, { data, timestamp: Date.now() });
}

// Expose for manual cache invalidation (e.g. after an order is placed)
export function invalidateCache(url) {
    if (url) httpCache.delete(url);
    else httpCache.clear();
}
// ─────────────────────────────────────────────────────────────────────────────

async function sendHttpRequest(url, config) {
    const response = await fetch(url, config);
    const resData = await response.json();
    if (!response.ok) {
        throw new Error(resData.message || 'Something went wrong, failed to send request');
    }
    return resData;
}

export default function useHttp(url, config, initialData) {
    const isGetRequest = !config || !config.method || config.method === 'GET';

    // Start with cached data immediately (no loading flash if cache exists)
    const [data, setData] = useState(() => {
        if (isGetRequest) {
            const cached = getCached(url);
            if (cached) return cached;
        }
        return initialData;
    });
    const [isLoading, setIsLoading] = useState(isGetRequest && !getCached(url));
    const [error, setError] = useState();
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    function clearData() {
        setData(initialData);
    }

    // silent=true: revalidation in background — no loading spinner, no error override
    const sendRequest = useCallback(async function sendRequest(body, silent = false) {
        if (!silent) setIsLoading(true);
        try {
            const resData = await sendHttpRequest(url, { ...config, body });
            if (isMounted.current) {
                setData(resData);
                if (isGetRequest) setCache(url, resData);
            }
        } catch (err) {
            if (isMounted.current && !silent) {
                setError(err.message || 'Something went wrong!');
            }
        }
        if (isMounted.current && !silent) setIsLoading(false);
    }, [url, config]);   // eslint-disable-line

    useEffect(() => {
        if (!isGetRequest) return;
        const cached = getCached(url);
        if (cached) {
            // Data already set from useState initializer — silently revalidate
            sendRequest(undefined, true);
        } else {
            sendRequest();
        }
    }, [sendRequest]);   // eslint-disable-line

    return { data, isLoading, error, sendRequest, clearData };
}