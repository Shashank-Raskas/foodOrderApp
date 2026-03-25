export default function SearchBar({ searchTerm, onSearchChange, priceFilter, onPriceFilterChange }) {
    return (
        <div className="search-filter-container">
            <div className="search-bar">
                <input
                    type="text"
                    placeholder="🔍 Search meals..."
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="search-input"
                />
            </div>
            
            <div className="filter-controls">
                <div className="price-filter">
                    <label htmlFor="price-range">Max Price: ₹{priceFilter}</label>
                    <input
                        id="price-range"
                        type="range"
                        min="0"
                        max="3500"
                        value={priceFilter}
                        onChange={(e) => onPriceFilterChange(Number(e.target.value))}
                        className="price-slider"
                    />
                    <span className="price-value">₹{priceFilter}</span>
                </div>
                
                {(searchTerm || priceFilter < 3500) && (
                    <button 
                        className="reset-filters"
                        onClick={() => {
                            onSearchChange('');
                            onPriceFilterChange(3500);
                        }}
                    >
                        Clear Filters
                    </button>
                )}
            </div>
        </div>
    );
}
