import { FileUp, Plus } from 'lucide-react';
import { useActions } from '../state/actions.ts';

export function EmptyState() {
  const actions = useActions();
  return (
    <div className="empty-wrap">
      <div className="empty">
        <h2>Plot your first class</h2>
        <p>Drag down any day to block out a class, or add one with a form. Old schedule.json files can be imported as-is.</p>
        <div className="empty-actions">
          <button type="button" className="btn btn-primary" onClick={actions.newCourse}>
            <Plus aria-hidden /> Add a class
          </button>
          <label className="btn btn-secondary">
            <FileUp aria-hidden /> Import JSON
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void actions.importFile(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
