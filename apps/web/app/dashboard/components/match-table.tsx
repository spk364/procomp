'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Match, Referee } from '../page';

interface MatchTableProps {
  matches: Match[];
  referees: Referee[];
  onRefresh: () => void;
}

export function MatchTable({ matches, referees, onRefresh }: MatchTableProps) {
  const [assigningReferee, setAssigningReferee] = useState<string | null>(null);
  const [exportingMatch, setExportingMatch] = useState<string | null>(null);
  const [resettingHud, setResettingHud] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClientComponentClient();

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
      
      const { error } = await supabase
        .from('matches')
        .update({ referee_id: refereeId })
        .eq('id', matchId);

      if (error) throw error;

      // Update referee availability
      await supabase
        .from('users')
        .update({ available: false, current_match_id: matchId })
        .eq('id', refereeId);

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
      
      const { error } = await supabase
        .from('matches')
        .update({ hud_active: false })
        .eq('id', matchId);

      if (error) throw error;

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
        const dataStr = JSON.stringify(match, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `match-${match.id}.json`;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        // For PDF export, you would typically call a backend endpoint
        const response = await fetch(`/api/matches/${match.id}/export`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format: 'pdf' }),
        });
        
        if (!response.ok) throw new Error('Export failed');
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `match-${match.id}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error: any) {
      console.error('Failed to export match:', error);
      alert(`Failed to export match: ${error.message}`);
    } finally {
      setExportingMatch(null);
    }
  };

  const availableReferees = referees.filter(r => r.available || !r.currentMatchId);

  if (matches.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No matches found
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr className="border-b">
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Mat</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Match</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Athletes</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Status</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Referee</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden md:table-cell">Time</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden lg:table-cell">Score</th>
              <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground hidden lg:table-cell">HUD</th>
              <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => (
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
                    {/* Open Match Button */}
                    <button
                      onClick={() => openMatch(match.id)}
                      className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 w-8"
                      title="Open Match"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <polygon points="5,3 19,12 5,21" />
                      </svg>
                    </button>

                    {/* Assign Referee Button */}
                    <select
                      onChange={(e) => e.target.value && assignReferee(match.id, e.target.value)}
                      disabled={assigningReferee === match.id}
                      className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-2"
                      title="Assign Referee"
                      defaultValue=""
                    >
                      <option value="">Referee</option>
                      {availableReferees.map((referee) => (
                        <option key={referee.id} value={referee.id}>
                          {referee.name} {referee.available ? '(Available)' : '(Busy)'}
                        </option>
                      ))}
                    </select>

                    {/* Reset HUD Button */}
                    <button
                      onClick={() => {
                        if (confirm('Reset HUD for this match?')) {
                          resetHud(match.id);
                        }
                      }}
                      disabled={resettingHud === match.id}
                      className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 w-8"
                      title="Reset HUD"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <polyline points="1,4 1,10 7,10" />
                        <path d="M3.51,15a9,9,0,0,0,2.13,3.09L7.5,16.5" />
                        <polyline points="23,20 23,14 17,14" />
                        <path d="M20.49,9A9,9,0,0,0,18.36,5.91L16.5,7.5" />
                      </svg>
                    </button>

                    {/* Export Menu */}
                    <div className="relative">
                      <button
                        onClick={() => exportMatch(match, 'json')}
                        disabled={exportingMatch === match.id}
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 w-8"
                        title="Export JSON"
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                    </div>
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