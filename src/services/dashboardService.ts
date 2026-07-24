import { supabase } from '../lib/supabase';

export type DashboardCounts = {
  facultyCount: number;
  laboratoryCount: number;
  todayAccessCount: number;
};

export async function getDashboardCounts(): Promise<DashboardCounts> {
  const { start, end } = getTodayBounds();

  const [facultyResult, labResult, accessResult] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('laboratories').select('id', { count: 'exact', head: true }),
    supabase
      .from('access_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString()),
  ]);

  if (facultyResult.error) throw facultyResult.error;
  if (labResult.error) throw labResult.error;
  if (accessResult.error) throw accessResult.error;

  return {
    facultyCount: facultyResult.count ?? 0,
    laboratoryCount: labResult.count ?? 0,
    todayAccessCount: accessResult.count ?? 0,
  };
}

function getTodayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 1);

  return { start, end };
}
