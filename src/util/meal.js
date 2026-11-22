// Small helpers about meals shared by the menu, landing page and meal detail

// Some protein filter options cover more than one stored value ("Beef / Lamb", "Fish / Seafood")
const PROTEIN_FILTER_GROUPS = { beef: ['beef', 'lamb'], fish: ['fish', 'seafood'] };

/** Whether a meal matches the protein options ticked in the menu filter (an empty selection matches all). */
export function matchesProteinFilter(selected, protein) {
  if (!selected?.length) return true;
  return selected.some((option) => (PROTEIN_FILTER_GROUPS[option] || [option]).includes(protein));
}

/** Veg = no meat, fish or egg (the green dot Indian food apps show). */
export function isVegMeal(meal) {
  if (!meal) return false;
  if (meal.protein) return meal.protein === 'vegetarian';
  return (meal.dietary || []).some((d) => d === 'vegetarian' || d === 'vegan');
}
