import { useEffect } from "react";
import { useState } from "react";
import MealItem from "./MealItem";
import useHttp from "../hooks/useHttp";

const requestConfig ={};

export default function Meals() {

   const {
    data: loadedMeals,
    isLoading,
    error,
   } =  useHttp("http://localhost:3000/meals", requestConfig , []);

    // if error occurs, we can show it to the user
    if (isLoading) {
        return <p>Fetching Meals...</p>;
    }



   //!code is commented cuz we are using useHttp hook to fetch data
    // const [loadedMeals, setLoadedMeals] = useState([]);

    // useEffect(() => {
    //     async function fetchMeals() {
    //         const response = await fetch("http://localhost:3000/meals");
    //         if (!response.ok) {
    //             ///....
    //         }
    
    //         const meals = await response.json();
    //         setLoadedMeals(meals);
    //     }
    //     fetchMeals();
    // },[]);

    // if we call fetchMeals here, it will be called on every render, so we need to use useEffect


    if (isLoading) {
        return <p>Loading...</p>;
    }

    console.log(loadedMeals," loadedMeals");
    return( 
    <ul id="meals">
        {loadedMeals.map((meal) => (
    <MealItem key={meal.id} meal={meal}/>

    ))}
        {/* <button onClick={fetchMeals}>Fetch Meals</button> */}
    </ul>
    );
}