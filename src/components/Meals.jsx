import { useState, useMemo, useCallback, useEffect } from "react";
import MealItem from "./MealItem";
import FilterSidebar from "./FilterSidebar";
import FloatingSearch from "./FloatingSearch";
import useHttp from "../hooks/useHttp";
import Error from "./Error";
import { API_ENDPOINTS } from "../config/api";

const requestConfig = {};
const MEALS_PER_PAGE = 12;

const DEFAULT_FILTERS = {
    dietary: [],
    category: [],
    spiceLevel: [],
    protein: [],
    servingSize: [],
    availableTime: [],
    chefSpecial: false,
    priceRange: 3500,
    sortBy: "default",
};

export default function Meals() {
    const [searchTerm, setSearchTerm] = useState("");
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    const {
        data: loadedMeals,
        isLoading,
        error,
    } = useHttp(API_ENDPOINTS.MEALS, requestConfig, []);

    const handleFilterChange = useCallback((key, value) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    }, []);

    const handleClearAll = useCallback(() => {
        setFilters(DEFAULT_FILTERS);
    }, []);

    // Reset to page 1 when filters or search change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filters]);

    const filteredMeals = useMemo(() => {
        let result = loadedMeals.filter((meal) => {
            // Search
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                const matchesSearch =
                    meal.name.toLowerCase().includes(term) ||
                    meal.description.toLowerCase().includes(term);
                if (!matchesSearch) return false;
            }

            // Price range
            if (Number(meal.price) > filters.priceRange) return false;

            // Chef's Special
            if (filters.chefSpecial && !meal.isChefSpecial) return false;

            // Dietary (OR logic — meal must have at least one of the selected dietary tags)
            if (filters.dietary.length > 0) {
                const mealDietary = meal.dietary || [];
                if (!filters.dietary.some((d) => mealDietary.includes(d))) return false;
            }

            // Category
            if (filters.category.length > 0) {
                if (!filters.category.includes(meal.category)) return false;
            }

            // Spice Level
            if (filters.spiceLevel.length > 0) {
                if (!filters.spiceLevel.includes(meal.spiceLevel)) return false;
            }

            // Protein
            if (filters.protein.length > 0) {
                if (!filters.protein.includes(meal.protein)) return false;
            }

            // Serving Size
            if (filters.servingSize.length > 0) {
                if (!filters.servingSize.includes(meal.servingSize)) return false;
            }

            // Availability
            if (filters.availableTime.length > 0) {
                if (!filters.availableTime.includes(meal.availableTime)) return false;
            }

            return true;
        });

        // Sorting
        if (filters.sortBy === "price-low") {
            result = [...result].sort((a, b) => Number(a.price) - Number(b.price));
        } else if (filters.sortBy === "price-high") {
            result = [...result].sort((a, b) => Number(b.price) - Number(a.price));
        } else if (filters.sortBy === "name-az") {
            result = [...result].sort((a, b) => a.name.localeCompare(b.name));
        } else if (filters.sortBy === "chef-special") {
            result = [...result].sort((a, b) => (b.isChefSpecial ? 1 : 0) - (a.isChefSpecial ? 1 : 0));
        }

        return result;
    }, [loadedMeals, searchTerm, filters]);

    const totalPages = Math.ceil(filteredMeals.length / MEALS_PER_PAGE);
    const pagedMeals = filteredMeals.slice(
        (currentPage - 1) * MEALS_PER_PAGE,
        currentPage * MEALS_PER_PAGE
    );

    function handlePageChange(page) {
        setCurrentPage(page);
        // Scroll to top of meals grid
        document.getElementById("meals")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function renderPagination() {
        if (totalPages <= 1) return null;

        const pages = [];
        const maxVisible = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);

        if (endPage - startPage + 1 < maxVisible) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }

        return (
            <div className="pagination">
                <button
                    className="pagination-btn"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                >
                    &laquo;
                </button>

                {startPage > 1 && (
                    <>
                        <button className="pagination-btn" onClick={() => handlePageChange(1)}>1</button>
                        {startPage > 2 && <span className="pagination-ellipsis">&hellip;</span>}
                    </>
                )}

                {(() => {
                    for (let i = startPage; i <= endPage; i++) {
                        pages.push(
                            <button
                                key={i}
                                className={`pagination-btn${i === currentPage ? " active" : ""}`}
                                onClick={() => handlePageChange(i)}
                            >
                                {i}
                            </button>
                        );
                    }
                    return pages;
                })()}

                {endPage < totalPages && (
                    <>
                        {endPage < totalPages - 1 && <span className="pagination-ellipsis">&hellip;</span>}
                        <button className="pagination-btn" onClick={() => handlePageChange(totalPages)}>{totalPages}</button>
                    </>
                )}

                <button
                    className="pagination-btn"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    aria-label="Next page"
                >
                    &raquo;
                </button>
            </div>
        );
    }

    if (isLoading) {
        return <p className="center">Fetching Meals...</p>;
    }

    if (error) {
        return <Error title="failed to fetch meals" message={error} />;
    }

    return (
        <>
            {/* Mobile filter toggle */}
            <button
                className="mobile-filter-toggle"
                onClick={() => setSidebarOpen(true)}
                title="Open filters"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                </svg>
                Filters
            </button>

            <div className="app-layout">
                <FilterSidebar
                    filters={filters}
                    onFilterChange={handleFilterChange}
                    onClearAll={handleClearAll}
                    isOpen={sidebarOpen}
                    onToggle={() => setSidebarOpen((prev) => !prev)}
                />

                <main className="meals-content">
                    <div className="meals-result-bar">
                        <span className="result-count">
                            {filteredMeals.length} {filteredMeals.length === 1 ? "dish" : "dishes"} found
                            {totalPages > 1 && ` · Page ${currentPage} of ${totalPages}`}
                        </span>
                    </div>
                    <ul id="meals">
                        {pagedMeals.length > 0 ? (
                            pagedMeals.map((meal) => (
                                <MealItem key={meal.id} meal={meal} />
                            ))
                        ) : (
                            <p className="center no-results">
                                No meals match your filters. Try adjusting your selections!
                            </p>
                        )}
                    </ul>
                    {renderPagination()}
                </main>
            </div>

            <FloatingSearch
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
            />
        </>
    );
}