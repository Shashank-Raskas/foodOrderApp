import { useState } from "react";

const FILTER_SECTIONS = [
  {
    key: "chefSpecial",
    label: "Chef's Special",
    type: "toggle",
  },
  {
    key: "dietary",
    label: "Dietary",
    type: "checkbox",
    options: [
      { value: "vegan", label: "Vegan" },
      { value: "vegetarian", label: "Vegetarian" },
      { value: "gluten-free", label: "Gluten-Free" },
    ],
  },
  {
    key: "category",
    label: "Menu Category",
    type: "checkbox",
    options: [
      { value: "appetizers", label: "Appetizers" },
      { value: "entrees", label: "Entrées" },
      { value: "desserts", label: "Desserts" },
      { value: "sides", label: "Sides" },
    ],
  },
  {
    key: "spiceLevel",
    label: "Spice Level",
    type: "checkbox",
    options: [
      { value: "non-spicy", label: "Non-Spicy" },
      { value: "mild", label: "Mild" },
      { value: "medium", label: "Medium" },
      { value: "hot", label: "Hot 🌶️" },
    ],
  },
  {
    key: "protein",
    label: "Protein Type",
    type: "checkbox",
    options: [
      { value: "chicken", label: "Chicken" },
      { value: "beef", label: "Beef / Lamb" },
      { value: "fish", label: "Fish / Seafood" },
      { value: "pork", label: "Pork" },
      { value: "vegetarian", label: "Tofu / Vegetarian" },
    ],
  },
  {
    key: "priceRange",
    label: "Price Range",
    type: "range",
  },
  {
    key: "servingSize",
    label: "Serving Size",
    type: "checkbox",
    options: [
      { value: "individual", label: "Individual" },
      { value: "couples", label: "Couples" },
      { value: "family", label: "Family / Party" },
    ],
  },
  {
    key: "availableTime",
    label: "Availability",
    type: "checkbox",
    options: [
      { value: "all-day", label: "All Day" },
      { value: "breakfast", label: "Breakfast" },
    ],
  },
  {
    key: "sortBy",
    label: "Sort By",
    type: "radio",
    options: [
      { value: "default", label: "Default" },
      { value: "price-low", label: "Price: Low → High" },
      { value: "price-high", label: "Price: High → Low" },
      { value: "name-az", label: "Name: A → Z" },
      { value: "chef-special", label: "Chef's Special First" },
    ],
  },
];

export default function FilterSidebar({ filters, onFilterChange, onClearAll, isOpen, onToggle }) {
  const [collapsed, setCollapsed] = useState({});

  function toggleSection(key) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleCheckboxChange(filterKey, value) {
    const current = filters[filterKey] || [];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onFilterChange(filterKey, updated);
  }

  function handleRadioChange(filterKey, value) {
    onFilterChange(filterKey, value);
  }

  function handleToggleChange(filterKey) {
    onFilterChange(filterKey, !filters[filterKey]);
  }

  const hasActiveFilters =
    (filters.dietary?.length > 0) ||
    (filters.category?.length > 0) ||
    (filters.spiceLevel?.length > 0) ||
    (filters.protein?.length > 0) ||
    (filters.servingSize?.length > 0) ||
    (filters.availableTime?.length > 0) ||
    filters.chefSpecial ||
    filters.priceRange < 3500 ||
    filters.sortBy !== "default";

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && <div className="sidebar-overlay" onClick={onToggle} />}

      <aside className={`filter-sidebar${isOpen ? " open" : ""}`}>
        <div className="sidebar-header">
          <h2>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
            </svg>
            Filters
          </h2>
          <button className="sidebar-close-btn" onClick={onToggle} title="Close filters">✕</button>
        </div>

        {hasActiveFilters && (
          <button className="clear-all-btn" onClick={onClearAll}>
            Clear All Filters
          </button>
        )}

        <div className="sidebar-sections">
          {FILTER_SECTIONS.map((section) => (
            <div key={section.key} className="filter-section">
              <button
                className={`section-header${collapsed[section.key] ? " collapsed" : ""}`}
                onClick={() => toggleSection(section.key)}
              >
                <span>{section.label}</span>
                <svg
                  className="chevron"
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {!collapsed[section.key] && (
                <div className="section-body">
                  {section.type === "toggle" && (
                    <label className="toggle-label">
                      <span>Show Chef's Specials Only</span>
                      <div
                        className={`toggle-switch${filters.chefSpecial ? " active" : ""}`}
                        onClick={() => handleToggleChange(section.key)}
                      >
                        <div className="toggle-knob" />
                      </div>
                    </label>
                  )}

                  {section.type === "checkbox" &&
                    section.options.map((opt) => (
                      <label key={opt.value} className="filter-checkbox">
                        <input
                          type="checkbox"
                          checked={(filters[section.key] || []).includes(opt.value)}
                          onChange={() => handleCheckboxChange(section.key, opt.value)}
                        />
                        <span className="checkmark" />
                        <span className="label-text">{opt.label}</span>
                      </label>
                    ))}

                  {section.type === "radio" &&
                    section.options.map((opt) => (
                      <label key={opt.value} className="filter-radio">
                        <input
                          type="radio"
                          name={section.key}
                          checked={filters[section.key] === opt.value}
                          onChange={() => handleRadioChange(section.key, opt.value)}
                        />
                        <span className="radio-mark" />
                        <span className="label-text">{opt.label}</span>
                      </label>
                    ))}

                  {section.type === "range" && (
                    <div className="price-range-filter">
                      <div className="range-header">
                        <span>₹0</span>
                        <span className="range-value">₹{filters.priceRange}</span>
                        <span>₹3500</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="3500"
                        step="50"
                        value={filters.priceRange}
                        onChange={(e) =>
                          onFilterChange("priceRange", Number(e.target.value))
                        }
                        className="sidebar-price-slider"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
