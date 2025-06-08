import { useEffect } from "react";
import { useState } from "react";
import MealItem from "./MealItem";


export default function Meals() {
    const [loadedMeals, setLoadedMeals] = useState([]);

    useEffect(() => {
        async function fetchMeals() {
            const response = await fetch("http://localhost:3000/meals");
            if (!response.ok) {
                ///....
            }
    
            const meals = await response.json();
            setLoadedMeals(meals);
        }
        fetchMeals();
    },[]);

    // if we call fetchMeals here, it will be called on every render, so we need to use useEffect
    return( 
    <ul id="meals">
        {loadedMeals.map((meal) => (
    <MealItem key={meal.id} meal={meal}/>

    ))}
        {/* <button onClick={fetchMeals}>Fetch Meals</button> */}
    </ul>
    );
}