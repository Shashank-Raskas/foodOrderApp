// Small helpers about meals shared by the menu, landing page and meal detail

/** Veg = no meat, fish or egg (the green dot Indian food apps show). */
export function isVegMeal(meal) {
  if (!meal) return false;
  if (meal.protein) return meal.protein === 'vegetarian';
  return (meal.dietary || []).some((d) => d === 'vegetarian' || d === 'vegan');
}
