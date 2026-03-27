import { useState, useRef, useEffect } from "react";

export default function FloatingSearch({ searchTerm, onSearchChange }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape" && isExpanded) {
        setIsExpanded(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isExpanded]);

  function handleToggle() {
    if (isExpanded && searchTerm) {
      onSearchChange("");
    }
    setIsExpanded((prev) => !prev);
  }

  return (
    <div className={`floating-search${isExpanded ? " expanded" : ""}`}>
      {isExpanded && (
        <div className="floating-search-field">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search meals..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="floating-search-input"
          />
          {searchTerm && (
            <button
              className="floating-search-clear"
              onClick={() => onSearchChange("")}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      )}
      <button
        className="floating-search-btn"
        onClick={handleToggle}
        title={isExpanded ? "Close search" : "Search meals"}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {isExpanded ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
