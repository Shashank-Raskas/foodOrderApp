import { useEffect } from "react";
import { useState } from "react";
import MealItem from "./MealItem";
import SearchBar from "./SearchBar";
import useHttp from "../hooks/useHttp";
import Error from "./Error";
import { API_ENDPOINTS } from "../config/api";

const requestConfig = {};

export default function Meals() {

    const [searchTerm, setSearchTerm] = useState('');
    const [priceFilter, setPriceFilter] = useState(3500);
    const [showFilters, setShowFilters] = useState(false);
    
    const {
        data: loadedMeals,
        isLoading,
        error,
    } = useHttp(API_ENDPOINTS.MEALS, requestConfig, []);

    // Filter meals based on search and price
    const filteredMeals = loadedMeals.filter(meal => {
        const matchesSearch = meal.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            meal.description.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesPrice = meal.price <= priceFilter;
        return matchesSearch && matchesPrice;
    });

    if (isLoading) {
        return <p className="center">Fetching Meals...</p>;
    }

    if (error) {
        return <Error title="failed to fetch meals" message={error} /> ;
    }

    return (
        <>
            <div className="meals-header">
                <button 
                    className="filter-toggle-btn"
                    onClick={() => setShowFilters(!showFilters)}
                    title="Toggle filters"
                >
                    ⚙️ Filters
                </button>
            </div>
            {showFilters && (
                <SearchBar 
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    priceFilter={priceFilter}
                    onPriceFilterChange={setPriceFilter}
                />
            )}
            <ul id="meals">
                {filteredMeals.length > 0 ? (
                    filteredMeals.map((meal) => (
                        <MealItem key={meal.id} meal={meal}/>
                    ))
                ) : (
                    <p className="center">No meals match your search. Try adjusting your filters!</p>
                )}
            </ul>
        </>
    );
}