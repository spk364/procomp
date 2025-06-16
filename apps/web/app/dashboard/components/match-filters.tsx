'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@procomp/ui';
import { Label } from '@procomp/ui';
import { Filter } from 'lucide-react';
import type { Match, MatchFilters as MatchFiltersType } from '../page';

interface MatchFiltersProps {
  matches: Match[];
  filters: MatchFiltersType;
  onFiltersChange: (filters: MatchFiltersType) => void;
}

export function MatchFilters({
  matches,
  filters,
  onFiltersChange,
}: MatchFiltersProps) {
  // Extract unique categories and divisions from matches
  const categories = Array.from(new Set(matches.map(match => match.category))).sort();
  const divisions = Array.from(new Set(matches.map(match => match.division))).sort();

  const updateFilter = (key: keyof MatchFiltersType, value: string) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    });
  };

  const statusOptions = [
    { value: 'all', label: 'All Statuses', count: matches.length },
    { value: 'waiting', label: 'Waiting', count: matches.filter(m => m.status === 'waiting').length },
    { value: 'active', label: 'Active', count: matches.filter(m => m.status === 'active').length },
    { value: 'completed', label: 'Completed', count: matches.filter(m => m.status === 'completed').length },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-600';
      case 'waiting':
        return 'text-yellow-600';
      case 'completed':
        return 'text-gray-600';
      default:
        return 'text-blue-600';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm font-medium">Filters</Label>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Category Filter */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Category</Label>
          <Select
            value={filters.category}
            onValueChange={(value) => updateFilter('category', value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories ({matches.length})</SelectItem>
              {categories.map((category) => {
                const count = matches.filter(m => m.category === category).length;
                return (
                  <SelectItem key={category} value={category}>
                    {category} ({count})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Division Filter */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Division</Label>
          <Select
            value={filters.division}
            onValueChange={(value) => updateFilter('division', value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Divisions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Divisions ({matches.length})</SelectItem>
              {divisions.map((division) => {
                const count = matches.filter(m => m.division === division).length;
                return (
                  <SelectItem key={division} value={division}>
                    {division} ({count})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Status Filter */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select
            value={filters.status}
            onValueChange={(value) => updateFilter('status', value as MatchFiltersType['status'])}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex items-center gap-2">
                    <span className={option.value !== 'all' ? getStatusColor(option.value) : ''}>
                      {option.label}
                    </span>
                    <span className="text-muted-foreground">({option.count})</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Active Filters Summary */}
      {(filters.category !== 'all' || filters.division !== 'all' || filters.status !== 'all') && (
        <div className="text-xs text-muted-foreground">
          Active filters: {' '}
          {filters.category !== 'all' && `Category: ${filters.category}`}
          {filters.category !== 'all' && (filters.division !== 'all' || filters.status !== 'all') && ', '}
          {filters.division !== 'all' && `Division: ${filters.division}`}
          {filters.division !== 'all' && filters.status !== 'all' && ', '}
          {filters.status !== 'all' && `Status: ${filters.status}`}
        </div>
      )}
    </div>
  );
} 