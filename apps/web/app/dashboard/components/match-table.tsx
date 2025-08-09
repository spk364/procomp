'use client';

import { useState, useMemo, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Match, Referee } from '../page';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Button, Input } from '@procomp/ui';
import { useMatchStore } from '../hooks/use-match-store';
import { AssignRefereeDialog } from './assign-referee-dialog';

interface MatchTableProps {
  matches: Match[];
  referees: Referee[];
  onRefresh: () => void;
}

export function MatchTable({ matches, referees, onRefresh }: MatchTableProps) {
  const store = useMatchStore();
  const matchesFromStore = useMatchStore(s => s.matches);
  const refereesFromStore = useMatchStore(s => s.referees);
  const sourceRows = matchesFromStore && matchesFromStore.length ? matchesFromStore : matches;
  const visibleMatches = useMemo(() => store.applySearchAndSort(sourceRows), [store, sourceRows]);
  const [assigningReferee, setAssigningReferee] = useState<string | null>(null);
  const [exportingMatch, setExportingMatch] = useState<string | null>(null);
  const [resettingHud, setResettingHud] = useState<string | null>(null);
  const router = useRouter();
  

  const getStatusBadge = (status: Match['status']) => {
    const badgeClass = status === 'active' 
      ? 'bg-green-100 text-green-800 border-green-200' 
      : status === 'waiting'
      ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
      : 'bg-gray-100 text-gray-800 border-gray-200';
    
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${badgeClass}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getRefereeStatus = (match: Match) => {
    if (!match.refereeId) {
      return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border-red-200">No Referee</span>;
    }
    
    const referee = referees.find(r => r.id === match.refereeId);
    if (!referee) {
      return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border">Unknown</span>;
    }

    const statusClass = referee.available 
      ? 'bg-green-100 text-green-800 border-green-200'
      : 'bg-red-100 text-red-800 border-red-200';
    
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${statusClass}`}>
        {referee.available ? 'Available' : 'Busy'}
      </span>
    );
  };

  const getHudStatus = (match: Match) => {
    if (match.hudActive) {
      return (
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
          <span className="text-xs text-blue-600">Active</span>
        </div>
      );
    }
    return <span className="text-xs text-gray-500">Inactive</span>;
  };

  const formatTime = (timeString?: string) => {
    if (!timeString) return '--';
    const date = new Date(timeString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const assignReferee = async (matchId: string, refereeId: string) => {
    try {
      setAssigningReferee(matchId);
      await store.assignReferee(matchId, refereeId)
      onRefresh();
    } catch (error: any) {
      console.error('Failed to assign referee:', error);
      alert(`Failed to assign referee: ${error.message}`);
    } finally {
      setAssigningReferee(null);
    }
  };

  const openMatch = (matchId: string) => {
    router.push(`/referee/${matchId}`);
  };

  const resetHud = async (matchId: string) => {
    try {
      setResettingHud(matchId);
      await store.toggleHud(matchId)
      onRefresh();
    } catch (error: any) {
      console.error('Failed to reset HUD:', error);
      alert(`Failed to reset HUD: ${error.message}`);
    } finally {
      setResettingHud(null);
    }
  };

  const exportMatch = async (match: Match, format: 'json' | 'pdf') => {
    try {
      setExportingMatch(match.id);
      if (format === 'json') {
        const data = await import('../../../lib/api-client').then(m => m.api.exportMatch(match.id, 'json'))
        const dataStr = JSON.stringify(data, null, 2)
        const dataBlob = new Blob([dataStr], { type: 'application/json' })
        const url = URL.createObjectURL(dataBlob)
        const link = document.createElement('a')
        link.href = url
        link.download = `match-${match.id}.json`
        link.click()
        URL.revokeObjectURL(url)
      } else {
        const blob = await import('../../../lib/api-client').then(m => m.api.exportMatch(match.id, 'pdf' as any)) as Blob
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `match-${match.id}.pdf`
        link.click()
        URL.revokeObjectURL(url)
      }
    } catch (error: any) {
      console.error('Failed to export match:', error);
      alert(`Failed to export match: ${error.message}`);
    } finally {
      setExportingMatch(null);
    }
  };

  const availableReferees = referees.filter(r => r.available || !r.currentMatchId);

  // expose referee list to store for name lookup
  if (referees.length) {
    store.setReferees(referees)
  }

  if (visibleMatches.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No matches found
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="p-2 flex items-center gap-2">
        <Input
          placeholder="Search matches..."
          onChange={(e: ChangeEvent<HTMLInputElement>) => store.setSearchQuery(e.target.value)}
          aria-label="Search matches"
          className="max-w-xs"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr className="border-b">
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                <button className="hover:underline" onClick={() => store.setSort('mat')} aria-label="Sort by Mat">Mat</button>
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Match</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Athletes</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                <button className="hover:underline" onClick={() => store.setSort('status')} aria-label="Sort by Status">Status</button>
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                <button className="hover:underline" onClick={() => store.setSort('referee')} aria-label="Sort by Referee">Referee</button>
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden md:table-cell">
                <button className="hover:underline" onClick={() => store.setSort('updatedAt')} aria-label="Sort by Updated">Time</button>
              </th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden lg:table-cell">Score</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden lg:table-cell">HUD</th>
              <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleMatches.map((match) => (
              <tr key={match.id} className="border-b hover:bg-muted/50">
                <td className="p-4 align-middle">
                  <div className="flex items-center gap-1">
                    <svg className="h-3 w-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="font-medium">{match.matNumber || '--'}</span>
                  </div>
                </td>
                
                <td className="p-4 align-middle">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">
                      {match.category} - {match.division}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {match.bracket} • Position {match.position}
                    </div>
                  </div>
                </td>
                
                <td className="p-4 align-middle">
                  <div className="space-y-1 min-w-32">
                    <div className="flex items-center gap-1 text-sm">
                      <svg className="h-3 w-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                      </svg>
                      {match.athlete1Name || 'TBD'}
                    </div>
                    <div className="text-xs text-muted-foreground text-center">vs</div>
                    <div className="text-sm">{match.athlete2Name || 'TBD'}</div>
                  </div>
                </td>
                
                <td className="p-4 align-middle">{getStatusBadge(match.status)}</td>
                
                <td className="p-4 align-middle">
                  <div className="space-y-1">
                    <div className="text-sm">{match.refereeName || 'Not assigned'}</div>
                    <div>{getRefereeStatus(match)}</div>
                  </div>
                </td>
                
                <td className="p-4 align-middle hidden md:table-cell">
                  <div className="space-y-1 text-xs">
                    {match.startTime && (
                      <div className="flex items-center gap-1">
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12,6 12,12 16,14" />
                        </svg>
                        {formatTime(match.startTime)}
                      </div>
                    )}
                    {match.endTime && (
                      <div className="text-muted-foreground">
                        End: {formatTime(match.endTime)}
                      </div>
                    )}
                  </div>
                </td>
                
                <td className="p-4 align-middle hidden lg:table-cell">
                  {match.status === 'completed' ? (
                    <div className="flex items-center gap-2">
                      <svg className="h-3 w-3 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 11l5 5L20 5" />
                      </svg>
                      <span className="text-sm">
                        {match.score1 || 0} - {match.score2 || 0}
                      </span>
                    </div>
                  ) : match.status === 'active' ? (
                    <div className="text-sm text-muted-foreground">
                      {match.score1 || 0} - {match.score2 || 0}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">--</span>
                  )}
                </td>
                
                <td className="p-4 align-middle hidden lg:table-cell">
                  {getHudStatus(match)}
                </td>
                
                <td className="p-4 align-middle text-right">
                  <div className="flex items-center justify-end gap-2">
                    {/* Open/Actions */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" aria-label="Actions" title="Actions">⋯</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openMatch(match.id)}>Open Match</DropdownMenuItem>
                        {match.status !== 'active' && (
                          <DropdownMenuItem onSelect={() => store.startMatch(match.id)}>Start</DropdownMenuItem>
                        )}
                        {match.status === 'active' && (
                          <DropdownMenuItem onSelect={() => store.pauseMatch(match.id)}>Pause</DropdownMenuItem>
                        )}
                        {match.status !== 'completed' && (
                          <DropdownMenuItem onSelect={() => store.endMatch(match.id)}>End</DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={() => exportMatch(match, 'json')}>Export JSON</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Assign Referee */}
                    <AssignRefereeDialog
                      referees={availableReferees}
                      onAssign={(refId) => assignReferee(match.id, refId)}
                      disabled={assigningReferee === match.id}
                      trigger={
                        <Button variant="outline" size="icon" aria-label="Assign Referee" title="Assign Referee">
                          R
                        </Button>
                      }
                    />

                    {/* HUD toggle */}
                    <Button
                      onClick={() => resetHud(match.id)}
                      disabled={resettingHud === match.id}
                      variant="outline"
                      size="icon"
                      aria-label="Toggle HUD"
                      title="Toggle HUD"
                    >
                      {match.hudActive ? '⦿' : '○'}
                    </Button>

                                          {/* Export JSON shortcut */}
                      <Button
                        onClick={() => exportMatch(match, 'json')}
                        disabled={exportingMatch === match.id}
                        variant="outline"
                        size="icon"
                        aria-label="Export JSON"
                        title="Export JSON"
                      >
                        ⤓
                      </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 