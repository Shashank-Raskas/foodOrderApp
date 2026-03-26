import { createContext, useState } from 'react';

const SearchContext = createContext({
  searchTerm: '',
  setSearchTerm: () => {},
});

export function SearchContextProvider({ children }) {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <SearchContext.Provider value={{ searchTerm, setSearchTerm }}>
      {children}
    </SearchContext.Provider>
  );
}

export default SearchContext;
