'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@procomp/ui';
import { Label } from '@procomp/ui';
import { Calendar, Trophy } from 'lucide-react';
import type { Tournament } from '../page';

interface TournamentSelectorProps {
  tournaments: Tournament[];
  selectedTournament: string;
  onTournamentChange: (tournamentId: string) => void;
}

export function TournamentSelector({
  tournaments,
  selectedTournament,
  onTournamentChange,
}: TournamentSelectorProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusColor = (status: Tournament['status']) => {
    switch (status) {
      case 'active':
        return 'text-green-600';
      case 'published':
        return 'text-blue-600';
      case 'completed':
        return 'text-gray-600';
      default:
        return 'text-yellow-600';
    }
  };

  const getStatusLabel = (status: Tournament['status']) => {
    switch (status) {
      case 'active':
        return 'Live';
      case 'published':
        return 'Published';
      case 'completed':
        return 'Completed';
      default:
        return 'Draft';
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="tournament-select" className="text-sm font-medium">
        Select Tournament
      </Label>
      <Select value={selectedTournament} onValueChange={onTournamentChange}>
        <SelectTrigger id="tournament-select" className="w-full">
          <SelectValue placeholder="Choose a tournament...">
            {selectedTournament && (
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-muted-foreground" />
                <span>
                  {tournaments.find(t => t.id === selectedTournament)?.name}
                </span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {tournaments.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground text-center">
              No tournaments available
            </div>
          ) : (
            tournaments.map((tournament) => (
              <SelectItem key={tournament.id} value={tournament.id}>
                <div className="flex items-center justify-between w-full">
                  <div className="flex flex-col items-start gap-1">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{tournament.name}</span>
                      <span className={`text-xs px-2 py-1 rounded-full bg-opacity-10 ${getStatusColor(tournament.status)}`}>
                        {getStatusLabel(tournament.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>
                        {formatDate(tournament.startDate)} - {formatDate(tournament.endDate)}
                      </span>
                    </div>
                  </div>
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      {selectedTournament && tournaments.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Selected: {tournaments.find(t => t.id === selectedTournament)?.name}
        </div>
      )}
    </div>
  );
} 