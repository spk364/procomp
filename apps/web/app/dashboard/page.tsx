'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { TournamentSelector } from './components/tournament-selector';
import { MatchFilters } from './components/match-filters';
import { MatchTable } from './components/match-table';
import { useMatchWebSocket } from './hooks/use-match-websocket';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@procomp/ui';
import { Button } from '@procomp/ui';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@procomp/ui';

export interface Match {
  id: string;
  tournamentId: string;
  category: string;
  division: string;
  bracket: string;
  position: string;
  athlete1Id?: string;
  athlete2Id?: string;
  athlete1Name?: string;
  athlete2Name?: string;
  status: 'waiting' | 'active' | 'completed';
  score1?: number;
  score2?: number;
  winnerAthleteId?: string;
  refereeId?: string;
  refereeName?: string;
  matNumber?: number;
  startTime?: string;
  endTime?: string;
  hudActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Tournament {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'draft' | 'published' | 'active' | 'completed';
}

export interface Referee {
  id: string;
  name: string;
  email: string;
  available: boolean;
  currentMatchId?: string;
}

export interface MatchFilters {
  category: string;
  division: string;
  status: 'all' | 'waiting' | 'active' | 'completed';
}

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<string>('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [referees, setReferees] = useState<Referee[]>([]);
  const [filters, setFilters] = useState<MatchFilters>({
    category: 'all',
    division: 'all',
    status: 'all',
  });
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const supabase = createClientComponentClient();
  const router = useRouter();

  // WebSocket connection for real-time updates
  const { connectionStatus } = useMatchWebSocket({
    tournamentId: selectedTournament,
    onMatchUpdate: (updatedMatch: Match) => {
      setMatches(prev => prev.map(match => 
        match.id === updatedMatch.id ? updatedMatch : match
      ));
    },
    onRefereeUpdate: (updatedReferee: Referee) => {
      setReferees(prev => prev.map(referee =>
        referee.id === updatedReferee.id ? updatedReferee : referee
      ));
    },
  });

  // Auth check and user data fetch
  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) throw sessionError;
        
        if (!session) {
          router.push('/auth/login?redirectTo=/dashboard');
          return;
        }

        // Check user role
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (userError) throw userError;

        if (!userData || !['admin', 'organizer'].includes(userData.role)) {
          setError('Unauthorized: Only administrators and organizers can access this dashboard.');
          return;
        }

        setUser(userData);
      } catch (err: any) {
        setError(err.message || 'Failed to authenticate');
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, [supabase, router]);

  // Fetch tournaments
  useEffect(() => {
    async function fetchTournaments() {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('tournaments')
          .select('*')
          .in('status', ['published', 'active'])
          .order('startDate', { ascending: false });

        if (error) throw error;
        setTournaments(data || []);
        
        // Auto-select first tournament if available
        if (data && data.length > 0 && !selectedTournament) {
          setSelectedTournament(data[0].id);
        }
      } catch (err: any) {
        setError(`Failed to fetch tournaments: ${err.message}`);
      }
    }

    fetchTournaments();
  }, [user, supabase, selectedTournament]);

  // Fetch matches for selected tournament
  useEffect(() => {
    async function fetchMatches() {
      if (!selectedTournament) {
        setMatches([]);
        return;
      }

      try {
        setIsRefreshing(true);
        const { data, error } = await supabase
          .from('matches')
          .select(`
            *,
            athlete1:athlete1_id(name),
            athlete2:athlete2_id(name),
            referee:referee_id(name, available)
          `)
          .eq('tournament_id', selectedTournament)
          .order('mat_number', { ascending: true })
          .order('position', { ascending: true });

        if (error) throw error;

        const processedMatches = (data || []).map(match => ({
          id: match.id,
          tournamentId: match.tournament_id,
          category: match.category,
          division: match.division,
          bracket: match.bracket,
          position: match.position,
          athlete1Id: match.athlete1_id,
          athlete2Id: match.athlete2_id,
          athlete1Name: match.athlete1?.name,
          athlete2Name: match.athlete2?.name,
          status: match.status,
          score1: match.score1,
          score2: match.score2,
          winnerAthleteId: match.winner_athlete_id,
          refereeId: match.referee_id,
          refereeName: match.referee?.name,
          matNumber: match.mat_number,
          startTime: match.start_time,
          endTime: match.end_time,
          hudActive: match.hud_active,
          createdAt: match.created_at,
          updatedAt: match.updated_at,
        }));

        setMatches(processedMatches);
      } catch (err: any) {
        setError(`Failed to fetch matches: ${err.message}`);
      } finally {
        setIsRefreshing(false);
      }
    }

    fetchMatches();
  }, [selectedTournament, supabase]);

  // Fetch referees
  useEffect(() => {
    async function fetchReferees() {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, name, email, available, current_match_id')
          .eq('role', 'referee')
          .order('name');

        if (error) throw error;

        const processedReferees = (data || []).map(referee => ({
          id: referee.id,
          name: referee.name,
          email: referee.email,
          available: referee.available,
          currentMatchId: referee.current_match_id,
        }));

        setReferees(processedReferees);
      } catch (err: any) {
        setError(`Failed to fetch referees: ${err.message}`);
      }
    }

    fetchReferees();
  }, [supabase]);

  // Filter matches based on current filters
  const filteredMatches = matches.filter(match => {
    if (filters.category !== 'all' && match.category !== filters.category) return false;
    if (filters.division !== 'all' && match.division !== filters.division) return false;
    if (filters.status !== 'all' && match.status !== filters.status) return false;
    return true;
  });

  // Group matches by status
  const groupedMatches = {
    active: filteredMatches.filter(match => match.status === 'active'),
    waiting: filteredMatches.filter(match => match.status === 'waiting'),
    completed: filteredMatches.filter(match => match.status === 'completed'),
  };

  const refreshData = async () => {
    if (selectedTournament) {
      setIsRefreshing(true);
      // Trigger refetch by temporarily clearing and resetting tournament
      const currentTournament = selectedTournament;
      setSelectedTournament('');
      setTimeout(() => setSelectedTournament(currentTournament), 100);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tournament Dashboard</h1>
          <p className="text-muted-foreground">
            Manage matches, referees, and real-time tournament operations
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <div className={`h-2 w-2 rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-500' : 
              connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
            }`} />
            <span className="text-muted-foreground">
              {connectionStatus === 'connected' ? 'Live' : 
               connectionStatus === 'connecting' ? 'Connecting' : 'Disconnected'}
            </span>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={refreshData}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters and Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Tournament & Filters</CardTitle>
          <CardDescription>
            Select tournament and configure match filters
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TournamentSelector
              tournaments={tournaments}
              selectedTournament={selectedTournament}
              onTournamentChange={setSelectedTournament}
            />
            <MatchFilters
              matches={matches}
              filters={filters}
              onFiltersChange={setFilters}
            />
          </div>
        </CardContent>
      </Card>

      {/* Match Tables by Status */}
      {selectedTournament && (
        <div className="space-y-6">
          {/* Active Matches */}
          {groupedMatches.active.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-green-600">
                  Active Matches ({groupedMatches.active.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MatchTable
                  matches={groupedMatches.active}
                  referees={referees}
                  onRefresh={refreshData}
                />
              </CardContent>
            </Card>
          )}

          {/* Waiting Matches */}
          {groupedMatches.waiting.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-yellow-600">
                  Waiting Matches ({groupedMatches.waiting.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MatchTable
                  matches={groupedMatches.waiting}
                  referees={referees}
                  onRefresh={refreshData}
                />
              </CardContent>
            </Card>
          )}

          {/* Completed Matches */}
          {groupedMatches.completed.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-gray-600">
                  Completed Matches ({groupedMatches.completed.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MatchTable
                  matches={groupedMatches.completed}
                  referees={referees}
                  onRefresh={refreshData}
                />
              </CardContent>
            </Card>
          )}

          {/* No matches found */}
          {filteredMatches.length === 0 && (
            <Card>
              <CardContent className="text-center py-12">
                <p className="text-muted-foreground">
                  No matches found for the selected filters.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* No tournament selected */}
      {!selectedTournament && tournaments.length > 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">
              Please select a tournament to view matches.
            </p>
          </CardContent>
        </Card>
      )}

      {/* No tournaments available */}
      {tournaments.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">
              No active tournaments found.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 