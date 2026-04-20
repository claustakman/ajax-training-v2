import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export function ExerciseResultRow({ exerciseId, mins, teamId }: {
  exerciseId: string;
  mins: number;
  teamId: string;
}) {
  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises', teamId],
    queryFn: () => api.fetchExercises(),
    staleTime: 5 * 60_000,
  });
  const ex = exercises.find(e => e.id === exerciseId);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '5px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ flex: 1, fontSize: 13 }}>
        {ex?.name ?? exerciseId}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text2)', flexShrink: 0 }}>
        {mins} min
      </span>
    </div>
  );
}
