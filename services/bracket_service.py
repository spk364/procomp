"""
Bracket Engine Service for Single Elimination Tournaments

This service handles the complete lifecycle of tournament brackets:
- Generation of Single Elimination brackets with proper seeding
- Match result recording and winner propagation
- Bracket state retrieval and formatting

Author: Senior Backend Engineer
"""

import math
import random
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime, timedelta
import asyncio

# Assuming we're using SQLAlchemy with async support
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

# Import your models (adjust imports based on your project structure)
from models.tournament import Tournament, Category, Participant, Match


class BracketService:
    """Service class for managing tournament brackets"""
    
    def __init__(self, db_session: AsyncSession):
        self.db = db_session
    
    async def generate_single_elimination_bracket(
        self,
        tournament_id: int,
        category_id: int,
        seed_by_ranking: bool = False,
        match_duration_minutes: int = 15
    ) -> List[Dict[str, Any]]:
        """
        Generate a complete Single Elimination bracket for a category.
        
        Args:
            tournament_id: Tournament ID
            category_id: Category ID  
            seed_by_ranking: If True, seed by ranking_score; if False, random seeding
            match_duration_minutes: Duration between matches for scheduling
            
        Returns:
            List of Match objects representing the complete bracket
            
        Raises:
            ValueError: If insufficient participants or invalid data
        """
        
        # 1. Fetch paid participants for this category
        participants = await self._get_paid_participants(tournament_id, category_id)
        
        if len(participants) < 2:
            raise ValueError(f"Insufficient participants: {len(participants)}. Need at least 2.")
        
        # 2. Seed participants (random or by ranking)
        seeded_participants = await self._seed_participants(participants, seed_by_ranking)
        
        # 3. Calculate bracket structure
        bracket_size = self._calculate_bracket_size(len(participants))
        num_byes = bracket_size - len(participants)
        
        # 4. Generate all matches for the tournament
        all_matches = await self._create_bracket_matches(
            tournament_id=tournament_id,
            category_id=category_id,
            participants=seeded_participants,
            bracket_size=bracket_size,
            num_byes=num_byes,
            match_duration_minutes=match_duration_minutes
        )
        
        # 5. Save matches to database
        await self._save_matches_to_db(all_matches)
        
        return all_matches
    
    async def record_match_result(
        self,
        match_id: int,
        winner_id: int,
        loser_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Record the result of a match and propagate winner to next round.
        
        Args:
            match_id: ID of the completed match
            winner_id: ID of the winning participant
            loser_id: ID of the losing participant (optional, for validation)
            
        Returns:
            Dict containing match result and next match info
            
        Raises:
            ValueError: If invalid match or participant data
        """
        
        # 1. Fetch and validate the match
        match = await self._get_match_with_participants(match_id)
        if not match:
            raise ValueError(f"Match {match_id} not found")
        
        if match.get('winner_id'):
            raise ValueError(f"Match {match_id} already has a winner")
        
        # 2. Validate winner is a participant in this match
        if winner_id not in [match.get('fighter1_id'), match.get('fighter2_id')]:
            raise ValueError(f"Winner {winner_id} is not a participant in match {match_id}")
        
        # 3. Optional loser validation
        if loser_id and loser_id not in [match.get('fighter1_id'), match.get('fighter2_id')]:
            raise ValueError(f"Loser {loser_id} is not a participant in match {match_id}")
        
        try:
            # 4. Update match with winner and completion time
            await self._update_match_result(match_id, winner_id)
            
            # 5. Propagate winner to next match (if exists)
            next_match_updated = None
            if match.get('next_match_id'):
                next_match_updated = await self._propagate_winner_to_next_match(
                    current_match=match,
                    winner_id=winner_id
                )
            
            await self.db.commit()
            
            return {
                "match_id": match_id,
                "winner_id": winner_id,
                "completed_at": datetime.utcnow().isoformat(),
                "next_match_updated": next_match_updated,
                "is_tournament_complete": await self._check_tournament_completion(
                    match.get('tournament_id'), match.get('category_id')
                )
            }
            
        except Exception as e:
            await self.db.rollback()
            raise ValueError(f"Failed to record match result: {str(e)}")
    
    async def get_bracket(
        self,
        tournament_id: int,
        category_id: int,
        format_type: str = "nested"
    ) -> Dict[str, Any]:
        """
        Retrieve the complete bracket structure for a category.
        
        Args:
            tournament_id: Tournament ID
            category_id: Category ID
            format_type: "nested" for tree structure, "rounds" for flat by rounds
            
        Returns:
            Dict containing the bracket structure and metadata
        """
        
        # Fetch all matches for this category
        matches = await self._get_category_matches(tournament_id, category_id)
        
        if not matches:
            return {
                "tournament_id": tournament_id,
                "category_id": category_id,
                "status": "not_generated",
                "matches": [],
                "rounds": 0
            }
        
        if format_type == "nested":
            bracket_data = await self._format_bracket_nested(matches)
        else:
            bracket_data = await self._format_bracket_by_rounds(matches)
        
        # Add metadata
        bracket_data.update({
            "tournament_id": tournament_id,
            "category_id": category_id,
            "total_matches": len(matches),
            "completed_matches": len([m for m in matches if m.get('winner_id')]),
            "status": await self._get_bracket_status(matches)
        })
        
        return bracket_data
    
    # ============= PRIVATE HELPER METHODS =============
    
    async def _get_paid_participants(self, tournament_id: int, category_id: int) -> List[Dict[str, Any]]:
        """Fetch all paid participants for a category"""
        # SQL query to get paid participants
        query = """
        SELECT p.id, p.user_id, p.ranking_score, p.created_at, u.name as user_name
        FROM participants p
        JOIN users u ON p.user_id = u.id
        WHERE p.tournament_id = :tournament_id 
        AND p.category_id = :category_id 
        AND p.payment_status = 'paid'
        ORDER BY p.created_at
        """
        
        result = await self.db.execute(
            query, 
            {"tournament_id": tournament_id, "category_id": category_id}
        )
        
        return [dict(row) for row in result.fetchall()]
    
    async def _seed_participants(self, participants: List[Dict[str, Any]], by_ranking: bool) -> List[Dict[str, Any]]:
        """Seed participants either randomly or by ranking score"""
        if by_ranking:
            # Sort by ranking_score (higher is better), then by registration date
            return sorted(
                participants,
                key=lambda p: (p.get('ranking_score') or 0, p.get('created_at')),
                reverse=True
            )
        else:
            # Random seeding
            seeded = participants.copy()
            random.shuffle(seeded)
            return seeded
    
    def _calculate_bracket_size(self, num_participants: int) -> int:
        """Calculate the bracket size (next power of 2)"""
        return 2 ** math.ceil(math.log2(num_participants))
    
    async def _create_bracket_matches(
        self,
        tournament_id: int,
        category_id: int,
        participants: List[Dict[str, Any]],
        bracket_size: int,
        num_byes: int,
        match_duration_minutes: int
    ) -> List[Dict[str, Any]]:
        """Create all matches for the bracket structure"""
        
        all_matches = []
        total_rounds = int(math.log2(bracket_size))
        
        # Start time for first round (you can adjust this logic)
        base_start_time = datetime.utcnow() + timedelta(hours=1)
        
        # Generate matches for each round
        match_id = 1
        
        # First, create the structure round by round
        for round_num in range(1, total_rounds + 1):
            matches_in_round = bracket_size // (2 ** round_num)
            
            for position in range(1, matches_in_round + 1):
                # Calculate next match ID for winner advancement
                next_match_id = None
                if round_num < total_rounds:
                    # Winner goes to specific match in next round
                    next_match_id = match_id + matches_in_round + ((position - 1) // 2)
                
                match = {
                    "id": match_id,
                    "round": round_num,
                    "bracket_position": position,
                    "fighter1_id": None,
                    "fighter2_id": None,
                    "winner_id": None,
                    "tournament_id": tournament_id,
                    "category_id": category_id,
                    "next_match_id": next_match_id,
                    "scheduled_time": base_start_time + timedelta(
                        minutes=match_duration_minutes * (round_num - 1) * 60
                    ),
                    "completed_at": None
                }
                
                all_matches.append(match)
                match_id += 1
        
        # Now assign participants to first round matches
        await self._assign_participants_to_first_round(
            all_matches, participants, bracket_size, num_byes, total_rounds
        )
        
        return all_matches
    
    async def _assign_participants_to_first_round(
        self,
        all_matches: List[Dict[str, Any]],
        participants: List[Dict[str, Any]],
        bracket_size: int,
        num_byes: int,
        total_rounds: int
    ):
        """Assign participants to first round matches, handling byes"""
        
        first_round_matches = [m for m in all_matches if m['round'] == 1]
        first_round_matches.sort(key=lambda m: m['bracket_position'])
        
        participant_index = 0
        
        for i, match in enumerate(first_round_matches):
            # Distribute byes at the beginning of the bracket
            if i < num_byes:
                # This match gets a bye - only assign one fighter
                if participant_index < len(participants):
                    match['fighter1_id'] = participants[participant_index]['id']
                    match['fighter2_id'] = None  # Bye
                    # Auto-advance the winner for bye matches
                    match['winner_id'] = participants[participant_index]['id']
                    match['completed_at'] = datetime.utcnow()
                    participant_index += 1
            else:
                # Regular match with two fighters
                if participant_index < len(participants):
                    match['fighter1_id'] = participants[participant_index]['id']
                    participant_index += 1
                if participant_index < len(participants):
                    match['fighter2_id'] = participants[participant_index]['id']
                    participant_index += 1
    
    async def _save_matches_to_db(self, matches: List[Dict[str, Any]]):
        """Save all matches to the database"""
        for match in matches:
            query = """
            INSERT INTO matches (
                round, bracket_position, fighter1_id, fighter2_id, winner_id,
                tournament_id, category_id, next_match_id, scheduled_time, completed_at
            ) VALUES (
                :round, :bracket_position, :fighter1_id, :fighter2_id, :winner_id,
                :tournament_id, :category_id, :next_match_id, :scheduled_time, :completed_at
            )
            """
            await self.db.execute(query, match)
        
        await self.db.commit()
    
    async def _get_match_with_participants(self, match_id: int) -> Optional[Dict[str, Any]]:
        """Fetch a match with participant details"""
        query = """
        SELECT m.*, 
               f1.user_id as fighter1_user_id, u1.name as fighter1_name,
               f2.user_id as fighter2_user_id, u2.name as fighter2_name,
               w.user_id as winner_user_id, u3.name as winner_name
        FROM matches m
        LEFT JOIN participants f1 ON m.fighter1_id = f1.id
        LEFT JOIN users u1 ON f1.user_id = u1.id
        LEFT JOIN participants f2 ON m.fighter2_id = f2.id
        LEFT JOIN users u2 ON f2.user_id = u2.id
        LEFT JOIN participants w ON m.winner_id = w.id
        LEFT JOIN users u3 ON w.user_id = u3.id
        WHERE m.id = :match_id
        """
        
        result = await self.db.execute(query, {"match_id": match_id})
        row = result.fetchone()
        
        return dict(row) if row else None
    
    async def _update_match_result(self, match_id: int, winner_id: int):
        """Update match with winner and completion time"""
        query = """
        UPDATE matches 
        SET winner_id = :winner_id, completed_at = :completed_at
        WHERE id = :match_id
        """
        
        await self.db.execute(query, {
            "match_id": match_id,
            "winner_id": winner_id,
            "completed_at": datetime.utcnow()
        })
    
    async def _propagate_winner_to_next_match(
        self, 
        current_match: Dict[str, Any], 
        winner_id: int
    ) -> Dict[str, Any]:
        """Propagate winner to the next match in the bracket"""
        
        next_match_id = current_match.get('next_match_id')
        if not next_match_id:
            return {"message": "Final match - no propagation needed"}
        
        # Determine if winner goes to fighter1 or fighter2 slot in next match
        # Logic: odd bracket positions go to fighter1, even go to fighter2
        if current_match['bracket_position'] % 2 == 1:
            update_field = "fighter1_id"
        else:
            update_field = "fighter2_id"
        
        query = f"""
        UPDATE matches 
        SET {update_field} = :winner_id
        WHERE id = :next_match_id
        """
        
        await self.db.execute(query, {
            "winner_id": winner_id,
            "next_match_id": next_match_id
        })
        
        return {
            "next_match_id": next_match_id,
            "position_filled": update_field,
            "winner_advanced": winner_id
        }
    
    async def _get_category_matches(self, tournament_id: int, category_id: int) -> List[Dict[str, Any]]:
        """Get all matches for a category"""
        query = """
        SELECT m.*, 
               f1.user_id as fighter1_user_id, u1.name as fighter1_name,
               f2.user_id as fighter2_user_id, u2.name as fighter2_name,
               w.user_id as winner_user_id, u3.name as winner_name
        FROM matches m
        LEFT JOIN participants f1 ON m.fighter1_id = f1.id
        LEFT JOIN users u1 ON f1.user_id = u1.id
        LEFT JOIN participants f2 ON m.fighter2_id = f2.id
        LEFT JOIN users u2 ON f2.user_id = u2.id
        LEFT JOIN participants w ON m.winner_id = w.id
        LEFT JOIN users u3 ON w.user_id = u3.id
        WHERE m.tournament_id = :tournament_id 
        AND m.category_id = :category_id
        ORDER BY m.round, m.bracket_position
        """
        
        result = await self.db.execute(query, {
            "tournament_id": tournament_id,
            "category_id": category_id
        })
        
        return [dict(row) for row in result.fetchall()]
    
    async def _format_bracket_nested(self, matches: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Format bracket as nested tree structure"""
        # Group matches by round
        rounds = {}
        for match in matches:
            round_num = match['round']
            if round_num not in rounds:
                rounds[round_num] = []
            
            rounds[round_num].append({
                "id": match['id'],
                "bracket_position": match['bracket_position'],
                "fighter1": {
                    "id": match['fighter1_id'],
                    "name": match.get('fighter1_name')
                } if match['fighter1_id'] else None,
                "fighter2": {
                    "id": match['fighter2_id'],
                    "name": match.get('fighter2_name')
                } if match['fighter2_id'] else None,
                "winner": {
                    "id": match['winner_id'],
                    "name": match.get('winner_name')
                } if match['winner_id'] else None,
                "scheduled_time": match['scheduled_time'].isoformat() if match['scheduled_time'] else None,
                "completed_at": match['completed_at'].isoformat() if match['completed_at'] else None,
                "status": "completed" if match['winner_id'] else "pending",
                "next_match_id": match['next_match_id']
            })
        
        return {
            "format": "nested",
            "rounds": rounds,
            "total_rounds": len(rounds)
        }
    
    async def _format_bracket_by_rounds(self, matches: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Format bracket as flat list organized by rounds"""
        rounds_data = {}
        
        for match in matches:
            round_key = f"round_{match['round']}"
            if round_key not in rounds_data:
                rounds_data[round_key] = {
                    "round_number": match['round'],
                    "matches": []
                }
            
            rounds_data[round_key]["matches"].append({
                "id": match['id'],
                "bracket_position": match['bracket_position'],
                "fighter1_id": match['fighter1_id'],
                "fighter1_name": match.get('fighter1_name'),
                "fighter2_id": match['fighter2_id'],
                "fighter2_name": match.get('fighter2_name'),
                "winner_id": match['winner_id'],
                "winner_name": match.get('winner_name'),
                "scheduled_time": match['scheduled_time'].isoformat() if match['scheduled_time'] else None,
                "completed_at": match['completed_at'].isoformat() if match['completed_at'] else None,
                "next_match_id": match['next_match_id'],
                "status": "completed" if match['winner_id'] else "pending"
            })
        
        return {
            "format": "rounds",
            "rounds": rounds_data,
            "total_rounds": len(rounds_data)
        }
    
    async def _get_bracket_status(self, matches: List[Dict[str, Any]]) -> str:
        """Determine the overall status of the bracket"""
        if not matches:
            return "not_generated"
        
        completed_matches = [m for m in matches if m.get('winner_id')]
        
        if len(completed_matches) == 0:
            return "ready"
        elif len(completed_matches) == len(matches):
            return "completed"
        else:
            return "in_progress"
    
    async def _check_tournament_completion(self, tournament_id: int, category_id: int) -> bool:
        """Check if the tournament category is complete"""
        matches = await self._get_category_matches(tournament_id, category_id)
        
        if not matches:
            return False
        
        # Tournament is complete when the final match (highest round) has a winner
        final_match = max(matches, key=lambda m: m['round'])
        return final_match.get('winner_id') is not None


# ============= UTILITY FUNCTIONS =============

async def create_bracket_for_category(
    db_session: AsyncSession,
    tournament_id: int,
    category_id: int,
    **kwargs
) -> List[Dict[str, Any]]:
    """Convenience function to create a bracket for a category"""
    service = BracketService(db_session)
    return await service.generate_single_elimination_bracket(
        tournament_id=tournament_id,
        category_id=category_id,
        **kwargs
    )

async def record_match_winner(
    db_session: AsyncSession,
    match_id: int,
    winner_id: int
) -> Dict[str, Any]:
    """Convenience function to record a match result"""
    service = BracketService(db_session)
    return await service.record_match_result(match_id, winner_id)

async def get_tournament_bracket(
    db_session: AsyncSession,
    tournament_id: int,
    category_id: int,
    format_type: str = "nested"
) -> Dict[str, Any]:
    """Convenience function to get bracket data"""
    service = BracketService(db_session)
    return await service.get_bracket(tournament_id, category_id, format_type)


# ============= EXAMPLE USAGE =============

"""
Example usage of the Bracket Service:

# 1. Generate a bracket for a category
async def generate_bracket_example():
    async with get_db_session() as db:
        service = BracketService(db)
        matches = await service.generate_single_elimination_bracket(
            tournament_id=1,
            category_id=2,
            seed_by_ranking=True
        )
        print(f"Generated {len(matches)} matches")

# 2. Record match results
async def record_result_example():
    async with get_db_session() as db:
        service = BracketService(db)
        result = await service.record_match_result(
            match_id=1,
            winner_id=123
        )
        print(f"Match result: {result}")

# 3. Get bracket data
async def get_bracket_example():
    async with get_db_session() as db:
        service = BracketService(db)
        bracket = await service.get_bracket(
            tournament_id=1,
            category_id=2,
            format_type="nested"
        )
        print(f"Bracket status: {bracket['status']}")
""" 