import { useEffect } from "react";
import { useState } from "react";
import MealItem from "./MealItem";
import useHttp from "../hooks/useHttp";
import Error from "./Error";
import { API_ENDPOINTS } from "../config/api";

const requestConfig = {};

export default function Meals() {

   const {
    data: loadedMeals,
    isLoading,
    error,
   } = useHttp(API_ENDPOINTS.MEALS, requestConfig, []);

    if (isLoading) {
        return <p className="center">Fetching Meals...</p>;
    }

    if (error) {
       return <Error title="failed to fetch meals" message={error} /> ;
    }

    return( 
    <ul id="meals">
        {loadedMeals.map((meal) => (
            <MealItem key={meal.id} meal={meal}/>
        ))}
    </ul>
    );
}