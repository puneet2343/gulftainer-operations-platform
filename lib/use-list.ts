'use client';

import { useMemo, useState } from 'react';

/**
 * Search, filters and pagination for list pages. Filters are a flat record of
 * string values; 'All' means no filter.
 */
export function useList<T, F extends Record<string, string>>(items: T[], options: {
  pageSize?: number;
  initialFilters: F;
  search: (item: T, query: string) => boolean;
  filter: (item: T, filters: F) => boolean;
  sort?: (a: T, b: T) => number;
}) {
  const { pageSize = 10, initialFilters } = options;
  const [search, setSearchState] = useState('');
  const [filters, setFiltersState] = useState<F>(initialFilters);
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = items.filter(item => options.filter(item, filters) && (!query || options.search(item, query)));
    return options.sort ? [...result].sort(options.sort) : result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const hasActiveFilters = Object.keys(filters).some(key => filters[key] !== initialFilters[key]);

  function setSearch(value: string) { setSearchState(value); setPage(1); }
  function setFilter<K extends keyof F>(key: K, value: F[K]) { setFiltersState(current => ({ ...current, [key]: value })); setPage(1); }
  function clearFilters() { setFiltersState(initialFilters); setSearchState(''); setPage(1); }

  return { search, setSearch, filters, setFilter, clearFilters, hasActiveFilters, showFilters, setShowFilters, page: safePage, setPage, totalPages, filtered, pageItems, pageSize };
}
