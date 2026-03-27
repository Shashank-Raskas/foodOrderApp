import { useState, useEffect } from 'react';

/**
 * Returns a debounced version of the value that only updates
 * after the specified delay (ms) of no changes.
 */
export default function useDebounce(value, delay) {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debouncedValue;
}
