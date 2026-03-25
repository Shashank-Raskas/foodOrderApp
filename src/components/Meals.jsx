import { useState, useMemo, useCallback } from "react";
import MealItem from "./MealItem";
import FilterSidebar from "./FilterSidebar";
import FloatingSearch from "./FloatingSearch";
import useHttp from "../hooks/useHttp";
import Error from "./Error";
import { API_ENDPOINTS } from "../config/api";

const requestConfig = {};

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
                        </span>
                    </div>
                    <ul id="meals">
                        {filteredMeals.length > 0 ? (
                            filteredMeals.map((meal) => (
                                <MealItem key={meal.id} meal={meal} />
                            ))
                        ) : (
                            <p className="center no-results">
                                No meals match your filters. Try adjusting your selections!
                            </p>
                        )}
                    </ul>
                </main>
            </div>

            <FloatingSearch
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
            />
        </>
    );
}