import { useCallback, useRef } from 'react';

/**
 * Returns a throttled version of the callback that fires at most
 * once per `delay` ms, using requestAnimationFrame for scroll-safe timing.
 */
export default function useThrottle(fn, delay) {
    const lastRun = useRef(0);
    const rafId = useRef(null);

    return useCallback((...args) => {
        if (rafId.current) return;
        const now = Date.now();
        if (now - lastRun.current >= delay) {
            lastRun.current = now;
            fn(...args);
        } else {
            rafId.current = requestAnimationFrame(() => {
                rafId.current = null;
                const n = Date.now();
                if (n - lastRun.current >= delay) {
                    lastRun.current = n;
                    fn(...args);
                }
            });
        }
    }, [fn, delay]);
}
