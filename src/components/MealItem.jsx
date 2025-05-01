import { currencyFormatter } from "../util/formatting"
import Button from "./UI/Button"

export default function MealItem({meal}) {
    //! we are using url in img prop cuz we need to get the data from backend
    return <li className="meal-item">
        <article>
            <img src={`http://localhost:3000/${meal.image}`} alt={meal.name}/>
            <div>
                <h3>{meal.name}</h3>
                <p className="meal-item-price">{currencyFormatter.format(meal.price)}</p>
                <p className="meal-item-description">{meal.description}</p>
            </div>
            <p className="meal-item-actions">
                <Button>Add to cart</Button>
            </p>
        </article>
        </li>
}