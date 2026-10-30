'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { SearchBar, FilterChoice, FilterTag, FilterLabel } from './Filters';

export type FilterGroup<F extends Record<string, string>> = { key: keyof F & string; label: string; options: { value: string; label: string }[] };

/**
 * The list-page toolbar: search with a filter toggle, the result count, the folding
 * filter panel of chips, and the active filter tags with "Clear all".
 */
export default function ListToolbar<F extends Record<string, string>>({ search, onSearch, placeholder, label, count, showFilters, onToggleFilters, filters, groups, onFilter, onClear, hasActiveFilters, extra }: {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  label: string;
  count: number;
  showFilters: boolean;
  onToggleFilters: () => void;
  filters: F;
  groups: FilterGroup<F>[];
  onFilter: (key: keyof F & string, value: string) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
  extra?: ReactNode;
}) {
  const activeTags = groups.flatMap(group => {
    const value = filters[group.key];
    if (value === 'All') return [];
    const option = group.options.find(entry => entry.value === value);
    return [{ key: group.key, label: `${group.label}: ${option?.label ?? value}` }];
  });
  return (
    <div className="space-y-3 border-b border-gray-100 p-3 sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchBar value={search} onChange={onSearch} placeholder={placeholder} label={label} showFilters={showFilters} onToggleFilters={onToggleFilters} hasActiveFilters={hasActiveFilters} />
        </div>
        {extra}
        <p className="shrink-0 !text-[13px] !text-gray-400 sm:pl-2">{count} result{count === 1 ? '' : 's'}</p>
      </div>
      {showFilters && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="grid gap-4 overflow-hidden rounded-xl bg-gray-50 p-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map(group => (
            <div key={group.key}>
              <FilterLabel>{group.label}</FilterLabel>
              <div className="flex flex-wrap gap-2">
                <FilterChoice label="All" selected={filters[group.key] === 'All'} onClick={() => onFilter(group.key, 'All')} />
                {group.options.map(option => <FilterChoice key={option.value} label={option.label} selected={filters[group.key] === option.value} onClick={() => onFilter(group.key, option.value)} />)}
              </div>
            </div>
          ))}
        </motion.div>
      )}
      {activeTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeTags.map(tag => <FilterTag key={tag.key} label={tag.label} onRemove={() => onFilter(tag.key, 'All')} />)}
          <button type="button" onClick={onClear} className="text-[12px] font-semibold text-primary hover:text-primary-dark">Clear all</button>
        </div>
      )}
    </div>
  );
}
